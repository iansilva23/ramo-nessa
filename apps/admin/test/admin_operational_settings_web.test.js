import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test('Admin envia tempo de oferta e reserva do pagamento ao Core', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      driverOfferTtlSeconds: 35,
      driverPaymentHoldSeconds: 120,
      noDriverDecisionTimeoutSeconds: 900,
      driverLocationMaxAgeSeconds: 75,
      nearbyDriverMaxDistanceKm: 8.5,
      showNearbyDrivers: false,
      driverDocumentAutoEnforcement: false,
      updatedAt: '2026-09-26T18:56:00.000Z',
    });
  };

  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_operational_settings_secret';
  await api.updateOperationalSettings(token, {
    driverOfferTtlSeconds: 35,
    driverPaymentHoldSeconds: 120,
    noDriverDecisionTimeoutSeconds: 900,
    driverLocationMaxAgeSeconds: 75,
    nearbyDriverMaxDistanceKm: 8.5,
    showNearbyDrivers: false,
    driverDocumentAutoEnforcement: false,
    mercadoPagoPublicKey: 'APP_USR-public-key-admin-1234567890',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/admin/operational-settings');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    driverOfferTtlSeconds: 35,
    driverPaymentHoldSeconds: 120,
    noDriverDecisionTimeoutSeconds: 900,
    driverLocationMaxAgeSeconds: 75,
    nearbyDriverMaxDistanceKm: 8.5,
    showNearbyDrivers: false,
    driverDocumentAutoEnforcement: false,
    mercadoPagoPublicKey: 'APP_USR-public-key-admin-1234567890',
  });
});

test('página Motoristas expõe e valida a reserva durante pagamento', () => {
  const html = readFileSync(
    new URL('../pages/drivers.html', import.meta.url),
    'utf8',
  );
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  assert.match(
    html,
    /id=["']driver-payment-hold-seconds["']/,
  );
  assert.match(
    html,
    /id=["']driver-payment-hold-seconds["'][^>]*type=["']number["'][^>]*min=["']30["'][^>]*max=["']300["']/,
  );
  assert.match(app, /driverPaymentHoldSeconds/);
  assert.match(app, /paymentHoldSeconds < 30/);
  assert.match(app, /paymentHoldSeconds > 300/);
  assert.match(app, /driver-payment-hold-seconds/);
  assert.match(
    html,
    /id=["']no-driver-decision-timeout-seconds["'][^>]*min=["']60["'][^>]*max=["']3600["']/,
  );
  assert.match(app, /noDriverDecisionTimeoutSeconds/);
  assert.match(app, /noDriverDecisionTimeoutSeconds < 60/);
  assert.match(app, /noDriverDecisionTimeoutSeconds > 3600/);
  assert.match(
    html,
    /id=["']driver-location-max-age-seconds["'][^>]*min=["']15["'][^>]*max=["']600["']/,
  );
  assert.match(
    html,
    /id=["']nearby-driver-max-distance-km["'][^>]*min=["']0\.5["'][^>]*max=["']100["']/,
  );
  assert.match(app, /driverLocationMaxAgeSeconds/);
  assert.match(app, /nearbyDriverMaxDistanceKm/);
  assert.match(app, /locationMaxAgeSeconds < 15/);
  assert.match(app, /nearbyMaxDistanceKm < 0\.5/);

  for (const id of [
    'driver-offer-ttl-seconds',
    'driver-payment-hold-seconds',
    'no-driver-decision-timeout-seconds',
    'driver-location-max-age-seconds',
    'nearby-driver-max-distance-km',
  ]) {
    const tag = html.match(
      new RegExp(
        `<input[^>]*id=["']${id}["'][^>]*>`,
      ),
    )?.[0];
    assert.ok(tag, `campo ${id} não encontrado`);
    assert.match(tag, /\bdisabled\b/);
    assert.equal(/\bvalue=/.test(tag), false);
  }

  assert.match(app, /operationalSettings: null/);
  assert.match(app, /Aguardando configurações do Core/);
  assert.match(app, /state\.operationalSettings == null/);
  assert.match(
    app,
    /renderOperationalSettings\(null\);[\s\S]*handleAuthenticatedError/,
  );
});
