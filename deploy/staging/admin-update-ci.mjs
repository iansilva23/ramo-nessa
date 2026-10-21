// Real disposable Core/Caddy/PostgreSQL fixture. All values are synthetic.
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,cpSync,readdirSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {updateAdmin,adminSourceRevision,adminBaseRevision} from './update-regions-admin.mjs';
if(process.getuid?.()!==0||process.env.GITHUB_ACTIONS!=='true')throw Error('Disposable CI root only');
const scenario=process.env.ADMIN_UPDATE_SCENARIO;
if(!['success','rollback'].includes(scenario))throw Error('Unknown scenario');
const dir=mkdtempSync('/tmp/ramo-admin-ci-'),repo='/opt/ramo-nessa';mkdirSync(repo,{recursive:true});cpSync('.git',join(repo,'.git'),{recursive:true});
function run(command,args,extra={}){const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:64*1024**2,stdio:['pipe','pipe','pipe'],...extra});if(r.status!==0)throw Error(command+' failed: '+r.stderr+'\n'+r.stdout);return r.stdout;}
const docker=args=>run('docker',args);
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const archive=join(dir,'source.tar'),fd=openSync(archive,'wx');
try{run('git',['archive',adminBaseRevision,'backend/core','apps/admin'],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
run('tar',['-xf',archive,'-C',dir]);
docker(['pull','postgres:16']);
docker(['build','-t','ramo-admin-ci-core:local',join(dir,'backend/core')]);
docker(['build','-t','ramo-admin-ci-gateway:local',join(dir,'apps/admin')]);
for(const role of ['passenger','driver']){
 const target=join(dir,'web',role);mkdirSync(target,{recursive:true});
 for(const file of ['index.html','main.dart.js','flutter_bootstrap.js'])writeFileSync(join(target,file),'synthetic-unchanged-'+role+'-'+file);
}
const caddy=join(dir,'Caddyfile');writeFileSync(caddy,`{
 admin off
}
:8080 {
 @api path /v1/* /health /ready
 handle @api {
  reverse_proxy core:8080
 }
 handle_path /administrodo/* {
  root * /srv/admin
  try_files {path} /index.html
  file_server
 }
 handle_path /passageiro/* {
  root * /srv/web/passenger
  file_server
 }
 handle_path /motorista/* {
  root * /srv/web/driver
  file_server
 }
 handle /api/health {
  respond 200
 }
 handle / {
  respond "synthetic institutional site" 200
 }
}
`);
const model={name:'ramo-nessa-staging',services:{
 postgres:{image:'postgres:16',environment:{POSTGRES_USER:'ramo',POSTGRES_PASSWORD:'synthetic-only',POSTGRES_DB:'ramo'}},
 core:{image:'ramo-admin-ci-core:local',labels:{'br.com.ramonessa.regions-ci':'true'},environment:{NODE_ENV:'staging',DATABASE_URL:'postgresql://ramo:synthetic-only@postgres:5432/ramo',DB_SSL:'false',OTP_HASH_SECRET:'synthetic-only-otp-hash-secret-123456789',OTP_RATE_LIMIT_SECRET:'synthetic-only-otp-limit-secret-123456789',ADMIN_MFA_ENCRYPTION_KEY:Buffer.alloc(32,29).toString('base64'),ADMIN_LOGIN_RATE_LIMIT_SECRET:'synthetic-only-admin-limit-secret-123456789',PLACE_PROOF_SECRET:'synthetic-only-place-proof-secret-123456789',ROUTING_PROVIDER:'google',MERCADO_PAGO_MODE:'disabled',PUSH_PROVIDER:'disabled',GEO_CATALOG_SEARCH_ENABLED:'false',GEO_PASSENGER_LEARNING_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false'},volumes:[{type:'volume',source:'docs',target:'/var/lib/ramo-nessa'}]},
 gateway:{image:'ramo-admin-ci-gateway:local',environment:{FIXTURE_DOLLARS:'one$$two$$$$three'},ports:['127.0.0.1:18080:8080'],volumes:[{type:'bind',source:join(dir,'web'),target:'/srv/web',read_only:true},{type:'bind',source:caddy,target:'/etc/caddy/Caddyfile',read_only:true}]}
},volumes:{docs:{}}};
const composeFile=join(dir,'runtime.compose.json');writeFileSync(composeFile,JSON.stringify(model));
const compose=['compose','--project-name','ramo-nessa-staging','-f',composeFile];
docker([...compose,'up','-d','postgres']);
const db='ramo-nessa-staging-postgres-1';
for(let n=0;;n++){const r=spawnSync('docker',['exec',db,'pg_isready','-U','ramo'],{stdio:'ignore'});if(r.status===0)break;if(n>60)throw Error('PostgreSQL not ready');await new Promise(r=>setTimeout(r,1000));}
const env=['--env','DATABASE_URL=postgresql://ramo:synthetic-only@127.0.0.1:5432/ramo','--env','DB_SSL=false'];
const inDb=code=>docker(['run','--rm','--network','container:'+inspect(db).Id,...env,'ramo-admin-ci-core:local','node','--input-type=module','-e',code]);
docker(['run','--rm','--network','container:'+inspect(db).Id,...env,'ramo-admin-ci-core:local','node','dist/scripts/migrate.js']);
inDb(`
 import {createPostgresPool} from './dist/src/db/postgres.js';
 import {STATIC_PRICING_CATALOG_V1} from './dist/src/pricing/catalog-snapshot.js';
 import {prepareThreeRegionCatalog} from './dist/src/pricing/management-service.js';
 import {validateOperations} from './dist/src/pricing/managed-operations.js';
 const pool=createPostgresPool(process.env.DATABASE_URL),c=prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1);
 c.managedOperations.rates=[{id:'fixture-moto-rate',name:'Synthetic saved fare',kind:'fixed',originRegionId:'prea',destinationRegionId:'prea',bidirectional:true,categoryId:'moto',enabled:true,archived:false,day:{amountCents:1234,minimumCents:0},night:null,includedPassengers:1,perExtraPassengerCents:0,extras:[]}];
 validateOperations(c.managedOperations);
 await pool.query("INSERT INTO pricing_catalog_versions(id,status,snapshot,effective_from,created_by_kind,created_by_id,created_by_name,published_by_kind,published_by_id,published_by_name,created_at,updated_at,published_at) VALUES ($1,'published',$2,now(),'user',$3,'Synthetic Owner','user',$3,'Synthetic Owner',now(),now(),now())",['22222222-2222-4222-8222-222222222222',c,'11111111-1111-4111-8111-111111111111']);
 await pool.query("INSERT INTO rides(id,passenger_id,state,payment_status,origin_zone_id,origin_locality_id,destination_zone_id,destination_locality_id,category,price_period,passengers,pricing_rule_id,base_amount_cents,pickup_compensation_cents,total_amount_cents,platform_commission_cents,driver_net_cents,pricing_catalog_version_id,pricing_catalog_version_number) VALUES('33333333-3333-4333-8333-333333333333','synthetic-passenger','completed','paid','prea','prea','prea','prea','moto','day',1,'synthetic-history',1000,0,1000,100,900,'22222222-2222-4222-8222-222222222222',1)");
 await pool.query("INSERT INTO payments(id,ride_id,method,processor,status,amount_cents,idempotency_key) VALUES('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','pix','synthetic-only','paid',1000,'synthetic-paid')");
 await pool.query("INSERT INTO ledger_transactions(id,kind,ride_id,payment_id,reference_key) VALUES('55555555-5555-4555-8555-555555555555','synthetic-history','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','synthetic-history')");
 await pool.query("INSERT INTO ledger_entries(transaction_id,account_key,direction,amount_cents) VALUES('55555555-5555-4555-8555-555555555555','synthetic-escrow','debit',1000),('55555555-5555-4555-8555-555555555555','synthetic-bank','credit',1000)");
 await pool.end();
`);
docker([...compose,'up','-d','--no-build','--pull','never','core','gateway']);
for(let n=0;;n++){if(['ramo-nessa-staging-core-1','ramo-nessa-staging-gateway-1'].every(name=>inspect(name).State.Health?.Status==='healthy'))break;if(n>90)throw Error('Core/Gateway not healthy');await new Promise(r=>setTimeout(r,1000));}
for(const name of ['ramo-nessa-staging-google-maps-mock-1','ramo-nessa-site-institutional-site-1'])docker(['run','-d','--name',name,'--entrypoint','sleep','postgres:16','1200']);
const core=inspect('ramo-nessa-staging-core-1'),oldGateway=inspect('ramo-nessa-staging-gateway-1');
const fingerprint=()=>inDb(String.raw`
 import {createPostgresPool} from './dist/src/db/postgres.js';
 const p=createPostgresPool(process.env.DATABASE_URL),tables=await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"),result={};
 for(const {tablename:t} of tables.rows){if(!/^[a-z0-9_]+$/.test(t))throw Error('table');result[t]=(await p.query('SELECT md5(coalesce(string_agg(to_jsonb(r)::text,\'|\' ORDER BY to_jsonb(r)::text),\'\')) AS hash FROM public."'+t+'" r')).rows[0].hash;}
 console.log(JSON.stringify(result));await p.end();
`).trim();
const before=fingerprint(),policyBefore=await (await fetch('http://127.0.0.1:18080/v1/pricing/policy')).json();
let failure;
try{await updateAdmin([adminSourceRevision],scenario==='rollback'?{testAfterSwitch:async()=>{throw Error('Synthetic failure after Gateway switch');}}:{});}catch(e){failure=e;}
if(scenario==='success'){
 assert.equal(failure,undefined);assert.notEqual(inspect('ramo-nessa-staging-gateway-1').Image,oldGateway.Image);
 const id=inspect('ramo-nessa-staging-gateway-1').Id;
 await updateAdmin([adminSourceRevision]);assert.equal(inspect('ramo-nessa-staging-gateway-1').Id,id,'Idempotent retry must not restart');
}else{
 assert.match(failure?.message??'',/ADM anterior recuperado/);assert.equal(inspect('ramo-nessa-staging-gateway-1').Image,oldGateway.Image);
 const root='/opt/ramo-nessa-regions/admin-updates';
 const journal=JSON.parse(readFileSync(join(root,readdirSync(root).find(n=>n!=='operations.lock'),'journal.private.json')));
 assert.equal(journal.rollbackComplete,true);assert.equal(journal.phase,'rolled-back');
}
assert.equal(inspect('ramo-nessa-staging-core-1').Id,core.Id);assert.equal(fingerprint(),before,'All public tables, saved tariffs, historical ride/payment and ledger must be unchanged');
assert.deepEqual(await (await fetch('http://127.0.0.1:18080/v1/pricing/policy')).json(),policyBefore);
console.log('REAL ADM-ONLY UPDATE VERIFIED: '+scenario+'; Core/PostgreSQL/Web, configured fare and complete table fingerprints preserved.');
