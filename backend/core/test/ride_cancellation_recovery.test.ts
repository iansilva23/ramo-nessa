import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryOperationalSettingsRepository } from '../src/config/in-memory-operational-settings-repository.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { cancelDriverRide } from '../src/drivers/driver-ride-service.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import {
  createWalletTopup,
  passengerWalletBalanceCents,
  payRideWithWallet,
} from '../src/payments/wallet-services.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import { automaticallyRefundRide } from '../src/rides/automatic-ride-refund-service.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import {
  cancelPassengerRideAfterNoDriver,
  retryPassengerRideSearch,
} from '../src/rides/passenger-ride-recovery-service.js';
import { expireNoDriverDecisions } from '../src/rides/no-driver-decision-timeout-service.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { transitionRide } from '../src/rides/ride-state.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-29T14:00:00.000Z');

function preparedRide(id: string): RideRecord {
  return {
    id,
    passengerId: 'passenger-cancel-flow',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-payment-hold',
    driverHoldExpiresAt: '2026-09-29T14:05:00.000Z',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    dropoffLatitude: -2.8986,
    dropoffLongitude: -40.4506,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'prea-jijoca-car',
      baseAmountCents: 12000,
      pickupCompensationCents: 0,
      totalAmountCents: 12000,
      platformCommissionCents: 1200,
      driverNetCents: 10800,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function setupWalletPaidRide(id: string) {
  const rides = new InMemoryRideRepository();
  const finance = new InMemoryFinanceRepository();
  const promotions = new InMemoryPromotionRepository();
  const ride = await rides.create(preparedRide(id));

  const topup = await createWalletTopup(finance, {
    passengerId: ride.passengerId,
    method: 'pix',
    processor: 'test-gateway',
    amountCents: 15000,
    idempotencyKey: `topup-${id}`,
    now,
  });
  await finance.captureWalletTopup({
    walletTopupId: topup.id,
    processorEventId: `topup-event-${id}`,
    capturedAt: now,
  });
  const payment = await payRideWithWallet(finance, {
    ride,
    passengerId: ride.passengerId,
    idempotencyKey: `wallet-payment-${id}`,
    now,
  });
  const paid = await confirmRidePayment(rides, {
    rideId: ride.id,
    payment: payment.payment,
    confirmedAt: now,
  });
  return { rides, finance, promotions, paid, payment: payment.payment };
}

test('passageiro tenta novamente após NO_DRIVER_FOUND sem nova cobrança e pode reofertar o mesmo motorista em nova rodada', async () => {
  const ctx = await setupWalletPaidRide(
    '44444444-4444-4444-8444-444444444444',
  );
  const driverId = 'driver-payment-hold';
  const drivers = new InMemoryDriverSupplyRepository();
  await drivers.upsert({
    driverId,
    vehicleId: 'vehicle-retry-same-round',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.821,
    longitude: -40.414,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  const matching = new InMemoryRideMatchingRepository(
    ctx.rides,
    drivers,
  );

  const firstDispatch = await dispatchRideAfterPayment({
    ride: ctx.paid,
    rides: ctx.rides,
    drivers,
    matching,
    finance: ctx.finance,
    now,
  });
  assert.equal(firstDispatch.kind, 'OFFER_CREATED');
  if (firstDispatch.kind !== 'OFFER_CREATED') {
    throw new Error('A primeira rodada deveria criar uma oferta.');
  }

  await matching.rejectOffer({
    offerId: firstDispatch.offer.id,
    driverId,
    rejectedAt: new Date(now.getTime() + 1000).toISOString(),
  });
  const noDriver = await matching.markNoDriverFound({
    rideId: ctx.paid.id,
    at: new Date(now.getTime() + 2000).toISOString(),
  });
  assert.equal(noDriver.state, 'NO_DRIVER_FOUND');

  const balanceBeforeRetry = await passengerWalletBalanceCents(
    ctx.finance,
    noDriver.passengerId,
  );
  assert.equal(balanceBeforeRetry, 3000);

  const retried = await retryPassengerRideSearch({
    rides: ctx.rides,
    drivers,
    matching,
    finance: ctx.finance,
    passengerId: noDriver.passengerId,
    rideId: noDriver.id,
    now: new Date(now.getTime() + 3000),
  });

  assert.equal(retried.dispatchStatus, 'SEARCHING_DRIVER');
  assert.equal(retried.ride.state, 'SEARCHING_DRIVER');
  assert.equal(retried.offer?.driverId, driverId);

  const offers = await matching.listOffersForRide(noDriver.id);
  assert.equal(offers.length, 2);
  assert.deepEqual(
    offers.map((offer) => offer.driverId),
    [driverId, driverId],
  );
  assert.equal(
    await passengerWalletBalanceCents(
      ctx.finance,
      noDriver.passengerId,
    ),
    balanceBeforeRetry,
  );
});

test('passageiro cancela após NO_DRIVER_FOUND e recebe carteira integralmente', async () => {
  const ctx = await setupWalletPaidRide(
    '11111111-1111-4111-8111-111111111111',
  );
  const searching = await ctx.rides.save({
    ...ctx.paid,
    state: transitionRide(ctx.paid.state, 'SEARCHING_DRIVER'),
  });
  const noDriver = await ctx.rides.save({
    ...searching,
    state: transitionRide(searching.state, 'NO_DRIVER_FOUND'),
    updatedAt: new Date(now.getTime() + 1000).toISOString(),
  });

  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, noDriver.passengerId),
    3000,
  );

  const cancelled = await cancelPassengerRideAfterNoDriver({
    rides: ctx.rides,
    passengerId: noDriver.passengerId,
    rideId: noDriver.id,
    now: new Date(now.getTime() + 2000),
  });
  assert.equal(cancelled.state, 'CANCELLED_BY_PASSENGER');

  const refunded = await automaticallyRefundRide({
    rides: ctx.rides,
    finance: ctx.finance,
    promotions: ctx.promotions,
    gateway: null,
    rideId: cancelled.id,
    passengerId: cancelled.passengerId,
    now: new Date(now.getTime() + 3000),
  });

  assert.equal(refunded.ride.state, 'REFUNDED');
  assert.equal(refunded.refundStatus, 'refunded');
  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, noDriver.passengerId),
    15000,
  );
});

