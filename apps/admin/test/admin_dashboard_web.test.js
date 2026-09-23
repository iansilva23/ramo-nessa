import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';
import {
  formatCurrencyCents,
  locationLabel,
  rideStatePresentation,
  serviceCategoryLabel,
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

test('helpers do dashboard usam estados, categorias, rota e centavos do Core', () => {
  assert.match(formatCurrencyCents(12345), /123,45/);
  assert.equal(
    rideStatePresentation('SEARCHING_DRIVER').label,
    'Buscando motorista',
  );
  assert.equal(
    rideStatePresentation('IN_PROGRESS').tone,
    'success',
  );
  assert.equal(
    serviceCategoryLabel('comfort_black'),
    'Comfort/Black',
  );
  assert.equal(locationLabel({ zoneId: 'prea' }), 'Preá');
  assert.equal(
    locationLabel({
      zoneId: 'external',
      localityId: 'Fortaleza',
    }),
    'Fortaleza',
  );
});

test('cliente do dashboard usa GET autenticado sem colocar credencial na URL', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      generatedAt: '2026-09-23T22:00:00.000Z',
      window: {
        kind: 'last_24h',
        since: '2026-09-22T22:00:00.000Z',
      },
      rides: {
        active: 2,
        searchingDriver: 1,
        driverOnTheWay: 1,
        inProgress: 0,
        completedLast24h: 4,
        cancelledLast24h: 1,
      },
      activeRides: [],
    });
  };
  const api = createAdminApi(fakeFetch);
  const credential = 'rn_admin_session_dashboard_test';

  await api.dashboard(credential);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/admin/dashboard');
  assert.equal(calls[0].url.includes(credential), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${credential}`,
  );
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('HTML do Admin contém a superfície operacional do dashboard', () => {
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );

  for (const id of [
    'dashboard-active',
    'dashboard-searching',
    'dashboard-on-way',
    'dashboard-in-progress',
    'dashboard-completed-24h',
    'dashboard-cancelled-24h',
    'dashboard-rides-body',
    'dashboard-rides-empty',
    'refresh-dashboard-button',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});
