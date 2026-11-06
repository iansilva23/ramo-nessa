import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresRidePreparationRepository } from '../src/rides/postgres-ride-preparation-repository.js';
import { PostgresRideMatchingRepository } from '../src/matching/postgres-ride-matching-repository.js';
import { PostgresDriverSupplyRepository } from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import { preparePassengerRideForPayment } from '../src/rides/prepare-ride.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
test('PostgreSQL persists checkout independently, releases the driver and dispatches payment to another eligible driver', { skip: !databaseUrl }, async () => {
  const pool = createPostgresPool(databaseUrl!);
  const suffix = randomUUID();
  const driverIds = ['window-near-' + suffix, 'window-next-' + suffix];
  const rides = new PostgresRideRepository(pool);
  const drivers = new PostgresDriverSupplyRepository(pool);
  const matching = new PostgresRideMatchingRepository(pool);
  const now = new Date('2026-09-23T14:00:00Z');
  const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);
  const rideIds: string[] = [];
  try {
    for (let i = 0; i < driverIds.length; i++) await drivers.upsert({
      driverId: driverIds[i]!, vehicleId: 'vehicle-' + driverIds[i], categories: ['car'], fourByFour: false,
      seatCapacity: 4, online: true, busy: false, latitude: i === 0 ? -2.82018 : -2.821,
      longitude: -40.41468, locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString(),
    });
    const input = { repository: new PostgresRidePreparationRepository(pool), drivers,
      routing: { routeDistanceKm: async () => 0.2 }, passengerId: 'window-passenger-' + suffix,
      quoteRequest: { origin: { zoneId: 'prea' as const }, destination: { zoneId: 'jijoca' as const }, category: 'car' as const, period: 'day' as const },
      pickup: { latitude: -2.82017, longitude: -40.41467 }, dropoff: { latitude: -2.8986, longitude: -40.4506 },
      canUseDriver: async (id: string) => driverIds.includes(id), now };
    const ride = await preparePassengerRideForPayment(input); rideIds.push(ride.id);
    const loaded = (await rides.findById(ride.id))!;
    assert.equal(loaded.paymentExpiresAt, at(600).toISOString());
    assert.equal(loaded.driverHoldExpiresAt, at(60).toISOString());
    assert.equal((await rides.save(loaded)).paymentExpiresAt, at(600).toISOString());
    assert.equal((await matching.listOffersForRide(ride.id)).length, 0);

    const other = await preparePassengerRideForPayment({ ...input, passengerId: 'window-other-' + suffix, now: at(61) });
    rideIds.push(other.id);
    assert.equal(other.reservedDriverId, driverIds[0]);
    const next = (await drivers.findByDriverId(driverIds[1]!))!;
    await drivers.upsert({ ...next, locationUpdatedAt: at(90).toISOString(), updatedAt: at(90).toISOString() });
    const paid = await rides.save({ ...loaded, state: 'PAID', paymentStatus: 'paid', paymentMethod: 'card' });
    const result = await dispatchRideAfterPayment({ ride: paid, rides, drivers, matching, now: at(90),
      canOfferDriver: async id => driverIds.includes(id) });
    assert.equal(result.kind, 'OFFER_CREATED');
    if (result.kind === 'OFFER_CREATED') assert.equal(result.offer.driverId, driverIds[1]);
    const persisted = (await rides.findById(ride.id))!;
    assert.equal(persisted.paymentExpiresAt, at(600).toISOString());
    assert.deepEqual(persisted.quote, loaded.quote);
  } finally {
    await pool.query('DELETE FROM ride_offers WHERE ride_id = ANY($1::uuid[])', [rideIds]);
    await pool.query('UPDATE driver_supply SET reserved_ride_id = NULL, reserved_until = NULL WHERE driver_id = ANY($1::text[])', [driverIds]);
    await pool.query('DELETE FROM rides WHERE id = ANY($1::uuid[])', [rideIds]);
    await pool.query('DELETE FROM driver_supply WHERE driver_id = ANY($1::text[])', [driverIds]);
    await pool.end();
  }
});
