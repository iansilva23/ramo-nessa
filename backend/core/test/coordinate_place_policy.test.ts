import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STATIC_PRICING_CATALOG_V1,
  normalizePricingCatalogSnapshot,
} from '../src/pricing/catalog-snapshot.js';
import {
  classifyCoordinateByCatalog,
  CoordinateClassificationError,
} from '../src/places/coordinate-place-policy.js';

test('classifica hubs padrão pelo catálogo vigente', () => {
  assert.deepEqual(
    classifyCoordinateByCatalog({
      catalog: STATIC_PRICING_CATALOG_V1,
      latitude: -2.82017,
      longitude: -40.41467,
    }),
    { zoneId: 'prea', localityId: 'prea' },
  );

  assert.deepEqual(
    classifyCoordinateByCatalog({
      catalog: STATIC_PRICING_CATALOG_V1,
      latitude: -2.906425,
      longitude: -40.357338,
    }),
    { zoneId: 'external', localityId: 'airport-jjd' },
  );
});

test('menor raio compatível vence quando áreas se sobrepõem', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  catalog.localities.prea['lagoa-grande'] = {};
  catalog.localityGeofences.push({
    zoneId: 'prea',
    localityId: 'lagoa-grande',
    centerLatitude: -2.82017,
    centerLongitude: -40.41467,
    radiusKm: 0.8,
  });

  assert.deepEqual(
    classifyCoordinateByCatalog({
      catalog,
      latitude: -2.82017,
      longitude: -40.41467,
    }),
    { zoneId: 'prea', localityId: 'lagoa-grande' },
  );
});

test('geofence de zona desativada não autoriza coordenada', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  catalog.zonePolicies.prea.enabled = false;

  assert.throws(
    () =>
      classifyCoordinateByCatalog({
        catalog,
        latitude: -2.82017,
        longitude: -40.41467,
      }),
    (error: unknown) =>
      error instanceof CoordinateClassificationError &&
      error.code === 'COORDINATE_NOT_CLASSIFIED',
  );
});

test('snapshot legado recebe geofences padrão ao normalizar', () => {
  const legacy = structuredClone(STATIC_PRICING_CATALOG_V1);
  delete (
    legacy as typeof legacy & {
      localityGeofences?: typeof legacy.localityGeofences;
    }
  ).localityGeofences;

  const normalized = normalizePricingCatalogSnapshot(legacy);
  assert.ok(normalized.localityGeofences.length >= 4);
  assert.equal(
    normalized.localityGeofences.some(
      (item) =>
        item.zoneId === 'jericoacoara' &&
        item.localityId === 'jericoacoara',
    ),
    true,
  );
});

test('coordenada fora de todas as áreas falha fechada', () => {
  assert.throws(
    () =>
      classifyCoordinateByCatalog({
        catalog: STATIC_PRICING_CATALOG_V1,
        latitude: -3.7319,
        longitude: -38.5267,
      }),
    (error: unknown) =>
      error instanceof CoordinateClassificationError &&
      error.code === 'COORDINATE_NOT_CLASSIFIED',
  );
});
