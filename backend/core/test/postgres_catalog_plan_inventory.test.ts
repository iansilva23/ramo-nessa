import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresPricingCatalogVersionRepository} from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import {PostgresAdminRepository} from '../src/admin/repositories/postgres-admin-repository.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
const url='postgresql://ramo_ci:ramo_ci_ephemeral_only@127.0.0.1:5432/ramo_v5_ci';
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_V5_EPHEMERAL_PG==='true'&&process.env.DATABASE_URL===url;
const run=promisify(execFile);
test('catalog plan inventories real wallet/Asaas tables and foreign keys privately without mutating catalog or financial records',{skip:!enabled,timeout:45000},async()=>{
  const schema='plan_inventory_'+randomUUID().replaceAll('-',''),root=createPostgresPool(url),isolated=new URL(url);
  isolated.searchParams.set('options','-c search_path='+schema+',public');
  const pool=createPostgresPool(isolated.toString()),versions=new PostgresPricingCatalogVersionRepository(pool);
  const folder=await mkdtemp(join(tmpdir(),'ramo-catalog-plan-')),output=join(folder,'plan.private.json');
  const id=randomUUID(),ride=randomUUID(),payout=randomUUID(),instant=new Date(Date.now()-1000).toISOString();
  const actor={kind:'user' as const,id:randomUUID(),name:'Plan inventory fixture'};
  try{
    await root.query('CREATE SCHEMA '+schema);
    for(const table of ['pricing_catalog_versions','admin_audit_log'])
      await root.query('CREATE TABLE '+schema+'.'+table+' (LIKE public.'+table+' INCLUDING ALL)');
    await pool.query('CREATE TABLE rides(id uuid PRIMARY KEY,catalog_id uuid CONSTRAINT rides_catalog_fk REFERENCES pricing_catalog_versions(id))');
    await pool.query('CREATE TABLE payments(id uuid PRIMARY KEY,ride_id uuid REFERENCES rides(id))');
    await pool.query('CREATE TABLE driver_payouts(id uuid PRIMARY KEY)');
    await pool.query('CREATE TABLE wallet_topups(id uuid PRIMARY KEY)');
    await pool.query('CREATE TABLE wallet_topup_events(id uuid PRIMARY KEY,wallet_topup_id uuid REFERENCES wallet_topups(id))');
    await pool.query('CREATE TABLE ledger_transactions(id uuid PRIMARY KEY,wallet_topup_id uuid REFERENCES wallet_topups(id))');
    await pool.query('CREATE TABLE ledger_entries(id uuid PRIMARY KEY,transaction_id uuid REFERENCES ledger_transactions(id))');
    await pool.query('CREATE TABLE asaas_driver_transfer_attempts(payout_id uuid PRIMARY KEY REFERENCES driver_payouts(id))');
    await pool.query('CREATE TABLE asaas_driver_transfer_events(id uuid PRIMARY KEY,payout_id uuid REFERENCES driver_payouts(id))');
    assert.ok(await versions.commitDirect!({admin:new PostgresAdminRepository(pool),expectedEffectiveId:null,
      record:{id,status:'published',snapshot:STATIC_PRICING_CATALOG_V1,createdBy:actor,publishedBy:actor,createdAt:instant,updatedAt:instant,publishedAt:instant,effectiveFrom:instant},
      audit:{id:randomUUID(),actor,action:'test.plan_inventory.seed',targetType:'pricing_catalog_version',targetId:id,metadata:{},createdAt:instant}}));
    await pool.query('INSERT INTO rides VALUES($1,$2)',[ride,id]);
    await pool.query('INSERT INTO payments VALUES($1,$2)',[randomUUID(),ride]);
    await pool.query('INSERT INTO driver_payouts VALUES($1)',[payout]);
    await pool.query('INSERT INTO asaas_driver_transfer_attempts VALUES($1)',[payout]);
    await pool.query('INSERT INTO asaas_driver_transfer_events VALUES($1,$2)',[randomUUID(),payout]);
    await pool.query('INSERT INTO wallet_topups VALUES($1)',[randomUUID()]);
    const invoke=()=>run(process.execPath,['--import','tsx','scripts/prepare-regions-catalog.ts','--plan',output],
      {cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATABASE_URL:isolated.toString()},timeout:20000});
    const result=await invoke();
    assert.equal(JSON.parse(result.stdout).result,'PLAN_ONLY_NO_MUTATION');
    const bytes=await readFile(output,'utf8'),data=JSON.parse(bytes);
    assert.equal((await stat(output)).mode&0o077,0);
    for(const table of ['rides','payments','driver_payouts','wallet_topups','asaas_driver_transfer_attempts','asaas_driver_transfer_events'])
      assert.equal(data.dependencyInventory[table],'1');
    assert.equal(data.dependencyInventory.ledger_transactions,'0');
    assert.equal(data.foreignKeyInventory.find((f:{name:string})=>f.name==='rides_catalog_fk').target_table,'pricing_catalog_versions');
    assert.ok(data.foreignKeyInventory.some((f:{source_table:string;target_table:string})=>f.source_table==='asaas_driver_transfer_attempts'&&f.target_table==='driver_payouts'));
    assert.equal((await versions.list(100)).length,1);
    assert.equal((await versions.findById(id))!.snapshot.managedOperations,undefined);
    assert.equal((await pool.query('SELECT count(*)::text AS n FROM payments')).rows[0].n,'1');
    await assert.rejects(invoke());
    assert.equal(await readFile(output,'utf8'),bytes);
  }finally{
    await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();
    await rm(folder,{recursive:true,force:true});
  }
});
