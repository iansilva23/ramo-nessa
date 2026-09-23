import assert from 'node:assert/strict';
import test from 'node:test';

import { createPaymentForRide } from '../src/payments/create-payment.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import {
  creditPassengerWallet,
  getPassengerWalletBalance,
  payRideUsingWallet,
} from '../src/payments/wallet-service.js';
import { WalletDomainError } from '../src/payments/wallet.js';
import type { RideRecord } from '../src/rides/ride.js';

function ride(): RideRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    passengerId: 'passenger-wallet-1',
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

test('recarga confirmada aumenta saldo e é idempotente', async () => {
  const repository = new InMemoryFinanceRepository();

  const first = await creditPassengerWallet(repository, {
    passengerId: 'passenger-wallet-1',
    processor: 'test-gateway',
    processorEventId: 'topup-event-001',
    amountCents: 20000,
    creditedAt: new Date('2026-09-23T04:00:00.000Z'),
  });

  const second = await creditPassengerWallet(repository, {
    passengerId: 'passenger-wallet-1',
    processor: 'test-gateway',
    processorEventId: 'topup-event-001',
    amountCents: 20000,
  });

  assert.equal(first.duplicateCredit, false);
  assert.equal(second.duplicateCredit, true);
  assert.equal(
    await getPassengerWalletBalance(repository, 'passenger-wallet-1'),
    20000,
  );
});

test('pagamento com carteira move saldo para escrow da corrida', async () => {
  const repository = new InMemoryFinanceRepository();
  const currentRide = ride();

  await creditPassengerWallet(repository, {
    passengerId: currentRide.passengerId,
    processor: 'test-gateway',
    processorEventId: 'topup-event-002',
    amountCents: 20000,
  });

  const payment = await createPaymentForRide(repository, {
    ride: currentRide,
    method: 'wallet',
    processor: 'internal-wallet',
    idempotencyKey: 'wallet-ride-payment-001',
  });

  const result = await payRideUsingWallet(repository, {
    passengerId: currentRide.passengerId,
    rideId: currentRide.id,
    paymentId: payment.id,
    amountCents: currentRide.quote.totalAmountCents,
  });

  assert.equal(result.payment.status, 'paid');
  assert.equal(result.balanceCents, 5000);
  assert.equal(
    await repository.getAccountBalanceCents(
      `ride:${currentRide.id}:escrow`,
    ),
    15000,
  );
});

test('pagamento de carteira é idempotente', async () => {
  const repository = new InMemoryFinanceRepository();
  const currentRide = ride();

  await creditPassengerWallet(repository, {
    passengerId: currentRide.passengerId,
    processor: 'test-gateway',
    processorEventId: 'topup-event-003',
    amountCents: 20000,
  });

  const payment = await createPaymentForRide(repository, {
    ride: currentRide,
    method: 'wallet',
    processor: 'internal-wallet',
    idempotencyKey: 'wallet-ride-payment-002',
  });

  const input = {
    passengerId: currentRide.passengerId,
    rideId: currentRide.id,
    paymentId: payment.id,
    amountCents: 15000,
  };

  const first = await payRideUsingWallet(repository, input);
  const second = await payRideUsingWallet(repository, input);

  assert.equal(first.duplicatePayment, false);
  assert.equal(second.duplicatePayment, true);
  assert.equal(second.balanceCents, 5000);
});

test('carteira nunca fica negativa', async () => {
  const repository = new InMemoryFinanceRepository();
  const currentRide = ride();

  await creditPassengerWallet(repository, {
    passengerId: currentRide.passengerId,
    processor: 'test-gateway',
    processorEventId: 'topup-event-004',
    amountCents: 10000,
  });

  const payment = await createPaymentForRide(repository, {
    ride: currentRide,
    method: 'wallet',
    processor: 'internal-wallet',
    idempotencyKey: 'wallet-ride-payment-003',
  });

  await assert.rejects(
    () =>
      payRideUsingWallet(repository, {
        passengerId: currentRide.passengerId,
        rideId: currentRide.id,
        paymentId: payment.id,
        amountCents: 15000,
      }),
    (error: unknown) =>
      error instanceof WalletDomainError &&
      error.code === 'INSUFFICIENT_WALLET_BALANCE',
  );

  assert.equal(
    await getPassengerWalletBalance(repository, currentRide.passengerId),
    10000,
  );
});
