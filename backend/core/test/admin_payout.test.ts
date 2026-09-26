import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminPayoutError,
  cancelAdminPayout,
  completeAdminPayout,
  getAdminPayoutDetail,
} from '../src/admin/admin-payout-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { requestDriverPayout } from '../src/payments/request-payout.js';
import { settleCompletedRide } from '../src/payments/settlement.js';
import type { PaymentRecord } from '../src/payments/payment.js';
import type { RideRecord } from '../src/rides/ride.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-payout-test',
  name: 'Admin Payout Test',
};

function ride(): RideRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    passengerId: 'passenger-payout-admin',
    driverId: 'driver-payout-admin',
    state: 'COMPLETED',
    paymentStatus: 'paid',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'prea-jijoca-car',
      baseAmountCents: 10000,
      pickupCompensationCents: 0,
      totalAmountCents: 10000,
      platformCommissionCents: 1000,
      driverNetCents: 9000,
    },
    createdAt: '2026-09-26T16:00:00.000Z',
    updatedAt: '2026-09-26T16:20:00.000Z',
  };
}

async function setup() {
  const finance = new InMemoryFinanceRepository();
  const admin = new InMemoryAdminRepository();
  const payment: PaymentRecord = {
    id: '22222222-2222-4222-8222-222222222222',
    rideId: ride().id,
    method: 'pix',
    processor: 'test',
    status: 'pending',
    amountCents: 10000,
    idempotencyKey: 'admin-payout-seed',
    createdAt: '2026-09-26T16:01:00.000Z',
    updatedAt: '2026-09-26T16:01:00.000Z',
  };
  await finance.createPayment(payment);
  const captured = await finance.capturePayment({
    paymentId: payment.id,
    processorEventId: 'admin-payout-capture',
  });
  await settleCompletedRide(finance, {
    ride: ride(),
    payment: captured.payment,
  });
  await finance.upsertDriverPayoutDestination({
    driverId: 'driver-payout-admin',
    pixKeyType: 'random',
    pixKey: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-09-26T16:30:00.000Z',
    updatedAt: '2026-09-26T16:30:00.000Z',
  });
  const requested = await requestDriverPayout(finance, {
    driverId: 'driver-payout-admin',
    amountCents: 4000,
    idempotencyKey: 'admin-payout-request',
    now: new Date('2026-09-26T16:31:00.000Z'),
  });
  return { finance, admin, payout: requested.payout };
}

test('Admin consulta e registra repasse pago com auditoria', async () => {
  const ctx = await setup();

  const detail = await getAdminPayoutDetail({
    finance: ctx.finance,
    payoutId: ctx.payout.id,
  });
  assert.equal(detail.pixKey, ctx.payout.pixKey);
  assert.equal(detail.status, 'requested');

  const completed = await completeAdminPayout({
    finance: ctx.finance,
    admin: ctx.admin,
    actor,
    payoutId: ctx.payout.id,
    processor: 'Pix manual',
    processorPayoutId: 'comprovante-admin-001',
    now: new Date('2026-09-26T16:35:00.000Z'),
  });

  assert.equal(completed.payout.status, 'paid');
  assert.equal(completed.duplicate, false);

  const duplicate = await completeAdminPayout({
    finance: ctx.finance,
    admin: ctx.admin,
    actor,
    payoutId: ctx.payout.id,
    processor: 'Pix manual',
    processorPayoutId: 'comprovante-admin-001',
  });
  assert.equal(duplicate.duplicate, true);

  const audit = await ctx.admin.listAudit(10);
  assert.equal(
    audit.filter((entry) => entry.action === 'finance.payout.paid').length,
    1,
  );
  assert.equal(audit[0]?.targetId, ctx.payout.id);
  assert.equal(audit[0]?.metadata?.amountCents, 4000);
});

test('Admin cancela saque e registra devolução em auditoria', async () => {
  const ctx = await setup();

  const cancelled = await cancelAdminPayout({
    finance: ctx.finance,
    admin: ctx.admin,
    actor,
    payoutId: ctx.payout.id,
    now: new Date('2026-09-26T16:36:00.000Z'),
  });

  assert.equal(cancelled.payout.status, 'cancelled');
  assert.equal(
    await ctx.finance.getAccountBalanceCents(
      'driver:driver-payout-admin:payable',
    ),
    9000,
  );

  const audit = await ctx.admin.listAudit(10);
  assert.equal(audit[0]?.action, 'finance.payout.cancelled');
  assert.equal(
    audit[0]?.metadata?.fundsReturnedToDriverBalance,
    true,
  );
});

test('Admin recebe PAYOUT_NOT_FOUND consistente em consulta e mutação', async () => {
  const finance = new InMemoryFinanceRepository();
  const admin = new InMemoryAdminRepository();
  const missing = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  for (const action of [
    () => getAdminPayoutDetail({ finance, payoutId: missing }),
    () =>
      completeAdminPayout({
        finance,
        admin,
        actor,
        payoutId: missing,
        processor: 'Pix manual',
      }),
    () =>
      cancelAdminPayout({
        finance,
        admin,
        actor,
        payoutId: missing,
      }),
  ]) {
    await assert.rejects(
      action,
      (error: unknown) =>
        error instanceof AdminPayoutError &&
        error.code === 'PAYOUT_NOT_FOUND',
    );
  }
});
