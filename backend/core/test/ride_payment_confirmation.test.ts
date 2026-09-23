import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import {
  createWalletTopup,
  payRideWithWallet,
} from '../src/payments/wallet-services.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import type { RideRecord } from '../src/rides/ride.js';

function awaitingRide(): RideRecord {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    passengerId: 'passenger-confirm',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    category: 'comfort_black',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'jeri-prea-comfort',
      baseAmountCents: 15000,
      pickupCompensationCents: 0,
      totalAmountCents: 15000,
      platformCommissionCents: 1500,
      driverNetCents: 13500,
    },
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  };
}

test('pagamento da carteira confirma corrida como PAID', async () => {
  const rides = new InMemoryRideRepository();
  const finance = new InMemoryFinanceRepository();
  const ride = await rides.create(awaitingRide());

  const topup = await createWalletTopup(finance, {
    passengerId: ride.passengerId,
    method: 'pix',
    processor: 'test-gateway',
    amountCents: 20000,
    idempotencyKey: 'confirm-topup-001',
  });
  await finance.captureWalletTopup({
    walletTopupId: topup.id,
    processorEventId: 'confirm-topup-event-001',
  });

  const walletPayment = await payRideWithWallet(finance, {
    ride,
    passengerId: ride.passengerId,
    idempotencyKey: 'confirm-wallet-payment-001',
  });

  const confirmed = await confirmRidePayment(rides, {
    rideId: ride.id,
    payment: walletPayment.payment,
    confirmedAt: new Date('2026-09-23T00:10:00.000Z'),
  });

  assert.equal(confirmed.state, 'PAID');
  assert.equal(confirmed.paymentStatus, 'paid');

  const stored = await rides.findById(ride.id);
  assert.equal(stored?.state, 'PAID');
});

test('confirmação repetida é idempotente', async () => {
  const rides = new InMemoryRideRepository();
  const ride = await rides.create(awaitingRide());

  const payment = {
    id: '88888888-8888-4888-8888-888888888888',
    rideId: ride.id,
    method: 'wallet' as const,
    processor: 'internal-wallet',
    status: 'paid' as const,
    amountCents: 15000,
    idempotencyKey: 'confirm-idempotent-001',
    createdAt: '2026-09-23T00:01:00.000Z',
    updatedAt: '2026-09-23T00:01:00.000Z',
  };

  const first = await confirmRidePayment(rides, {
    rideId: ride.id,
    payment,
  });
  const second = await confirmRidePayment(rides, {
    rideId: ride.id,
    payment,
  });

  assert.equal(first.state, 'PAID');
  assert.deepEqual(second, first);
});
