import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';

test('corrida cash gera dívida de comissão e retry é idempotente', async () => {
  const finance = new InMemoryFinanceRepository();

  const first = await finance.settleCashRide({
    rideId: 'cash-ride-001',
    driverId: 'driver-cash-001',
    platformCommissionCents: 1200,
    settledAt: new Date('2026-09-24T03:00:00.000Z'),
  });

  assert.equal(first.duplicateSettlement, false);
  assert.equal(first.cashDebtCents, 1200);
  assert.equal(
    await finance.getDriverCashDebtCents('driver-cash-001'),
    1200,
  );
  assert.equal(
    await finance.getAccountBalanceCents('platform:revenue'),
    1200,
  );

  const retry = await finance.settleCashRide({
    rideId: 'cash-ride-001',
    driverId: 'driver-cash-001',
    platformCommissionCents: 1200,
    settledAt: new Date('2026-09-24T03:01:00.000Z'),
  });

  assert.equal(retry.duplicateSettlement, true);
  assert.equal(retry.cashDebtCents, 1200);
  assert.equal(
    await finance.getAccountBalanceCents('platform:revenue'),
    1200,
  );
});

test('corrida digital amortiza dívida cash antes de liberar saldo sacável', async () => {
  const finance = new InMemoryFinanceRepository();
  const driverId = 'driver-cash-recovery';

  await finance.settleCashRide({
    rideId: 'cash-ride-debt',
    driverId,
    platformCommissionCents: 3000,
  });

  await finance.createPayment({
    id: 'digital-payment-001',
    rideId: 'digital-ride-001',
    method: 'wallet',
    processor: 'internal-wallet',
    status: 'pending',
    amountCents: 10000,
    idempotencyKey: 'digital-payment-001-key',
    createdAt: '2026-09-24T03:10:00.000Z',
    updatedAt: '2026-09-24T03:10:00.000Z',
  });
  const captured = await finance.capturePayment({
    paymentId: 'digital-payment-001',
    processorEventId: 'digital-payment-001-event',
    capturedAt: new Date('2026-09-24T03:11:00.000Z'),
  });

  const settlement = await finance.settleRide({
    rideId: 'digital-ride-001',
    paymentId: captured.payment.id,
    driverId,
    totalAmountCents: 10000,
    platformCommissionCents: 1000,
    driverNetCents: 9000,
    settledAt: new Date('2026-09-24T03:12:00.000Z'),
  });

  assert.equal(settlement.cashDebtRecoveredCents, 3000);
  assert.equal(
    await finance.getDriverCashDebtCents(driverId),
    0,
  );
  assert.equal(
    await finance.getAccountBalanceCents(
      `driver:${driverId}:payable`,
    ),
    6000,
  );
  assert.equal(
    await finance.getAccountBalanceCents('platform:revenue'),
    4000,
  );

  const summary = await finance.adminFinanceSummary();
  assert.equal(summary.driverCashCommissionDebtCents, 0);
});

test('dívida cash maior que ganho digital é amortizada parcialmente', async () => {
  const finance = new InMemoryFinanceRepository();
  const driverId = 'driver-cash-partial';

  await finance.settleCashRide({
    rideId: 'cash-ride-partial',
    driverId,
    platformCommissionCents: 12000,
  });

  await finance.createPayment({
    id: 'digital-payment-partial',
    rideId: 'digital-ride-partial',
    method: 'pix',
    processor: 'test-gateway',
    status: 'pending',
    amountCents: 10000,
    idempotencyKey: 'digital-payment-partial-key',
    createdAt: '2026-09-24T03:20:00.000Z',
    updatedAt: '2026-09-24T03:20:00.000Z',
  });
  const captured = await finance.capturePayment({
    paymentId: 'digital-payment-partial',
    processorEventId: 'digital-payment-partial-event',
  });

  const settlement = await finance.settleRide({
    rideId: 'digital-ride-partial',
    paymentId: captured.payment.id,
    driverId,
    totalAmountCents: 10000,
    platformCommissionCents: 1000,
    driverNetCents: 9000,
  });

  assert.equal(settlement.cashDebtRecoveredCents, 9000);
  assert.equal(
    await finance.getDriverCashDebtCents(driverId),
    3000,
  );
  assert.equal(
    await finance.getAccountBalanceCents(
      `driver:${driverId}:payable`,
    ),
    0,
  );
});


test('saldo digital existente quita comissão cash antes de gerar nova dívida', async () => {
  const finance = new InMemoryFinanceRepository();
  const driverId = 'driver-cash-existing-balance';

  await finance.createPayment({
    id: 'existing-balance-payment',
    rideId: 'existing-balance-ride',
    method: 'pix',
    processor: 'test-gateway',
    status: 'pending',
    amountCents: 10000,
    idempotencyKey: 'existing-balance-payment-key',
    createdAt: '2026-09-24T03:30:00.000Z',
    updatedAt: '2026-09-24T03:30:00.000Z',
  });
  const captured = await finance.capturePayment({
    paymentId: 'existing-balance-payment',
    processorEventId: 'existing-balance-payment-event',
  });
  await finance.settleRide({
    rideId: 'existing-balance-ride',
    paymentId: captured.payment.id,
    driverId,
    totalAmountCents: 10000,
    platformCommissionCents: 1000,
    driverNetCents: 9000,
  });

  assert.equal(
    await finance.getAccountBalanceCents(
      `driver:${driverId}:payable`,
    ),
    9000,
  );

  const cash = await finance.settleCashRide({
    rideId: 'cash-ride-existing-balance',
    driverId,
    platformCommissionCents: 1200,
  });

  assert.equal(
    cash.cashCommissionRecoveredFromBalanceCents,
    1200,
  );
  assert.equal(cash.cashDebtCents, 0);
  assert.equal(
    await finance.getAccountBalanceCents(
      `driver:${driverId}:payable`,
    ),
    7800,
  );
  assert.equal(
    await finance.getDriverCashDebtCents(driverId),
    0,
  );
});
