import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyCoordinateByCatalog } from '../src/places/coordinate-place-policy.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { requiresFourByFourForTrip } from '../src/pricing/category-eligibility.js';
import { municipalityFor } from '../src/pricing/municipality-directory.js';
import { quoteFare } from '../src/pricing/quote-engine.js';
import { PricingError } from '../src/pricing/types.js';
import {
  assertPricingLocationMatchesPoint,
  PricingLocationMismatchError,
} from '../src/rides/pricing-location-validation.js';

// These are pre-existing reference points in the approved catalog. This is
// deterministic GPS/geofence integration, not a live Google Maps route test.
const fixtures = [
  { ref: { zoneId: 'prea' as const, localityId: 'prea' },
    point: { latitude: -2.82017, longitude: -40.41467 } },
  { ref: { zoneId: 'jijoca' as const, localityId: 'jijoca' },
    point: { latitude: -2.89860, longitude: -40.45060 } },
  { ref: { zoneId: 'jericoacoara' as const, localityId: 'jericoacoara' },
    point: { latitude: -2.80023, longitude: -40.51638 } },
  { ref: { zoneId: 'external' as const, localityId: 'airport-jjd' },
    point: { latitude: -2.906425, longitude: -40.357338 } },
] as const;

test('GPS de referência classifica por geocerca aprovada antes da cotação', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  for (const { ref, point } of fixtures) {
    assert.deepEqual(classifyCoordinateByCatalog({
      catalog, latitude: point.latitude, longitude: point.longitude,
    }), ref);
    assert.doesNotThrow(() => assertPricingLocationMatchesPoint({
      catalog, ref, point, field: 'origin',
    }));
  }
  // Same municipality metadata must never reassign the legacy commercial zone.
  assert.equal(municipalityFor(catalog,'external','airport-jjd').municipalityId,'cruz');
  assert.equal(fixtures[3]?.ref.zoneId,'external');
});

test('GPS correto preserva transfer aprovado e exigência 4x4 na fronteira da Vila', () => {
  const catalog=STATIC_PRICING_CATALOG_V1;
  const origin=fixtures[0]!;
  const jeri=fixtures[2]!;
  const airport=fixtures[3]!;
  const day=quoteFare({
    origin:origin.ref,destination:jeri.ref,category:'car',period:'day',
  },catalog);
  assert.equal(day.kind,'exact');
  assert.equal(day.ruleId,'jeri-prea-car');
  assert.equal(requiresFourByFourForTrip({
    catalog,origin:origin.ref,destination:jeri.ref,category:'car',
  }),true);
  const jjd=quoteFare({
    origin:jeri.ref,destination:airport.ref,category:'comfort_black',period:'day',
  },catalog);
  assert.equal(jjd.kind,'exact');
  assert.equal(jjd.ruleId,'jeri-airport-comfort');
  if (jjd.kind==='exact') assert.equal(jjd.baseAmountCents,24000);
});

test('identidade de GPS falsa não transforma ponto remoto em localidade tarifável', () => {
  const catalog=STATIC_PRICING_CATALOG_V1;
  const prea=fixtures[0]!;
  const jeri=fixtures[2]!;
  assert.throws(() => assertPricingLocationMatchesPoint({
    catalog,ref:jeri.ref,point:prea.point,field:'destination',
  }),PricingLocationMismatchError);
  assert.throws(() => assertPricingLocationMatchesPoint({
    catalog,ref:prea.ref,point:jeri.point,field:'origin',
  }),PricingLocationMismatchError);
  const invalid = {zoneId:'prea' as const,localityId:'não-existe'};
  assert.throws(() => quoteFare({
    origin:invalid,destination:jeri.ref,category:'car',period:'day',
  },catalog),(error:unknown)=>error instanceof PricingError &&
    error.code==='UNKNOWN_LOCALITY');
});