test('motorista pode cancelar corrida já iniciada e o passageiro é reembolsado sem liquidar a corrida', async () => {
  const ctx = await setupWalletPaidRide(
    '22222222-2222-4222-8222-222222222222',
  );
  const driverId = 'driver-cancel-in-progress';
  const drivers = new InMemoryDriverSupplyRepository();
  await drivers.upsert({
    driverId,
    vehicleId: 'vehicle-cancel-in-progress',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: true,
    latitude: -2.82,
    longitude: -40.41,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const inProgress = await ctx.rides.save({
    ...ctx.paid,
    state: 'IN_PROGRESS',
    driverId,
    updatedAt: new Date(now.getTime() + 1000).toISOString(),
  });

  const cancelled = await cancelDriverRide({
    rides: ctx.rides,
    drivers,
    driverId,
    rideId: inProgress.id,
    reason: 'threat_aggression',
    note: 'Passageiro ameaçou o motorista durante a viagem.',
    now: new Date(now.getTime() + 2000),
  });

  assert.equal(cancelled.ride.state, 'CANCELLED_BY_DRIVER');
  assert.equal(cancelled.compensationReviewRequired, true);
  assert.equal(cancelled.requiresAdminReview, true);
  assert.equal((await drivers.findByDriverId(driverId))?.busy, false);

  const refunded = await automaticallyRefundRide({
    rides: ctx.rides,
    finance: ctx.finance,
    promotions: ctx.promotions,
    gateway: null,
    rideId: inProgress.id,
    passengerId: inProgress.passengerId,
    now: new Date(now.getTime() + 3000),
  });

  assert.equal(refunded.ride.state, 'REFUNDED');
  assert.equal(refunded.refundStatus, 'refunded');
  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, inProgress.passengerId),
    15000,
  );
});


test('busca NO_DRIVER_FOUND abandonada expira no prazo configurado e reembolsa automaticamente', async () => {
  const ctx = await setupWalletPaidRide(
    '33333333-3333-4333-8333-333333333333',
  );
  const searching = await ctx.rides.save({
    ...ctx.paid,
    state: transitionRide(ctx.paid.state, 'SEARCHING_DRIVER'),
  });
  const noDriverAt = new Date('2026-09-29T14:00:00.000Z');
  const noDriver = await ctx.rides.save({
    ...searching,
    state: transitionRide(searching.state, 'NO_DRIVER_FOUND'),
    updatedAt: noDriverAt.toISOString(),
  });
  const settings = new InMemoryOperationalSettingsRepository();
  await settings.update({
    noDriverDecisionTimeoutSeconds: 900,
    updatedAt: noDriverAt.toISOString(),
  });

  const before = await expireNoDriverDecisions({
    rides: ctx.rides,
    finance: ctx.finance,
    promotions: ctx.promotions,
    operationalSettings: settings,
    gateway: null,
    now: new Date('2026-09-29T14:14:59.000Z'),
  });
  assert.equal(before.length, 0);
  assert.equal((await ctx.rides.findById(noDriver.id))?.state, 'NO_DRIVER_FOUND');

  const expired = await expireNoDriverDecisions({
    rides: ctx.rides,
    finance: ctx.finance,
    promotions: ctx.promotions,
    operationalSettings: settings,
    gateway: null,
    now: new Date('2026-09-29T14:15:00.000Z'),
  });

  assert.equal(expired.length, 1);
  assert.equal(expired[0]?.refundStatus, 'refunded');
  assert.equal((await ctx.rides.findById(noDriver.id))?.state, 'REFUNDED');
  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, noDriver.passengerId),
    15000,
  );
});
