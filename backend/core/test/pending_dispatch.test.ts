import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { advancePendingRideDispatch } from '../src/rides/pending-dispatch-service.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-10-07T03:00:00Z');
function paidRide(id = 'pending-ride'): RideRecord {
  return {
    id, passengerId: 'passenger-test', state: 'PAID', paymentStatus: 'paid',
    paymentMethod: 'pix', pickupLatitude: -2.82017, pickupLongitude: -40.41467,
    origin: { zoneId: 'prea' }, destination: { zoneId: 'prea' },
    category: 'moto', period: 'after_22', passengers: 1,
    quote: { ruleId: 'test', baseAmountCents: 1660, pickupCompensationCents: 0,
      totalAmountCents: 1660, platformCommissionCents: 166, driverNetCents: 1494 },
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}
async function setup(count: number) {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  await rides.create(paidRide());
  for (let i = 0; i < count; i++) await drivers.upsert({
    driverId: 'driver-' + i, vehicleId: 'vehicle-' + i, categories: ['moto'],
    fourByFour: false, seatCapacity: 1, online: true, busy: false,
    latitude: -2.82017 - i * 0.001, longitude: -40.41467,
    locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  const dispatch = (ride: RideRecord, at: Date) => dispatchRideAfterPayment({
    rides, drivers, matching, ride, now: at,
  });
  return { rides, drivers, matching, dispatch };
}

test('server sweep expires an unanswered offer and selects next driver without connected apps', async () => {
  const ctx = await setup(2);
  const holdExpiresAt = new Date(now.getTime() + 120_000).toISOString();
  await ctx.rides.save({ ...paidRide(), reservedDriverId: 'driver-0', driverHoldExpiresAt: holdExpiresAt });
  await ctx.drivers.upsert({ ...(await ctx.drivers.findByDriverId('driver-0'))!,
    reservedRideId: 'pending-ride', reservedUntil: holdExpiresAt });
  await advancePendingRideDispatch({ ...ctx, now });
  const first = (await ctx.matching.listOffersForRide('pending-ride'))[0]!;
  const after = new Date(Date.parse(first.expiresAt) + 1000);
  const progress: string[] = [];
  assert.equal(await advancePendingRideDispatch({ ...ctx, now: after,
    onProgress: async (_id, result) => { progress.push(result.kind); } }), 1);
  const offers = await ctx.matching.listOffersForRide('pending-ride');
  assert.equal(offers[0]!.status, 'EXPIRED');
  assert.equal(offers[1]!.status, 'OFFERED');
  assert.notEqual(offers[0]!.driverId, offers[1]!.driverId);
  assert.deepEqual(progress, ['OFFER_CREATED']);
});

test('last expired offer moves paid ride to no-driver decision and repeated sweep does not repeat it', async () => {
  const ctx = await setup(1);
  await advancePendingRideDispatch({ ...ctx, now });
  const offer = (await ctx.matching.listOffersForRide('pending-ride'))[0]!;
  const after = new Date(Date.parse(offer.expiresAt) + 1000);
  assert.equal(await advancePendingRideDispatch({ ...ctx, now: after }), 1);
  assert.equal((await ctx.rides.findById('pending-ride'))!.state, 'NO_DRIVER_FOUND');
  assert.equal((await ctx.rides.findById('pending-ride'))!.paymentStatus, 'paid');
  assert.equal(await advancePendingRideDispatch({ ...ctx, now: after }), 0);
  assert.equal((await ctx.matching.listOffersForRide('pending-ride')).length, 1);
});

test('valid offer stays active without duplicated offers or progress notifications', async () => {
  const ctx = await setup(2);
  await advancePendingRideDispatch({ ...ctx, now });
  let notifications = 0;
  assert.equal(await advancePendingRideDispatch({ ...ctx, now: new Date(now.getTime() + 1000),
    onProgress: async () => { notifications++; } }), 0);
  assert.equal(notifications, 0);
  assert.equal((await ctx.matching.listOffersForRide('pending-ride')).length, 1);
});

test('unpaid, refunded and driver-consent bookings are not dispatched by recovery', async () => {
  const ctx = await setup(0);
  await ctx.rides.save({ ...paidRide(), state: 'AWAITING_PAYMENT', paymentStatus: 'pending' });
  await ctx.rides.create({ ...paidRide('legacy'), driverConsentRequired: true });
  await ctx.rides.create({ ...paidRide('refunded'), paymentStatus: 'refunded' });
  assert.equal(await advancePendingRideDispatch({ ...ctx, now }), 0);
});

test('driver acceptance after candidate selection prevents recovery from changing that ride', async () => {
  const ctx = await setup(1);
  await advancePendingRideDispatch({ ...ctx, now });
  const offer = (await ctx.matching.listOffersForRide('pending-ride'))[0]!;
  const list = ctx.rides.listPendingDispatch.bind(ctx.rides);
  ctx.rides.listPendingDispatch = async (before, limit) => {
    const pending = await list(before, limit);
    await ctx.matching.acceptOffer({ offerId: offer.id, driverId: offer.driverId,
      acceptedAt: new Date(now.getTime() + 1000).toISOString() });
    return pending;
  };
  assert.equal(await advancePendingRideDispatch({ ...ctx, now }), 0);
  assert.equal((await ctx.rides.findById('pending-ride'))!.state, 'DRIVER_ASSIGNED');
});

test('one failing dispatch does not prevent recovery of another paid ride', async () => {
  const ctx = await setup(0);
  await ctx.rides.create(paidRide('second'));
  const failures: string[] = [];
  assert.equal(await advancePendingRideDispatch({ ...ctx, now,
    dispatch: async (ride, at) => {
      if (ride.id === 'pending-ride') throw new Error('temporary failure');
      return ctx.dispatch(ride, at);
    }, onFailure: id => { failures.push(id); } }), 1);
  assert.deepEqual(failures, ['pending-ride']);
  assert.equal((await ctx.rides.findById('second'))!.state, 'NO_DRIVER_FOUND');
});
