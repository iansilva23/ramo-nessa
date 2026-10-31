import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresAdminRepository} from '../src/admin/repositories/postgres-admin-repository.js';
import {PostgresPricingCatalogVersionRepository} from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {prepareThreeRegionCatalog,saveManagementChange,catalogRevision} from '../src/pricing/management-service.js';
import {quoteFare} from '../src/pricing/quote-engine.js';
const url='postgresql://ramo_ci:ramo_ci_ephemeral_only@127.0.0.1:5432/ramo_v5_ci';
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_V5_EPHEMERAL_PG==='true'&&process.env.DATABASE_URL===url;
test('real PostgreSQL direct save, CAS, archive, audit failure rollback and immutable history',{skip:!enabled,timeout:45000},async()=>{
  const schema='managed_'+randomUUID().replaceAll('-',''),root=createPostgresPool(url),dbUrl=new URL(url);
  dbUrl.searchParams.set('options','-c search_path='+schema+',public');
  const pool=createPostgresPool(dbUrl.toString()),versions=new PostgresPricingCatalogVersionRepository(pool),admin=new PostgresAdminRepository(pool);
  const actor={kind:'user' as const,id:randomUUID(),name:'PostgreSQL isolated administrator'},now=new Date('2026-10-20T18:00:00Z');
  const snapshot=prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),id=randomUUID(),instant=now.toISOString();
  const audit=(action:string,targetId:string)=>({id:randomUUID(),actor,action,targetType:'pricing_catalog_version',targetId,metadata:{},createdAt:instant});
  try{
    await root.query('CREATE SCHEMA '+schema);
    await root.query('CREATE TABLE '+schema+'.pricing_catalog_versions (LIKE public.pricing_catalog_versions INCLUDING ALL)');
    await root.query('CREATE TABLE '+schema+'.admin_audit_log (LIKE public.admin_audit_log INCLUDING ALL)');
    const baseline=await versions.commitDirect!({admin,expectedEffectiveId:null,record:{id,status:'published',snapshot,createdBy:actor,publishedBy:actor,createdAt:instant,updatedAt:instant,publishedAt:instant,effectiveFrom:instant},audit:audit('test.seed',id)});
    assert.ok(baseline);
    const region=baseline.snapshot.managedOperations!.regions[0]!;
    const input=(name:string)=>({versions,admin,actor,expectedRevision:catalogRevision(baseline),requestId:randomUUID(),mutation:{kind:'region.save',region:{...region,name}},reauthenticate:async()=>{},now:new Date(now.getTime()+1000)});
    const outcomes=await Promise.allSettled([saveManagementChange(input('First writer')),saveManagementChange(input('Second writer'))]);
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await versions.list(100)).length,2);
    assert.equal((await admin.listAudit(100)).length,2);
    assert.equal((await versions.findById(id))!.snapshot.managedOperations!.regions[0]!.name,'Jericoacoara');
    const current=await versions.findEffective(new Date(now.getTime()+2000).toISOString());assert.ok(current);
    await pool.query("ALTER TABLE admin_audit_log ADD CONSTRAINT isolated_failure CHECK (action <> 'test.fail')");
    const rejectedId=randomUUID(),failedTime=new Date(now.getTime()+3000).toISOString();
    await assert.rejects(versions.commitDirect!({admin,expectedEffectiveId:current.id,
      record:{...current,id:rejectedId,effectiveFrom:failedTime,createdAt:failedTime,updatedAt:failedTime,publishedAt:failedTime},audit:audit('test.fail',rejectedId)}));
    assert.equal(await versions.findById(rejectedId),null);
    assert.equal((await versions.list(100)).length,2);
    const archived=await saveManagementChange({...input('unused'),expectedRevision:catalogRevision(current),
      mutation:{kind:'region.archive',id:'prea'},now:new Date(now.getTime()+4000)});
    assert.equal(archived.snapshot.managedOperations!.regions.find(r=>r.id==='prea')!.archived,true);
    assert.throws(()=>quoteFare({origin:{zoneId:'prea'},destination:{zoneId:'prea'},category:'moto',period:'day',tripDistanceKm:2},archived.snapshot));
    const legacy=await versions.createDraft({id:randomUUID(),snapshot:STATIC_PRICING_CATALOG_V1,createdBy:actor,createdAt:failedTime});
    assert.equal(await versions.publish({id:legacy.id,expectedUpdatedAt:legacy.updatedAt,effectiveFrom:failedTime,publishedBy:actor,publishedAt:failedTime}),null);
    assert.equal((await versions.findEffective(new Date(now.getTime()+5000).toISOString()))!.id,archived.id);
  }finally{await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();}
});
