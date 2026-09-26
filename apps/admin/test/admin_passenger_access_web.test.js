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

test('cliente Admin altera status do passageiro sem vazar Bearer na URL', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      passenger: {
        passengerId: 'passenger-web-block',
        status: 'suspended',
      },
      revokedSessions: 2,
    });
  });

  const token = 'rn_admin_session_passenger_block_secret';
  const payload = await api.setPassengerStatus(token, {
    passengerId: 'passenger-web-block',
    status: 'suspended',
  });

  assert.equal(payload.passenger.status, 'suspended');
  assert.equal(payload.revokedSessions, 2);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    '/v1/admin/passengers/passenger-web-block/auth/status',
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(
    calls[0].options.body,
    JSON.stringify({ status: 'suspended' }),
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('frontend expõe bloqueio/desbloqueio somente com escopo de escrita', () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/passengers.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const api = readFileSync(
    new URL('../src/api.js', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );

  for (const id of [
    'passenger-access-actions',
    'passenger-access-button',
    'passenger-access-note',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(app, /hasScope\('passengers:auth:write'\)/);
  assert.match(app, /handlePassengerAccessChange/);
  assert.match(app, /api\.setPassengerStatus\(state\.token/);
  assert.match(app, /revokedSessions/);
  assert.match(app, /Desbloquear acesso/);
  assert.match(
    api,
    /\/v1\/admin\/passengers\/\$\{encodeURIComponent\(passengerId\)\}\/auth\/status/,
  );

  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(
    html.includes('Restaurar sessão'),
    false,
  );
  assert.equal(css.includes('.passenger-access-actions'), true);
});
