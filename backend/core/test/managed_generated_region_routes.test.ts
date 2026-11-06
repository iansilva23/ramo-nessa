import assert from 'node:assert/strict';
import test from 'node:test';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {prepareThreeRegionCatalog, applyManagementMutation} from '../src/pricing/management-service.js';
import {authoritativeManagedQuote} from '../src/pricing/authoritative-quote.js';
import type {QuoteRequest} from '../src/pricing/types.js';

const jeri = {latitude:-2.80023, longitude:-40.51638};
const endpoints = [
  {id:'region-generated-fortaleza', latitude:-3.82428, longitude:-38.55410},
  {id:'region-generated-airport', latitude:-2.90624, longitude:-40.35776},
  {id:'region-generated-future', latitude:-3.2, longitude:-40.7},
];
function catalogFor(endpoint: typeof endpoints[number], kind: 'fixed'|'distance' = 'fixed') {
  let catalog = prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1);
  catalog = applyManagementMutation(catalog, {kind:'region.save', region:{
    ...endpoint, name:'Synthetic destination', municipality:'Synthetic municipality', state:'CE',
    zoneId:'external', radiusKm:1, categoryIds:['comfort_black'], enabled:true, archived:false,
  }}).snapshot;
  return applyManagementMutation(catalog, {kind:'rate.save', rate:{
    id:'synthetic-generated-route', name:'Synthetic fare, never commercial', kind,
    originRegionId:'jericoacoara', destinationRegionId:endpoint.id, bidirectional:true,
    categoryId:'comfort_black', enabled:true, archived:false,
    day:{amountCents:kind === 'fixed' ? 12345 : 200, minimumCents:0},
    night:{amountCents:23456, minimumCents:0}, includedPassengers:1,
    perExtraPassengerCents:0, extras:[],
  }}).snapshot;
}

for (const endpoint of endpoints) {
  for (const reverse of [false,true]) {
    for (const period of ['day','after_22'] as const) {
      test(`generated region ${endpoint.id}, reverse=${reverse}, period=${period} has authoritative fixed quote`, async()=>{
        const catalog = catalogFor(endpoint);
        const a = {zoneId:'jericoacoara' as const, localityId:'jericoacoara'};
        const b = {zoneId:'external' as const, localityId:endpoint.id};
        const request:QuoteRequest = {origin:reverse?b:a,destination:reverse?a:b,
          category:'comfort_black', period, passengers:1, tripDistanceKm:0.001};
        const result = await authoritativeManagedQuote({catalog,request,
          pickup:reverse?endpoint:jeri,dropoff:reverse?jeri:endpoint,
          routing:{async routeDistanceKm(){throw Error('Fixed fare must not request distance');}}});
        assert.equal(result.kind,'exact');
        assert.equal(result.totalAmountCents, period === 'day' ? 12345 : 23456);
      });
    }
  }
}

test('generated route km uses server distance; missing fare never falls back to legacy', async()=>{
  const endpoint=endpoints[0]!,catalog=catalogFor(endpoint,'distance');
  const request:QuoteRequest={origin:{zoneId:'jericoacoara',localityId:'jericoacoara'},
    destination:{zoneId:'external',localityId:endpoint.id},category:'comfort_black',period:'day',tripDistanceKm:0.001};
  const input={catalog,request,pickup:jeri,dropoff:endpoint,routing:{async routeDistanceKm(){return 25;}}};
  const result=await authoritativeManagedQuote(input);
  assert.equal(result.kind,'exact');
  assert.equal(result.totalAmountCents,5000);
  catalog.managedOperations!.rates=[];
  await assert.rejects(authoritativeManagedQuote(input),{code:'UNKNOWN_ROUTE'});
});

test('generated routes retain server category and coordinate checks', async()=>{
  const endpoint=endpoints[1]!,catalog=catalogFor(endpoint);
  const request:QuoteRequest={origin:{zoneId:'jericoacoara',localityId:'jericoacoara'},
    destination:{zoneId:'external',localityId:endpoint.id},category:'comfort_black',period:'day'};
  const input={catalog,request,pickup:jeri,dropoff:endpoint,routing:null};
  await assert.rejects(authoritativeManagedQuote({...input,dropoff:{latitude:0,longitude:0}}));
  await assert.rejects(authoritativeManagedQuote({...input,request:{...request,category:'moto'}}),{code:'UNAVAILABLE_CATEGORY'});
  catalog.managedOperations!.rates[0]!.bidirectional=false;
  await assert.rejects(authoritativeManagedQuote({...input,pickup:endpoint,dropoff:jeri,
    request:{...request,origin:request.destination,destination:request.origin}}),{code:'UNKNOWN_ROUTE'});
});
