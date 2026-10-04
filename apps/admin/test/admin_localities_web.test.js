import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Nova localidade tem fluxo guiado, mapa, edição e exclusão protegida', () => {
  const index = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
  const html = readFileSync(
    new URL('../pages/localities.html', import.meta.url),
    'utf8',
  );
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const localities = readFileSync(
    new URL('../src/localities-admin.js', import.meta.url),
    'utf8',
  );
  const map = readFileSync(
    new URL('../src/pricing-geofence-map.js', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );

  assert.match(
    index,
    /href=["']\/admin\/nova-localidade["'][^>]*data-view=["']localities["']/,
  );
  assert.match(index, /Nova localidade/);
  assert.match(app, /path: '\/admin\/nova-localidade'/);
  assert.match(app, /createLocalitiesAdmin/);
  assert.match(app, /destroyLocalitiesAdmin/);

  for (const id of [
    'view-localities',
    'localities-new-button',
    'localities-current-draft',
    'localities-effective-version',
    'localities-discard-draft-button',
    'localities-publish-draft-button',
    'localities-overview-map',
    'localities-list',
    'locality-wizard',
    'locality-scope',
    'locality-name',
    'locality-id',
    'locality-wizard-map',
    'locality-radius',
    'locality-category-moto',
    'locality-category-delivery',
    'locality-category-car',
    'locality-category-comfort',
    'locality-price-moto-card',
    'locality-price-delivery-card',
    'locality-price-car-card',
    'locality-distance-grid',
    'locality-distance-moto-enabled',
    'locality-distance-moto-minimum-fare',
    'locality-distance-moto-per-km',
    'locality-distance-moto-min-km',
    'locality-distance-moto-max-km',
    'locality-distance-car-enabled',
    'locality-distance-comfort_black-enabled',
    'locality-night-surcharge',
    'locality-review',
    'locality-wizard-reset',
    'locality-wizard-cancel',
    'locality-wizard-save',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  for (let step = 1; step <= 6; step += 1) {
    assert.match(html, new RegExp(`id=["']locality-step-${step}["']`));
  }

  assert.match(localities, /kind: 'locality_structure'/);
  assert.match(localities, /kind: 'locality_geofence'/);
  assert.match(localities, /kind: 'locality_price'/);
  assert.match(localities, /kind: 'locality_policy'/);
  assert.match(localities, /kind: 'distance_fare_policy'/);
  assert.match(localities, /minimumFareCents/);
  assert.match(localities, /pricePerKmCents/);
  assert.match(localities, /operation: 'remove'/);
  assert.match(localities, /Desfazer última exclusão/);
  assert.match(localities, /window\.confirm/);
  assert.match(localities, /Nada foi publicado ainda/);
  assert.match(localities, /api\.deletePricingVersion/);
  assert.match(localities, /api\.publishPricingVersion/);
  assert.match(localities, /Excluir o rascunho/);
  assert.match(localities, /createPricingCoverageMap/);
  assert.match(localities, /createPricingGeofenceMap/);
  assert.match(html, /PONTOS SEM PREÇO CADASTRADO/);
  assert.match(html, /Cobrança automática por distância/);
  assert.match(html, /preço fixo.*prioridade/is);
  assert.equal(localities.includes('.innerHTML'), false);

  assert.match(map, /export function createPricingCoverageMap/);
  assert.match(map, /pricing-coverage-map__radius/);
  assert.match(map, /pricing-coverage-map__pin/);
  assert.match(map, /strict-origin-when-cross-origin/);
  assert.equal(map.includes('.innerHTML'), false);

  for (const selector of [
    '.localities-summary-grid',
    '.localities-overview-grid',
    '.locality-directory-item',
    '.locality-stepper',
    '.locality-wizard-map',
    '.locality-category-grid',
    '.locality-price-grid',
    '.locality-distance-section',
    '.locality-distance-grid',
    '.locality-distance-card',
    '.locality-review',
    '.pricing-coverage-map__radius',
    '.pricing-coverage-map__pin',
  ]) {
    assert.equal(css.includes(selector), true, selector);
  }
});

test('Operação e Tarifas direciona cadastro geográfico para Nova localidade', () => {
  const html = readFileSync(
    new URL('../pages/pricing.html', import.meta.url),
    'utf8',
  );

  assert.match(html, /Operação e Tarifas/);
  assert.match(html, /Localidades agora têm uma área própria/);
  assert.match(
    html,
    /href=["']\/admin\/nova-localidade["'][^>]*data-view=["']localities["']/,
  );

  const select =
    html.match(
      /<select id=["']pricing-edit-kind["']>[\s\S]*?<\/select>/,
    )?.[0] ?? '';

  assert.equal(select.includes('value="locality_price"'), true);
  assert.equal(select.includes('value="locality_policy"'), true);
  assert.equal(select.includes('value="locality_map"'), false);
  assert.equal(select.includes('value="locality_structure"'), false);
  assert.match(select, /value="fixed_route"/);
  assert.match(select, /value="category_policy"/);
  assert.match(select, /value="zone_policy"/);
});
