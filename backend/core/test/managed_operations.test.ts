import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { prepareThreeRegionCatalog, applyManagementMutation, saveManagementChange, catalogRevision } from '../src/pricing/management-service.js';
import { validateOperations, type ManagedRate, ManagementError } from '../src/pricing/managed-operations.js';
import { quoteFare } from '../src/pricing/quote-engine.js';
import { publicPricingPolicyView } from '../src/pricing/public-pricing-policy.js';
import { authoritativeManagedQuote } from '../src/pricing/authoritative-quote.js';
import { classifyCoordinateByCatalog } from '../src/places/coordinate-place-policy.js';
import { InMemoryPricingCatalogVersionRepository } from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { resolvePricingCatalogContext } from '../src/pricing/effective-catalog.js';
import { requiresFourByFourForTrip } from '../src/pricing/category-eligibility.js';
import { pricingPeriodAt } from '../src/pricing/period.js';
const actor={kind:'user' as const,id:randomUUID(),name:'Isolated administrator'};
const now=new Date('2026-10-20T18:00:00.000Z');
const ref=(id:string)=>({zoneId:id as 'prea'|'jijoca'|'jericoacoara',localityId:id});
const base=()=>prepareThreeRegionCatalog(structuredClone(STATIC_PRICING_CATALOG_V1));
const rate=(overrides:Partial<ManagedRate>={}):ManagedRate=>({
  id:'test-rate',name:'Synthetic test tariff',kind:'distance',originRegionId:'prea',destinationRegionId:'prea',
  bidirectional:true,categoryId:'moto',enabled:true,archived:false,
  day:{amountCents:250,minimumCents:1000},night:{amountCents:350,minimumCents:1200},
  includedPassengers:1,perExtraPassengerCents:0,extras:[],...overrides,
});
const request={origin:ref('prea'),destination:ref('prea'),category:'moto' as const,period:'day' as const};
const point={latitude:-2.82017,longitude:-40.41467};
function configured(rates:ManagedRate[]){
  const catalog=base();catalog.managedOperations!.rates=rates;
  validateOperations(catalog.managedOperations!);return catalog;
}
test('preparation removes commercial fallback and operational localities, preserves source/categories',()=>{
  const source=structuredClone(STATIC_PRICING_CATALOG_V1),copy=structuredClone(source);
  const catalog=prepareThreeRegionCatalog(source);
  assert.deepEqual(source,copy);
  assert.deepEqual(catalog.categories,source.categories);
  assert.deepEqual(catalog.managedOperations!.regions.map(r=>r.id).sort(),['jericoacoara','jijoca','prea']);
  assert.deepEqual(catalog.fixedRoutes,[]);assert.deepEqual(catalog.distanceFarePolicies,[]);
  assert.equal(catalog.commercialPolicy,undefined);
  for(const category of catalog.categories)for(const a of ['jericoacoara','jijoca','prea'])for(const b of ['jericoacoara','jijoca','prea']){
    assert.throws(()=>quoteFare({origin:ref(a),destination:ref(b),category,period:'day',tripDistanceKm:5},catalog));
  }
  const policy=publicPricingPolicyView({snapshot:catalog,version:null,reference:{catalogVersion:'test'}});
  assert.deepEqual(policy.enabledCategories,[]);
});
test('fixed tariff takes precedence in both directions, night is explicit',()=>{
  const catalog=configured([
    rate({id:'distance',originRegionId:'prea',destinationRegionId:'jijoca'}),
    rate({id:'fixed',kind:'fixed',originRegionId:'prea',destinationRegionId:'jijoca',day:{amountCents:2300,minimumCents:0},night:{amountCents:3100,minimumCents:0}}),
  ]);
  for(const [a,b]of [['prea','jijoca'],['jijoca','prea']]){
    const q=quoteFare({...request,origin:ref(a!),destination:ref(b!),tripDistanceKm:100},catalog);
    assert.equal(q.ruleId,'fixed');assert.equal(q.kind,'exact');if(q.kind==='exact')assert.equal(q.totalAmountCents,2300);
  }
  const q=quoteFare({...request,origin:ref('prea'),destination:ref('jijoca'),period:'after_22'},catalog);
  if(q.kind==='exact')assert.equal(q.totalAmountCents,3100);
});
test('distance, minimum, extras and commission preserve exact integer money',()=>{
  const catalog=configured([rate({extras:[{name:'Synthetic extra',amountCents:100,period:'day'}]})]);
  for(const [km,cents]of [[1,1100],[5.1,1375]]){
    const q=quoteFare({...request,tripDistanceKm:km},catalog);
    assert.equal(q.kind,'exact');
    if(q.kind==='exact'){
      assert.equal(q.totalAmountCents,cents);assert.equal(q.pickupCompensationCents,0);
      assert.equal(q.platformCommissionCents+q.driverNetCents,q.totalAmountCents);
    }
  }
});
test('no day fallback for a missing night price and no legacy delivery/buggy fallback',()=>{
  const catalog=configured([rate({night:null})]);
  assert.throws(()=>quoteFare({...request,period:'after_22',tripDistanceKm:2},catalog),/indisponível/);
  for(const category of ['delivery','buggy'] as const)assert.throws(()=>quoteFare({...request,category,tripDistanceKm:2},catalog),/indisponível/);
});
test('overlap precedence is deterministic and smaller region wins',()=>{
  const catalog=base();
  catalog.managedOperations!.regions.push({...catalog.managedOperations!.regions.find(r=>r.id==='prea')!,id:'small',radiusKm:0.1});
  catalog.localities.prea.small={};catalog.localityGeofences.push({zoneId:'prea',localityId:'small',centerLatitude:point.latitude,centerLongitude:point.longitude,radiusKm:0.1});
  assert.deepEqual(classifyCoordinateByCatalog({catalog,...point}),{zoneId:'prea',localityId:'small'});
  assert.throws(()=>quoteFare({...request,origin:{zoneId:'external'},tripDistanceKm:3},catalog));
});
test('invalid distance and impossible capacities fail closed',()=>{
  for(const km of [NaN,Infinity,-1,5001])assert.throws(()=>quoteFare({...request,tripDistanceKm:km},configured([rate()])));
  assert.throws(()=>quoteFare({...request,passengers:2,tripDistanceKm:3},configured([rate()])),/passageiros/);
});
test('server route length wins over forged client distance, fixed tariff needs no route request',async()=>{
  let calls=0;
  const catalog=configured([rate()]);
  const q=await authoritativeManagedQuote({catalog,request:{...request,tripDistanceKm:0.001},
    pickup:point,dropoff:point,routing:{async routeDistanceKm(){calls++;return 5;}}});
  assert.equal(calls,1);if(q.kind==='exact')assert.equal(q.totalAmountCents,1250);
  await assert.rejects(authoritativeManagedQuote({catalog,request,pickup:point,dropoff:{latitude:0,longitude:0},routing:null}));
  const fixed=configured([rate({kind:'fixed',day:{amountCents:2200,minimumCents:0},night:null})]);
  await authoritativeManagedQuote({catalog:fixed,request,pickup:point,dropoff:point,routing:{async routeDistanceKm(){throw Error('must not call');}}});
});
test('duplicate rules, invalid coordinates and unsupported activation are rejected',()=>{
  assert.throws(()=>configured([rate({id:'one'}),rate({id:'two'})]),/Já existe/);
  const catalog=base();
  assert.throws(()=>applyManagementMutation(catalog,{kind:'region.save',region:{...catalog.managedOperations!.regions[0],latitude:NaN}}));
  const custom={...catalog.managedOperations!.categories[0]!,id:'new-category',name:'Future operational category',enabled:false};
  const saved=applyManagementMutation(catalog,{kind:'category.save',category:custom}).snapshot;
  assert.ok(saved.managedOperations!.categories.find(c=>c.id===custom.id));
  assert.throws(()=>applyManagementMutation(saved,{kind:'category.save',category:{...custom,enabled:true}}),/suporte operacional/);
});
test('archive cascades availability without removing references or old prices',()=>{
  const original=configured([rate()]);
  const archived=applyManagementMutation(original,{kind:'region.archive',id:'prea'});
  assert.equal(archived.sensitive,true);
  assert.equal(archived.snapshot.managedOperations!.rates[0]!.enabled,false);
  assert.equal(archived.snapshot.managedOperations!.rates[0]!.day!.amountCents,250);
  assert.equal(original.managedOperations!.regions.find(r=>r.id==='prea')!.archived,false);
  assert.throws(()=>quoteFare({...request,tripDistanceKm:3},archived.snapshot));
});
test('Jeri retains real 4x4 requirement and configured day/night boundaries',()=>{
  const catalog=base();
  assert.equal(requiresFourByFourForTrip({catalog,category:'car',origin:ref('jericoacoara'),destination:ref('prea')}),true);
  assert.equal(requiresFourByFourForTrip({catalog,category:'car',origin:ref('jericoacoara'),destination:ref('jericoacoara')}),true);
  assert.equal(pricingPeriodAt(new Date('2026-10-21T00:59:59Z'),catalog.periodPolicy),'day');
  assert.equal(pricingPeriodAt(new Date('2026-10-21T01:00:00Z'),catalog.periodPolicy),'after_22');
  assert.equal(pricingPeriodAt(new Date('2026-10-21T09:00:00Z'),catalog.periodPolicy),'day');
});
async function seed(){
  const versions=new InMemoryPricingCatalogVersionRepository(),admin=new InMemoryAdminRepository();
  const snapshot=base(),instant=now.toISOString(),id=randomUUID();
  const record=await versions.commitDirect!({admin,expectedEffectiveId:null,
    record:{id,status:'published',snapshot,createdBy:actor,publishedBy:actor,createdAt:instant,updatedAt:instant,publishedAt:instant,effectiveFrom:instant},
    audit:{id:randomUUID(),actor,action:'test.seed',targetType:'pricing_catalog_version',targetId:id,metadata:{},createdAt:instant}});
  return {versions,admin,record:record!};
}
test('direct save is immutable, retries idempotent and stale admins conflict',async()=>{
  const {versions,admin,record}=await seed();
  let confirmations=0;
  const mutation={kind:'region.save',region:{...record.snapshot.managedOperations!.regions[0],name:'Jericoacoara atualizada'}};
  const input={versions,admin,actor,requestId:randomUUID(),expectedRevision:catalogRevision(record),mutation,
    reauthenticate:async()=>{confirmations++;},now:new Date(now.getTime()+1000)};
  const saved=await saveManagementChange(input),retry=await saveManagementChange(input);
  assert.equal(saved.id,retry.id);assert.equal(confirmations,1);
  assert.equal((await versions.list(100)).length,2);
  assert.equal((await admin.listAudit(100)).length,2);
  await assert.rejects(saveManagementChange({...input,requestId:randomUUID()}),e=>e instanceof ManagementError&&e.status===409);
  assert.equal((await versions.findById(record.id))!.snapshot.managedOperations!.regions[0]!.name,'Jericoacoara');
});
test('concurrent saves have one winner; reauth/audit failures never change catalog',async()=>{
  const {versions,admin,record}=await seed();
  const create=(name:string)=>({versions,admin,actor,requestId:randomUUID(),expectedRevision:catalogRevision(record),
    mutation:{kind:'region.save',region:{...record.snapshot.managedOperations!.regions[0],name}},reauthenticate:async()=>{},now:new Date(now.getTime()+1000)});
  const results=await Promise.allSettled([saveManagementChange(create('first')),saveManagementChange(create('second'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const current=await resolvePricingCatalogContext({versions,at:new Date(now.getTime()+2000)});
  await assert.rejects(saveManagementChange({...create('blocked'),expectedRevision:catalogRevision(current.version),
    reauthenticate:async()=>{throw new ManagementError('REAUTH_REQUIRED','Confirm',428);}}));
  assert.equal((await versions.list(100)).length,2);
  const brokenAdmin={...admin,appendAudit:async()=>{throw Error('audit unavailable');}} as unknown as typeof admin;
  await assert.rejects(saveManagementChange({...create('audit fails'),admin:brokenAdmin,expectedRevision:catalogRevision(current.version)}));
  assert.equal((await versions.list(100)).length,2);
});
