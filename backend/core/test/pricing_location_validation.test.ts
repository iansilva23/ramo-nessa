import assert from 'node:assert/strict';
import test from 'node:test';

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
