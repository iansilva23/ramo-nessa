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

test('cliente Admin gerencia versões com Bearer somente no header', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      id: '11111111-1111-4111-8111-111111111111',
      versionNumber: 2,
      status: 'draft',
    });
  });

  const token = 'rn_admin_session_pricing_write_secret';
  const versionId = '11111111-1111-4111-8111-111111111111';

  await api.pricingVersions(token);
  await api.getPricingVersion(token, versionId);
  await api.createPricingVersion(token);
  const expectedUpdatedAt = '2026-09-27T06:00:00.000Z';
  await api.updatePricingVersion(token, {
    versionId,
    expectedUpdatedAt,
    patch: {
      kind: 'fixed_route',
      routeId: 'prea-jijoca-car',
      dayCents: 13000,
      after22Cents: 15000,
    },
  });
  await api.publishPricingVersion(token, {
    versionId,
    effectiveFrom: '2026-10-01T03:00:00.000Z',
    expectedUpdatedAt,
  });

  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method]),
    [
      ['/v1/admin/pricing/versions', 'GET'],
      [
        '/v1/admin/pricing/versions/11111111-1111-4111-8111-111111111111',
        'GET',
      ],
      ['/v1/admin/pricing/versions', 'POST'],
      [
        '/v1/admin/pricing/versions/11111111-1111-4111-8111-111111111111',
        'PATCH',
      ],
      [
        '/v1/admin/pricing/versions/11111111-1111-4111-8111-111111111111/publish',
        'POST',
      ],
    ],
  );

  for (const call of calls) {
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.cache, 'no-store');
  }

  assert.deepEqual(JSON.parse(calls[3].options.body), {
    kind: 'fixed_route',
    routeId: 'prea-jijoca-car',
    dayCents: 13000,
    after22Cents: 15000,
    expectedUpdatedAt,
  });
  assert.deepEqual(JSON.parse(calls[4].options.body), {
    effectiveFrom: '2026-10-01T03:00:00.000Z',
    expectedUpdatedAt,
  });
});

