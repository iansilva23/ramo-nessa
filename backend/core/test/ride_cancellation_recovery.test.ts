import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { cancelDriverRide } from '../src/drivers/driver-ride-service.js';
import {
  createWalletTopup,
  passengerWalletBalanceCents,
  payRideWithWallet,
} from '../src/payments/wallet-services.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { automaticallyRefundRide } from '../src/rides/automatic-ride-refund-service.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import { cancelPassengerRideAfterNoDriver } from '../src/rides/passenger-ride-recovery-service.js';
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
  return { rides, finance, paid, payment: payment.payment };
}

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
