import assert from 'node:assert/strict';
import test from 'node:test';

import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { quoteFare } from '../src/pricing/quote-engine.js';
import { PricingError, type LocationRef, type ServiceCategory } from '../src/pricing/types.js';

const catalog = STATIC_PRICING_CATALOG_V1;
const endpoints: LocationRef[] = [
  ...Object.keys(catalog.localities.prea).map(localityId => ({zoneId:'prea' as const,localityId})),
  ...Object.keys(catalog.localities.jijoca).map(localityId => ({zoneId:'jijoca' as const,localityId})),
  ...catalog.externalLocalities.map(localityId => ({zoneId:'external' as const,localityId})),
  {zoneId:'jericoacoara',localityId:'jericoacoara'},
];
const categories: ServiceCategory[] = ['moto','car','comfort_black','buggy','delivery'];
const periods = ['day','after_22'] as const;

test('auditoria cruzada de todo o catálogo preserva segurança financeira e autorização explícita', () => {
  let exact = 0;
  let range = 0;
  let denied = 0;
  let scenarios = 0;
  for (const origin of endpoints) {
    for (const destination of endpoints) {
      for (const category of categories) {
        for (const period of periods) {
          scenarios++;
          try {
            const result = quoteFare({
              origin,destination,category,period,
              tripDistanceKm:7.25,
              passengers:category === 'buggy' ? 2 : 1,
              driverPickupDistanceKm:0,
            },catalog);
            assert.ok(result.ruleId.length>0);
            assert.equal(Number.isInteger(result.pickupCompensationCents),true);
            assert.ok(result.pickupCompensationCents>=0);
            if (result.kind === 'exact') {
              exact++;
              for(const value of [
                result.baseAmountCents,result.totalAmountCents,
                result.platformCommissionCents,result.driverNetCents,
              ]) {
                assert.ok(Number.isSafeInteger(value) && value >= 0,
                  origin.zoneId + '/' + origin.localityId + ' → ' +
                  destination.zoneId + '/' + destination.localityId +
                  ' ' + category + ' ' + period + ' yielded invalid money');
              }
              assert.equal(result.totalAmountCents,
                result.baseAmountCents+result.pickupCompensationCents);
              assert.equal(result.platformCommissionCents+result.driverNetCents,
                result.totalAmountCents);
            } else {
              range++;
              assert.equal(result.requiresExactResolution,true);
              assert.ok(Number.isSafeInteger(result.minTotalAmountCents));
              assert.ok(Number.isSafeInteger(result.maxTotalAmountCents));
              assert.ok(result.minTotalAmountCents>=0);
              assert.ok(result.maxTotalAmountCents>=result.minTotalAmountCents);
            }
          } catch (error) {
            // Failed business eligibility is expected for unregistered/unsupported
            // routes. A programming/runtime failure is never an accepted result.
            if (!(error instanceof PricingError)) throw error;
            assert.ok([
              'UNKNOWN_ROUTE','UNAVAILABLE_CATEGORY','UNAVAILABLE_ZONE',
              'UNKNOWN_LOCALITY','MISSING_DISTANCE','INVALID_PASSENGER_COUNT',
            ].includes(error.code),error.code);
            denied++;
          }
        }
      }
    }
  }
  assert.equal(exact+range+denied,scenarios);
  assert.ok(exact>0);
  assert.ok(denied>0);
  assert.equal(catalog.distanceFarePolicies.length,0,
    'Baseline must not secretly turn on new kilometer fallback policies.');
  console.log('Ramo pricing full matrix: ' +
    JSON.stringify({endpoints:endpoints.length,categories:categories.length,
      periods:periods.length,scenarios,exact,range,denied}));
});

test('Core rejects non-finite or negative distance before calculating price/commission', () => {
  for (const distance of [Number.NaN,Number.POSITIVE_INFINITY,-3]) {
    for (const field of ['tripDistanceKm','driverPickupDistanceKm'] as const) {
      const request = {
        origin: {zoneId:'prea' as const,localityId:'prea'},
        destination: {zoneId:'prea' as const,localityId:'cavalo-bravo'},
        category:'car' as const,
        period:'day' as const,
        tripDistanceKm:6,
        driverPickupDistanceKm:0,
      };
      assert.throws(() => quoteFare({...request,[field]:distance},catalog),
        (error: unknown) => error instanceof PricingError &&
          error.code === 'MISSING_DISTANCE');
    }
  }
});
