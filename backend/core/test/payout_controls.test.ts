import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DRIVER_ANTICIPATION_FEE_CENTS,
  DRIVER_ANTICIPATION_MINIMUM_CENTS,
  requestDriverPayoutFromApp,
} from '../src/drivers/driver-finance-service.js';
import {
  createScheduledDriverPayouts,
  scheduledDriverPayoutCycleDate,
} from '../src/payments/driver-payout-policy-service.js';
import {
  processDriverPayout,
  reconcileDriverPayouts,
} from '../src/payments/driver-payout-processing-service.js';
import type { DriverPayoutProvider } from '../src/payments/driver-payout-provider.js';
import { PayoutDomainError } from '../src/payments/payout.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';

async function fundedFinance(amountCents = 20_000) {
  const finance = new InMemoryFinanceRepository();
  const payment = await finance.createPayment({
    id: '11111111-1111-4111-8111-111111111111',
    rideId: '22222222-2222-4222-8222-222222222222',
    method: 'wallet',
    processor: 'internal-wallet',
    status: 'pending',
    amountCents: amountCents + 1_000,
    idempotencyKey: 'payout-controls-seed',
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z',
  });
  const captured = await finance.capturePayment({
    paymentId: payment.id,
    processorEventId: 'payout-controls-capture',
  });
  await finance.settleRide({
    rideId: payment.rideId,
    paymentId: captured.payment.id,
    driverId: 'driver-controls',
    totalAmountCents: amountCents + 1_000,
    platformCommissionCents: 1_000,
    driverNetCents: amountCents,
  });
  await finance.upsertDriverPayoutDestination({
    driverId: 'driver-controls',
    pixKeyType: 'random',
    pixKey: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-09-28T10:10:00.000Z',
    updatedAt: '2026-09-28T10:10:00.000Z',
  });
  return finance;
}

test('antecipação exige R$ 80 e não dispara Pix sem aprovação', async () => {
  const finance = await fundedFinance();
  await assert.rejects(
    requestDriverPayoutFromApp({
      repository: finance,
      driverId: 'driver-controls',
      amountCents: DRIVER_ANTICIPATION_MINIMUM_CENTS - 1,
      idempotencyKey: 'early-minimum-test',
    }),
    (error: unknown) =>
      error instanceof PayoutDomainError &&
      error.code === 'PAYOUT_ANTICIPATION_MINIMUM',
  );

  const request = await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-controls',
    amountCents: 10_000,
    idempotencyKey: 'early-approval-test',
  });
  assert.equal(request.payout.requestedAmountCents, 10_000);
  assert.equal(request.payout.feeCents, DRIVER_ANTICIPATION_FEE_CENTS);
  assert.equal(request.payout.amountCents, 9_000);
  assert.equal(request.payout.approvedAt, undefined);
  assert.equal(
    await finance.getAccountBalanceCents('driver:driver-controls:payable'),
    10_000,
  );
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-controls:payout_pending',
    ),
    10_000,
  );

  let sends = 0;
  const provider: DriverPayoutProvider = {
    name: 'test-provider',
    async createPixPayout() {
      sends += 1;
      return { providerPayoutId: 'provider-early', status: 'paid' };
    },
    async getPayoutStatus() {
      throw new Error('not expected');
    },
  };
  await assert.rejects(
    processDriverPayout({
      finance,
      provider,
      payoutId: request.payout.id,
    }),
    (error: unknown) =>
      error instanceof PayoutDomainError &&
      error.code === 'PAYOUT_APPROVAL_REQUIRED',
  );
  const batch = await reconcileDriverPayouts({ finance, provider });
  assert.equal(sends, 0);
  assert.equal(batch.paid, 0);
});

