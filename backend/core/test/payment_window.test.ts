import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryRidePreparationRepository } from '../src/rides/in-memory-ride-preparation-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { preparePassengerRideForPayment } from '../src/rides/prepare-ride.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { createPaymentForRide } from '../src/payments/create-payment.js';
import { shouldRefundMercadoPagoPaymentBeforeDispatch } from '../src/payments/mercado-pago-payment-service.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { isDriverPaymentHoldExpired, isRidePaymentWindowExpired, ridePaymentExpiresAt } from '../src/rides/ride.js';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import { createPromotionCampaignRecord, savePassengerPromotionPreference, applyPromotionToRide } from '../src/promotions/promotion-service.js';

const now = new Date('2026-09-23T14:00:00Z');
const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);
async function setup() {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const preparation = new InMemoryRidePreparationRepository(rides, drivers);
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const routing = { routeDistanceKm: async () => 0.2 };
  for (const [driverId, latitude] of [['driver-near', -2.82018], ['driver-next', -2.821]] as const) {
    await drivers.upsert({ driverId, vehicleId: 'vehicle-' + driverId, categories: ['car'], fourByFour: false,
      seatCapacity: 4, online: true, busy: false, latitude, longitude: -40.41468,
      locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString() });
  }
  const input = { repository: preparation, drivers, routing, passengerId: 'passenger-window',
    quoteRequest: { origin: { zoneId: 'prea' as const }, destination: { zoneId: 'jijoca' as const }, category: 'car' as const, period: 'day' as const },
    pickup: { latitude: -2.82017, longitude: -40.41467 }, dropoff: { latitude: -2.8986, longitude: -40.4506 }, now };
  const ride = await preparePassengerRideForPayment(input);
  return { rides, drivers, matching, input, ride };
}

test('new checkout grants 10 minutes and exclusively reserves a driver for only 60 seconds', async () => {
  const ctx = await setup();
  assert.equal(ctx.ride.driverHoldExpiresAt, at(60).toISOString());
  assert.equal(ctx.ride.paymentExpiresAt, at(600).toISOString());
  assert.equal((await ctx.drivers.findByDriverId('driver-near'))?.reservedUntil, at(60).toISOString());
  assert.equal((await ctx.matching.listOffersForRide(ctx.ride.id)).length, 0);
  assert.equal(isDriverPaymentHoldExpired(ctx.ride, at(60)), true);
  assert.equal(isRidePaymentWindowExpired(ctx.ride, at(60)), false);
  assert.equal(ridePaymentExpiresAt(ctx.ride), at(600).toISOString());
});

test('the original driver can serve another passenger after 60 seconds before the first payment', async () => {
  const ctx = await setup();
  const another = await preparePassengerRideForPayment({ ...ctx.input, passengerId: 'another-passenger', now: at(61) });
  assert.equal(another.reservedDriverId, ctx.ride.reservedDriverId);
  assert.notEqual(another.id, ctx.ride.id);
  assert.equal((await ctx.matching.listOffersForRide(ctx.ride.id)).length, 0);
});

for (const method of ['card', 'pix'] as const) {
  test(method + ' payment can start after the 1-minute hold and before checkout expires', async () => {
    const { ride } = await setup();
    const finance = new InMemoryFinanceRepository();
    const payment = await createPaymentForRide(finance, { ride, method, processor: 'mercado-pago-orders', idempotencyKey: 'payment-window-' + method, now: at(599) });
    assert.equal(payment.rideId, ride.id);
    assert.equal(payment.amountCents, ride.quote.totalAmountCents);
    assert.equal(shouldRefundMercadoPagoPaymentBeforeDispatch(ride, at(599)), false);
    await assert.rejects(createPaymentForRide(finance, { ride, method, processor: 'mercado-pago-orders', idempotencyKey: 'expired-window-' + method, now: at(600) }), /prazo de pagamento expirou/i);
    assert.equal(shouldRefundMercadoPagoPaymentBeforeDispatch(ride, at(600)), true);
  });
}

