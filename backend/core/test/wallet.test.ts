import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import {
  createWalletTopup,
  passengerWalletBalanceCents,
  payRideWithWallet,
} from '../src/payments/wallet-services.js';
import { WalletDomainError } from '../src/payments/wallet.js';
import type { RideRecord } from '../src/rides/ride.js';

function ride(amountCents = 6000): RideRecord {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    passengerId: 'passenger-wallet',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    origin: { zoneId: 'jijoca', localityId: 'jijoca' },
    destination: { zoneId: 'jijoca', localityId: 'mangue-seco' },
    category: 'moto',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'jijoca-mangue-seco-moto',
      baseAmountCents: amountCents,
      pickupCompensationCents: 0,
      totalAmountCents: amountCents,
      platformCommissionCents: Math.round(amountCents * 0.1),
      driverNetCents:
        amountCents - Math.round(amountCents * 0.1),
    },
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
  };
}

async function walletWithBalance(amountCents = 10000) {
  const repository = new InMemoryFinanceRepository();
  const topup = await createWalletTopup(repository, {
    passengerId: 'passenger-wallet',
    method: 'pix',
    processor: 'test-gateway',
    amountCents,
    idempotencyKey: 'wallet-topup-001',
  });

  await repository.captureWalletTopup({
    walletTopupId: topup.id,
    processorEventId: 'wallet-topup-event-001',
  });

  return repository;
}

test('recarga só vira saldo após captura confirmada', async () => {
  const repository = new InMemoryFinanceRepository();
  const topup = await createWalletTopup(repository, {
    passengerId: 'passenger-wallet',
    method: 'pix',
    processor: 'test-gateway',
    amountCents: 10000,
    idempotencyKey: 'wallet-topup-002',
  });

  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    0,
  );

  const captured = await repository.captureWalletTopup({
    walletTopupId: topup.id,
    processorEventId: 'wallet-topup-event-002',
  });

  assert.equal(captured.topup.status, 'paid');
  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    10000,
  );

  const duplicate = await repository.captureWalletTopup({
    walletTopupId: topup.id,
    processorEventId: 'wallet-topup-event-002',
  });

  assert.equal(duplicate.duplicateEvent, true);
  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    10000,
  );
});

test('carteira paga corrida e move saldo para escrow', async () => {
  const repository = await walletWithBalance();

  const result = await payRideWithWallet(repository, {
    ride: ride(6000),
    passengerId: 'passenger-wallet',
    idempotencyKey: 'wallet-ride-payment-001',
  });

  assert.equal(result.payment.status, 'paid');
  assert.equal(result.payment.method, 'wallet');
  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    4000,
  );
  assert.equal(
    await repository.getAccountBalanceCents(
      'ride:66666666-6666-4666-8666-666666666666:escrow',
    ),
    6000,
  );
});

test('pagamento da carteira é idempotente', async () => {
  const repository = await walletWithBalance();
  const input = {
    ride: ride(6000),
    passengerId: 'passenger-wallet',
    idempotencyKey: 'wallet-ride-payment-002',
  };

  const first = await payRideWithWallet(repository, input);
  const second = await payRideWithWallet(repository, input);

  assert.equal(first.payment.id, second.payment.id);
  assert.equal(second.duplicatePayment, true);
  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    4000,
  );
});

test('carteira nunca permite saldo negativo', async () => {
  const repository = await walletWithBalance(5000);

  await assert.rejects(
    () =>
      payRideWithWallet(repository, {
        ride: ride(6000),
        passengerId: 'passenger-wallet',
        idempotencyKey: 'wallet-insufficient-001',
      }),
    (error: unknown) =>
      error instanceof WalletDomainError &&
      error.code === 'INSUFFICIENT_WALLET_BALANCE',
  );

  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    5000,
  );
});


test('mesmo evento do gateway não pode capturar recargas diferentes', async () => {
  const repository = new InMemoryFinanceRepository();

  const first = await createWalletTopup(repository, {
    passengerId: 'passenger-wallet',
    method: 'pix',
    processor: 'test-gateway',
    amountCents: 5000,
    idempotencyKey: 'wallet-cross-event-001',
  });
  const second = await createWalletTopup(repository, {
    passengerId: 'passenger-wallet',
    method: 'pix',
    processor: 'test-gateway',
    amountCents: 7000,
    idempotencyKey: 'wallet-cross-event-002',
  });

  await repository.captureWalletTopup({
    walletTopupId: first.id,
    processorEventId: 'wallet-event-shared',
  });

  await assert.rejects(
    () =>
      repository.captureWalletTopup({
        walletTopupId: second.id,
        processorEventId: 'wallet-event-shared',
      }),
    (error: unknown) =>
      error instanceof WalletDomainError &&
      error.code === 'WALLET_IDEMPOTENCY_CONFLICT',
  );

  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    5000,
  );
});


test('carteira não debita a mesma corrida duas vezes com chaves diferentes', async () => {
  const repository = await walletWithBalance(20000);
  const currentRide = ride(6000);

  await payRideWithWallet(repository, {
    ride: currentRide,
    passengerId: 'passenger-wallet',
    idempotencyKey: 'wallet-one-paid-ride-a',
  });

  await assert.rejects(
    () =>
      payRideWithWallet(repository, {
        ride: currentRide,
        passengerId: 'passenger-wallet',
        idempotencyKey: 'wallet-one-paid-ride-b',
      }),
    (error: unknown) =>
      error instanceof WalletDomainError &&
      error.code === 'RIDE_ALREADY_PAID',
  );

  assert.equal(
    await passengerWalletBalanceCents(repository, 'passenger-wallet'),
    14000,
  );
  assert.equal(
    await repository.getAccountBalanceCents(
      'ride:66666666-6666-4666-8666-666666666666:escrow',
    ),
    6000,
  );
});
