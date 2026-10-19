// CI-only rehearsal of the same offline dump/restore/migration/probe commands.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,chmodSync,openSync,closeSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Somente CI descartável.');
const dir=mkdtempSync(join(tmpdir(),'asaas-offline-ci-')),name='asaas-offline-ci-'+randomBytes(8).toString('hex');
const pw=randomBytes(32).toString('base64url'),user='ramo_restore',database='ramo_asaas_restore';
const url='postgresql://'+user+':'+pw+'@127.0.0.1:5432/'+database;
const old='ramo-asaas-ci-old:local',candidate='ramo-asaas-ci-new:local',postgres='postgres:16';
let source=false,target=false;
function run(args,options={}){const r=spawnSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024,...options});if(r.status!==0||r.error)throw Error('Comando Docker CI falhou.');return r.stdout;}
function core(container,image,args){return run(['run','--rm','--network','container:'+container,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env','DATABASE_URL='+url,'--env','DB_SSL=false','--mount','type=bind,src='+join(dir,'probe.mjs')+',dst=/audit/probe.mjs,readonly',image,'node',...args]);}
async function start(container){run(['run','-d','--rm','--name',container,'--network','none','--env','POSTGRES_USER='+user,'--env','POSTGRES_PASSWORD='+pw,'--env','POSTGRES_DB='+database,'--mount','type=bind,src='+dir+',dst=/backup,readonly',postgres]);if(container===name+'-source')source=true;else target=true;
for(let i=0;i<60;i++){const r=spawnSync('docker',['exec',container,'sh','-lc','test "$(cat /proc/1/comm)" = "postgres" && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "SELECT 1"'],{encoding:'utf8'});if(r.status===0&&r.stdout.trim()==='1')return;await new Promise(r=>setTimeout(r,1000));}throw Error('PG não iniciou.');}
try{
 copyFileSync(resolve('deploy/staging/asaas-restoration-probe.mjs'),join(dir,'probe.mjs'));chmodSync(join(dir,'probe.mjs'),0o644);
 await start(name+'-source');core(name+'-source',old,['dist/scripts/migrate.js']);
 const fd=openSync(join(dir,'database.dump'),'wx',0o600);try{run(['exec',name+'-source','pg_dump','-U',user,'-d',database,'--format=custom','--no-owner','--no-acl'],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
 await start(name+'-target');run(['exec',name+'-target','pg_restore','--exit-on-error','--no-owner','--no-acl','-U',user,'-d',database,'/backup/database.dump']);
 const before=core(name+'-target',candidate,['/audit/probe.mjs','fingerprint']);
 const first=core(name+'-target',candidate,['dist/scripts/migrate.js']);assert.match(first,/applied 086_asaas_driver_payouts.sql/);
 assert.match(core(name+'-target',candidate,['/audit/probe.mjs','defaults']),/DEFAULTS_OK/);
 core(name+'-target',candidate,['/audit/probe.mjs','set-custom']);
 const second=core(name+'-target',candidate,['dist/scripts/migrate.js']);assert.match(second,/skip 086_asaas_driver_payouts.sql/);assert.doesNotMatch(second,/applied /);
 assert.match(core(name+'-target',candidate,['/audit/probe.mjs','custom']),/CUSTOM_OK/);
 assert.match(core(name+'-target',old,['/audit/probe.mjs','old-reader']),/OLD_READER_OK/);
 assert.equal(core(name+'-target',candidate,['/audit/probe.mjs','fingerprint']),before);
 for(const suffix of ['-source','-target']){const result=JSON.parse(run(['inspect',name+suffix]))[0];assert.equal(result.HostConfig.NetworkMode,'none');assert.equal(Object.keys(result.HostConfig.PortBindings??{}).length,0);}
 console.log('OFFLINE RESTORE CI PASSED: dump restored, migration 086 repeated, custom policy preserved, old/new repositories readable and business data unchanged.');
 run(['exec',name+'-target','psql','-v','ON_ERROR_STOP=1','-U',user,'-d',database,'-c','CREATE DATABASE ramo_asaas_sandbox']);
 const labUrl='postgresql://'+user+':'+pw+'@127.0.0.1:5432/ramo_asaas_sandbox';
 run(['run','--rm','--network','container:'+name+'-target','--env','DATABASE_URL='+labUrl,'--env','DB_SSL=false',candidate,'node','dist/scripts/migrate.js']);
 const lab=join(dir,'lab');mkdirSync(lab);chmodSync(lab,0o777);
 const id=randomUUID(),session={id,rideId:randomUUID(),paymentId:randomUUID(),captureEventId:randomUUID(),driverId:'asaas-sandbox-ci-'+id,createdAt:new Date().toISOString()};
 writeFileSync(join(lab,'session.json'),JSON.stringify(session),{mode:0o644});writeFileSync(join(lab,'webhook-token'),'ci-sandbox-webhook-fixture-only-12345678901234567890',{mode:0o644});
 writeFileSync(join(dir,'key-fixture'),'ci-sandbox-api-key-fixture-only-12345678901234567890',{mode:0o644});
 for(const [source,target] of [['asaas-sandbox-worker.mjs','worker.mjs'],['asaas-sandbox-worker-fixture.mjs','fixture.mjs']]){copyFileSync(resolve('deploy/staging/'+source),join(dir,target));chmodSync(join(dir,target),0o644);}
 const labRun=()=>JSON.parse(run(['run','--rm','--network','container:'+name+'-target','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env','DATABASE_URL='+labUrl,'--env','DB_SSL=false','--env','GITHUB_ACTIONS=true','--mount','type=bind,src='+lab+',dst=/audit/data','--mount','type=bind,src='+join(dir,'worker.mjs')+',dst=/audit/worker.mjs,readonly','--mount','type=bind,src='+join(dir,'fixture.mjs')+',dst=/audit/fixture.mjs,readonly','--mount','type=bind,src='+join(dir,'key-fixture')+',dst=/run/secrets/asaas-sandbox-api-key,readonly',candidate,'node','/audit/fixture.mjs']));
 const firstRun=labRun(),restart=labRun();
 for(const result of [firstRun,restart]){assert.equal(result.transport,'ci-fixture');assert.equal(result.result,'passed');assert.equal(result.postAttempts,1);assert.equal(result.ledgerPaidEntries,1);assert.equal(result.externalWebhookDeliveryVerified,false);}
 assert.equal(restart.transferId,firstRun.transferId);assert.equal(restart.payoutId,firstRun.payoutId);
 console.log('SANDBOX WORKER CI PASSED: concurrent requests, lost response and worker restart preserve one POST and one paid ledger entry. External API and webhook delivery are not exercised in CI.');

}finally{
 if(target)run(['rm','-f','-v',name+'-target']);if(source)run(['rm','-f','-v',name+'-source']);rmSync(dir,{recursive:true,force:true});
}
