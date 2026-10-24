import assert from 'node:assert/strict';
import test from 'node:test';
import {managedPlacesBounds} from '../src/places/managed-places-coverage.js';
import {prepareThreeRegionCatalog,applyManagementMutation} from '../src/pricing/management-service.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {GooglePlacesService} from '../src/places/google-places-service.js';
test('managed search coverage follows active circles without inheriting static search limits',()=>{
  assert.equal(managedPlacesBounds(STATIC_PRICING_CATALOG_V1),undefined);
  const current=prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1);
  const changed=applyManagementMutation(current,{kind:'region.save',region:{
    id:'new-test-coverage',zoneId:'external',name:'Synthetic outside original rectangle',municipality:'Cruz',state:'CE',
    latitude:-3.2,longitude:-40.2,radiusKm:2,enabled:true,archived:false,categoryIds:['moto'],
  }}).snapshot;
  const bounds=managedPlacesBounds(changed)!;
  assert.ok(bounds.minLatitude < -3.2);assert.ok(bounds.maxLongitude > -40.2);
  const archived=applyManagementMutation(changed,{kind:'region.archive',id:'new-test-coverage'}).snapshot;
  assert.ok(managedPlacesBounds(archived)!.minLatitude > bounds.minLatitude);
});
test('Google autocomplete receives only server-derived coverage, legacy defaults stay unchanged',async()=>{
  const calls:Array<Record<string,any>>=[];
  const provider=new GooglePlacesService('synthetic-key','https://places.googleapis.com/v1/',5000,
    (async(_url:unknown,init:RequestInit)=>{
      calls.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({suggestions:[]}),{status:200,headers:{'content-type':'application/json'}});
    }) as typeof fetch);
  const bounds={minLatitude:-3.3,maxLatitude:-3.1,minLongitude:-40.3,maxLongitude:-40.1};
  await provider.autocomplete({query:'Synthetic place',sessionToken:'11111111-1111-4111-8111-111111111111',localOnly:true,bounds});
  assert.deepEqual(calls[0]!.locationRestriction.rectangle,{low:{latitude:-3.3,longitude:-40.3},high:{latitude:-3.1,longitude:-40.1}});
  await provider.autocomplete({query:'Legacy place',sessionToken:'22222222-2222-4222-8222-222222222222',localOnly:true});
  assert.equal(calls[1]!.locationRestriction.rectangle.low.latitude,-2.98);
});
