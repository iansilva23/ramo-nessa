import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertGoogleMapsProductionConfig,
  assertMercadoPagoProductionConfig,
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


test('Mercado Pago não é obrigatório fora de produção', () => {
  assert.doesNotThrow(() =>
    assertMercadoPagoProductionConfig({
      NODE_ENV: 'development',
    }),
  );
});

test('produção exige configuração completa do Mercado Pago', () => {
  assert.throws(
    () =>
      assertMercadoPagoProductionConfig({
        NODE_ENV: 'production',
      }),
    /MERCADO_PAGO_MODE/,
  );

  assert.throws(
    () =>
      assertMercadoPagoProductionConfig({
        NODE_ENV: 'production',
        MERCADO_PAGO_MODE: 'production',
      }),
    /MERCADO_PAGO_ACCESS_TOKEN/,
  );

  assert.throws(
    () =>
      assertMercadoPagoProductionConfig({
        NODE_ENV: 'production',
        MERCADO_PAGO_MODE: 'production',
        MERCADO_PAGO_ACCESS_TOKEN:
          'APP_USR-production-token-with-safe-length',
      }),
    /MERCADO_PAGO_WEBHOOK_SECRET/,
  );

  assert.doesNotThrow(() =>
    assertMercadoPagoProductionConfig({
      NODE_ENV: 'production',
      MERCADO_PAGO_MODE: 'production',
      MERCADO_PAGO_ACCESS_TOKEN:
        'APP_USR-production-token-with-safe-length',
      MERCADO_PAGO_WEBHOOK_SECRET:
        'production-webhook-secret-safe-length',
    }),
  );
});


test('Google Maps não é obrigatório fora de produção', () => {
  assert.doesNotThrow(() =>
    assertGoogleMapsProductionConfig({
      NODE_ENV: 'development',
    }),
  );
});

test('produção exige Google Maps server configurado', () => {
  assert.throws(
    () =>
      assertGoogleMapsProductionConfig({
        NODE_ENV: 'production',
      }),
    /GOOGLE_MAPS_SERVER_API_KEY/,
  );

  assert.throws(
    () =>
      assertGoogleMapsProductionConfig({
        NODE_ENV: 'production',
        ROUTING_PROVIDER: 'osrm',
        GOOGLE_MAPS_SERVER_API_KEY:
          'test-google-server-key-with-safe-length',
      }),
    /ROUTING_PROVIDER/,
  );

  assert.doesNotThrow(() =>
    assertGoogleMapsProductionConfig({
      NODE_ENV: 'production',
      ROUTING_PROVIDER: 'google',
      GOOGLE_MAPS_SERVER_API_KEY:
        'test-google-server-key-with-safe-length',
    }),
  );
});
