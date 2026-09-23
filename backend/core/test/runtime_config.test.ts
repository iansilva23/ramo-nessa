import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseIntegerSetting,
  resolveCorePort,
  resolveDbPoolMax,
  resolveRoutingTimeoutMs,
} from '../src/config/runtime-config.js';

test('config numérica usa defaults seguros', () => {
  assert.equal(resolveCorePort({}), 8080);
  assert.equal(resolveDbPoolMax({}), 10);
  assert.equal(resolveRoutingTimeoutMs({}), 5000);
});

test('config numérica aceita inteiros dentro dos limites', () => {
  assert.equal(
    parseIntegerSetting({
      name: 'TEST',
      value: '42',
      defaultValue: 1,
      min: 1,
      max: 100,
    }),
    42,
  );
});

test('porta e pool rejeitam valores inválidos', () => {
  assert.throws(() => resolveCorePort({ PORT: '0' }), /PORT deve ser/);
  assert.throws(() => resolveCorePort({ PORT: 'abc' }), /PORT deve ser/);
  assert.throws(
    () => resolveDbPoolMax({ DB_POOL_MAX: '101' }),
    /DB_POOL_MAX deve ser/,
  );
  assert.throws(
    () => resolveRoutingTimeoutMs({ ROUTING_TIMEOUT_MS: '100' }),
    /ROUTING_TIMEOUT_MS deve ser/,
  );
});
