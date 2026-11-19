import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresRidePreparationRepository } from '../src/rides/postgres-ride-preparation-repository.js';
import { PostgresRideMatchingRepository } from '../src/matching/postgres-ride-matching-repository.js';
import { PostgresDriverSupplyRepository } from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import { PostgresPromotionRepository } from '../src/promotions/repositories/postgres-promotion-repository.js';
import { prepareRideForPayment, preparePassengerRideForPayment } from '../src/rides/prepare-ride.js';
import { createPrepaymentDriverOffer } from '../src/rides/prepayment-driver-confirmation.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { applyPromotionToRide, createPromotionCampaignRecord, savePassengerPromotionPreference } from '../src/promotions/promotion-service.js';
const databaseUrl = process.env.DATABASE_URL?.trim();

for (const passengerFlow of [false, true]) test('PostgreSQL: desistência e proteção de pagamento concorrente passengerFlow=' + passengerFlow, { skip: !databaseUrl }, async () => {
  const pool = createPostgresPool(databaseUrl!);
  const now = new Date();
  const suffix = randomUUID();
  const driverId = `pix-abandon-${suffix}`;
  const passengerId = `pix-abandon-passenger-${suffix}`;
  const rides = new PostgresRideRepository(pool);
  const drivers = new PostgresDriverSupplyRepository(pool);
  const matching = new PostgresRideMatchingRepository(pool);
  const ids: string[] = [];
  let blocker: PoolClient | undefined;
  let cancelling: Promise<unknown> | undefined;
  try {
    await drivers.upsert({ driverId, vehicleId: `vehicle-${suffix}`, categories: ['car'],
      fourByFour: false, seatCapacity: 4, online: true, busy: false,
      latitude: -2.8205, longitude: -40.4145,
      locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString() });
    async function prepareAndAccept() {
      const ride = await (passengerFlow ? preparePassengerRideForPayment : prepareRideForPayment)({ repository: new PostgresRidePreparationRepository(pool),
        drivers, routing: { routeDistanceKm: async () => 1 }, passengerId, now,
        ...(passengerFlow ? {} : { requireDriverConsent: true }), maxPickupDistanceKm: 5, canUseDriver: async id => id === driverId,
        quoteRequest: { origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' }, category: 'car', period: 'day' },
        pickup: { latitude: -2.82017, longitude: -40.41467 }, dropoff: { latitude: -2.8986, longitude: -40.4506 } });
      ids.push(ride.id);
      if (passengerFlow) return { ride, offer: null };
      const offer = await createPrepaymentDriverOffer({ ride, matching, now });
      await matching.acceptOffer({ offerId: offer.id, driverId, acceptedAt: now.toISOString() });
      return { ride, offer };
    }
    const first = await prepareAndAccept();
    const cancelled = await matching.releasePrepaymentHold({ rideId: first.ride.id,
      at: now.toISOString(), cancelledByPassenger: true });
    assert.equal(cancelled.state, 'CANCELLED_BY_PASSENGER');
    assert.equal((await rides.findById(first.ride.id))?.state, 'CANCELLED_BY_PASSENGER');
    if (first.offer != null) assert.equal((await matching.findOfferById(first.offer.id))?.status, 'CANCELLED');
    else assert.equal((await matching.listOffersForRide(first.ride.id)).length, 0);
    assert.equal((await drivers.findByDriverId(driverId))?.reservedRideId, undefined);
    assert.equal(await rides.findRecoverableByPassengerId(passengerId), null);
    const retry = await prepareAndAccept();
    await matching.releasePrepaymentHold({ rideId: first.ride.id,
      at: now.toISOString(), cancelledByPassenger: true });
    assert.equal((await drivers.findByDriverId(driverId))?.reservedRideId, retry.ride.id);
    blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query("UPDATE rides SET state='PAID', payment_status='paid', payment_method='pix' WHERE id=$1", [retry.ride.id]);
    // Cancellation must wait for the ride row and re-check the committed payment.
    cancelling = matching.releasePrepaymentHold({ rideId: retry.ride.id,
      at: now.toISOString(), cancelledByPassenger: true });
    const rejected = assert.rejects(cancelling, { code: 'RIDE_NOT_READY' });
    await blocker.query('COMMIT');
    blocker.release(); blocker = undefined;
    await rejected;
    assert.equal((await rides.findById(retry.ride.id))?.state, 'PAID');
    assert.equal((await drivers.findByDriverId(driverId))?.reservedRideId, retry.ride.id);
  } finally {
    if (blocker) { await blocker.query('ROLLBACK'); blocker.release(); }
    await cancelling?.catch(() => {});
    await pool.query('DELETE FROM ride_offers WHERE ride_id = ANY($1::uuid[])', [ids]);
    await pool.query('UPDATE driver_supply SET reserved_ride_id=NULL,reserved_until=NULL WHERE driver_id=$1', [driverId]);
    await pool.query('DELETE FROM rides WHERE id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM driver_supply WHERE driver_id=$1', [driverId]);
    await pool.end();
  }
});

test('PostgreSQL: aceite reserva motorista e cupom, protege tarifa e só ativa após pagamento', { skip: !databaseUrl }, async () => {
  const pool = createPostgresPool(databaseUrl!); const now = new Date('2026-10-03T12:00:00Z');
  const suffix = randomUUID(); const driverId = `consent-driver-${suffix}`;
  const rides = new PostgresRideRepository(pool); const drivers = new PostgresDriverSupplyRepository(pool);
  const matching = new PostgresRideMatchingRepository(pool); const promotions = new PostgresPromotionRepository(pool);
  const ids: string[] = []; let campaignId: string | undefined;
  try {
    await drivers.upsert({ driverId, vehicleId: `consent-vehicle-${suffix}`, categories: ['car'], fourByFour: false,
      seatCapacity: 4, online: true, busy: false, latitude: -2.8205, longitude: -40.4145,
      locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString() });
    const staleGps = (await drivers.findByDriverId(driverId))!;
    const prepare = (passengerId: string) => prepareRideForPayment({ repository: new PostgresRidePreparationRepository(pool),
      drivers, routing: { routeDistanceKm: async () => 1 }, passengerId, now, requireDriverConsent: true, maxPickupDistanceKm: 5,
      canUseDriver: async id => id === driverId,
      quoteRequest: { origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' }, category: 'car', period: 'day' },
      pickup: { latitude: -2.82017, longitude: -40.41467 }, dropoff: { latitude: -2.8986, longitude: -40.4506 } });
    const ride = await prepare(`consent-passenger-${suffix}`); ids.push(ride.id);
    const campaign = await promotions.createCampaign(createPromotionCampaignRecord({ code: `C${suffix.replaceAll('-', '').slice(0, 15)}`,
      name: 'Consent coupon', kind: 'fixed_discount', valueCents: 500, enabled: true, maxRedemptions: 10, now }));
    campaignId = campaign.id;
    const device = `consent-device-${suffix}`;
    await savePassengerPromotionPreference({ promotions, passengerId: ride.passengerId, code: campaign.code, clientInstanceId: device, now });
    const promoted = await applyPromotionToRide({ promotions, rides, passengerId: ride.passengerId, rideId: ride.id,
      preparationPreference: (await promotions.getPreference(ride.passengerId))!, clientInstanceId: device, now });
    const offer = await createPrepaymentDriverOffer({ ride: promoted, matching, now });
    await assert.rejects(pool.query('UPDATE rides SET total_amount_cents = total_amount_cents + 1 WHERE id = $1', [ride.id]), /DRIVER_CONFIRMATION_STARTED/);
    const at = new Date(now.getTime() + 30_000).toISOString();
    const accepted = await matching.acceptOffer({ offerId: offer.id, driverId, acceptedAt: at, paymentHoldSeconds: 90 });
    assert.equal(accepted.ride.state, 'AWAITING_PAYMENT');
    assert.equal(accepted.ride.driverConsentRequired, true);
    assert.equal(accepted.ride.driverSearchMaxDistanceKm, 5);
    assert.equal(accepted.ride.promotion?.discountCents, 500);
    assert.equal((await promotions.findRedemptionById(promoted.promotion!.applicationId))?.expiresAt, accepted.ride.driverHoldExpiresAt);
    await drivers.upsert({ ...staleGps, latitude: -2.8204 }, { preserveRideState: true });
    assert.equal((await drivers.findByDriverId(driverId))?.reservedRideId, ride.id);
    assert.equal((await drivers.findByDriverId(driverId))?.reservedUntil, accepted.ride.driverHoldExpiresAt);
    assert.equal((await drivers.findByDriverId(driverId))?.busy, false);
    await assert.rejects(prepare(`another-passenger-${suffix}`), { code: 'NO_ELIGIBLE_DRIVER' });
    const paid = await rides.save({ ...accepted.ride, state: 'PAID', paymentStatus: 'paid', paymentMethod: 'pix' });
    assert.equal((await dispatchRideAfterPayment({ ride: paid, rides, drivers, matching, now: new Date(now.getTime() + 100_000) })).kind, 'DRIVER_CONFIRMED');
    await drivers.upsert({ ...staleGps, latitude: -2.8203, online: false }, { preserveRideState: true });
    assert.equal((await drivers.findByDriverId(driverId))?.busy, true);
    assert.equal((await drivers.findByDriverId(driverId))?.online, true);
  } finally {
    await pool.query('DELETE FROM passenger_promotion_preferences WHERE passenger_id = $1', [`consent-passenger-${suffix}`]);
    if (campaignId != null) await pool.query('DELETE FROM promotion_redemptions WHERE campaign_id = $1', [campaignId]);
    await pool.query('DELETE FROM ride_offers WHERE ride_id = ANY($1::uuid[])', [ids]);
    await pool.query('UPDATE driver_supply SET reserved_ride_id = NULL, reserved_until = NULL WHERE driver_id = $1', [driverId]);
    await pool.query('DELETE FROM rides WHERE id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM driver_supply WHERE driver_id = $1', [driverId]);
    if (campaignId != null) await pool.query('DELETE FROM promotion_campaigns WHERE id = $1', [campaignId]);
    await pool.end();
  }
});
