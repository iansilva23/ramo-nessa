import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';
import {
  paymentStatusLabel,
  pricePeriodLabel,
  rideStatePresentation,
} from '../src/security.js';

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

test('cliente web monta filtros e cursor do diretório de viagens', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      items: [],
      nextCursor: null,
    });
  };
  const api = createAdminApi(fakeFetch);
  const credential = 'rn_admin_session_rides_test';

  await api.rides(credential, {
    scope: 'all',
    state: 'COMPLETED',
    query: 'passenger-001',
    from: '2026-09-20',
    to: '2026-09-23',
    limit: 25,
    cursor: 'opaque_cursor_ride',
  });

  assert.equal(calls.length, 1);
  const requestUrl = new URL(calls[0].url, 'https://admin.local');
  assert.equal(requestUrl.pathname, '/v1/admin/rides');
  assert.equal(requestUrl.searchParams.get('scope'), 'all');
  assert.equal(requestUrl.searchParams.get('state'), 'COMPLETED');
  assert.equal(requestUrl.searchParams.get('query'), 'passenger-001');
  assert.equal(requestUrl.searchParams.get('from'), '2026-09-20');
  assert.equal(requestUrl.searchParams.get('to'), '2026-09-23');
  assert.equal(requestUrl.searchParams.get('limit'), '25');
  assert.equal(
    requestUrl.searchParams.get('cursor'),
    'opaque_cursor_ride',
  );
  assert.equal(calls[0].url.includes(credential), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${credential}`,
  );
});

test('cliente web consulta detalhe da viagem por rota read-only', async () => {
  const calls = [];
  const rideId = '11111111-1111-4111-8111-111111111111';
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      id: rideId,
      state: 'IN_PROGRESS',
    });
  };
  const api = createAdminApi(fakeFetch);

  await api.getRide('rn_admin_session_ride_detail', rideId);

  assert.equal(
    calls[0].url,
    `/v1/admin/rides/${rideId}`,
  );
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('cliente web cancela corrida com Bearer no header e motivo no body', async () => {
  const calls = [];
  const rideId = '22222222-2222-4222-8222-222222222222';
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      ride: {
        id: rideId,
        state: 'REFUND_PENDING',
      },
      refundStatus: 'pending_external_gateway',
      duplicateCancellation: false,
    });
  };
  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_ride_cancel';

  const payload = await api.cancelRide(token, {
    rideId,
    reason: 'Falha operacional confirmada',
  });

  assert.equal(payload.ride.state, 'REFUND_PENDING');
  assert.equal(
    calls[0].url,
    `/v1/admin/rides/${rideId}/cancel`,
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(
    calls[0].options.body,
    JSON.stringify({
      reason: 'Falha operacional confirmada',
    }),
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('labels da viagem seguem estados oficiais do Core', () => {
  assert.equal(
    rideStatePresentation('DRIVER_ARRIVING').label,
    'Motorista a caminho',
  );
  assert.equal(paymentStatusLabel('paid'), 'Pago');
  assert.equal(paymentStatusLabel('refunded'), 'Reembolsado');
  assert.equal(pricePeriodLabel('day'), 'Diurno');
  assert.equal(pricePeriodLabel('after_22'), 'Após 22h');
});

test('HTML de Viagens contém histórico e cancelamento administrativo protegido', () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/rides.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');

  for (const id of [
    'view-rides',
    'ride-directory-form',
    'ride-directory-query',
    'ride-directory-scope',
    'ride-directory-state',
    'ride-directory-from',
    'ride-directory-to',
    'ride-directory-body',
    'ride-directory-more',
    'ride-detail-content',
    'ride-detail-status',
    'ride-cancel-panel',
    'ride-cancel-form',
    'ride-cancel-reason',
    'ride-cancel-button',
    'ride-cancel-note',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  assert.match(app, /hasScope\('rides:write'\)/);
  assert.match(app, /ADMIN_CANCELLABLE_RIDE_STATES/);
  assert.match(app, /api\.cancelRide\(state\.token/);
  assert.match(app, /ride-directory-from/);
  assert.match(app, /ride-directory-to/);
  assert.match(app, /pending_external_gateway/);
  assert.equal(app.includes('.innerHTML'), false);
});