test('frontend de preços expõe catálogo protegido e fluxo versionado', () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/pricing.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );
  const geofenceMap = readFileSync(
    new URL('../src/pricing-geofence-map.js', import.meta.url),
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
    'pricing-category-count',
    'pricing-category-policies-body',
    'pricing-category-policy-fields',
    'pricing-policy-category',
    'pricing-policy-enabled',
    'pricing-policy-four-by-four',
    'pricing-zone-count',
    'pricing-zone-policies-body',
    'pricing-external-count',
    'pricing-external-localities-body',
    'pricing-zone-policy-fields',
    'pricing-zone-policy-id',
    'pricing-zone-policy-enabled',
    'pricing-locality-policy-fields',
    'pricing-locality-policy-hub',
    'pricing-locality-policy-id',
    'pricing-locality-policy-moto',
    'pricing-locality-policy-delivery',
    'pricing-locality-policy-car',
    'pricing-locality-policy-comfort-field',
    'pricing-locality-policy-comfort',
    'pricing-locality-policy-night-field',
    'pricing-locality-policy-night',
    'pricing-locality-map-fields',
    'pricing-locality-map-scope',
    'pricing-locality-map-id',
    'pricing-locality-map-radius',
    'pricing-locality-map-coordinate-label',
    'pricing-locality-map-latitude',
    'pricing-locality-map-longitude',
    'pricing-locality-map',
    'pricing-locality-map-tiles',
    'pricing-locality-map-overlay',
    'pricing-locality-map-zoom-in',
    'pricing-locality-map-zoom-out',
    'pricing-geofence-count',
    'pricing-geofences-body',
    'pricing-geofences-empty',
    'pricing-locality-structure-fields',
    'pricing-locality-structure-operation',
    'pricing-locality-structure-scope',
    'pricing-locality-structure-id',
    'pricing-commission-policy-fields',
    'pricing-commission-percent',
    'pricing-period-policy-fields',
    'pricing-night-start-hour',
    'pricing-day-start-hour',
    'pricing-pickup-policy-fields',
    'pricing-pickup-free-km',
    'pricing-fuel-price-reais',
    'pricing-moto-km-liter',
    'pricing-car-km-liter',
    'pricing-surcharge-policy-fields',
    'pricing-prea-comfort-surcharge',
    'pricing-prea-night-surcharge',
    'pricing-prea-night-localities',
    'pricing-buggy-policy-fields',
    'pricing-buggy-min-passengers',
    'pricing-buggy-max-passengers',
    'pricing-buggy-day-price',
    'pricing-buggy-night-price',
    'pricing-buggy-passenger-price',
    'pricing-delivery-bands-fields',
    'pricing-delivery-bands',
    'pricing-delivery-above-max',
    'pricing-versions-body',
    'pricing-create-draft-button',
    'pricing-editor-status',
    'pricing-editor-controls',
    'pricing-edit-form',
    'pricing-edit-kind',
    'pricing-route-id',
    'pricing-route-day',
    'pricing-route-night',
    'pricing-locality-hub',
    'pricing-locality-id',
    'pricing-locality-category',
    'pricing-locality-price-kind',
    'pricing-locality-min',
    'pricing-locality-max',
    'pricing-effective-from',
    'pricing-publish-button',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(html, /data-view=["']pricing["']/);
  assert.match(html, /Operação e Tarifas/i);
  assert.match(html, /Catálogo ativo protegido/i);
  assert.match(html, /Localidades agora têm uma área própria/i);
  assert.match(html, /Gerenciar localidades/i);
  assert.match(html, /Clique para posicionar o alfinete/i);
  assert.match(html, /Raio da localidade/i);
  assert.match(html, /ÁREAS NO MAPA/i);
  assert.match(html, /Adicional noturno do Preá/i);
  assert.match(app, /hasScope\('pricing:read'\)/);
  assert.match(app, /hasScope\('pricing:write'\)/);
  assert.match(app, /api\.pricingCatalog\(state\.token\)/);
  assert.match(app, /api\.pricingVersions\(state\.token\)/);
  assert.match(app, /api\.createPricingVersion\(state\.token\)/);
  assert.match(app, /api\.updatePricingVersion\(state\.token/);
  assert.match(app, /api\.publishPricingVersion/);
  assert.match(app, /expectedUpdatedAt: version\.updatedAt/);
  assert.match(app, /window\.confirm/);
  assert.match(app, /vigência imediata/);
  assert.match(app, /coloca o catálogo em produção/);
  assert.match(app, /category_policy/);
  assert.match(app, /pricing-category-policies-body/);
  assert.match(app, /pricing-policy-four-by-four/);
  assert.match(app, /zone_policy/);
  assert.match(app, /locality_policy/);
  assert.match(app, /openPricingLocalityPolicyEditor/);
  assert.match(app, /pricing-locality-policy-comfort/);
  assert.match(app, /applyNightSurcharge/);
  assert.match(app, /locality_map/);
  assert.match(app, /locality_geofence/);
  assert.match(app, /createPricingGeofenceMap/);
  assert.match(app, /openPricingGeofenceEditor/);
  assert.match(app, /pricing-locality-map-radius/);
  assert.match(app, /Localidade e área salvas no rascunho/);
  assert.match(app, /locality_structure/);
  assert.match(app, /commission_policy/);
  assert.match(app, /period_policy/);
  assert.match(app, /pickup_policy/);
  assert.match(app, /surcharge_policy/);
  assert.match(app, /buggy_policy/);
  assert.match(app, /delivery_bands/);
  assert.match(app, /pricing-commission-percent/);
  assert.match(app, /pricing-delivery-bands/);
  assert.match(app, /pricing-delivery-above-max/);
  assert.match(app, /pricing-zone-policies-body/);
  assert.match(app, /pricing-external-localities-body/);
  assert.match(
    app,
    /bindRouteEvent\('pricing-create-draft-button', 'click'/,
  );
  assert.match(
    app,
    /bindRouteEvent\('pricing-edit-form', 'submit'/,
  );
  assert.match(
    app,
    /bindRouteEvent\('pricing-publish-button', 'click'/,
  );
  assert.equal(app.includes('.innerHTML'), false);
  assert.match(geofenceMap, /pointerdown/);
  assert.match(geofenceMap, /radiusKm/);
  assert.match(geofenceMap, /tile\.openstreetmap\.org/);
  assert.equal(geofenceMap.includes('.innerHTML'), false);

  for (const selector of [
    '.pricing-summary-grid',
    '.pricing-readonly-note',
    '.pricing-table-heading',
    '.pricing-workflow-grid',
    '.pricing-edit-form',
    '.pricing-publish-panel',
    '.pricing-geofence-map',
    '.pricing-geofence-map__radius',
    '.pricing-geofence-map__pin',
    '.pricing-toggle-field',
  ]) {
    assert.equal(css.includes(selector), true);
  }
});
