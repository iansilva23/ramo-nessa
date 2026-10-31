// Actual passenger sessions and Core HTTP against a disposable database schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresAuthOtpRepository} from '../src/auth/repositories/postgres-auth-otp-repository.js';
import {PostgresAuthSessionRepository} from '../src/auth/repositories/postgres-auth-session-repository.js';
import {PostgresDriverSupplyRepository} from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import {PostgresDriverRegistryRepository} from '../src/drivers/repositories/postgres-driver-registry-repository.js';
import {issueAuthSession} from '../src/auth/auth-service.js';

const database='postgresql://ramonessa:ramonessa@127.0.0.1:5432/ramonessa';
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_NEARBY_HTTP==='true'&&process.env.DATABASE_URL===database;
test('actual passenger nearby HTTP: authentication, moving fleet, anonymization and offline removal',{skip:!enabled,timeout:60000},async()=>{
 const schema='passenger_nearby_'+randomUUID().replaceAll('-',''),root=createPostgresPool(database),url=new URL(database);
 url.searchParams.set('options','-c search_path='+schema+',public');const pool=createPostgresPool(url.toString());
 let server:ReturnType<typeof spawn>|undefined;
 const call=async(token?:string,query='latitude=-2.82017&longitude=-40.41467')=>fetch('http://127.0.0.1:18779/v1/passenger/me/nearby-vehicles?'+query,{headers:token?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(4000)});
 try{
  await root.query('CREATE SCHEMA '+schema);
  for(const table of ['auth_identities','auth_sessions','driver_supply','driver_profiles','driver_vehicles','driver_documents','driver_document_compliance_controls','operational_settings'])await root.query('CREATE TABLE '+schema+'.'+table+' (LIKE public.'+table+' INCLUDING ALL)');
  await pool.query('INSERT INTO operational_settings SELECT * FROM public.operational_settings');
  const identities=new PostgresAuthOtpRepository(pool),sessions=new PostgresAuthSessionRepository(pool),drivers=new PostgresDriverSupplyRepository(pool),registry=new PostgresDriverRegistryRepository(pool),time=new Date().toISOString();
  const tokens:Record<string,string>={};
  for(const [i,kind]of (['passenger','passenger','driver'] as const).entries()){
   const id='nearby-person-'+i;
   await identities.createIdentity({id:randomUUID(),subjectId:id,subjectType:kind,phoneE164:'+558899984730'+i,status:'active',createdAt:time,updatedAt:time});
   tokens[String(i)]=(await issueAuthSession({repository:sessions,subjectId:id,subjectType:kind})).token;
  }
  await registry.upsertProfile({driverId:'nearby-person-2',fullName:'Private Driver Name',status:'approved',createdAt:time,updatedAt:time});
  await registry.upsertVehicle({id:randomUUID(),driverId:'nearby-person-2',plateNormalized:'TST8A92',make:'Honda',model:'Synthetic',modelYear:2025,color:'Black',categories:['moto'],fourByFour:false,seatCapacity:2,status:'approved',createdAt:time,updatedAt:time});
  const supply={driverId:'nearby-person-2',vehicleId:'private-vehicle',categories:['moto' as const],fourByFour:false,seatCapacity:2,online:true,busy:false,latitude:-2.82017,longitude:-40.41467,locationUpdatedAt:time,updatedAt:time};
  await drivers.upsert(supply);
  server=spawn(process.execPath,['--import','tsx','src/server.ts'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATABASE_URL:url.toString(),PORT:'18779',NODE_ENV:'test',ROUTING_PROVIDER:'google',GOOGLE_MAPS_SERVER_API_KEY:'',GOOGLE_PLACES_API_KEY:'',MERCADO_PAGO_MODE:'disabled',PUSH_PROVIDER:'disabled',GEO_CATALOG_SEARCH_ENABLED:'false',GEO_PASSENGER_LEARNING_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  const logs:string[]=[];server.stderr?.on('data',b=>logs.push(String(b)));
  let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(logs.join('').slice(-2000));try{if((await fetch('http://127.0.0.1:18779/ready')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  assert.equal((await call()).status,401);assert.equal((await call(tokens['2'])).status,401);
  assert.equal((await call(tokens['0'],'latitude=NaN&longitude=1')).status,400);
  assert.equal((await call(tokens['0'],'longitude=1')).status,400);
  const response=await call(tokens['0']);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const initial=await response.json();
  assert.equal(initial.vehicles.length,1);assert.equal(initial.vehicles[0].category,'moto');
  for(const secret of ['nearby-person','Private Driver Name','TST8A92','private-vehicle'])assert.equal(JSON.stringify(initial).includes(secret),false);
  assert.notEqual((await(await call(tokens['1'])).json()).vehicles[0].id,initial.vehicles[0].id);
  await drivers.upsert({...supply,latitude:-2.8195,locationUpdatedAt:new Date().toISOString()});
  const moved=await(await call(tokens['0'])).json();assert.equal(moved.vehicles[0].id,initial.vehicles[0].id);assert.notEqual(moved.vehicles[0].latitude,initial.vehicles[0].latitude);
  await drivers.upsert({...supply,busy:true});assert.equal((await(await call(tokens['0'])).json()).vehicles.length,0);
  await drivers.upsert({...supply,online:false});assert.equal((await(await call(tokens['0'])).json()).vehicles.length,0);
  await pool.query("UPDATE auth_identities SET status='suspended' WHERE subject_id='nearby-person-0'");assert.equal((await call(tokens['0'])).status,401);
 }finally{
  if(server&&server.exitCode===null){const stopped=once(server,'exit');server.kill('SIGTERM');await Promise.race([stopped,new Promise(r=>setTimeout(r,3000))]);if(server.exitCode===null)server.kill('SIGKILL');}
  await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();
 }
});
