// Disposable CI only: real previous Core, PostgreSQL, Caddy and release bytes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,cpSync,chmodSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {prepareIdentity,activateIdentity} from './identity-web-update.mjs';
import {escapeCompose} from './asaas-activation-plan-contract.mjs';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {names} from './google-search-update-contract.mjs';
import {hashFile,hashTree,digest} from './google-search-update-io.mjs';
import {identityRoot,identityDirectory,identityWeb,liveWeb} from './identity-web-contract.mjs';
if(process.getuid?.()!==0||process.env.GITHUB_ACTIONS!=='true')throw Error('CI isolated root only');
const [archiveArg,baselineArg]=process.argv.slice(2),archive=resolve(archiveArg),baseline=resolve(baselineArg),lab='/opt/ramo-identity-web-ci',net='identity-web-ci',config=lab+'/compose.json';
for(const p of [identityRoot,dirnameSafe(liveWeb),dirnameSafe(identityWeb),lab])if(existsSync(p))throw Error('Refusing preexisting disposable path: '+p);
function dirnameSafe(p){return p.slice(0,p.lastIndexOf('/'));}
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:600000,maxBuffer:64*1024**2});if(r.error||r.status!==0)throw Error('CI Docker: '+r.stderr);return r.stdout;}
const inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0],image=tag=>JSON.parse(docker(['image','inspect',tag]))[0].Id;
const compose=args=>docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',config,...args]);
const query=sql=>docker(['exec',names.postgres,'psql','-X','-U','ci','-d','ci','-Atq','-v','ON_ERROR_STOP=1','-c',sql]);
const health=async role=>{for(let i=0;i<90;i++){if(inspect(role).State.Health?.Status==='healthy')return;await new Promise(r=>setTimeout(r,1000));}throw Error('CI health '+role);};
const volumes=['identity-web-ci-docs','identity-web-ci-pg','identity-web-ci-caddydata','identity-web-ci-caddyconfig'];let started=false;
try{
 mkdirSync(lab,{recursive:true});mkdirSync(dirnameSafe(liveWeb),{recursive:true});mkdirSync(liveWeb);
 docker(['build','-t','identity-web-ci-core',join(baseline,'backend/core')]);
 const gatewayContext=join(lab,'gateway');cpSync(join(baseline,'apps/admin'),gatewayContext,{recursive:true});
 writeFileSync(join(gatewayContext,'Dockerfile'),'FROM caddy:2.11.7-alpine\nCOPY index.html styles.css guide.css admin-workspace.css favicon.svg /srv/admin/\nCOPY src /srv/admin/src\nCOPY pages /srv/admin/pages\n');
 docker(['build','-t','identity-web-ci-gateway',gatewayContext]);
 const coreImage=image('identity-web-ci-core'),gatewayImage=image('identity-web-ci-gateway'),pgImage=image('postgres:16');
 // Use the candidate's configured public bridge for a synthetic previous bundle.
 // The driver sentinel is never rebuilt or changed by the installer.
 cpSync(resolve('baseline-web/passenger'),join(liveWeb,'passenger'),{recursive:true});
 cpSync(resolve('baseline-web/driver'),join(liveWeb,'driver'),{recursive:true});
 const caddy='{\n admin off\n auto_https off\n}\n:8080 {\n header ?Permissions-Policy \"camera=(), microphone=(), geolocation=()\"\n respond /healthz 200\n handle /health {\n reverse_proxy core:8080\n }\n handle /ready {\n reverse_proxy core:8080\n }\n handle /v1/* {\n reverse_proxy core:8080\n }\n handle_path /passageiro/* {\n header Permissions-Policy \"camera=(), microphone=(), geolocation=(self)\"\n root * /srv/web/passenger\n file_server\n }\n handle_path /motorista/* {\n header Permissions-Policy \"camera=(), microphone=(), geolocation=(self)\"\n root * /srv/web/driver\n file_server\n }\n handle_path /administrodo/* {\n root * /srv/admin\n file_server\n }\n}\n';writeFileSync(lab+'/Caddyfile',caddy);writeFileSync(lab+'/documents-sentinel','do not change');
 docker(['run','--rm','--network','none','--mount','type=bind,src='+lab+'/Caddyfile,dst=/etc/caddy/Caddyfile,readonly',gatewayImage,'caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);
 docker(['network','create','--internal',net]);docker(['network','create',net+'-ingress']);for(const v of volumes)docker(['volume','create',v]);
 const labels={'br.com.ramonessa.identity-ci':'true'},security={read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],tmpfs:['/tmp:rw,noexec,nosuid,size=64m']};
 const service=(role,id)=>({image:id,container_name:names[role],networks:{default:{aliases:[role]}},labels});
 const env={NODE_ENV:'staging',DATABASE_URL:'postgresql://ci:synthetic@postgres:5432/ci',DB_SSL:'false',PASSENGER_PAYMENT_SETTINGS_KEY:'a'.repeat(64),DRIVER_PAYOUT_SETTINGS_KEY:'b'.repeat(64),ADMIN_MFA_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),DOCUMENT_INSPECTION_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64'),MERCADO_PAGO_MODE:'production',MERCADO_PAGO_ACCESS_TOKEN:'APP_USR-synthetic-fixture-no-real-credentials',ASAAS_PAYOUTS_ENABLED:'false',LITERAL_SECRET:'fixture-$abc-${NO_VALUE}-$$'};
 const model={name:'ramo-nessa-staging',services:{
  core:{...service('core',coreImage),...security,environment:env,volumes:[{type:'volume',source:'docs',target:'/var/lib/ramo-nessa'}],healthcheck:{test:['CMD','node','-e',"fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],interval:'1s',timeout:'2s',retries:30}},
  postgres:{...service('postgres',pgImage),environment:{POSTGRES_USER:'ci',POSTGRES_PASSWORD:'synthetic',POSTGRES_DB:'ci'},volumes:[{type:'volume',source:'pg',target:'/var/lib/postgresql/data'}],healthcheck:{test:['CMD','pg_isready','-U','ci','-d','ci'],interval:'1s',timeout:'2s',retries:30}},
  gateway:{...service('gateway',gatewayImage),...security,environment:{LITERAL_SECRET:env.LITERAL_SECRET},cap_add:['NET_BIND_SERVICE'],ports:[{host_ip:'127.0.0.1',target:8080,published:'18080',protocol:'tcp'}],volumes:[{type:'bind',source:liveWeb,target:'/srv/web',read_only:true},{type:'bind',source:lab+'/Caddyfile',target:'/etc/caddy/Caddyfile',read_only:true},{type:'bind',source:lab+'/documents-sentinel',target:'/srv/sentinel',read_only:true},{type:'volume',source:'caddydata',target:'/data'},{type:'volume',source:'caddyconfig',target:'/config'}],healthcheck:{test:['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:8080/healthz'],interval:'1s',timeout:'2s',retries:30}},
  maps:service('maps',gatewayImage),site:service('site',gatewayImage),
 },networks:{default:{name:net,external:true},ingress:{name:net+'-ingress',external:true}},volumes:Object.fromEntries(['docs','pg','caddydata','caddyconfig'].map((n,i)=>[n,{name:volumes[i],external:true}]))};model.services.gateway.networks.ingress=null;
 writeFileSync(config,JSON.stringify(escapeCompose(model)),{mode:0o600});started=true;
 compose(['up','-d','--no-build','--pull','never','postgres','maps','site']);await health('postgres');
 docker(['run','--rm','--network',net,'-e','DATABASE_URL='+env.DATABASE_URL,'-e','DB_SSL=false',coreImage,'node','dist/scripts/migrate.js']);
 compose(['up','-d','--no-build','--pull','never','core','gateway']);await health('core');await health('gateway');
 const seed="import{createPostgresPool}from'./dist/src/db/postgres.js';import{STATIC_PRICING_CATALOG_V1 as s}from'./dist/src/pricing/catalog-snapshot.js';const p=createPostgresPool(process.env.DATABASE_URL);await p.query(\"INSERT INTO pricing_catalog_versions(id,version_number,status,snapshot,effective_from,created_by_kind,created_by_id,created_by_name,published_by_kind,published_by_id,published_by_name,created_at,updated_at,published_at) VALUES('11111111-1111-4111-8111-111111111111',81,'published',$1,now()-interval '1 minute','user','22222222-2222-4222-8222-222222222222','CI','user','22222222-2222-4222-8222-222222222222','CI',now(),now(),now())\",[s]);await p.query(\"CREATE TABLE ci_financial_sentinel(id int primary key,amount int); INSERT INTO ci_financial_sentinel VALUES(1,12345)\");await p.query(\"UPDATE agency_tours SET title='Existing approved tour',enabled=true,cover_image=decode('89504e470d0a1a0a','hex'),cover_image_mime_type='image/png',cover_image_version=1 WHERE slug=(SELECT slug FROM agency_tours ORDER BY slug LIMIT 1)\");await p.end();";
 docker(['exec',names.core,'node','--input-type=module','-e',seed]);
 const historicalRide=`import{createPostgresPool}from'./dist/src/db/postgres.js';
import{PostgresRideRepository}from'./dist/src/rides/repositories/postgres-ride-repository.js';
import{PostgresRidePreparationRepository}from'./dist/src/rides/postgres-ride-preparation-repository.js';
import{PostgresDriverSupplyRepository}from'./dist/src/drivers/repositories/postgres-driver-supply-repository.js';
import{preparePassengerRideForPayment}from'./dist/src/rides/prepare-ride.js';
const p=createPostgresPool(process.env.DATABASE_URL),drivers=new PostgresDriverSupplyRepository(p),now=new Date();
await drivers.upsert({driverId:'historical-ci-driver',vehicleId:'historical-ci-vehicle',categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,latitude:-2.82018,longitude:-40.41468,locationUpdatedAt:now.toISOString(),updatedAt:now.toISOString()});
const ride=await preparePassengerRideForPayment({repository:new PostgresRidePreparationRepository(p),drivers,routing:{routeDistanceKm:async()=>0.2},passengerId:'historical-ci-passenger',quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day'},pickup:{latitude:-2.82017,longitude:-40.41467},dropoff:{latitude:-2.8986,longitude:-40.4506},canUseDriver:async id=>id==='historical-ci-driver',now});
await new PostgresRideRepository(p).save({...ride,state:'COMPLETED'});
await p.query("UPDATE driver_supply SET reserved_ride_id=NULL,reserved_until=NULL WHERE driver_id='historical-ci-driver'");await p.end();`;
 docker(['exec',names.core,'node','--input-type=module','-e',historicalRide]);
 const catalog=digest(JSON.stringify(JSON.parse(query("SELECT snapshot FROM pricing_catalog_versions WHERE version_number=81")))),fixture={coreImage,gatewayImage,catalog,webFiles:Object.fromEntries(['driver/main.dart.js','driver/index.html','passenger/main.dart.js','passenger/index.html'].map(p=>[p,hashFile(join(liveWeb,p))])),caddy:digest(caddy)};
 const legacyTables=JSON.parse(query("SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'"));
 if(!legacyTables.every(t=>/^[a-z_0-9]+$/.test(t)))throw Error('Invalid fixture table');
 const data=()=>query("SELECT jsonb_object_agg(name,records ORDER BY name)::text FROM ("+legacyTables.map(t=>"SELECT '"+t+"' AS name,COALESCE(jsonb_agg(to_jsonb(t)-'manual_refund' ORDER BY (to_jsonb(t)-'manual_refund')::text),'[]'::jsonb) AS records FROM public."+t+" t").join(" UNION ALL ")+") snapshot");
 const existingPublicGuide=await(await fetch('http://127.0.0.1:18080/v1/content/guide')).json();
 assert.ok(existingPublicGuide.entities.length>0);
 const original=data(),oldWeb=hashTree(liveWeb),untouched=Object.fromEntries(['postgres','maps','site'].map(r=>[r,runtimeIdentity(inspect(r))]));
 const preserved=()=>{assert.equal(data(),original);assert.equal(hashTree(liveWeb),oldWeb);assert.equal(readFileSync(lab+'/Caddyfile','utf8'),caddy);for(const r of Object.keys(untouched))assert.equal(runtimeIdentity(inspect(r)),untouched[r]);};
 const reset=async()=>{compose(['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','core','gateway']);await health('core');await health('gateway');rmSync(identityDirectory,{recursive:true});rmSync(dirnameSafe(identityWeb),{recursive:true});};
 let prepared=await prepareIdentity([archive,hashFile(archive)],fixture);
 const nextCore=JSON.parse(readFileSync(join(identityDirectory,'images-after.private.json'))).core;
 assert.equal(nextCore.Config.User,'node');
 for(const p of [identityWeb,join(identityWeb,'driver'),join(identityWeb,'passenger')])assert.equal(statSync(p).mode&0o777,0o755);
 assert.equal(statSync(identityDirectory).mode&0o777,0o700);
 const ids=[inspect('core').Id,inspect('gateway').Id];
 writeFileSync(lab+'/Caddyfile',caddy+'\n# concurrent change');await assert.rejects(activateIdentity([prepared.directory,prepared.sha256]),/IDENTITY_ACTIVE_CONFIGURATION_CHANGED/);assert.deepEqual([inspect('core').Id,inspect('gateway').Id],ids);writeFileSync(lab+'/Caddyfile',caddy);
 await assert.rejects(activateIdentity([prepared.directory,prepared.sha256],{failAfterCore:true}),e=>e.rollbackComplete===true);preserved();assert.equal(inspect('core').Image,coreImage);assert.equal(inspect('gateway').Image,gatewayImage);assert.equal(query("SELECT count(*) FROM schema_migrations WHERE filename='091_manual_ride_cancellations.sql'").trim(),'1');
 await reset();prepared=await prepareIdentity([archive,hashFile(archive)],fixture);
 await assert.rejects(activateIdentity([prepared.directory,prepared.sha256],{failAfterWeb:true}),e=>e.rollbackComplete===true);preserved();assert.equal(inspect('core').Image,coreImage);assert.equal(inspect('gateway').Image,gatewayImage);
 await reset();prepared=await prepareIdentity([archive,hashFile(archive)],fixture);
 await assert.rejects(activateIdentity([prepared.directory,prepared.sha256],{removeGatewayAfterWeb:true}),e=>e.rollbackComplete===true);preserved();assert.equal(inspect('gateway').Image,gatewayImage);
 await reset();prepared=await prepareIdentity([archive,hashFile(archive)],fixture);
 const candidateBeforeGuard=JSON.parse(readFileSync(join(identityDirectory,'images-after.private.json'))).core.Id;
 await assert.rejects(activateIdentity([prepared.directory,prepared.sha256],{failAfterWeb:true,beforeFailure:async()=>{
  query("INSERT INTO ride_manual_cancellations(ride_id,passenger_id,paid_cents,credited_fee_cents,fee_cents,status,reason,created_at,updated_at) SELECT id,passenger_id,0,0,0,'review','Synthetic rollback guard',now(),now() FROM rides WHERE passenger_id='historical-ci-passenger' LIMIT 1");
 }}),e=>e.rollbackComplete===false&&e.message.includes('conferência'));
 assert.equal(inspect('core').Image,candidateBeforeGuard,'new financial cases must keep the compatible Core');
 assert.equal(query("SELECT count(*) FROM ride_manual_cancellations WHERE reason='Synthetic rollback guard'").trim(),'1');
 preserved();
 query("DELETE FROM ride_manual_cancellations WHERE reason='Synthetic rollback guard' AND passenger_id='historical-ci-passenger'");
 await reset();
 prepared=await prepareIdentity([archive,hashFile(archive)],fixture);
 await activateIdentity([prepared.directory,prepared.sha256]);preserved();
 assert.equal(query("SELECT count(*) FROM rides WHERE passenger_id='historical-ci-passenger' AND state='COMPLETED'").trim(),'1');
 const publicGuide=await(await fetch('http://127.0.0.1:18080/v1/content/guide')).json();assert.deepEqual(publicGuide,existingPublicGuide);assert.equal(query('SELECT amount FROM ci_financial_sentinel').trim(),'12345');
 const seedIdentity=`import{randomUUID}from'node:crypto';
import{createPostgresPool}from'./dist/src/db/postgres.js';
import{PostgresAuthOtpRepository}from'./dist/src/auth/repositories/postgres-auth-otp-repository.js';
import{PostgresAuthSessionRepository}from'./dist/src/auth/repositories/postgres-auth-session-repository.js';
import{issueAuthSession}from'./dist/src/auth/auth-service.js';
import{PostgresRideRepository}from'./dist/src/rides/repositories/postgres-ride-repository.js';
import{createRide}from'./dist/src/rides/create-ride.js';
const p=createPostgresPool(process.env.DATABASE_URL),identities=new PostgresAuthOtpRepository(p),sessions=new PostgresAuthSessionRepository(p),rides=new PostgresRideRepository(p),now=new Date().toISOString(),tokens={};
const passenger=randomUUID(),driver=randomUUID();
for(const [subjectType,subjectId,phoneE164]of [['passenger',passenger,'+5588999990001'],['driver',driver,'+5588999990002']]){
 await identities.createIdentity({id:subjectId,subjectType,subjectId,phoneE164,status:'active',createdAt:now,updatedAt:now});tokens[subjectType]=(await issueAuthSession({repository:sessions,subjectType,subjectId})).token;
}
const ride=await createRide(rides,{passengerId:passenger,quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day'}});await rides.save({...ride,driverId:driver,state:'IN_PROGRESS'});console.log(JSON.stringify({rideId:ride.id,tokens,driverId:driver,passengerId:passenger}));await p.end();`;
 const identity=JSON.parse(docker(['exec',names.core,'node','--input-type=module','-e',seedIdentity]));
 const call=async(role,path='',method='GET',body)=>fetch('http://127.0.0.1:18080/v1/'+(role==='driver'?'driver/me/':'')+'rides/'+identity.rideId+'/messages'+path,{method,headers:{authorization:'Bearer '+identity.tokens[role],'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 let response=await call('passenger','','POST',{body:'Estou no portão'});assert.equal(response.status,201);const message=(await response.json()).message;
 response=await call('driver','/status');const status=await response.json();assert.equal(response.status,200);assert.equal(status.unreadCount,1);assert.equal(status.passengerWhatsApp,'+5588999990001');
 assert.equal((await call('driver','/read','POST',{messageIds:[message.id]})).status,200);
 const afterConfig=join(identityDirectory,'core-after.private.json');docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',afterConfig,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','core']);await health('core');
 assert.equal((await(await call('driver','/status')).json()).unreadCount,0);
 assert.equal(query('SELECT amount FROM ci_financial_sentinel').trim(),'12345');
 const rateUrl='http://127.0.0.1:18080/v1/driver/me/rides/'+identity.rideId+'/passenger-rating';
 const rate=(method='GET',body)=>fetch(rateUrl,{method,headers:{authorization:'Bearer '+identity.tokens.driver,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 assert.equal((await rate('POST',{stars:5})).status,409);
 query("UPDATE rides SET state='COMPLETED' WHERE id='"+identity.rideId+"'");
 let rated=await rate('POST',{stars:4,reasons:['polite','communication'],comment:'Muito educado'});assert.equal(rated.status,201);const saved=await rated.json();assert.equal(saved.rating.stars,4);
 rated=await rate('POST',{stars:1,reasons:[]});assert.equal(rated.status,200);assert.deepEqual((await rated.json()).rating,saved.rating);
 docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',afterConfig,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','core']);await health('core');
 assert.deepEqual((await(await rate()).json()).rating,saved.rating);
 assert.equal(query('SELECT amount FROM ci_financial_sentinel').trim(),'12345');

 const manualProgram="import{randomUUID}from'node:crypto';\nimport{createPostgresPool}from'./dist/src/db/postgres.js';\nimport{PostgresManualCancellationStore}from'./dist/src/rides/manual-cancellation-store.js';\nimport{PostgresRideRepository}from'./dist/src/rides/repositories/postgres-ride-repository.js';\nimport{PostgresFinanceRepository}from'./dist/src/payments/repositories/postgres-finance-repository.js';\nimport{PostgresDriverSupplyRepository}from'./dist/src/drivers/repositories/postgres-driver-supply-repository.js';\nimport{PostgresDriverRegistryRepository}from'./dist/src/drivers/repositories/postgres-driver-registry-repository.js';\nimport{PostgresAdminRepository}from'./dist/src/admin/repositories/postgres-admin-repository.js';\nimport{issueAdminApiKey}from'./dist/src/admin/admin-auth.js';\nimport{createRide}from'./dist/src/rides/create-ride.js';\nconst p=createPostgresPool(process.env.DATABASE_URL),store=new PostgresManualCancellationStore(p),rides=new PostgresRideRepository(p),finance=new PostgresFinanceRepository(p),drivers=new PostgresDriverSupplyRepository(p),registry=new PostgresDriverRegistryRepository(p),now=new Date().toISOString(),driverId=process.argv[1],passengerId=process.argv[2];\nconst policy=await store.policy();policy.rules.car={enabled:true,feeCents:500,freeSeconds:40};await store.savePolicy(policy.rules,policy.revision,'fixture');\nawait p.query(\"UPDATE auth_identities SET full_name='Ian Silva' WHERE subject_type='passenger' AND subject_id=$1\",[passengerId]);\nawait registry.upsertProfile({driverId,fullName:'João Silva',status:'approved',createdAt:now,updatedAt:now});\nconst vehicle=await registry.upsertVehicle({id:randomUUID(),driverId,plateNormalized:'ABC1D23',make:'Toyota',model:'Corolla',modelYear:2023,color:'Prata',categories:['car'],fourByFour:false,seatCapacity:4,status:'approved',createdAt:now,updatedAt:now});\nawait drivers.upsert({driverId,vehicleId:vehicle.id,categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:true,latitude:-2.82,longitude:-40.41,locationUpdatedAt:now,updatedAt:now});\nconst ride=await createRide(rides,{passengerId,quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day'}});\nawait rides.save({...ride,state:'DRIVER_ASSIGNED',driverId,paymentStatus:'paid',paymentMethod:'pix'});\nawait p.query(\"UPDATE ride_cancellation_terms SET accepted_at=now()-interval '41 seconds',accepted_driver_id=$2 WHERE ride_id=$1\",[ride.id,driverId]);\nconst paymentId=randomUUID();await finance.createPayment({id:paymentId,rideId:ride.id,method:'pix',processor:'fixture',status:'pending',amountCents:ride.quote.totalAmountCents,idempotencyKey:randomUUID(),createdAt:now,updatedAt:now});\nawait finance.capturePayment({paymentId,processorEventId:randomUUID()});\nconst admin=await issueAdminApiKey({repository:new PostgresAdminRepository(p),name:'Manual cancellation fixture',scopes:['finance:read','finance:write','rides:write']});\nconsole.log(JSON.stringify({rideId:ride.id,paidCents:ride.quote.totalAmountCents,adminToken:admin.token}));await p.end();";
 const manual=JSON.parse(docker(['exec',names.core,'node','--input-type=module','-e',manualProgram,identity.driverId,identity.passengerId]));
 const requestManual=(role,path,method='GET',body)=>fetch('http://127.0.0.1:18080'+path,{method,headers:{authorization:'Bearer '+(role==='admin'?manual.adminToken:identity.tokens[role]),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 const ridePath='/v1/rides/'+manual.rideId;
 let reply=await requestManual('passenger',ridePath+'/tracking');assert.equal(reply.status,200);let tracking=await reply.json();
 assert.equal(tracking.driver.displayName,'João Silva');assert.equal(tracking.driver.vehicle.plate,'ABC1D23');
 reply=await requestManual('passenger',ridePath+'/cancellation');let dormant=await reply.json();assert.equal(dormant.canCancel,false);assert.equal(dormant.terms.cancelUntil,null);
 reply=await requestManual('passenger',ridePath+'/cancellation','POST',{reason:'Disabled'});assert.equal(reply.status,409);assert.equal((await reply.json()).error,'CANCELLATION_DISABLED');
 assert.equal(query("SELECT count(*) FROM ride_manual_cancellations WHERE ride_id='"+manual.rideId+"'").trim(),'0');
 reply=await requestManual('admin','/v1/admin/cancellation-policy');let policy=await reply.json();assert.equal(policy.systemEnabled,false);
 reply=await requestManual('admin','/v1/admin/cancellation-policy','PUT',{...policy,systemEnabled:true});assert.equal(reply.status,200);
 reply=await requestManual('passenger',ridePath+'/cancellation');assert.equal((await reply.json()).terms.systemEnabled,true);
 reply=await requestManual('passenger',ridePath+'/cancellation','POST',{reason:'Too late'});assert.equal(reply.status,409);
 reply=await requestManual('admin','/v1/admin/rides/'+manual.rideId+'/cancel','POST',{reason:'Passageiro solicitou suporte'});assert.equal(reply.status,200);assert.equal((await reply.json()).refundStatus,'manual_review');
 reply=await requestManual('passenger',ridePath+'/refund-pix','PUT',{type:'email',key:'fixture@example.test',holder:'Ian Silva'});assert.equal(reply.status,200);
 reply=await requestManual('driver','/v1/driver/me/rides/'+manual.rideId+'/identification');const driverInfo=await reply.json();
 assert.equal(driverInfo.passengerName,'Ian Silva');assert.equal(driverInfo.cancellationFeeCents,500);assert.ok(!JSON.stringify(driverInfo).includes('fixture@example.test'));
 assert.equal((await requestManual('passenger','/v1/admin/manual-refunds')).status,401);
 reply=await requestManual('admin','/v1/admin/manual-refunds/'+manual.rideId);let manualCase=await reply.json();
 reply=await requestManual('admin','/v1/admin/manual-refunds/'+manual.rideId+'/review','POST',{revision:manualCase.revision,feeCents:200,note:'Empresa cobre R$ 3'});assert.equal(reply.status,200);manualCase=await reply.json();
 const receipt={name:'comprovante.pdf',contentType:'application/pdf',base64:Buffer.concat([Buffer.from('%PDF-1.4'),Buffer.alloc(100000,32)]).toString('base64')};
 const paidBody={revision:manualCase.revision,bankReference:'BANK-CI-'+manual.rideId,receipt};
 for(let attempt=0;attempt<2;attempt++){reply=await requestManual('admin','/v1/admin/manual-refunds/'+manual.rideId+'/paid','POST',paidBody);assert.equal(reply.status,200);assert.equal((await reply.json()).status,'refunded');}
 assert.equal(query("SELECT count(*) FROM ledger_transactions WHERE kind='MANUAL_PASSENGER_REFUND' AND ride_id='"+manual.rideId+"'").trim(),'1');
 const balanceProgram="import{createPostgresPool}from'./dist/src/db/postgres.js';import{PostgresFinanceRepository}from'./dist/src/payments/repositories/postgres-finance-repository.js';const p=createPostgresPool(process.env.DATABASE_URL);console.log(await new PostgresFinanceRepository(p).getAccountBalanceCents('driver:'+process.argv[1]+':payable'));await p.end();";
 assert.equal(docker(['exec',names.core,'node','--input-type=module','-e',balanceProgram,identity.driverId]).trim(),'500');
 reply=await requestManual('passenger',ridePath+'/cancellation');const finalCase=(await reply.json()).cancellation;assert.equal(finalCase.status,'refunded');assert.equal(finalCase.refundCents,manual.paidCents-200);assert.ok(!('receipt' in finalCase));
 console.log('IDENTITY MANUAL INSTALL VERIFIED: immutable old versions, Core/Gateway recovery, financial-write rollback guard, real HTTP ownership/identification, exact 40-second rejection, manual receipt above 64KB, no duplicate refund and preserved driver compensation.');

}catch(e){if(existsSync(identityDirectory+'/command.private.log'))console.error('Synthetic fixture log: '+readFileSync(identityDirectory+'/command.private.log','utf8').slice(-5000));for(const role of ['core','gateway']){const r=spawnSync('docker',['logs','--tail','30',names[role]],{encoding:'utf8'});console.error('CI '+role+': '+r.stdout+r.stderr);const state=spawnSync('docker',['inspect','--format','{{json .State}}',names[role]],{encoding:'utf8'});console.error('CI state '+role+': '+state.stdout);}throw e;}
finally{if(started)for(const role of Object.keys(names))spawnSync('docker',['rm','-fv',names[role]]);for(const v of volumes)spawnSync('docker',['volume','rm',v]);for(const n of [net,net+'-ingress'])spawnSync('docker',['network','rm',n]);for(const p of [identityRoot,dirnameSafe(liveWeb),dirnameSafe(identityWeb),lab])rmSync(p,{recursive:true,force:true});}
