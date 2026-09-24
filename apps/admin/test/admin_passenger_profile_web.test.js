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

test('cliente Admin abre ficha de passageiro sem vazar Bearer na URL', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      passenger: {
        passengerId: 'passenger-profile-001',
        phoneE164: '+5588999991001',
        status: 'active',
      },
      rides: {
        total: 2,
        active: 1,
        completed: 1,
        cancelled: 0,
        completedAmountCents: 12000,
      },
      recentRides: [],
    });
  });

  const token = 'rn_admin_session_passenger_profile_secret';
  const passengerId = 'passenger-profile-001';
  const payload = await api.getPassenger(token, passengerId);

  assert.equal(payload.passenger.passengerId, passengerId);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    '/v1/admin/passengers/passenger-profile-001',
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('cliente Admin altera acesso do passageiro sem vazar Bearer', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      passenger: {
        passengerId: 'passenger-profile-001',
        status: 'suspended',
      },
      revokedSessions: 2,
    });
  });

  const token = 'rn_admin_session_passenger_block_secret';
  const result = await api.setPassengerStatus(token, {
    passengerId: 'passenger-profile-001',
    status: 'suspended',
  });

  assert.equal(result.passenger.status, 'suspended');
  assert.equal(result.revokedSessions, 2);
  assert.equal(
    calls[0].url,
    '/v1/admin/passengers/passenger-profile-001/auth/status',
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(
    calls[0].options.body,
    JSON.stringify({ status: 'suspended' }),
  );
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
});

test('frontend de Passageiros expõe ficha, histórico e bloqueio de acesso', () => {
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );

  for (const id of [
    'passenger-detail-status',
    'passenger-detail-content',
    'passenger-detail-history',
    'passenger-detail-total-rides',
    'passenger-detail-active-rides',
    'passenger-detail-completed-rides',
    'passenger-detail-cancelled-rides',
    'passenger-detail-completed-amount',
    'passenger-detail-rides-body',
    'passenger-detail-rides-empty',
    'passenger-access-actions',
    'passenger-access-button',
    'passenger-access-note',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(app, /api\.getPassenger\(state\.token, passengerId\)/);
  assert.match(app, /hasScope\('passengers:auth:read'\)/);
  assert.match(app, /hasScope\('passengers:auth:write'\)/);
  assert.match(app, /hasScope\('rides:read'\)/);
  assert.match(app, /api\.setPassengerStatus\(state\.token/);
  assert.match(app, /lookupPassenger\(passenger\.passengerId\)/);
  assert.match(app, /completedAmountCents/);
  assert.equal(app.includes('.innerHTML'), false);

  for (const selector of [
    '.passenger-detail-card',
    '.passenger-detail-grid',
    '.passenger-detail-summary',
    '.passenger-history-table',
    '.passenger-access-actions',
  ]) {
    assert.equal(css.includes(selector), true);
  }
});
