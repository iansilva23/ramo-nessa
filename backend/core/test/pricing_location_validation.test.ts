import assert from 'node:assert/strict';
import test from 'node:test';

import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import {
  assertPricingLocationMatchesPoint,
  PricingLocationMismatchError,
} from '../src/rides/pricing-location-validation.js';

test('zona local precisa conferir com as coordenadas', () => {
  assert.doesNotThrow(() =>
    assertPricingLocationMatchesPoint({
      ref: { zoneId: 'prea' },
      point: { latitude: -2.82017, longitude: -40.41467 },
      field: 'origin',
    }),
  );

  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'jijoca' },
        point: { latitude: -2.82017, longitude: -40.41467 },
        field: 'origin',
      }),
    PricingLocationMismatchError,
  );
});

test('Aeroporto JJD externo precisa conferir com o GPS', () => {
  assert.doesNotThrow(() =>
    assertPricingLocationMatchesPoint({
      ref: { zoneId: 'external', localityId: 'airport-jjd' },
      point: { latitude: -2.906425, longitude: -40.357338 },
      field: 'destination',
    }),
  );

  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'external', localityId: 'airport-jjd' },
        point: { latitude: -2.82017, longitude: -40.41467 },
        field: 'destination',
      }),
    PricingLocationMismatchError,
  );
});

test('destino externo aprovado não pode apontar para coordenada de zona local', () => {
  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'external', localityId: 'sobral' },
        point: { latitude: -2.82017, longitude: -40.41467 },
        field: 'destination',
      }),
    PricingLocationMismatchError,
  );
});

test('localityId incompatível com a tabela da zona é rejeitado', () => {
  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'jijoca', localityId: 'sobral' },
        point: { latitude: -2.89860, longitude: -40.45060 },
        field: 'destination',
      }),
    PricingLocationMismatchError,
  );
});


test('prova local assinada permite localidade específica fora do raio genérico', () => {
  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'prea', localityId: 'aranau' },
        point: { latitude: -3.05, longitude: -40.10 },
        field: 'destination',
      }),
    PricingLocationMismatchError,
  );

  assert.doesNotThrow(() =>
    assertPricingLocationMatchesPoint({
      ref: { zoneId: 'prea', localityId: 'aranau' },
      point: { latitude: -3.05, longitude: -40.10 },
      field: 'destination',
      localityProofVerified: true,
    }),
  );

  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'jijoca', localityId: 'aranau' },
        point: { latitude: -3.05, longitude: -40.10 },
        field: 'destination',
        localityProofVerified: true,
      }),
    PricingLocationMismatchError,
  );
});

test('validação de GPS usa localidades e zonas do catálogo vigente', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  catalog.localities.prea['novo-ponto'] = {};
  catalog.externalLocalities.push('novo-externo');

  assert.doesNotThrow(() =>
    assertPricingLocationMatchesPoint({
      ref: { zoneId: 'prea', localityId: 'novo-ponto' },
      point: { latitude: -2.82017, longitude: -40.41467 },
      field: 'origin',
      catalog,
    }),
  );

  catalog.zonePolicies.prea.enabled = false;
  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'prea', localityId: 'novo-ponto' },
        point: { latitude: -2.82017, longitude: -40.41467 },
        field: 'origin',
        catalog,
      }),
    /desativada/i,
  );
});


test('geofence versionada protege localidade externa sem placeProof', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  catalog.externalLocalities.push('sobral-piloto');
  catalog.localityGeofences.push({
    zoneId: 'external',
    localityId: 'sobral-piloto',
    centerLatitude: -3.6894,
    centerLongitude: -40.3482,
    radiusKm: 12,
  });

  assert.doesNotThrow(() =>
    assertPricingLocationMatchesPoint({
      ref: { zoneId: 'external', localityId: 'sobral-piloto' },
      point: { latitude: -3.69, longitude: -40.35 },
      field: 'destination',
      catalog,
    }),
  );

  assert.throws(
    () =>
      assertPricingLocationMatchesPoint({
        ref: { zoneId: 'external', localityId: 'sobral-piloto' },
        point: { latitude: -3.45, longitude: -40.10 },
        field: 'destination',
        catalog,
      }),
    /área cadastrada/i,
  );
});
