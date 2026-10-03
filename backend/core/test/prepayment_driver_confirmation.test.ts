import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryRidePreparationRepository } from '../src/rides/in-memory-ride-preparation-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { prepareRideForPayment } from '../src/rides/prepare-ride.js';
import { createPrepaymentDriverOffer } from '../src/rides/prepayment-driver-confirmation.js';
import { createPaymentForRide } from '../src/payments/create-payment.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { performDriverRideAction } from '../src/drivers/driver-ride-service.js';
const now = new Date('2026-10-03T12:00:00Z');
async function setup(routedKm = 1) {
  const rides = new InMemoryRideRepository(); const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers); const finance = new InMemoryFinanceRepository();
  await drivers.upsert({ driverId: 'driver-confirm', vehicleId: 'vehicle-confirm', categories: ['car'],
    fourByFour: false, seatCapacity: 4, online: true, busy: false, latitude: -2.8205, longitude: -40.4145,
    locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString() });
  const prepare = () => prepareRideForPayment({ repository: new InMemoryRidePreparationRepository(rides, drivers),
    drivers, routing: { routeDistanceKm: async () => routedKm }, passengerId: 'passenger-confirm',
    quoteRequest: { origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' }, category: 'car', period: 'day' },
    pickup: { latitude: -2.82017, longitude: -40.41467 }, dropoff: { latitude: -2.89860, longitude: -40.45060 },
    requireDriverConsent: true, maxPickupDistanceKm: 5, now });
  return { rides, drivers, matching, finance, prepare };
}
test('aceite antes da cobrança reserva sem liberar embarque; pagamento ativa o mesmo motorista', async () => {
  const ctx = await setup(); const ride = await ctx.prepare();
  await assert.rejects(createPaymentForRide(ctx.finance, { ride, method: 'pix', processor: 'test',
    idempotencyKey: 'before-consent', now }), { code: 'RIDE_NOT_PREPARED' });
  const offer = await createPrepaymentDriverOffer({ ride, matching: ctx.matching, now });
  assert.equal(Date.parse(offer.expiresAt) - now.getTime(), 35_000);
  const accepted = await ctx.matching.acceptOffer({ offerId: offer.id, driverId: offer.driverId, acceptedAt: now.toISOString() });
  assert.equal(accepted.ride.state, 'AWAITING_PAYMENT');
  assert.equal((await ctx.drivers.findByDriverId(offer.driverId))?.busy, false);
  await assert.rejects(performDriverRideAction({ rides: ctx.rides, drivers: ctx.drivers, finance: ctx.finance,
    rideId: ride.id, driverId: offer.driverId, action: 'arrive', now }), { code: 'INVALID_RIDE_ACTION' });
  await assert.rejects(ctx.prepare(), { code: 'NO_ELIGIBLE_DRIVER' });
  await createPaymentForRide(ctx.finance, { ride: accepted.ride, method: 'pix', processor: 'test', idempotencyKey: 'after-consent', now });
  const paid = await ctx.rides.save({ ...accepted.ride, state: 'PAID', paymentStatus: 'paid', paymentMethod: 'pix' });
  assert.equal((await dispatchRideAfterPayment({ ride: paid, ...ctx, now })).kind, 'DRIVER_CONFIRMED');
  assert.equal((await ctx.rides.findById(ride.id))?.state, 'DRIVER_ASSIGNED');
  assert.equal((await ctx.drivers.findByDriverId(offer.driverId))?.busy, true);
});
test('coleta por estrada acima do limite não reserva motorista', async () => {
  const ctx = await setup(12); await assert.rejects(ctx.prepare(), { code: 'NO_ELIGIBLE_DRIVER' });
  assert.equal((await ctx.drivers.findByDriverId('driver-confirm'))?.reservedRideId, undefined);
});
test('cancelar libera reserva e bloqueia pagamento tardio; não troca motorista', async () => {
  const ctx = await setup(); const ride = await ctx.prepare();
  const offer = await createPrepaymentDriverOffer({ ride, matching: ctx.matching, now });
  await ctx.matching.acceptOffer({ offerId: offer.id, driverId: offer.driverId, acceptedAt: now.toISOString() });
  const released = await ctx.matching.releasePrepaymentHold({ rideId: ride.id, at: now.toISOString() });
  assert.equal((await ctx.drivers.findByDriverId(offer.driverId))?.reservedRideId, undefined);
  assert.equal((await ctx.matching.findOfferById(offer.id))?.status, 'CANCELLED');
  await assert.rejects(createPaymentForRide(ctx.finance, { ride: released, method: 'pix', processor: 'test',
    idempotencyKey: 'cancelled-payment', now }), { code: 'RIDE_NOT_PREPARED' });
  const paid = await ctx.rides.save({ ...released, state: 'PAID', paymentStatus: 'paid', paymentMethod: 'pix' });
  assert.equal((await dispatchRideAfterPayment({ ride: paid, ...ctx, now })).kind, 'NOT_PREPARED');
});
