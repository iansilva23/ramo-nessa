import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyCoordinateByCatalog, CoordinateClassificationError } from '../src/places/coordinate-place-policy.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { requiresFourByFourForTrip } from '../src/pricing/category-eligibility.js';
import { municipalityFor } from '../src/pricing/municipality-directory.js';
import { quoteFare } from '../src/pricing/quote-engine.js';
import { assertCatalogLocationSupported } from '../src/pricing/catalog-location-policy.js';
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
  // A revisão comercial aprovada em 03/10 substituiu a base legada de R$ 240.
  if (jjd.kind==='exact') assert.equal(jjd.baseAmountCents,22000);
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

test('coordenadas inválidas não podem validar referências tarifárias', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const reference = fixtures[0]!;
  const invalidPoints = [
    {latitude:Number.NaN,longitude:reference.point.longitude},
    {latitude:Number.POSITIVE_INFINITY,longitude:reference.point.longitude},
    {latitude:reference.point.latitude,longitude:Number.NEGATIVE_INFINITY},
    {latitude:91,longitude:reference.point.longitude},
    {latitude:-91,longitude:reference.point.longitude},
    {latitude:reference.point.latitude,longitude:181},
    {latitude:reference.point.latitude,longitude:-181},
  ];
  for (const point of invalidPoints) {
    for (const field of ['origin','destination'] as const) {
      assert.throws(() => assertPricingLocationMatchesPoint({
        catalog,ref:reference.ref,point,field,
      }), PricingLocationMismatchError);
    }
  }
});

test('coordenada local não pode ser declarada destino externo sem prova', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const prea = fixtures[0]!;
  assert.throws(() => assertPricingLocationMatchesPoint({
    catalog,
    ref:{zoneId:'external',localityId:'airport-jjd'},
    point:prea.point,
    field:'destination',
  }), PricingLocationMismatchError);
  assert.throws(() => assertPricingLocationMatchesPoint({
    catalog,
    ref:{zoneId:'external'},
    point:prea.point,
    field:'destination',
  }), PricingLocationMismatchError);
});

test('classificador de geocercas rejeita coordenadas inválidas e pontos sem área aprovada', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const invalidPoints = [
    {latitude:Number.NaN,longitude:-40.41467},
    {latitude:Number.POSITIVE_INFINITY,longitude:-40.41467},
    {latitude:-2.82017,longitude:Number.NEGATIVE_INFINITY},
    {latitude:90.01,longitude:-40.41467},
    {latitude:-90.01,longitude:-40.41467},
    {latitude:-2.82017,longitude:180.01},
    {latitude:-2.82017,longitude:-180.01},
  ];
  for (const point of invalidPoints) {
    assert.throws(() => classifyCoordinateByCatalog({catalog,...point}),
      (error:unknown) => error instanceof CoordinateClassificationError &&
        error.code === 'INVALID_COORDINATES');
  }
  assert.throws(() => classifyCoordinateByCatalog({
    catalog,latitude:0,longitude:0,
  }), (error:unknown) => error instanceof CoordinateClassificationError &&
    error.code === 'COORDINATE_NOT_CLASSIFIED');
});

test('localidade fictícia da Vila não pode ser validada apenas por estar dentro da geocerca', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const jeri = fixtures[2]!;
  assert.throws(() => assertPricingLocationMatchesPoint({
    catalog,
    ref:{zoneId:'jericoacoara',localityId:'vila-inventada'},
    point:jeri.point,
    field:'destination',
  }), PricingLocationMismatchError);
  assert.doesNotThrow(() => assertPricingLocationMatchesPoint({
    catalog,ref:jeri.ref,point:jeri.point,field:'destination',
  }));
});

test('zona desconhecida falha com erro de domínio, nunca exceção não tratada', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const ref = {zoneId:'zona-inexistente',localityId:'prea'} as unknown as typeof fixtures[0]['ref'];
  assert.throws(() => assertPricingLocationMatchesPoint({
    catalog,ref,point:fixtures[0]!.point,field:'origin',
  }), PricingLocationMismatchError);
  assert.throws(() => assertCatalogLocationSupported({catalog,ref,field:'origin'}),
    (error:unknown) => error instanceof PricingError && error.code === 'UNAVAILABLE_ZONE');
});

