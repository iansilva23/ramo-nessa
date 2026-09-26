import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminDriverCashPolicyError,
  adminDriverCashPolicyView,
  setAdminDriverCashDebtLimit,
} from '../src/admin/admin-driver-cash-policy-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { InMemoryPaymentPolicySettingsRepository } from '../src/payments/repositories/in-memory-payment-policy-settings-repository.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-driver-cash-policy',
  name: 'Admin Cash Policy',
};

test('limite individual cash usa R$120 por padrão e fica inativo com cash desligado', async () => {
  const settings = new InMemoryPaymentPolicySettingsRepository();
  const finance = new InMemoryFinanceRepository();

  const view = await adminDriverCashPolicyView({
    settings,
    finance,
    driverId: 'driver-cash-limit',
  });

  assert.equal(view.cashEnabled, false);
  assert.equal(view.defaultDebtLimitCents, 12000);
  assert.equal(view.overrideDebtLimitCents, null);
  assert.equal(view.effectiveDebtLimitCents, 12000);
  assert.equal(view.currentDebtCents, 0);
  assert.equal(view.remainingDebtCapacityCents, 12000);
  assert.equal(view.canAcceptCashRide, false);
});

test('Admin só aumenta limite individual quando cash está ativado', async () => {
  const settings = new InMemoryPaymentPolicySettingsRepository();
  const finance = new InMemoryFinanceRepository();
  const admin = new InMemoryAdminRepository();

  await assert.rejects(
    setAdminDriverCashDebtLimit({
      settings,
      finance,
      admin,
      actor,
      driverId: 'driver-cash-limit',
      debtLimitCents: 20000,
    }),
    (error: unknown) =>
      error instanceof AdminDriverCashPolicyError &&
      error.code === 'CASH_NOT_ENABLED',
  );

  await settings.setCashEnabled(
    true,
    '2026-09-24T03:20:00.000Z',
  );

  await assert.rejects(
    setAdminDriverCashDebtLimit({
      settings,
      finance,
      admin,
      actor,
      driverId: 'driver-cash-limit',
      debtLimitCents: 11999,
    }),
    (error: unknown) =>
      error instanceof AdminDriverCashPolicyError &&
      error.code === 'DRIVER_CASH_LIMIT_BELOW_DEFAULT',
  );

  const updated = await setAdminDriverCashDebtLimit({
    settings,
    finance,
    admin,
    actor,
    driverId: 'driver-cash-limit',
    debtLimitCents: 20000,
    now: new Date('2026-09-24T03:21:00.000Z'),
  });

  assert.equal(updated.overrideDebtLimitCents, 20000);
  assert.equal(updated.effectiveDebtLimitCents, 20000);
  assert.equal(updated.canAcceptCashRide, true);

  await finance.settleCashRide({
    rideId: 'cash-limit-debt-ride',
    driverId: 'driver-cash-limit',
    platformCommissionCents: 15000,
  });

  const indebted = await adminDriverCashPolicyView({
    settings,
    finance,
    driverId: 'driver-cash-limit',
  });
  assert.equal(indebted.currentDebtCents, 15000);
  assert.equal(indebted.remainingDebtCapacityCents, 5000);

  const reset = await setAdminDriverCashDebtLimit({
    settings,
    finance,
    admin,
    actor,
    driverId: 'driver-cash-limit',
    debtLimitCents: null,
    now: new Date('2026-09-24T03:22:00.000Z'),
  });

  assert.equal(reset.overrideDebtLimitCents, null);
  assert.equal(reset.effectiveDebtLimitCents, 12000);
  assert.equal(reset.canAcceptCashRide, false);

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 2);
  assert.equal(
    audit[0]?.action,
    'payment_policy.driver_cash_limit_reset',
  );
  assert.equal(
    audit[1]?.action,
    'payment_policy.driver_cash_limit_updated',
  );
});
