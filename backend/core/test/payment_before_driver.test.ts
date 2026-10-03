import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryRidePreparationRepository } from '../src/rides/in-memory-ride-preparation-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { preparePassengerRideForPayment } from '../src/rides/prepare-ride.js';
import { createPrepaymentDriverOffer } from '../src/rides/prepayment-driver-confirmation.js';
import { createPaymentForRide } from '../src/payments/create-payment.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';

async function setup() {
  const now = new Date('2026-10-03T18:00:00Z');
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const repository = new InMemoryRidePreparationRepository(rides, drivers);
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  await drivers.upsert({ driverId: 'driver-payment-first', vehicleId: 'vehicle-payment-first', categories: ['car'],
    fourByFour: false, seatCapacity: 4, online: true, busy: false, latitude: -2.8205, longitude: -40.4145,
    locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString() });
  // Even an obsolete caller cannot opt new passenger bookings into prepayment acceptance.
  const input = { repository, drivers, routing: { async routeDistanceKm() { return 2; } },
    passengerId: 'passenger-payment-first', quoteRequest: { origin: { zoneId: 'prea' as const }, destination: { zoneId: 'jijoca' as const },
      category: 'car' as const, period: 'day' as const }, pickup: { latitude: -2.82017, longitude: -40.41467 },
    dropoff: { latitude: -2.89860, longitude: -40.45060 }, requireDriverConsent: true, now };
  const ride = await preparePassengerRideForPayment(input);
  return { rides, drivers, matching, ride, now };
}

test('new booking shows final price with no driver acceptance or offer before payment', async () => {
  const { ride, matching, rides, drivers, now } = await setup();
  assert.equal(ride.state, 'AWAITING_PAYMENT');
  assert.notEqual(ride.driverConsentRequired, true);
  assert.equal(ride.driverId, undefined);
  assert.equal(ride.quote.totalAmountCents, 12000);
  assert.equal((await matching.listOffersForRide(ride.id)).length, 0);
  await assert.rejects(createPrepaymentDriverOffer({ ride, matching, now }));
  await assert.rejects(dispatchRideAfterPayment({ ride, rides, drivers, matching, now }), /não está pronta/);
  assert.equal((await matching.listOffersForRide(ride.id)).length, 0);
});

test('payment confirmation starts normal search and sends first offer without previous acceptance', async () => {
  const { ride, matching, rides, drivers, now } = await setup();
  const paid = await confirmRidePayment(rides, { rideId: ride.id, notifyPassenger: false, confirmedAt: now,
    payment: { id: 'payment-first', rideId: ride.id, method: 'pix', processor: 'test', status: 'paid',
      amountCents: ride.quote.totalAmountCents, idempotencyKey: 'payment-first', createdAt: now.toISOString(), updatedAt: now.toISOString() } });
  const result = await dispatchRideAfterPayment({ ride: paid, rides, drivers, matching, now });
  assert.equal(result.kind, 'OFFER_CREATED');
  const offers = await matching.listOffersForRide(ride.id);
  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.status, 'OFFERED');
  assert.equal(offers[0]?.driverId, 'driver-payment-first');
  assert.equal((await rides.findById(ride.id))?.state, 'SEARCHING_DRIVER');
});

test('abandoned payment expires without requesting acceptance or accepting a late charge', async () => {
  const { ride, matching, now } = await setup();
  const later = new Date(now.getTime() + 91_000);
  await assert.rejects(createPaymentForRide(new InMemoryFinanceRepository(), { ride, method: 'pix',
    processor: 'test', idempotencyKey: 'abandoned-payment', now: later }), { code: 'DRIVER_HOLD_EXPIRED' });
  assert.equal((await matching.listOffersForRide(ride.id)).length, 0);
});
