import assert from 'node:assert/strict';
import test from 'node:test';

import { adminFinanceView } from '../src/admin/admin-finance-service.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import type { PaymentRecord } from '../src/payments/payment.js';
import type { DriverPayoutRecord } from '../src/payments/payout.js';

test('financeiro Admin deriva comissão e saldos do ledger real', async () => {
  const finance = new InMemoryFinanceRepository();
  const paidPayment: PaymentRecord = {
    id: '11111111-1111-4111-8111-111111111111',
    rideId: '22222222-2222-4222-8222-222222222222',
    method: 'pix',
    processor: 'dev',
    status: 'pending',
    amountCents: 10000,
    idempotencyKey: 'admin-finance-paid-payment',
    createdAt: '2026-09-24T01:00:00.000Z',
    updatedAt: '2026-09-24T01:00:00.000Z',
  };
  await finance.createPayment(paidPayment);
  await finance.capturePayment({
    paymentId: paidPayment.id,
    processorEventId: 'event-admin-finance-paid',
    processorPaymentId: 'processor-payment-secret',
    capturedAt: new Date('2026-09-24T01:01:00.000Z'),
  });
  await finance.settleRide({
    rideId: paidPayment.rideId,
    paymentId: paidPayment.id,
    driverId: 'driver-finance-admin',
    totalAmountCents: 10000,
    platformCommissionCents: 1000,
    driverNetCents: 9000,
    settledAt: new Date('2026-09-24T01:02:00.000Z'),
  });

  const pendingPayment: PaymentRecord = {
    id: '33333333-3333-4333-8333-333333333333',
    rideId: '44444444-4444-4444-8444-444444444444',
    method: 'card',
    processor: 'dev',
    status: 'pending',
    amountCents: 5000,
    idempotencyKey: 'admin-finance-pending-payment',
    createdAt: '2026-09-24T01:03:00.000Z',
    updatedAt: '2026-09-24T01:03:00.000Z',
  };
  await finance.createPayment(pendingPayment);

  const payout: DriverPayoutRecord = {
    id: '55555555-5555-4555-8555-555555555555',
    driverId: 'driver-finance-admin',
    amountCents: 3000,
    status: 'requested',
    idempotencyKey: 'admin-finance-payout',
    createdAt: '2026-09-24T01:04:00.000Z',
    updatedAt: '2026-09-24T01:04:00.000Z',
  };
  await finance.reserveDriverPayout(payout);

  const view = await adminFinanceView({
    finance,
    limit: 10,
  });

  assert.equal(view.readOnly, true);
  assert.deepEqual(view.summary, {
    paymentsTotal: 2,
    paymentsPaid: 1,
    paymentsPaidCents: 10000,
    paymentsPending: 1,
    paymentsFailed: 0,
    paymentsCancelled: 0,
    paymentsRefunded: 0,
    platformRevenueCents: 1000,
    driverPayableCents: 6000,
    driverPayoutPendingCents: 3000,
    driverCashCommissionDebtCents: 0,
    rideEscrowCents: 0,
    passengerWalletCents: 0,
    payoutsRequested: 1,
    payoutsRequestedCents: 3000,
  });

  assert.equal(view.payments.length, 2);
  assert.equal(view.payments[0]?.id, pendingPayment.id);
  assert.equal(view.payments[1]?.status, 'paid');
  assert.equal(
    'idempotencyKey' in (view.payments[0] ?? {}),
    false,
  );
  assert.equal(
    'processorPaymentId' in (view.payments[1] ?? {}),
    false,
  );

  assert.equal(view.payouts.length, 1);
  assert.equal(view.payouts[0]?.amountCents, 3000);
  assert.equal(
    'idempotencyKey' in (view.payouts[0] ?? {}),
    false,
  );
  assert.equal(
    'processorPayoutId' in (view.payouts[0] ?? {}),
    false,
  );
});