test('aprovação cobra R$ 10 uma vez e envia somente o líquido', async () => {
  const finance = await fundedFinance();
  const request = await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-controls',
    amountCents: 10_000,
    idempotencyKey: 'early-fee-test',
  });
  const approved = await finance.approveDriverPayout({
    payoutId: request.payout.id,
    approvedAt: new Date('2026-09-28T11:00:00.000Z'),
  });
  assert.equal(approved.payout.requestedAmountCents, 10_000);
  assert.equal(approved.payout.feeCents, 1_000);
  assert.equal(approved.payout.amountCents, 9_000);
  assert.equal(await finance.getAccountBalanceCents('platform:revenue'), 2_000);
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-controls:payout_pending',
    ),
    9_000,
  );

  const duplicate = await finance.approveDriverPayout({
    payoutId: request.payout.id,
  });
  assert.equal(duplicate.duplicateApproval, true);
  assert.equal(await finance.getAccountBalanceCents('platform:revenue'), 2_000);

  let sentAmount = 0;
  const provider: DriverPayoutProvider = {
    name: 'test-provider',
    async createPixPayout(input) {
      sentAmount = input.amountCents;
      return { providerPayoutId: 'provider-paid', status: 'paid' };
    },
    async getPayoutStatus() {
      throw new Error('not expected');
    },
  };
  const paid = await processDriverPayout({
    finance,
    provider,
    payoutId: request.payout.id,
  });
  assert.equal(paid.kind, 'paid');
  assert.equal(sentAmount, 9_000);
});

test('recusa antes da aprovação devolve o bruto sem cobrar taxa', async () => {
  const finance = await fundedFinance();
  const request = await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-controls',
    amountCents: 10_000,
    idempotencyKey: 'early-reject-test',
  });
  await finance.cancelDriverPayout({ payoutId: request.payout.id });
  assert.equal(
    await finance.getAccountBalanceCents('driver:driver-controls:payable'),
    20_000,
  );
  assert.equal(await finance.getAccountBalanceCents('platform:revenue'), 1_000);
});

test('falha Pix após aprovação devolve bruto e estorna a taxa', async () => {
  const finance = await fundedFinance();
  const request = await requestDriverPayoutFromApp({
    repository: finance,
    driverId: 'driver-controls',
    amountCents: 10_000,
    idempotencyKey: 'early-failure-test',
  });
  await finance.approveDriverPayout({ payoutId: request.payout.id });
  const provider: DriverPayoutProvider = {
    name: 'test-provider',
    async createPixPayout() {
      return { providerPayoutId: 'provider-failed', status: 'failed' };
    },
    async getPayoutStatus() {
      throw new Error('not expected');
    },
  };
  await processDriverPayout({
    finance,
    provider,
    payoutId: request.payout.id,
  });
  assert.equal(
    await finance.getAccountBalanceCents('driver:driver-controls:payable'),
    20_000,
  );
  assert.equal(await finance.getAccountBalanceCents('platform:revenue'), 1_000);
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-controls:payout_pending',
    ),
    0,
  );
});

test('repasse normal respeita seg/qua/sex 07h Fortaleza e pode ser pausado', async () => {
  const before = new Date('2026-09-30T09:59:00.000Z');
  const atSeven = new Date('2026-09-30T10:00:00.000Z');
  const thursday = new Date('2026-10-01T10:00:00.000Z');
  assert.equal(scheduledDriverPayoutCycleDate(before), null);
  assert.equal(scheduledDriverPayoutCycleDate(atSeven), '2026-09-30');
  assert.equal(scheduledDriverPayoutCycleDate(thursday), null);

  const finance = await fundedFinance(9_000);
  const scheduled = await createScheduledDriverPayouts({
    finance,
    now: atSeven,
  });
  assert.equal(scheduled.created.length, 1);
  assert.equal(scheduled.created[0]?.payoutKind, 'scheduled');
  assert.equal(scheduled.created[0]?.feeCents, 0);
  assert.ok(scheduled.created[0]?.approvedAt);

  const pausedFinance = await fundedFinance(9_000);
  await pausedFinance.setDriverPayoutAutomaticEnabled({
    automaticEnabled: false,
  });
  const paused = await createScheduledDriverPayouts({
    finance: pausedFinance,
    now: atSeven,
  });
  assert.equal(paused.created.length, 0);
  assert.equal(paused.automaticEnabled, false);
});
