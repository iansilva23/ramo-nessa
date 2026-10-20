import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectRegionsPricing,runRegionsPricingInspection} from './inspect-regions-pricing.mjs';
const sha='a'.repeat(40),secret='NEVER_EXPOSE_PRIVATE_ENVIRONMENT';
function fixture({multiple=false,fail=false}={}){
  const calls=[];
  const execute=(command,args,options)=>{
    calls.push({command,args,options});
    if(fail)return {status:1,stdout:secret,stderr:secret};
    if(command==='git')return {status:0,stdout:sha+'\n'};
    if(args[0]==='ps')return {status:0,stdout:'unrelated-private-service\nramo-nessa-staging-core-1\nramo-nessa-staging-postgres-1\n'+(multiple?'ramo-nessa-other-postgres-1\n':'')};
    if(args[0]==='inspect'){
      assert.equal(args[1],'--format');
      assert.equal(args[2].includes('.Config.Env'),false);
      assert.equal(args[2].includes('{{json .}}'),false);
      return {status:0,stdout:['/'+args[3],'container-id','sha256:image','image:review','running','healthy',sha].map(s=>JSON.stringify(s)).join('\t')};
    }
    assert.equal(args[0],'exec');assert.equal(args[1],'ramo-nessa-staging-postgres-1');
    const sql=args.at(-1);
    assert.ok(sql.startsWith('BEGIN READ ONLY;'));
    assert.ok(sql.includes('SET LOCAL statement_timeout='));
    assert.ok(sql.includes('SET LOCAL lock_timeout='));
    assert.ok(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/i.test(sql));
    let value;
    if(sql.includes('information_schema'))value=['rides','payments','pricing_catalog_versions','schema_migrations'];
    else if(sql.includes('to_json(count'))value='12';
    else if(sql.includes('json_agg(filename'))value=['001_init.sql'];
    else value={id:'catalog-id',versionNumber:7,effectiveFrom:'2026-10-20T10:00:00Z',snapshot:{
      catalogVersion:'managed-test',privateFixture:secret,managedOperations:{regions:[{enabled:true,archived:false},{enabled:false,archived:false}],
      rates:[{enabled:true,archived:false},{enabled:false,archived:true}]}}};
    return {status:0,stdout:JSON.stringify(value)};
  };
  return {execute,calls};
}
test('inventory uses projected Docker fields and read-only SQL, emits aggregates/digest and never raw snapshot/env',()=>{
  const f=fixture(),report=inspectRegionsPricing(f);
  assert.equal(report.readOnly,true);assert.equal(report.checkoutIsNotDeploymentProof,true);
  assert.equal(report.services.length,2);assert.equal(report.checkoutRevision,sha);
  assert.equal(report.database.status,'inspected');assert.equal(report.database.catalog.mode,'managed');
  assert.equal(report.database.catalog.operationalRegions,1);assert.equal(report.database.catalog.activeRates,1);
  assert.match(report.database.catalog.snapshotSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.database.dependencies.rides,'12');assert.equal(report.database.dependencies.driver_payouts,null);
  assert.equal(JSON.stringify(report).includes(secret),false);
  assert.ok(f.calls.every(c=>!['restart','stop','start','rm','run','build'].includes(c.args[0])));
});
test('multiple databases require an explicit running Ramo Nessa PostgreSQL; no database is guessed',()=>{
  const f=fixture({multiple:true}),report=inspectRegionsPricing(f);
  assert.equal(report.database.status,'selection-required');assert.equal(f.calls.some(c=>c.args[0]==='exec'),false);
  assert.throws(()=>inspectRegionsPricing({...fixture(),postgresContainer:'unrelated-private-service'}),/selecionado/);
});
test('failed commands do not reveal private stdout/stderr and mutation flags are rejected',()=>{
  assert.throws(()=>inspectRegionsPricing(fixture({fail:true})),error=>!error.message.includes(secret)&&error.message.includes('Saída privada'));
  assert.throws(()=>runRegionsPricingInspection(['--apply']),/somente/);
  assert.throws(()=>runRegionsPricingInspection(['--postgres-container=external']),/somente/);
});
