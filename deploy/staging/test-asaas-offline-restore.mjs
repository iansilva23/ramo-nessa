// CI-only rehearsal of the same offline dump/restore/migration/probe commands.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,chmodSync,openSync,closeSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
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
}finally{
 if(target)run(['rm','-f','-v',name+'-target']);if(source)run(['rm','-f','-v',name+'-source']);rmSync(dir,{recursive:true,force:true});
}
