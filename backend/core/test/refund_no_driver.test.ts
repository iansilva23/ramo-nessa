import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import {
  createWalletTopup,
  passengerWalletBalanceCents,
  payRideWithWallet,
} from '../src/payments/wallet-services.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import { refundWalletRideAfterNoDriver } from '../src/rides/refund-no-driver.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { transitionRide } from '../src/rides/ride-state.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T18:00:00.000Z');

function preparedRide(): RideRecord {
  return {
    id: 'abababab-abab-4bab-8bab-abababababab',
    passengerId: 'passenger-refund',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-prepared-but-unavailable',
    driverHoldExpiresAt: '2026-09-23T18:02:00.000Z',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    dropoffLatitude: -2.89860,
    dropoffLongitude: -40.45060,
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

async function setupPaidRide() {
  const rides = new InMemoryRideRepository();
  const finance = new InMemoryFinanceRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const ride = await rides.create(preparedRide());

  const topup = await createWalletTopup(finance, {
    passengerId: ride.passengerId,
    method: 'pix',
    processor: 'test-gateway',
    amountCents: 15000,
    idempotencyKey: 'refund-topup-001',
    now,
  });
  await finance.captureWalletTopup({
    walletTopupId: topup.id,
    processorEventId: 'refund-topup-event-001',
    capturedAt: now,
  });

  const walletPayment = await payRideWithWallet(finance, {
    ride,
    passengerId: ride.passengerId,
    idempotencyKey: 'refund-wallet-payment-001',
    now,
  });
  const paidRide = await confirmRidePayment(rides, {
    rideId: ride.id,
    payment: walletPayment.payment,
    confirmedAt: now,
  });

  return {
    rides,
    finance,
    drivers,
    matching,
    paidRide,
    payment: walletPayment.payment,
  };
}

test('sem motorista a carteira é estornada integralmente e de forma idempotente', async () => {
  const ctx = await setupPaidRide();

  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, ctx.paidRide.passengerId),
    3000,
  );
  assert.equal(
    await ctx.finance.getAccountBalanceCents(
      `ride:${ctx.paidRide.id}:escrow`,
    ),
    12000,
  );

  const dispatch = await dispatchRideAfterPayment({
    ride: ctx.paidRide,
    rides: ctx.rides,
    drivers: ctx.drivers,
    matching: ctx.matching,
    now,
  });
  assert.equal(dispatch.kind, 'NO_DRIVER_FOUND');

  const first = await refundWalletRideAfterNoDriver({
    rides: ctx.rides,
    finance: ctx.finance,
    rideId: ctx.paidRide.id,
    paymentId: ctx.payment.id,
    passengerId: ctx.paidRide.passengerId,
    now: new Date('2026-09-23T18:00:01.000Z'),
  });

  assert.equal(first.ride.state, 'REFUNDED');
  assert.equal(first.ride.paymentStatus, 'refunded');
  assert.equal(first.payment.status, 'refunded');
  assert.equal(first.duplicateRefund, false);
  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, ctx.paidRide.passengerId),
    15000,
  );
  assert.equal(
    await ctx.finance.getAccountBalanceCents(
      `ride:${ctx.paidRide.id}:escrow`,
    ),
    0,
  );

  const second = await refundWalletRideAfterNoDriver({
    rides: ctx.rides,
    finance: ctx.finance,
    rideId: ctx.paidRide.id,
    paymentId: ctx.payment.id,
    passengerId: ctx.paidRide.passengerId,
    now: new Date('2026-09-23T18:00:02.000Z'),
  });

  assert.equal(second.duplicateRefund, true);
  assert.equal(second.ride.state, 'REFUNDED');
  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, ctx.paidRide.passengerId),
    15000,
  );
  assert.equal(
    await ctx.finance.getAccountBalanceCents(
      `ride:${ctx.paidRide.id}:escrow`,
    ),
    0,
  );
});

test('retry conclui corrida se o dinheiro já voltou mas o estado parou em REFUND_PENDING', async () => {
  const ctx = await setupPaidRide();

  const noDriverRide = await ctx.rides.save({
    ...ctx.paidRide,
    state: transitionRide(
      transitionRide(ctx.paidRide.state, 'SEARCHING_DRIVER'),
      'NO_DRIVER_FOUND',
    ),
    updatedAt: '2026-09-23T18:00:01.000Z',
  });
  const pendingRide = await ctx.rides.save({
    ...noDriverRide,
    state: transitionRide(noDriverRide.state, 'REFUND_PENDING'),
    updatedAt: '2026-09-23T18:00:02.000Z',
  });

  const financialRefund = await ctx.finance.refundWalletRide({
    paymentId: ctx.payment.id,
    passengerId: pendingRide.passengerId,
    refundedAt: new Date('2026-09-23T18:00:03.000Z'),
  });
  assert.equal(financialRefund.payment.status, 'refunded');

  const recovered = await refundWalletRideAfterNoDriver({
    rides: ctx.rides,
    finance: ctx.finance,
    rideId: pendingRide.id,
    paymentId: ctx.payment.id,
    passengerId: pendingRide.passengerId,
    now: new Date('2026-09-23T18:00:04.000Z'),
  });

  assert.equal(recovered.duplicateRefund, true);
  assert.equal(recovered.ride.state, 'REFUNDED');
  assert.equal(recovered.ride.paymentStatus, 'refunded');
  assert.equal(
    await passengerWalletBalanceCents(ctx.finance, pendingRide.passengerId),
    15000,
  );
});
