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

test('cliente Admin consulta frota sem vazar Bearer na URL', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      generatedAt: '2026-09-24T01:00:00.000Z',
      staleAfterSeconds: 120,
      summary: {
        totalOnline: 1,
        free: 1,
        reserved: 0,
        onRide: 0,
        busy: 0,
        staleGps: 0,
      },
      items: [],
    });
  });

  const token = 'rn_admin_session_fleet_secret';
  const payload = await api.fleet(token);

  assert.equal(payload.summary.totalOnline, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/admin/fleet');
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('frontend da frota expõe mapa, polling e CSP restrito aos tiles', () => {
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const map = readFileSync(
    new URL('../src/fleet-map.js', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );
  const caddy = readFileSync(
    new URL('../Caddyfile', import.meta.url),
    'utf8',
  );

  for (const id of [
    'view-fleet',
    'refresh-fleet-button',
    'fleet-updated-at',
    'fleet-total-online',
    'fleet-free',
    'fleet-on-ride',
    'fleet-stale-gps',
    'fleet-map',
    'fleet-map-tiles',
    'fleet-map-markers',
    'fleet-map-zoom-in',
    'fleet-map-zoom-out',
    'fleet-roster',
    'fleet-roster-count',
    'fleet-roster-empty',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(html, /data-view=["']fleet["']/);
  assert.match(app, /hasScope\('fleet:read'\)/);
  assert.match(app, /api\.fleet\(state\.token\)/);
  assert.match(app, /setInterval\(\(\) => \{/);
  assert.match(app, /5_000/);
  assert.match(app, /createFleetMap/);
  assert.match(map, /https:\/\/tile\.openstreetmap\.org/);
  assert.match(map, /marker\.dataset\.availability/);
  assert.match(map, /marker\.dataset\.gps/);
  assert.match(map, /marker\.dataset\.category/);
  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(map.includes('.innerHTML'), false);

  assert.match(
    html,
    /img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org/,
  );
  assert.match(
    caddy,
    /img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org/,
  );
  assert.match(caddy, /connect-src 'self'/);

  for (const selector of [
    '.fleet-summary-grid',
    '.fleet-layout',
    '.fleet-map',
    '.fleet-marker',
    '.fleet-roster',
  ]) {
    assert.equal(css.includes(selector), true);
  }
});
