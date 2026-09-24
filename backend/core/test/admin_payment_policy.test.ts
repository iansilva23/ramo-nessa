import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminPaymentPolicyError,
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

test('política de dinheiro nasce desligada e expõe readiness bloqueado', async () => {
  const repository = new InMemoryPaymentPolicySettingsRepository();

  const view = await adminPaymentPolicyView(repository);

  assert.equal(view.cashEnabled, false);
  assert.equal(view.cashActivationReady, false);
  assert.equal(view.futureCashDebtLimitCents, 12000);
  assert.deepEqual(view.allowedDigitalMethods, [
    'pix',
    'card',
    'wallet',
  ]);
});

test('Admin pode manter/desativar cash, mas ativação permanece bloqueada', async () => {
  const repository = new InMemoryPaymentPolicySettingsRepository();
  const admin = new InMemoryAdminRepository();

  await repository.setCashEnabled(
    true,
    '2026-09-24T01:00:00.000Z',
  );

  const disabled = await updateAdminPaymentPolicy({
    repository,
    admin,
    actor,
    cashEnabled: false,
    now: new Date('2026-09-24T01:01:00.000Z'),
  });

  assert.equal(disabled.cashEnabled, false);

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.action, 'payment_policy.cash_disabled');
  assert.equal(audit[0]?.actor.kind, 'user');
  assert.equal(audit[0]?.metadata.cashEnabled, false);

  await assert.rejects(
    updateAdminPaymentPolicy({
      repository,
      admin,
      actor,
      cashEnabled: true,
    }),
    (error: unknown) =>
      error instanceof AdminPaymentPolicyError &&
      error.code === 'CASH_ACTIVATION_BLOCKED',
  );

  const after = await repository.get();
  assert.equal(after.cashEnabled, false);
  assert.equal((await admin.listAudit(10)).length, 1);
});
