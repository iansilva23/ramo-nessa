// Disposable GitHub runner only. Real old Core/Postgres/Caddy, approved binaries.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {prepareSearch} from './prepare-google-search-update.mjs';
import {activateSearch} from './activate-google-search-update.mjs';
import {escapeCompose} from './asaas-activation-plan-contract.mjs';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {names,directory,root,oldWebRoot,newWebRoot,baselineSource,candidateSource,assertFingerprint} from './google-search-update-contract.mjs';
import {io,hashFile,hashTree} from './google-search-update-io.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.getuid?.()!==0)throw Error('Disposable CI root only.');
const [webZip,patchZip,oldZip,baselineDir]=process.argv.slice(2).map(resolve);
const fixture='/opt/ramo-google-search-fixture',modelPath=fixture+'/compose.json',network='ramo-google-search-ci',volume='ramo-google-search-ci-docs',pgVolume='ramo-google-search-ci-pg';
mkdirSync(fixture,{recursive:true});chmodSync(fixture,0o755);
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:64*1024**2});if(r.error||r.status!==0)throw Error('Disposable CI command: '+r.stderr);return r.stdout;}
const inspect=r=>JSON.parse(docker(['inspect',names[r]]))[0];
const compose=args=>docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',modelPath,...args]);
const image=tag=>JSON.parse(docker(['image','inspect',tag]))[0].Id;
let started=false;
try{
  docker(['build','-t','google-search-ci-baseline',baselineDir]);
  const coreImage=image('google-search-ci-baseline'),gatewayImage=image('caddy:2.11.7-alpine'),pgImage=image('postgres:16');
  const {run,health,fingerprint}=io();
  mkdirSync(resolve(oldWebRoot,'..'),{recursive:true});
  run('python3',[resolve('deploy/staging/stage-regions-web.py'),'--archive',oldZip,'--output',oldWebRoot,'--source','0f5305ddef3398112ca1e7d10a00fd05fa8548e8','--sha256','3026f5f9ac800445ea37faaf214871ec6c3e481a805680ddc619c8be4257f35d']);
  writeFileSync(fixture+'/Caddyfile','{\n admin off\n auto_https off\n}\n:8080 {\n respond /healthz 200\n handle_path /passageiro/* {\n root * /srv/web/passenger\n file_server\n }\n handle_path /motorista/* {\n root * /srv/web/driver\n file_server\n }\n}\n');
  writeFileSync(fixture+'/sentinel','unchanged documents and ADM');
  docker(['network','create','--internal',network]);docker(['volume','create',volume]);docker(['volume','create',pgVolume]);
  const labels={'br.com.ramonessa.regions-ci':'true'},security={cap_drop:['ALL'],security_opt:['no-new-privileges:true'],restart:'unless-stopped'};
  const coreEnv={NODE_ENV:'staging',PORT:'8080',DATABASE_URL:'postgresql://ci:synthetic@postgres:5432/ci',DB_SSL:'false',ROUTING_PROVIDER:'google',GOOGLE_MAPS_SERVER_API_KEY:'synthetic',GOOGLE_PLACES_BASE_URL:'http://maps:8080/v1/',PLACE_PROOF_SECRET:'synthetic-google-ci-proof-secret-123456789',MERCADO_PAGO_MODE:'disabled',PUSH_PROVIDER:'disabled',OTP_HASH_SECRET:'synthetic-google-ci-otp-secret-123456789',OTP_RATE_LIMIT_SECRET:'synthetic-google-ci-rate-secret-123456789',ADMIN_LOGIN_RATE_LIMIT_SECRET:'synthetic-google-ci-login-secret-123456789',ADMIN_MFA_ENCRYPTION_KEY:'a'.repeat(64),DOCUMENT_INSPECTION_ENCRYPTION_KEY:'b'.repeat(64),LITERAL_SECRET:'fixture-$abc-${UNKNOWN}-$$'};
  const healthcheck={test:['CMD','node','-e',"fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],interval:'1s',timeout:'2s',retries:30};
  const service=(role,img)=>({image:img,container_name:names[role],networks:{default:{aliases:[role]}},labels});
  const model={name:'ramo-nessa-staging',services:{
    postgres:{...service('postgres',pgImage),environment:{POSTGRES_USER:'ci',POSTGRES_PASSWORD:'synthetic',POSTGRES_DB:'ci'},volumes:[{type:'volume',source:'pg',target:'/var/lib/postgresql/data'}],healthcheck:{test:['CMD','pg_isready','-U','ci','-d','ci'],interval:'1s',timeout:'2s',retries:30}},
    core:{...service('core',coreImage),...security,environment:coreEnv,healthcheck,volumes:[{type:'volume',source:'docs',target:'/var/lib/ramo-nessa'}]},
    gateway:{...service('gateway',gatewayImage),...security,environment:{LITERAL_SECRET:coreEnv.LITERAL_SECRET},ports:[{target:8080,published:'18080',host_ip:'127.0.0.1',protocol:'tcp'}],healthcheck:{test:['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:8080/healthz'],interval:'1s',timeout:'2s',retries:20},volumes:[{type:'bind',source:oldWebRoot,target:'/srv/web',read_only:true},{type:'bind',source:fixture+'/Caddyfile',target:'/etc/caddy/Caddyfile',read_only:true},{type:'bind',source:fixture+'/sentinel',target:'/srv/admin-proof',read_only:true}]},
    maps:{...service('maps',gatewayImage)},site:{...service('site',gatewayImage)},
  },networks:{default:{name:network,external:true}},volumes:{docs:{name:volume,external:true},pg:{name:pgVolume,external:true}}};
  writeFileSync(modelPath,JSON.stringify(escapeCompose(model)),{mode:0o600});
  started=true;compose(['up','-d','--no-build','--pull','never','postgres','maps','site']);await health('postgres');
  docker(['run','--rm','--network',network,'-e','DATABASE_URL='+coreEnv.DATABASE_URL,'-e','DB_SSL=false',coreImage,'node','dist/scripts/migrate.js']);
  compose(['up','-d','--no-build','--pull','never','core','gateway']);await health('core');await health('gateway');
  assertFingerprint(fingerprint(names.core,true),baselineSource);
  // Published catalog and a dependency sentinel are synthetic and must survive every path.
  const seed="import {Pool} from 'pg';import{STATIC_PRICING_CATALOG_V1 as s}from './dist/src/pricing/catalog-snapshot.js';const p=new Pool({connectionString:process.env.DATABASE_URL});await p.query(\"INSERT INTO pricing_catalog_versions(id,status,snapshot,effective_from,created_by_kind,created_by_id,created_by_name,published_by_kind,published_by_id,published_by_name,created_at,updated_at,published_at) VALUES ('11111111-1111-4111-8111-111111111111','published',$1,now()-interval '1 minute','user','22222222-2222-4222-8222-222222222222','CI','user','22222222-2222-4222-8222-222222222222','CI',now(),now(),now())\",[s]);await p.query('CREATE TABLE ci_financial_sentinel(id int primary key, amount int); INSERT INTO ci_financial_sentinel VALUES (1,12345)');await p.end();";
  docker(['exec',names.core,'node','--input-type=module','-e',seed]);
  const data=()=>docker(['exec',names.postgres,'pg_dump','-U','ci','-d','ci','--data-only','--no-owner','--no-privileges']).replace(/^\\(?:un)?restrict .*$/gm,'');
  const previousData=data(),unchanged=Object.fromEntries(['postgres','maps','site'].map(r=>[r,runtimeIdentity(inspect(r))])),caddyHash=hashFile(fixture+'/Caddyfile'),oldHash=hashTree(oldWebRoot);
  const checkUntouched=()=>{assert.equal(data(),previousData);assert.equal(hashFile(fixture+'/Caddyfile'),caddyHash);assert.equal(hashTree(oldWebRoot),oldHash);for(const r of Object.keys(unchanged))assert.equal(runtimeIdentity(inspect(r)),unchanged[r]);assert.equal(docker(['exec',names.gateway,'cat','/srv/admin-proof']),'unchanged documents and ADM');};
  const beforeIds=[inspect('core').Id,inspect('gateway').Id];
  await prepareSearch([webZip,patchZip],{coreImage,gatewayImage});
  assert.deepEqual([inspect('core').Id,inspect('gateway').Id],beforeIds);checkUntouched();
  const planSha=hashFile(directory+'/prepared.private.json');
  // Refuse changed config before any restart.
  writeFileSync(fixture+'/Caddyfile','changed concurrently');
  await assert.rejects(activateSearch([directory,planSha]),/Configuração ativa alterada/);
  assert.deepEqual([inspect('core').Id,inspect('gateway').Id],beforeIds);
  writeFileSync(fixture+'/Caddyfile','{\n admin off\n auto_https off\n}\n:8080 {\n respond /healthz 200\n handle_path /passageiro/* {\n root * /srv/web/passenger\n file_server\n }\n handle_path /motorista/* {\n root * /srv/web/driver\n file_server\n }\n}\n');
  await assert.rejects(activateSearch([directory,planSha],{failAfterCore:true}),e=>e.rollbackComplete===true);
  assert.equal(JSON.parse(readFileSync(directory+'/activation.private.json')).phase,'rolled-back');
  assertFingerprint(fingerprint(names.core,true),baselineSource);checkUntouched();
  rmSync(directory,{recursive:true,force:true});rmSync(resolve(newWebRoot,'..'),{recursive:true,force:true});
  await prepareSearch([webZip,patchZip],{coreImage,gatewayImage});
  const nextSha=hashFile(directory+'/prepared.private.json');
  await assert.rejects(activateSearch([directory,nextSha],{failAfterWeb:true}),e=>e.rollbackComplete===true);checkUntouched();
  rmSync(directory,{recursive:true,force:true});rmSync(resolve(newWebRoot,'..'),{recursive:true,force:true});
  await prepareSearch([webZip,patchZip],{coreImage,gatewayImage});
  await activateSearch([directory,hashFile(directory+'/prepared.private.json')]);
  assertFingerprint(fingerprint(names.core,true),candidateSource);checkUntouched();
  console.log('GOOGLE SEARCH UPDATE REHEARSAL PASSED: exact old/new Core, approved Web, literal environment, ADM, providers, catalog and financial rows preserved; configuration race rejected before restart; Core and Web failure paths restore both old services; successful activation verified over HTTP. No live system accessed.');
}catch(e){for(const r of ['core','gateway']){const p=spawnSync('docker',['logs','--tail','40',names[r]],{encoding:'utf8'});console.error('Synthetic '+r+' logs: '+p.stdout+p.stderr);}throw e;
}finally{
  if(started)for(const r of Object.keys(names))spawnSync('docker',['rm','-f',names[r]]);
  for(const v of [volume,pgVolume])spawnSync('docker',['volume','rm',v]);spawnSync('docker',['network','rm',network]);
  rmSync(root,{recursive:true,force:true});rmSync(resolve(newWebRoot,'..'),{recursive:true,force:true});rmSync(resolve(oldWebRoot,'..'),{recursive:true,force:true});rmSync(fixture,{recursive:true,force:true});
}
