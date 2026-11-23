import assert from 'node:assert/strict';
import test from 'node:test';

import { CompanyPayoutError } from '../src/payments/company-payout.js';
import {
  processCompanyPayout,
} from '../src/payments/company-payout-processing-service.js';
import type { DriverPayoutProvider } from '../src/payments/driver-payout-provider.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { requestCompanyPayout } from '../src/payments/request-company-payout.js';

async function financeWithCompanyRevenue() {
  const finance = new InMemoryFinanceRepository();
  await finance.upsertCompanyPayoutDestination({
    pixKeyType: 'random',
    pixKey: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-09-30T08:00:00.000Z',
    updatedAt: '2026-09-30T08:00:00.000Z',
  });

  await finance.createPayment({
    id: '33333333-3333-4333-8333-333333333333',
    rideId: '22222222-2222-4222-8222-222222222222',
    method: 'pix',
    processor: 'company-payout-test',
    status: 'pending',
    amountCents: 10_000,
    idempotencyKey: 'company-payout-payment-seed',
    createdAt: '2026-09-30T08:05:00.000Z',
    updatedAt: '2026-09-30T08:05:00.000Z',
  });
  await finance.capturePayment({
    paymentId: '33333333-3333-4333-8333-333333333333',
    processorEventId: 'company-payout-capture-seed',
    capturedAt: new Date('2026-09-30T08:06:00.000Z'),
  });

  await finance.settleRide({
    rideId: '22222222-2222-4222-8222-222222222222',
    paymentId: '33333333-3333-4333-8333-333333333333',
    driverId: 'driver-company-profit',
    totalAmountCents: 10_000,
    fareAmountCents: 10_000,
    paymentAdjustmentCents: 0,
    platformCommissionCents: 1_000,
    driverNetCents: 9_000,
    settledAt: new Date('2026-09-30T08:10:00.000Z'),
  });
  return finance;
}

test('repasse da empresa reserva somente receita realmente disponível', async () => {
  const finance = await financeWithCompanyRevenue();
  const before = await finance.adminFinanceSummary();
  assert.equal(before.platformRevenueCents, 1_000);
  assert.equal(before.companyProfitAvailableCents, 1_000);
  assert.equal(before.companyPayoutPendingCents, 0);

  const requested = await requestCompanyPayout({
    finance,
    amountCents: 700,
    idempotencyKey: 'company-profit-request-001',
    now: new Date('2026-09-30T08:20:00.000Z'),
  });

  assert.equal(requested.payout.amountCents, 700);
  assert.equal(requested.payout.status, 'requested');

  const after = await finance.adminFinanceSummary();
  assert.equal(after.platformRevenueCents, 300);
  assert.equal(after.companyProfitAvailableCents, 300);
  assert.equal(after.companyPayoutPendingCents, 700);
});

test('comissão cash ainda não recebida não pode virar retirada da empresa', async () => {
  const finance = new InMemoryFinanceRepository();
  await finance.upsertCompanyPayoutDestination({
    pixKeyType: 'email',
    pixKey: 'empresa@example.com',
    createdAt: '2026-09-30T09:00:00.000Z',
    updatedAt: '2026-09-30T09:00:00.000Z',
  });
  await finance.settleCashRide({
    rideId: '44444444-4444-4444-8444-444444444444',
    driverId: 'driver-cash-debt-company',
    platformCommissionCents: 1_000,
    settledAt: new Date('2026-09-30T09:10:00.000Z'),
  });

  const summary = await finance.adminFinanceSummary();
  assert.equal(summary.platformRevenueCents, 1_000);
  assert.equal(summary.driverCashCommissionDebtCents, 1_000);
  assert.equal(summary.companyProfitAvailableCents, 0);

  await assert.rejects(
    requestCompanyPayout({
      finance,
      amountCents: 100,
      idempotencyKey: 'company-profit-cash-debt',
    }),
    (error: unknown) =>
      error instanceof CompanyPayoutError &&
      error.code === 'INSUFFICIENT_COMPANY_BALANCE',
  );
});

test('Pix pago conclui retirada da empresa sem duplicar ledger', async () => {
  const finance = await financeWithCompanyRevenue();
  const requested = await requestCompanyPayout({
    finance,
    amountCents: 1_000,
    idempotencyKey: 'company-profit-paid-001',
  });

  let sends = 0;
  const provider: DriverPayoutProvider = {
    name: 'mercado-pago-payouts',
    async createPixPayout(input) {
      sends += 1;
      assert.equal(input.amountCents, 1_000);
      assert.equal(
        input.pixKey,
        '11111111-1111-4111-8111-111111111111',
      );
      return {
        providerPayoutId: 'POP01COMPANY/TOP01COMPANY',
        status: 'paid',
      };
    },
    async getPayoutStatus() {
      throw new Error('not expected');
    },
  };

  const paid = await processCompanyPayout({
    finance,
    provider,
    payoutId: requested.payout.id,
  });
  assert.equal(paid.kind, 'paid');
  assert.equal(sends, 1);

  const summary = await finance.adminFinanceSummary();
  assert.equal(summary.companyPayoutPendingCents, 0);
  assert.equal(summary.companyProfitAvailableCents, 0);

  const terminal = await processCompanyPayout({
    finance,
    provider,
    payoutId: requested.payout.id,
  });
  assert.equal(terminal.kind, 'terminal');
  assert.equal(sends, 1);
});

test('falha do Pix devolve integralmente o saldo da empresa', async () => {
  const finance = await financeWithCompanyRevenue();
  const requested = await requestCompanyPayout({
    finance,
    amountCents: 800,
    idempotencyKey: 'company-profit-failed-001',
  });

  const provider: DriverPayoutProvider = {
    name: 'mercado-pago-payouts',
    async createPixPayout() {
      return {
        providerPayoutId: 'POP01FAILED/TOP01FAILED',
        status: 'failed',
      };
    },
    async getPayoutStatus() {
      throw new Error('not expected');
    },
  };

  const failed = await processCompanyPayout({
    finance,
    provider,
    payoutId: requested.payout.id,
  });
  assert.equal(failed.kind, 'failed');

  const summary = await finance.adminFinanceSummary();
  assert.equal(summary.platformRevenueCents, 1_000);
  assert.equal(summary.companyProfitAvailableCents, 1_000);
  assert.equal(summary.companyPayoutPendingCents, 0);
});

test('repasse da empresa é idempotente', async () => {
  const finance = await financeWithCompanyRevenue();
  const first = await requestCompanyPayout({
    finance,
    amountCents: 500,
    idempotencyKey: 'company-profit-idempotent',
  });
  const second = await requestCompanyPayout({
    finance,
    amountCents: 500,
    idempotencyKey: 'company-profit-idempotent',
  });

  assert.equal(second.duplicateRequest, true);
  assert.equal(second.payout.id, first.payout.id);

  const summary = await finance.adminFinanceSummary();
  assert.equal(summary.companyPayoutPendingCents, 500);
  assert.equal(summary.companyProfitAvailableCents, 500);
});
