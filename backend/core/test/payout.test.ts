import assert from 'node:assert/strict';
import test from 'node:test';

import { requestDriverPayout } from '../src/payments/request-payout.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { settleCompletedRide } from '../src/payments/settlement.js';
import { PayoutDomainError } from '../src/payments/payout.js';
import type { PaymentRecord } from '../src/payments/payment.js';
import type { RideRecord } from '../src/rides/ride.js';

function ride(): RideRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    passengerId: 'passenger-1',
    driverId: 'driver-77',
    state: 'COMPLETED',
    paymentStatus: 'paid',
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
    updatedAt: '2026-09-23T02:00:00.000Z',
  };
}

function payment(): PaymentRecord {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    rideId: ride().id,
    method: 'pix',
    processor: 'test-gateway',
    status: 'paid',
    amountCents: 15000,
    idempotencyKey: 'driver-payout-seed',
    createdAt: '2026-09-23T00:10:00.000Z',
    updatedAt: '2026-09-23T00:11:00.000Z',
  };
}

async function repositoryWithDriverBalance() {
  const repository = new InMemoryFinanceRepository();
  const paid = payment();
  await repository.createPayment({
    ...paid,
    status: 'pending',
  });
  const capture = await repository.capturePayment({
    paymentId: paid.id,
    processorEventId: 'driver-payout-seed-capture',
  });
  await settleCompletedRide(repository, {
    ride: ride(),
    payment: capture.payment,
  });
  await repository.upsertDriverPayoutDestination({
    driverId: 'driver-77',
    pixKeyType: 'random',
    pixKey: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-09-23T02:30:00.000Z',
    updatedAt: '2026-09-23T02:30:00.000Z',
  });
  return repository;
}

test('pedido de saque reserva saldo e impede gasto duplo', async () => {
  const repository = await repositoryWithDriverBalance();

  const result = await requestDriverPayout(repository, {
    driverId: 'driver-77',
    amountCents: 5000,
    idempotencyKey: 'payout-driver-77-001',
    now: new Date('2026-09-23T03:00:00.000Z'),
  });

  assert.equal(result.payout.status, 'requested');
  assert.equal(result.duplicateRequest, false);
  assert.equal(
    await repository.getAccountBalanceCents('driver:driver-77:payable'),
    8500,
  );
  assert.equal(
    await repository.getAccountBalanceCents(
      'driver:driver-77:payout_pending',
    ),
    5000,
  );
});

test('mesmo pedido de saque é idempotente', async () => {
  const repository = await repositoryWithDriverBalance();
  const input = {
    driverId: 'driver-77',
    amountCents: 5000,
    idempotencyKey: 'payout-driver-77-002',
  };

  const first = await requestDriverPayout(repository, input);
  const second = await requestDriverPayout(repository, input);

  assert.equal(first.payout.id, second.payout.id);
  assert.equal(second.duplicateRequest, true);
  assert.equal(
    await repository.getAccountBalanceCents('driver:driver-77:payable'),
    8500,
  );
});

test('saque acima do saldo disponível é recusado', async () => {
  const repository = await repositoryWithDriverBalance();

  await assert.rejects(
    () =>
      requestDriverPayout(repository, {
        driverId: 'driver-77',
        amountCents: 14000,
        idempotencyKey: 'payout-too-high',
      }),
    (error: unknown) =>
      error instanceof PayoutDomainError &&
      error.code === 'INSUFFICIENT_DRIVER_BALANCE',
  );

  assert.equal(
    await repository.getAccountBalanceCents('driver:driver-77:payable'),
    13500,
  );
});


test('concluir saque zera pendência sem devolver saldo disponível', async () => {
  const repository = await repositoryWithDriverBalance();
  const requested = await requestDriverPayout(repository, {
    driverId: 'driver-77',
    amountCents: 5000,
    idempotencyKey: 'payout-driver-77-complete',
    now: new Date('2026-09-23T03:00:00.000Z'),
  });

  const completed = await repository.completeDriverPayout({
    payoutId: requested.payout.id,
    processor: 'Pix manual',
    processorPayoutId: 'receipt-001',
    completedAt: new Date('2026-09-23T03:05:00.000Z'),
  });

  assert.equal(completed.payout.status, 'paid');
  assert.equal(completed.payout.processor, 'Pix manual');
  assert.equal(completed.payout.processorPayoutId, 'receipt-001');
  assert.equal(completed.duplicateCompletion, false);
  assert.equal(
    await repository.getAccountBalanceCents(
      'driver:driver-77:payout_pending',
    ),
    0,
  );
  assert.equal(
    await repository.getAccountBalanceCents(
      'driver:driver-77:payable',
    ),
    8500,
  );
  assert.equal(
    await repository.getAccountBalanceCents(
      'processor:Pix manual:payouts',
    ),
    5000,
  );

  const retry = await repository.completeDriverPayout({
    payoutId: requested.payout.id,
    processor: 'Pix manual',
    processorPayoutId: 'receipt-001',
  });
  assert.equal(retry.duplicateCompletion, true);
  assert.equal(
    await repository.getAccountBalanceCents(
      'driver:driver-77:payout_pending',
    ),
    0,
  );
});

test('cancelar saque devolve integralmente a reserva ao saldo do motorista', async () => {
  const repository = await repositoryWithDriverBalance();
  const requested = await requestDriverPayout(repository, {
    driverId: 'driver-77',
    amountCents: 5000,
    idempotencyKey: 'payout-driver-77-cancel',
    now: new Date('2026-09-23T03:00:00.000Z'),
  });

  const cancelled = await repository.cancelDriverPayout({
    payoutId: requested.payout.id,
    cancelledAt: new Date('2026-09-23T03:05:00.000Z'),
  });

  assert.equal(cancelled.payout.status, 'cancelled');
  assert.equal(cancelled.duplicateCancellation, false);
  assert.equal(
    await repository.getAccountBalanceCents(
      'driver:driver-77:payout_pending',
    ),
    0,
  );
  assert.equal(
    await repository.getAccountBalanceCents(
      'driver:driver-77:payable',
    ),
    13500,
  );

  const retry = await repository.cancelDriverPayout({
    payoutId: requested.payout.id,
  });
  assert.equal(retry.duplicateCancellation, true);
  assert.equal(
    await repository.getAccountBalanceCents(
      'driver:driver-77:payable',
    ),
    13500,
  );
});

test('saque pago não pode ser cancelado depois da conciliação', async () => {
  const repository = await repositoryWithDriverBalance();
  const requested = await requestDriverPayout(repository, {
    driverId: 'driver-77',
    amountCents: 5000,
    idempotencyKey: 'payout-driver-77-terminal',
  });
  await repository.completeDriverPayout({
    payoutId: requested.payout.id,
    processor: 'Pix manual',
  });

  await assert.rejects(
    () =>
      repository.cancelDriverPayout({
        payoutId: requested.payout.id,
      }),
    (error: unknown) =>
      error instanceof PayoutDomainError &&
      error.code === 'INVALID_PAYOUT_TRANSITION',
  );
});
