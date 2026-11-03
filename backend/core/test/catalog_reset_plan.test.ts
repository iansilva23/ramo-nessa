import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {InMemoryPricingCatalogVersionRepository} from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import {InMemoryAdminRepository} from '../src/admin/repositories/in-memory-admin-repository.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {prepareCatalogResetPlan,applyCatalogResetPlan,restoreCatalogBeforeReset} from '../src/pricing/catalog-reset-plan.js';
import {catalogRevision,saveManagementChange} from '../src/pricing/management-service.js';
const actor={kind:'user' as const,id:randomUUID(),name:'Reset plan isolated test'};
async function fixture(){
  const versions=new InMemoryPricingCatalogVersionRepository(),admin=new InMemoryAdminRepository(),now=new Date(Date.now()-60000);
  const snapshot=structuredClone(STATIC_PRICING_CATALOG_V1),id=randomUUID(),instant=now.toISOString();
  await versions.commitDirect!({admin,expectedEffectiveId:null,record:{id,status:'published',snapshot,createdBy:actor,publishedBy:actor,effectiveFrom:instant,createdAt:instant,updatedAt:instant,publishedAt:instant},
    audit:{id:randomUUID(),actor,action:'test.seed',targetType:'pricing_catalog_version',targetId:id,metadata:{},createdAt:instant}});
  return {versions,admin,now,snapshot};
}
test('plan is read-only; apply is reversible, idempotent and retains both historical snapshots',async()=>{
  const f=await fixture(),plan=await prepareCatalogResetPlan(f.versions);
  assert.equal((await f.versions.list(100)).length,1);
  const result=await applyCatalogResetPlan({...f,plan,actor,now:new Date(f.now.getTime()+1000)});
  assert.equal(result.unchanged,false);assert.ok(result.record);
  assert.deepEqual(result.record.snapshot.managedOperations!.rates,[]);
  const again=await applyCatalogResetPlan({...f,plan,actor,now:new Date(f.now.getTime()+2000)});
  assert.equal(again.unchanged,true);assert.equal((await f.versions.list(100)).length,2);
  const restored=await restoreCatalogBeforeReset({...f,plan,actor,expectedRevision:catalogRevision(result.record),now:new Date(f.now.getTime()+3000)});
  assert.deepEqual(restored.snapshot,f.snapshot);
  assert.equal((await f.versions.list(100)).length,3);
  assert.ok((await f.versions.findById(result.record.id))!.snapshot.managedOperations);
});
test('repeated cleanup never erases new operator tariffs; stale restore is rejected',async()=>{
  const f=await fixture(),plan=await prepareCatalogResetPlan(f.versions);
  const reset=await applyCatalogResetPlan({...f,plan,actor,now:new Date(f.now.getTime()+1000)});assert.ok(reset.record);
  const saved=await saveManagementChange({...f,actor,requestId:randomUUID(),expectedRevision:catalogRevision(reset.record),reauthenticate:async()=>{},
    mutation:{kind:'rate.save',rate:{id:'test-fare',name:'Synthetic rate',kind:'fixed',originRegionId:'prea',destinationRegionId:'prea',categoryId:'moto',bidirectional:true,
      enabled:true,archived:false,day:{amountCents:1200,minimumCents:0},night:null,includedPassengers:1,perExtraPassengerCents:0,extras:[]}},
    now:new Date(f.now.getTime()+2000)});
  const repeated=await applyCatalogResetPlan({...f,plan,actor,now:new Date(f.now.getTime()+3000)});
  assert.equal(repeated.unchanged,true);assert.equal(repeated.record!.id,saved.id);
  assert.equal(repeated.record!.snapshot.managedOperations!.rates.length,1);
  await assert.rejects(restoreCatalogBeforeReset({...f,plan,actor,expectedRevision:catalogRevision(reset.record),now:new Date(f.now.getTime()+4000)}),/Revise/);
});
test('modified plan checksum or changed source cannot be applied',async()=>{
  const f=await fixture(),plan=await prepareCatalogResetPlan(f.versions);
  const modified=structuredClone(plan);modified.sourceSnapshot.commissionBps++;
  await assert.rejects(applyCatalogResetPlan({...f,actor,plan:modified}),/plano/);
  assert.equal((await f.versions.list(100)).length,1);
});
