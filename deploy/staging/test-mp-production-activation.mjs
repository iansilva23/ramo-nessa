// Disposable CI only. Real compiled Core/Caddy/PostgreSQL, synthetic account.
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,lstatSync} from 'node:fs';import {join,resolve} from 'node:path';
import {activateMpProduction} from './activate-mp-production.mjs';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {environmentMap,servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {io,hashFile,hashTree} from './google-search-update-io.mjs';
import {inventoryDigest,productionCorePlan} from './mp-production-preflight-contract.mjs';
import {names} from './google-search-update-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.getuid?.()!==0)throw Error('Disposable root CI only');
const scenario=process.argv[2];if(!['success','rollback'].includes(scenario))throw Error('scenario');
const root='/var/lib/ramo-mp-activation-ci-'+scenario,dir=join(root,'preflight'),network='ramo-mp-activation-ci',source=join(root,'runtime.compose.private.json');
if(existsSync(root))throw Error('fixture already exists');mkdirSync(root,{mode:0o700});mkdirSync(dir,{mode:0o700});
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:32*1024**2,env:{PATH:process.env.PATH},...options});if(r.status!==0||r.error)throw Error('CI command failed: '+command+' '+String(r.stderr??''));return r.stdout;}
const docker=args=>run('docker',args),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0];
const stage=resolve('deploy/staging');
const env={NODE_ENV:'staging',DATABASE_URL:'postgresql://ramo:synthetic-only@postgres:5432/ramo',DB_SSL:'false',OTP_HASH_SECRET:'synthetic-only-otp-hash-secret-123456789',OTP_RATE_LIMIT_SECRET:'synthetic-only-otp-limit-secret-123456789',ADMIN_MFA_ENCRYPTION_KEY:Buffer.alloc(32,29).toString('base64'),ADMIN_LOGIN_RATE_LIMIT_SECRET:'synthetic-only-admin-limit-secret-123456789',PLACE_PROOF_SECRET:'synthetic-only-place-proof-secret-123456789',ROUTING_PROVIDER:'google',MERCADO_PAGO_MODE:'test',MERCADO_PAGO_PIX_TEST_APPROVAL:'true',MERCADO_PAGO_ACCESS_TOKEN_TEST:'TEST-synthetic-only-old-token-123456789',MERCADO_PAGO_WEBHOOK_SECRET:'synthetic-only-old-webhook-secret',DRIVER_PAYOUT_PROVIDER_NAME:'asaas',ASAAS_PAYOUTS_ENABLED:'false',ASAAS_PAYOUT_MODE:'production',PUSH_PROVIDER:'disabled',GEO_CATALOG_SEARCH_ENABLED:'false',GEO_PASSENGER_LEARNING_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false',FIXTURE_LITERAL:'a$$b$$$$c'};
const compose={name:'ramo-nessa-staging',services:{
 postgres:{image:'postgres:16',container_name:names.postgres,environment:{POSTGRES_USER:'ramo',POSTGRES_PASSWORD:'synthetic-only',POSTGRES_DB:'ramo'},healthcheck:{test:['CMD-SHELL','pg_isready -U ramo -d ramo'],interval:'1s',timeout:'2s',retries:60},volumes:[{type:'volume',source:'pg',target:'/var/lib/postgresql/data'}]},
 core:{image:'ramo-mp-ci-core:local',container_name:names.core,labels:{'br.com.ramonessa.mp-ci':'true'},environment:env,volumes:[{type:'volume',source:'docs',target:'/var/lib/ramo-nessa'}]},
 gateway:{image:'caddy:2.11.7-alpine',container_name:names.gateway,ports:['127.0.0.1:18080:8080'],healthcheck:{test:['CMD-SHELL','wget -q -O /dev/null http://127.0.0.1:8080/gateway-health'],interval:'1s',timeout:'2s',retries:60},volumes:[{type:'bind',source:join(root,'web'),target:'/srv/web',read_only:true},{type:'bind',source:join(root,'Caddyfile'),target:'/etc/caddy/Caddyfile',read_only:true},{type:'volume',source:'caddy-data',target:'/data'},{type:'volume',source:'caddy-config',target:'/config'}]},
 maps:{image:'caddy:2.11.7-alpine',container_name:names.maps},site:{image:'caddy:2.11.7-alpine',container_name:names.site}
},volumes:{pg:{},docs:{},'caddy-data':{},'caddy-config':{}},networks:{default:{name:network}}};
for(const role of ['passenger','driver']){mkdirSync(join(root,'web',role),{recursive:true,mode:0o755});writeFileSync(join(root,'web',role,'index.html'),'synthetic-'+role);}
writeFileSync(join(root,'Caddyfile'),`{
 admin off
 auto_https off
}
:8080 {
 handle /gateway-health {
  respond "ok" 200
 }
 handle /administrodo/* {
  respond "ADM protected sentinel" 200
 }
 handle_path /passageiro/* {
  root * /srv/web/passenger
  file_server
 }
 handle_path /motorista/* {
  root * /srv/web/driver
  file_server
 }
 handle {
  reverse_proxy core:8080
 }
}
`);
// The private fixture root must remain root-only for secrets; make only the
// public Web/Caddy mount parents traversable to the Caddy root process.
writeFileSync(source,JSON.stringify(compose),{mode:0o600});
const up=roles=>docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',source,'up','-d','--wait','--wait-timeout','100',...roles]);
const dbCode=code=>docker(['run','--rm','--pull','never','--network','container:'+inspect('postgres').Id,'--env','DATABASE_URL=postgresql://ramo:synthetic-only@127.0.0.1:5432/ramo','--env','DB_SSL=false','--mount','type=bind,src='+stage+',dst=/ops,readonly','--entrypoint','node','ramo-mp-ci-core:local','--input-type=module','-e',code]);
try{
 up(['postgres']);
 docker(['run','--rm','--network','container:'+inspect('postgres').Id,'--env','DATABASE_URL=postgresql://ramo:synthetic-only@127.0.0.1:5432/ramo','--env','DB_SSL=false','--entrypoint','node','ramo-mp-ci-core:local','dist/scripts/migrate.js']);
 dbCode(`import {createPostgresPool} from '/app/dist/src/db/postgres.js';import {seedConfirmedTests} from '/ops/mp-production-fixture.mjs';const p=createPostgresPool(process.env.DATABASE_URL);await seedConfirmedTests(p);await p.end();`);
 up(['core','gateway','maps','site']);
 const before=Object.fromEntries(Object.keys(names).map(r=>[r,inspect(r)]));
 const {image}=io(dir),model=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',source,'config','--format','json']));
 const old=servicePlan(model,'core',before.core,before.core.Image);
 assertEnvironmentMatches(old.services.core,before.core,image(before.core.Image));
 const credentials={format:1,publicKey:'APP_USR-fixture-public-production-key',accessToken:'APP_USR-fixture-private-production-token',webhookSecret:'fixture-production-webhook-secret'};
 const account={accountId:'123',siteId:'MLB',productionAccount:true};
 const save=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data),{mode:0o600});
 writeFileSync(join(root,'credentials.private.json'),JSON.stringify(credentials),{mode:0o600});
 save('runtime-before.private.json',before);save('core-image.private.json',image(before.core.Image));save('account.private.json',account);save('core-before.compose.private.json',old);save('core-after.compose.private.json',productionCorePlan(old,credentials));
 const inventory=JSON.parse(dbCode(`import {createPostgresPool} from '/app/dist/src/db/postgres.js';import {readProductionInventory} from '/ops/mp-production-preflight-contract.mjs';const p=createPostgresPool(process.env.DATABASE_URL),c=await p.connect();console.log(JSON.stringify(await readProductionInventory(c)));c.release();await p.end();`));save('financial-before.private.json',inventory);
 // Exercise the existing full backup and actual isolated restore implementation.
 const output=run(process.execPath,[join(stage,'backup-regions-pricing.mjs'),'--core-image='+before.core.Image,'--gateway-image='+before.gateway.Image]);
 const checkpoint=JSON.parse(output.slice(output.lastIndexOf('{\n  "status": "BACKUP_VERIFICADO"')));
 assert.equal(checkpoint.databaseRestoredInIsolation,true);
 const files=['runtime-before.private.json','core-image.private.json','account.private.json','core-before.compose.private.json','core-after.compose.private.json','financial-before.private.json'];
 const web=join(root,'web'),caddy=join(root,'Caddyfile');
 save('prepared.private.json',{format:1,preparedAt:new Date().toISOString(),accountVerified:true,credentialHash:hashFile(join(root,'credentials.private.json')),inventoryHash:inventoryDigest(inventory),source,sourceHash:hashFile(source),web,webHash:hashTree(web),caddy,caddyHash:hashFile(caddy),checkpoint,files:Object.fromEntries(files.map(n=>[n,hashFile(join(dir,n))])),activeRuntimeChanged:false,activeDatabaseChanged:false});
 const sha=hashFile(join(dir,'prepared.private.json'));
 let failure;try{await activateMpProduction([sha],{root,coreImage:before.core.Image,gatewayImage:before.gateway.Image,origin:'http://127.0.0.1:18080',verifyAccount:async token=>{assert.equal(token,credentials.accessToken);return account;},failPrivate:scenario==='rollback'});}catch(error){failure=error;}
 if(scenario==='success')assert.equal(failure,undefined);else assert.equal(failure?.rollbackComplete,true,String(failure));
 for(const r of ['postgres','maps','site'])assert.equal(runtimeIdentity(inspect(r)),runtimeIdentity(before[r]));
 assert.equal(inspect('gateway').Id,before.gateway.Id);assert.equal(inspect('gateway').Image,before.gateway.Image);assert.equal(inspect('core').Image,before.core.Image);
 assert.equal(hashTree(web),JSON.parse(readFileSync(join(dir,'prepared.private.json'))).webHash);
 const actual=environmentMap(inspect('core').Config.Env);assert.equal(actual.ASAAS_PAYOUTS_ENABLED,'false');assert.equal(actual.FIXTURE_LITERAL,'a$b$$c');assert.equal(actual.MERCADO_PAGO_MODE,scenario==='success'?'production':'test');
 const after=JSON.parse(dbCode(`import {createPostgresPool} from '/app/dist/src/db/postgres.js';import {contextInsideTransaction} from '/ops/mp-production-database.mjs';const p=createPostgresPool(process.env.DATABASE_URL);console.log(JSON.stringify(await contextInsideTransaction(p)));await p.end();`));
 assert.equal(after.payments.length,6);assert.equal(after.rides.length,9);assert.equal(after.wallet_topups.length,11);
 const balance=after.ledger_entries.filter(e=>e.account_key==='passenger:fixture-passenger:wallet').reduce((a,e)=>a+(e.direction==='credit'?e.amount_cents:-e.amount_cents),0);assert.equal(balance,scenario==='success'?0:15700);
 assert.equal(after.rides.filter(r=>r.state==='CANCELLED_BY_ADMIN').length,scenario==='success'?5:0);
 assert.equal(JSON.parse(readFileSync(join(root,'activation.private.json'))).phase,scenario==='success'?'completed':'rolled-back');
 const journalBefore=readFileSync(join(root,'activation.private.json'),'utf8');
 await assert.rejects(()=>activateMpProduction([sha],{root,coreImage:before.core.Image,gatewayImage:before.gateway.Image}),/MP_ACTIVATION_ALREADY_STARTED/);
 assert.equal(readFileSync(join(root,'activation.private.json'),'utf8'),journalBefore,'A rejected repeat must not overwrite the completed/recovered audit');
 console.log('MP ACTIVATION '+scenario.toUpperCase()+' REHEARSAL PASSED: real compiled Core, real Caddy ingress pause/reopen, real PostgreSQL archive/rollback, verified restore, identical images and protected Web/ADM/Asaas. Synthetic credentials; no provider calls.');
}catch(error){
 const workerError=join(root,'activation','worker-error.private.log');if(existsSync(workerError))process.stderr.write('Synthetic worker diagnostic: '+readFileSync(workerError,'utf8'));
 const ops=join(root,'activation','ops');if(existsSync(ops)){
  const stat=lstatSync(join(ops,'mp-production-database.mjs'));console.error('CI file owner/mode: '+JSON.stringify({uid:stat.uid,gid:stat.gid,mode:stat.mode&0o777}));
  try{console.error(docker(['run','--rm','--user','0:0','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--mount','type=bind,src='+ops+',dst=/ops,readonly','--entrypoint','node','ramo-mp-ci-core:local','-e',"const fs=require('fs');let stat;try{const s=fs.statSync('/ops');stat={uid:s.uid,gid:s.gid,mode:s.mode&511};}catch(e){stat=e.code};console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),stat}));"]));}catch{}
 }
 for(const r of ['core','gateway']){try{process.stderr.write(docker(['logs','--tail','30',names[r]]));}catch{}}
 throw error;
}finally{
 for(const role of Object.keys(names)){try{docker(['rm','-f','-v',names[role]]);}catch{}}
 for(const vol of Object.keys(compose.volumes)){try{docker(['volume','rm','ramo-nessa-staging_'+vol]);}catch{}}
 try{docker(['network','rm',network]);}catch{}
 rmSync(root,{recursive:true,force:true});
}