test('geocerca corrompida nunca valida GPS por comparação com NaN', () => {
  const reference = fixtures[0]!;
  for (const radiusKm of [Number.NaN,Number.POSITIVE_INFINITY,0,-1,101]) {
    const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
    const geofence = catalog.localityGeofences.find(row =>
      row.zoneId === reference.ref.zoneId &&
      row.localityId === reference.ref.localityId);
    assert.ok(geofence, 'Preá deve ter geocerca no catálogo de teste');
    geofence.radiusKm = radiusKm;
    assert.throws(() => assertPricingLocationMatchesPoint({
      catalog,ref:reference.ref,point:reference.point,field:'origin',
    }), PricingLocationMismatchError);
  }
});

test('matriz GPS → localidade → cotação percorre categorias e horários sem liberar rota desconhecida', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const categories = ['moto','car','comfort_black','buggy','delivery'] as const;
  const periods = ['day','after_22'] as const;
  let exact = 0;
  let range = 0;
  let denied = 0;
  for (const origin of fixtures) {
    for (const destination of fixtures) {
      const originRef = classifyCoordinateByCatalog({catalog,...origin.point});
      const destinationRef = classifyCoordinateByCatalog({catalog,...destination.point});
      assert.deepEqual(originRef, origin.ref);
      assert.deepEqual(destinationRef, destination.ref);
      assertPricingLocationMatchesPoint({catalog,ref:originRef,point:origin.point,field:'origin'});
      assertPricingLocationMatchesPoint({catalog,ref:destinationRef,point:destination.point,field:'destination'});
      for (const category of categories) {
        for (const period of periods) {
          try {
            const result = quoteFare({
              origin:originRef,destination:destinationRef,category,period,
              tripDistanceKm:7.25,driverPickupDistanceKm:0,
              passengers:category === 'buggy' ? 2 : 1,
            },catalog);
            if (result.kind === 'exact') {
              assert.ok(Number.isSafeInteger(result.totalAmountCents));
              assert.ok(result.totalAmountCents >= 0);
              assert.equal(result.platformCommissionCents + result.driverNetCents,
                result.totalAmountCents);
              exact++;
            } else {
              assert.equal(result.requiresExactResolution,true);
              range++;
            }
          } catch (error) {
            if (!(error instanceof PricingError)) throw error;
            assert.ok(['UNKNOWN_ROUTE','UNAVAILABLE_CATEGORY','UNAVAILABLE_ZONE',
              'UNKNOWN_LOCALITY','MISSING_DISTANCE','INVALID_PASSENGER_COUNT']
              .includes(error.code),error.code);
            denied++;
          }
        }
      }
    }
  }
  assert.equal(exact+range+denied,fixtures.length**2*categories.length*periods.length);
  assert.ok(exact > 0);
  assert.ok(denied > 0);
  assert.equal(catalog.distanceFarePolicies.length,0,
    'Não habilitar fallback regional por km durante os testes');
});

test('fronteira da Vila exige sinalização 4x4 nos dois sentidos sem impor regra dentro da zona', () => {
  const catalog = STATIC_PRICING_CATALOG_V1;
  const jeri = fixtures[2]!.ref;
  const prea = fixtures[0]!.ref;
  const jijoca = fixtures[1]!.ref;
  const categories = ['moto','car','comfort_black','buggy','delivery'] as const;
  for (const category of categories) {
    for (const other of [prea,jijoca]) {
      const departing = requiresFourByFourForTrip({
        catalog,origin:jeri,destination:other,category,
      });
      const returning = requiresFourByFourForTrip({
        catalog,origin:other,destination:jeri,category,
      });
      assert.equal(departing,returning,'A fronteira deve ser simétrica');
      assert.equal(departing,
        catalog.categoryPolicies[category].requiresFourByFourOnJeriBoundary);
    }
    assert.equal(requiresFourByFourForTrip({
      catalog,origin:jeri,destination:jeri,category,
    }),false);
    assert.equal(requiresFourByFourForTrip({
      catalog,origin:prea,destination:jijoca,category,
    }),false);
  }
  assert.equal(requiresFourByFourForTrip({
    catalog,origin:prea,destination:jeri,category:'car',
  }),true,'A categoria carro deve sinalizar restrição 4x4 ao cruzar para a Vila');
});
