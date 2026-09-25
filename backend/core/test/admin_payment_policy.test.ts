import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminPaymentPolicyView,
  updateAdminPaymentPolicy,
} from '../src/admin/admin-payment-policy-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryPaymentPolicySettingsRepository } from '../src/payments/repositories/in-memory-payment-policy-settings-repository.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-payment-policy-test',
  name: 'Admin Policy Test',
};

test('política de dinheiro nasce desligada mas pronta para ativação manual', async () => {
  const repository = new InMemoryPaymentPolicySettingsRepository();
  const view = await adminPaymentPolicyView(repository);

  assert.equal(view.cashEnabled, false);
  assert.equal(view.cashActivationReady, true);
  assert.equal(view.cardPriceAdjustmentBps, 498);
  assert.equal(view.futureCashDebtLimitCents, 12000);
});

test('Admin ativa e desativa cash explicitamente com auditoria', async () => {
  const repository = new InMemoryPaymentPolicySettingsRepository();
  const admin = new InMemoryAdminRepository();

  const enabled = await updateAdminPaymentPolicy({
    repository,
    admin,
    actor,
    cashEnabled: true,
    now: new Date('2026-09-24T01:00:00.000Z'),
  });

  assert.equal(enabled.cashEnabled, true);
  assert.equal(enabled.cashActivationReady, true);
  assert.equal((await repository.get()).cashEnabled, true);

  const repeated = await updateAdminPaymentPolicy({
    repository,
    admin,
    actor,
    cashEnabled: true,
    now: new Date('2026-09-24T01:00:30.000Z'),
  });
  assert.equal(repeated.cashEnabled, true);
  assert.equal((await admin.listAudit(10)).length, 1);

  const disabled = await updateAdminPaymentPolicy({
    repository,
    admin,
    actor,
    cashEnabled: false,
    now: new Date('2026-09-24T01:01:00.000Z'),
  });

  assert.equal(disabled.cashEnabled, false);
  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 2);
  assert.equal(audit[0]?.action, 'payment_policy.cash_disabled');
  assert.equal(audit[1]?.action, 'payment_policy.cash_enabled');
});


test('Admin altera ajuste do preço no cartão sem alterar cash', async () => {
  const repository = new InMemoryPaymentPolicySettingsRepository();
  const admin = new InMemoryAdminRepository();

  const updated = await updateAdminPaymentPolicy({
    repository,
    admin,
    actor,
    cardPriceAdjustmentBps: 449,
    now: new Date('2026-09-25T12:00:00.000Z'),
  });

  assert.equal(updated.cardPriceAdjustmentBps, 449);
  assert.equal(updated.cashEnabled, false);
  const stored = await repository.get();
  assert.equal(stored.cardPriceAdjustmentBps, 449);
  assert.equal(stored.cashEnabled, false);

  const audit = await admin.listAudit(10);
  assert.equal(
    audit[0]?.action,
    'payment_policy.card_price_adjustment_updated',
  );
});
