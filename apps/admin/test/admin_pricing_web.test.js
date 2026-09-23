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

test('cliente Admin consulta catálogo de preços sem vazar Bearer na URL', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      catalogVersion: 'v1',
      authority: 'core',
      mode: 'static',
      editable: false,
      commissionBps: 1000,
      localities: { prea: [], jijoca: [] },
      fixedRoutes: [],
    });
  });

  const token = 'rn_admin_session_pricing_secret';
  const payload = await api.pricingCatalog(token);

  assert.equal(payload.catalogVersion, 'v1');
  assert.equal(payload.editable, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/admin/pricing/catalog');
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('frontend de preços é somente leitura e expõe os elementos do catálogo', () => {
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
    'view-pricing',
    'refresh-pricing-button',
    'pricing-mode',
    'pricing-version',
    'pricing-commission',
    'pricing-localities',
    'pricing-fixed-routes',
    'pricing-localities-body',
    'pricing-routes-body',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(html, /data-view=["']pricing["']/);
  assert.match(html, /somente leitura/i);
  assert.match(app, /hasScope\('pricing:read'\)/);
  assert.match(app, /api\.pricingCatalog\(state\.token\)/);
  assert.equal(app.includes('pricingCatalogUpdate'), false);

  for (const selector of [
    '.pricing-summary-grid',
    '.pricing-readonly-note',
    '.pricing-table-heading',
  ]) {
    assert.equal(css.includes(selector), true);
  }
});
