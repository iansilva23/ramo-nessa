import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReconcilePayouts,
  reconciliationMessage,
} from '../src/finance-reconciliation.js';
import { createAdminApi } from '../src/api.js';
test('conciliação só habilita escrita com proprietário provedor e estado atualizado', () => {
  const valid = {
    config: { canManage: true, providerConfigured: true },
    canWrite: true,
  };
  assert.equal(canReconcilePayouts(valid), true);
  for (const invalid of [
    { ...valid, canWrite: false },
    { ...valid, busy: true },
    { ...valid, config: { canManage: false, providerConfigured: true } },
    { ...valid, config: { canManage: true, providerConfigured: false } },
    { ...valid, config: null },
  ])
    assert.equal(canReconcilePayouts(invalid), false);
});
test('conciliação conserva contadores de falha e não apresenta erro como sucesso', () => {
  const counters = {
    processed: 4,
    paid: 1,
    processing: 1,
    failed: 1,
    errors: 1,
  };
  const result = reconciliationMessage({
    drivers: counters,
    company: { ...counters, errors: 0 },
  });
  assert.equal(result.tone, 'warning');
  assert.match(result.text, /1 erros de consulta/);
  assert.throws(() =>
    reconciliationMessage({
      drivers: { ...counters, paid: -1 },
      company: counters,
    }),
  );
  assert.throws(() => reconciliationMessage({}));
});
test('conciliação envia POST autenticado sem criar chave ou desligar proteção', async () => {
  let call;
  const api = createAdminApi(async (url, options) => {
    call = { url, options };
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    };
  });
  await api.reconcileFinancePayouts('session');
  assert.equal(call.url, '/v1/admin/finance/payouts/reconcile');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.authorization, 'Bearer session');
  assert.equal(call.options.body, undefined);
});
