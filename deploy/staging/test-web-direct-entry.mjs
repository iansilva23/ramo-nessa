// Disposable CI only: actual Caddy HTTP + PostgreSQL and unchanged service sentinels.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {prepareDirect,directDir,directRoot,directBundle,googleBundle} from './prepare-web-direct-entry.mjs';
import {activateDirectWeb} from './activate-web-direct-entry.mjs';
import {escapeCompose} from './asaas-activation-plan-contract.mjs';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {io,hashFile,hashTree,digest} from './google-search-update-io.mjs';
import {names} from './google-search-update-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.getuid?.()!==0)throw Error('Disposable CI root only.');
const fixture='/opt/ramo-direct-entry-fixture',modelPath=fixture+'/compose.json',network='ramo-direct-ci';
const volumes=['ramo-direct-ci-docs','ramo-direct-ci-data','ramo-direct-ci-config','ramo-direct-ci-pg'];
if(existsSync(directDir)||existsSync(googleBundle))throw Error('Fixture path must be new.');
mkdirSync(fixture,{recursive:true});mkdirSync(resolve(googleBundle,'..'),{recursive:true});cpSync(resolve('approved'),googleBundle,{recursive:true});
// Artifact metadata is outside the actual mounted pair.
for(const n of ['release.json','source-commit.txt'])rmSync(join(googleBundle,n),{force:true});
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:180000,maxBuffer:64*1024**2});if(r.error||r.status!==0)throw Error('Disposable CI: '+r.stderr);return r.stdout;}
const inspect=r=>JSON.parse(docker(['inspect',names[r]]))[0];
const compose=args=>docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',modelPath,...args]);
let started=false;
try{
  const image=JSON.parse(docker(['image','inspect','caddy:2.11.7-alpine']))[0].Id;
  docker(['network','create',network]);for(const v of volumes)docker(['volume','create',v]);
  const caddy='{\n admin off\n auto_https off\n}\n:8080 {\n respond /healthz 200\n handle_path /passageiro/* {\n root * /srv/web/passenger\n file_server\n }\n handle_path /motorista/* {\n root * /srv/web/driver\n file_server\n }\n}\n';
  writeFileSync(fixture+'/Caddyfile',caddy);writeFileSync(fixture+'/adm-sentinel','approved ADM unchanged');
  const service=role=>({image,container_name:names[role],networks:{default:null},labels:{'br.com.ramonessa.regions-ci':'true'}});
  const model={name:'ramo-nessa-staging',services:{
    core:{...service('core'),environment:{NODE_ENV:'staging'},volumes:[{type:'volume',source:'docs',target:'/var/lib/ramo-nessa'}]},maps:service('maps'),site:service('site'),
    postgres:{...service('postgres'),image:'postgres:16',environment:{POSTGRES_USER:'ci',POSTGRES_PASSWORD:'synthetic-only',POSTGRES_DB:'ci'},volumes:[{type:'volume',source:'pg',target:'/var/lib/postgresql/data'}],healthcheck:{test:['CMD','pg_isready','-U','ci','-d','ci'],interval:'1s',timeout:'2s',retries:20}},
    gateway:{...service('gateway'),cap_drop:['ALL'],cap_add:['NET_BIND_SERVICE'],security_opt:['no-new-privileges:true'],environment:{LITERAL_SECRET:'fixture-$abc-${UNKNOWN}-$$'},ports:[{target:8080,published:'18080',host_ip:'127.0.0.1',protocol:'tcp'}],healthcheck:{test:['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:8080/healthz'],interval:'1s',timeout:'2s',retries:20},volumes:[{type:'bind',source:googleBundle,target:'/srv/web',read_only:true},{type:'bind',source:fixture+'/Caddyfile',target:'/etc/caddy/Caddyfile',read_only:true},{type:'bind',source:fixture+'/adm-sentinel',target:'/srv/admin/sentinel',read_only:true},{type:'volume',source:'data',target:'/data'},{type:'volume',source:'config',target:'/config'}]},
  },networks:{default:{name:network,external:true}},volumes:Object.fromEntries(['docs','data','config','pg'].map((k,i)=>[k,{name:volumes[i],external:true}]))};
  writeFileSync(modelPath,JSON.stringify(escapeCompose(model)),{mode:0o600});started=true;
  compose(['up','-d','--no-build','--pull','never']);const {health}=io();await health('gateway');await health('postgres');
  docker(['exec',names.postgres,'psql','-U','ci','-d','ci','-v','ON_ERROR_STOP=1','-c','CREATE TABLE ci_protected(kind text, amount int); INSERT INTO ci_protected VALUES (\'catalog\',14),(\'ride\',1),(\'payment\',12345),(\'ledger\',12345)']);
  const data=()=>docker(['exec',names.postgres,'psql','-U','ci','-d','ci','-Atc','SELECT row_to_json(t)::text FROM ci_protected t ORDER BY kind']);
  const beforeData=data(),before=Object.fromEntries(['core','postgres','maps','site'].map(r=>[r,runtimeIdentity(inspect(r))])),oldHash=hashTree(googleBundle);
  const untouched=()=>{assert.equal(data(),beforeData);assert.equal(hashTree(googleBundle),oldHash);for(const r of Object.keys(before))assert.equal(runtimeIdentity(inspect(r)),before[r]);assert.equal(docker(['exec',names.gateway,'cat','/srv/admin/sentinel']),'approved ADM unchanged');assert.equal(readFileSync(fixture+'/Caddyfile','utf8'),caddy);};
  const baselinePath=fixture+'/google-plan.json';writeFileSync(baselinePath,JSON.stringify({newWebHash:oldHash,coreImage:inspect('core').Image}),{mode:0o600});
  const rehearsal={baselinePlan:baselinePath,baselineDigest:hashFile(baselinePath),gatewayImage:image};
  const gatewayBefore=inspect('gateway').Id;await prepareDirect(rehearsal);assert.equal(inspect('gateway').Id,gatewayBefore);untouched();
  const sha=hashFile(directDir+'/prepared.private.json');
  await assert.rejects(activateDirectWeb([directDir,sha],{failAfterSwitch:true}),e=>e.rollbackComplete===true);untouched();
  assert.equal(JSON.parse(readFileSync(directDir+'/activation.private.json')).phase,'rolled-back');
  compose(['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','gateway']);await health('gateway');
  rmSync(directDir,{recursive:true,force:true});rmSync(resolve(directBundle,'..'),{recursive:true,force:true});
  await prepareDirect(rehearsal);await activateDirectWeb([directDir,hashFile(directDir+'/prepared.private.json')]);untouched();
  assert.equal(JSON.parse(readFileSync(directDir+'/activation.private.json')).phase,'completed');
  assert.equal(inspect('gateway').Image,image);assert.ok(!existsSync(join(directBundle,'passenger/ramo_entry_gate.js')));assert.ok(!existsSync(join(directBundle,'driver/ramo_entry_gate.css')));
  console.log('DIRECT ENTRY REHEARSAL PASSED: actual Caddy serves both direct-entry apps; identical image/ADM/environment/Caddy/providers; Core and other service identities untouched; PostgreSQL sentinels unchanged; forced failure restores old Web and successful switch is HTTP-verified.');
}catch(e){for(const r of ['gateway']){const l=spawnSync('docker',['logs','--tail','30',names[r]],{encoding:'utf8'});console.error('Synthetic Gateway: '+l.stdout+l.stderr);}throw e;
}finally{
  if(started)for(const r of Object.keys(names))spawnSync('docker',['rm','-fv',names[r]]);
  for(const v of volumes)spawnSync('docker',['volume','rm',v]);spawnSync('docker',['network','rm',network]);
  for(const path of [directRoot,resolve(directBundle,'..'),resolve(googleBundle,'..'),fixture])rmSync(path,{recursive:true,force:true});
}
