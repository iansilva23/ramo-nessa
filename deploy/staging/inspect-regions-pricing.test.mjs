import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectRegionsPricing,runRegionsPricingInspection,coreSourceFingerprintProgram,gatewayFingerprintFiles} from './inspect-regions-pricing.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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

test('compiled source fingerprint detects changed pricing while preserving the financial group and includes added/removed files',()=>{
  const root=mkdtempSync(join(tmpdir(),'ramo-runtime-fingerprint-'));
  try{
    mkdirSync(join(root,'pricing'));mkdirSync(join(root,'payments'));
    writeFileSync(join(root,'server.js'),'server');
    writeFileSync(join(root,'pricing','quote.js'),'old price');
    writeFileSync(join(root,'payments','provider.js'),'preserved provider');
    const run=()=>{
      const result=spawnSync(process.execPath,['--input-type=module','-e',coreSourceFingerprintProgram,root],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
    };
    const before=run();
    writeFileSync(join(root,'pricing','quote.js'),'new price');
    const changed=run();
    assert.notEqual(changed.source.sha256,before.source.sha256);
    assert.notEqual(changed.source.groups.pricing.sha256,before.source.groups.pricing.sha256);
    assert.deepEqual(changed.source.groups.payments,before.source.groups.payments);
    writeFileSync(join(root,'pricing','management.js'),'new management');
    const added=run();assert.equal(added.source.files,4);assert.notEqual(added.source.sha256,changed.source.sha256);
    rmSync(join(root,'pricing','management.js'));
    assert.deepEqual(run(),changed);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('optional fingerprint reads only Core compiled files, projected mounts and explicit ADM files',()=>{
  const base=fixture(),calls=[];
  const execute=(command,args,options)=>{
    calls.push({command,args});
    if(command==='docker'&&args[0]==='ps')
      return {status:0,stdout:base.execute(command,args,options).stdout+'ramo-nessa-staging-gateway-1\n'};
    if(args[0]==='inspect'&&args[2]==='{{json .Mounts}}')
      return {status:0,stdout:JSON.stringify([{Type:'bind',Source:'/private/configuration',Destination:'/etc/caddy/Caddyfile',RW:false},
        {Type:'bind',Source:'/private/web-release',Destination:'/srv/web',RW:false},
        {Type:'bind',Source:secret,Destination:'/not-selected',RW:false}])};
    if(args[0]==='exec'&&args[1]==='ramo-nessa-staging-core-1'){
      assert.deepEqual(args.slice(2,5),['node','--input-type=module','-e']);
      assert.equal(args[5],coreSourceFingerprintProgram);
      assert.deepEqual(args.slice(6),['/app/dist/src','/app/package-lock.json']);
      return {status:0,stdout:JSON.stringify({format:1,source:{files:2,sha256:'b'.repeat(64),groups:{payments:{files:1,sha256:'c'.repeat(64)}}}})};
    }
    if(args[0]==='exec'&&args[1]==='ramo-nessa-staging-gateway-1'){
      assert.equal(args[2],'sha256sum');
      assert.deepEqual(args.slice(3),gatewayFingerprintFiles.map(p=>'/srv/admin/'+p));
      return {status:0,stdout:gatewayFingerprintFiles.map(p=>'d'.repeat(64)+'  /srv/admin/'+p).join('\n')};
    }
    if(args.at(-1).includes("json_build_object('filename'"))
      return {status:0,stdout:JSON.stringify([{filename:'001_init.sql',checksum:'e'.repeat(64)}])};
    return base.execute(command,args,options);
  };
  const report=inspectRegionsPricing({execute,includeFingerprints:true});
  assert.equal(report.runtimeFiles.core.source.files,2);
  assert.equal(Object.keys(report.runtimeFiles.gateway.files).length,5);
  assert.equal(report.runtimeFiles.gateway.mounts.length,2);
  assert.equal(report.database.migrationChecksums[0].filename,'001_init.sql');
  assert.equal(JSON.stringify(report).includes(secret),false);
  assert.equal(calls.some(c=>c.args.some(a=>a.includes('.Config.Env'))),false);
  assert.throws(()=>runRegionsPricingInspection(['--runtime-files','--runtime-files']),/somente/);
});
