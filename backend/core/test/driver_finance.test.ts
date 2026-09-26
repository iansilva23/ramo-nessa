import assert from 'node:assert/strict';
import test from 'node:test';

import {
  driverFinanceStatement,
  driverFinanceSummary,
  requestDriverPayoutFromApp,
} from '../src/drivers/driver-finance-service.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { PayoutDomainError } from '../src/payments/payout.js';

const now = new Date('2026-09-23T19:00:00.000Z');

async function fundedFinance() {
  const finance = new InMemoryFinanceRepository();

  const payment = await finance.createPayment({
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    rideId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    method: 'wallet',
    processor: 'internal-wallet',
    status: 'pending',
    amountCents: 10000,
    idempotencyKey: 'finance-seed-payment',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  const capture = await finance.capturePayment({
    paymentId: payment.id,
    processorEventId: 'finance-seed-capture',
    capturedAt: now,
  });

  await finance.settleRide({
    rideId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    paymentId: capture.payment.id,
    driverId: 'driver-finance',
    totalAmountCents: 10000,
    platformCommissionCents: 1000,
    driverNetCents: 9000,
    settledAt: now,
  });
  await finance.upsertDriverPayoutDestination({
    driverId: 'driver-finance',
    pixKeyType: 'random',
    pixKey: '11111111-1111-4111-8111-111111111111',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  return finance;
}

test('resumo separa saldo disponível de saque pendente', async () => {
  const finance = await fundedFinance();

  assert.deepEqual(
    await driverFinanceSummary(finance, 'driver-finance'),
    {
      availableBalanceCents: 9000,
      payoutPendingCents: 0,
      cashCommissionDebtCents: 0,
    },
  );

  const payout = await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-finance',
    amountCents: 4000,
    idempotencyKey: 'payout-finance-001',
  });

  assert.equal(payout.payout.amountCents, 4000);
  assert.equal(payout.payout.status, 'requested');
  assert.equal(payout.duplicateRequest, false);
  assert.deepEqual(payout.finance, {
    availableBalanceCents: 5000,
    payoutPendingCents: 4000,
    cashCommissionDebtCents: 0,
  });
});

test('extrato mostra corrida, taxa e saque com saldo real', async () => {
  const finance = await fundedFinance();

  await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-finance',
    amountCents: 4000,
    idempotencyKey: 'payout-finance-statement',
  });

  const statement = await driverFinanceStatement({
    repository: finance,
    driverId: 'driver-finance',
  });

  assert.equal(statement.finance.availableBalanceCents, 5000);
  assert.equal(statement.finance.payoutPendingCents, 4000);
  assert.equal(statement.items.length, 2);

  const payout = statement.items[0]!;
  assert.equal(payout.kind, 'DRIVER_PAYOUT_RESERVED');
  assert.equal(payout.title, 'Saque solicitado');
  assert.equal(payout.availableDeltaCents, -4000);
  assert.equal(payout.pendingDeltaCents, 4000);
  assert.equal(payout.balanceAfterCents, 5000);

  const ride = statement.items[1]!;
  assert.equal(ride.kind, 'RIDE_SETTLED');
  assert.equal(ride.title, 'Corrida concluída');
  assert.equal(ride.availableDeltaCents, 9000);
  assert.equal(ride.platformFeeCents, 1000);
  assert.equal(ride.balanceAfterCents, 9000);
  assert.equal(
    ride.rideId,
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  );
});

test('solicitação idempotente não reserva saldo duas vezes', async () => {
  const finance = await fundedFinance();

  await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-finance',
    amountCents: 4000,
    idempotencyKey: 'payout-finance-002',
  });
  const repeated = await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-finance',
    amountCents: 4000,
    idempotencyKey: 'payout-finance-002',
  });

  assert.equal(repeated.duplicateRequest, true);
  assert.deepEqual(repeated.finance, {
    availableBalanceCents: 5000,
    payoutPendingCents: 4000,
    cashCommissionDebtCents: 0,
  });
});

test('saque acima do disponível é recusado', async () => {
  const finance = await fundedFinance();

  await assert.rejects(
    requestDriverPayoutFromApp({
      repository: finance,
      driverId: 'driver-finance',
      amountCents: 9001,
      idempotencyKey: 'payout-finance-003',
    }),
    (error: unknown) =>
      error instanceof PayoutDomainError &&
      error.code === 'INSUFFICIENT_DRIVER_BALANCE',
  );
});
