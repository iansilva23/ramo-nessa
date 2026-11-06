import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { PostgresPricingCatalogVersionRepository } from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
const databaseUrl=process.env.DATABASE_URL?.trim();
const execute=promisify(execFile);
test('approved pricing CLI simulates, publishes atomically, preserves geometry/history and subsequent ADM edits',{skip:!databaseUrl},async()=>{
 const schema=`pricing_${randomUUID().replaceAll('-','')}`;
 const owner=randomUUID();
 const root=createPostgresPool(databaseUrl!);
 const isolatedUrl=new URL(databaseUrl!);
 isolatedUrl.searchParams.set('options',`-c search_path=${schema},public`);
 const pool=createPostgresPool(isolatedUrl.toString());
 const versions=new PostgresPricingCatalogVersionRepository(pool);
 const actor={kind:'user' as const,id:owner,name:'Owner test'};
 const run=(...args:string[])=>execute(process.execPath,['--import','tsx','scripts/apply-approved-pricing.ts',...args],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATABASE_URL:isolatedUrl.toString(),ADMIN_OWNER_USER_ID:owner},
 });
 try{
  await root.query(`CREATE SCHEMA ${schema}`);
  await root.query(`CREATE TABLE ${schema}.admin_users (id uuid PRIMARY KEY)`);
  await root.query(`CREATE TABLE ${schema}.pricing_catalog_versions (LIKE public.pricing_catalog_versions INCLUDING ALL)`);
  await root.query(`CREATE TABLE ${schema}.admin_audit_log (LIKE public.admin_audit_log INCLUDING ALL)`);
  await pool.query('INSERT INTO admin_users(id) VALUES($1)',[owner]);
  const legacy=structuredClone(STATIC_PRICING_CATALOG_V1);
  delete legacy.commercialPolicy;legacy.catalogVersion='legacy-fixture';
  legacy.localityGeofences[0]!.radiusKm=0.3;
  const old=await versions.createDraft({id:randomUUID(),snapshot:legacy,createdBy:actor,createdAt:'2026-09-29T00:00:00Z'});
  await versions.publish({id:old.id,expectedUpdatedAt:old.updatedAt,effectiveFrom:'2026-09-29T00:00:00Z',publishedBy:actor,publishedAt:'2026-09-29T00:00:01Z'});
  assert.match((await run()).stdout,/SIMULAÇÃO/);
  assert.equal((await versions.list(100)).length,1);
  assert.match((await run('--apply')).stdout,/publicada/);
  const current=await versions.findEffective(new Date().toISOString());
  assert.equal(current?.snapshot.catalogVersion,'approved-2026-10-03');
  assert.equal(current?.snapshot.localityGeofences[0]?.radiusKm,0.3);
  assert.equal((await versions.findById(old.id))?.snapshot.catalogVersion,'legacy-fixture');
  const edited=structuredClone(current!.snapshot);
  edited.fixedRoutes.find(item=>item.id==='jeri-prea-car')!.dayCents=13100;
  const next=await versions.createDraft({id:randomUUID(),snapshot:edited,createdBy:actor,createdAt:new Date().toISOString()});
  await versions.publish({id:next.id,expectedUpdatedAt:next.updatedAt,effectiveFrom:new Date().toISOString(),publishedBy:actor,publishedAt:new Date().toISOString()});
  assert.match((await run('--apply')).stdout,/já publicada/);
  assert.equal((await versions.list(100)).length,3);
  assert.equal((await versions.findEffective(new Date().toISOString()))?.snapshot.fixedRoutes.find(item=>item.id==='jeri-prea-car')?.dayCents,13100);
  assert.equal(Number((await pool.query('SELECT count(*) AS count FROM admin_audit_log')).rows[0].count),2);
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
});
