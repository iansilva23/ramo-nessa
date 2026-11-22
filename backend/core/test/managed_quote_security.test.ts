import assert from 'node:assert/strict';
import test from 'node:test';
import {authorizeManagedQuote} from '../src/pricing/quote-request-security.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {prepareThreeRegionCatalog} from '../src/pricing/management-service.js';
import {InMemoryAdminHumanAuthRepository} from '../src/admin/repositories/in-memory-admin-human-auth-repository.js';
test('legacy quote stays compatible; managed routed quote requires authentication before consuming quota',async()=>{
  const limits=new InMemoryAdminHumanAuthRepository();
  await authorizeManagedQuote({catalog:STATIC_PRICING_CATALOG_V1,limits,authenticate:async()=>{throw Error('legacy must not change');}});
  await assert.rejects(authorizeManagedQuote({catalog:prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),limits,authenticate:async()=>{throw Error('unauthorized');}}),/unauthorized/);
});
test('managed quote quota is account-specific, persistent and resets after the window',async()=>{
  const catalog=prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),limits=new InMemoryAdminHumanAuthRepository(),now=new Date('2026-10-20T18:00:00Z');
  for(let i=0;i<60;i++)await authorizeManagedQuote({catalog,limits,now,authenticate:async()=> 'passenger-a'});
  await assert.rejects(authorizeManagedQuote({catalog,limits,now,authenticate:async()=> 'passenger-a'}),e=>(e as {code:string}).code==='PRICING_RATE_LIMITED');
  await authorizeManagedQuote({catalog,limits,now,authenticate:async()=> 'passenger-b'});
  await authorizeManagedQuote({catalog,limits,now:new Date(now.getTime()+60001),authenticate:async()=> 'passenger-a'});
});