test('payment after 60 seconds dispatches to the closest currently eligible driver without changing fare', async () => {
  const ctx = await setup();
  const paidAt = at(90);
  for (const driverId of ['driver-near', 'driver-next']) {
    const driver = (await ctx.drivers.findByDriverId(driverId))!;
    await ctx.drivers.upsert({ ...driver, busy: driverId === 'driver-near', locationUpdatedAt: paidAt.toISOString(), updatedAt: paidAt.toISOString() });
  }
  const paid = await ctx.rides.save({ ...ctx.ride, state: 'PAID', paymentStatus: 'paid', paymentMethod: 'card' });
  const result = await dispatchRideAfterPayment({ ...ctx, ride: paid, now: paidAt });
  assert.equal(result.kind, 'OFFER_CREATED');
  if (result.kind === 'OFFER_CREATED') assert.equal(result.offer.driverId, 'driver-next');
  assert.deepEqual((await ctx.rides.findById(paid.id))?.quote, ctx.ride.quote);
  const repeated = await dispatchRideAfterPayment({ ...ctx, ride: paid, now: paidAt });
  assert.equal(repeated.kind, 'OFFER_ACTIVE');
  assert.equal((await ctx.matching.listOffersForRide(paid.id)).length, 1);
});

test('checkout expiry never extends the promised hold for legacy consent-first rides', async () => {
  const { ride } = await setup();
  const legacy = { ...ride, driverConsentRequired: true, driverId: ride.reservedDriverId! };
  assert.equal(ridePaymentExpiresAt(legacy), at(60).toISOString());
  assert.equal(isRidePaymentWindowExpired(legacy, at(60)), true);
  assert.equal(shouldRefundMercadoPagoPaymentBeforeDispatch(legacy, at(60)), true);
});

test('malformed checkout deadline fails closed, while historical rides keep their original expiry', async () => {
  const { ride } = await setup();
  assert.equal(isRidePaymentWindowExpired({ ...ride, paymentExpiresAt: 'bad-date' }, now), true);
  const { paymentExpiresAt: _window, ...historical } = ride;
  assert.equal(isRidePaymentWindowExpired(historical, at(60)), true);
});

test('coupon reservation stays valid for the checkout window after the driver is released', async () => {
  const { ride, rides } = await setup();
  const promotions = new InMemoryPromotionRepository();
  const campaign = await promotions.createCampaign(createPromotionCampaignRecord({
    code: 'WINDOW10', name: 'Checkout window', kind: 'fixed_discount', valueCents: 500,
    maxRedemptions: 10, enabled: true, now,
  }));
  const clientInstanceId = 'checkout-window-device-0123456789abcdef';
  await savePassengerPromotionPreference({ promotions, passengerId: ride.passengerId, code: campaign.code, clientInstanceId, now });
  const promoted = await applyPromotionToRide({ promotions, rides, passengerId: ride.passengerId,
    rideId: ride.id, preparationPreference: (await promotions.getPreference(ride.passengerId))!, clientInstanceId, now });
  const redemption = await promotions.findRedemptionById(promoted.promotion!.applicationId);
  assert.equal(redemption?.expiresAt, at(600).toISOString());
  assert.equal(promoted.paymentExpiresAt, ride.paymentExpiresAt);
});

test('no eligible driver after payment enters the existing no-driver cancellation/refund flow', async () => {
  const ctx = await setup();
  for (const id of ['driver-near', 'driver-next']) {
    const driver = (await ctx.drivers.findByDriverId(id))!;
    await ctx.drivers.upsert({ ...driver, online: false });
  }
  const paid = await ctx.rides.save({ ...ctx.ride, state: 'PAID', paymentStatus: 'paid', paymentMethod: 'pix' });
  const result = await dispatchRideAfterPayment({ ...ctx, ride: paid, now: at(90) });
  assert.equal(result.kind, 'NO_DRIVER_FOUND');
  assert.equal((await ctx.rides.findById(paid.id))?.state, 'NO_DRIVER_FOUND');
  assert.equal((await ctx.matching.listOffersForRide(paid.id)).length, 0);
});
