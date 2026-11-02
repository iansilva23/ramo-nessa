// Real HTTP/Core + isolated PostgreSQL schema; no providers or production access.
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresAdminRepository} from '../src/admin/repositories/postgres-admin-repository.js';
import {PostgresAuthOtpRepository} from '../src/auth/repositories/postgres-auth-otp-repository.js';
import {issueAdminApiKey} from '../src/admin/admin-auth.js';

const database='postgresql://ramonessa:ramonessa@127.0.0.1:5432/ramonessa';
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_PASSENGER_DIRECTORY_HTTP==='true'&&process.env.DATABASE_URL===database;
test('actual passenger HTTP search returns registered names and retains scope, IDs and pagination',{skip:!enabled,timeout:60000},async()=>{
 const schema='passenger_name_'+randomUUID().replaceAll('-',''),root=createPostgresPool(database);
 const url=new URL(database);url.searchParams.set('options','-c search_path='+schema+',public');
 const pool=createPostgresPool(url.toString());let server:ReturnType<typeof spawn>|undefined;
 const request=async(path:string,token?:string)=>{
  const response=await fetch('http://127.0.0.1:18778'+path,{headers:token?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(3000)});
  return {status:response.status,body:await response.json() as Record<string,any>};
 };
 try{
  await root.query('CREATE SCHEMA '+schema);
  for(const table of ['auth_identities','admin_api_keys','admin_audit_log'])await root.query('CREATE TABLE '+schema+'.'+table+' (LIKE public.'+table+' INCLUDING ALL)');
  const repo=new PostgresAuthOtpRepository(pool),admin=new PostgresAdminRepository(pool);
  const key=await issueAdminApiKey({repository:admin,name:'Synthetic passenger reader',scopes:['passengers:auth:read']});
  const denied=await issueAdminApiKey({repository:admin,name:'Synthetic unrelated reader',scopes:['drivers:auth:read']});
  const time='2026-10-23T00:00:00.000Z';
  for(const [i,fullName] of ['João Silva','João Souza',null].entries())await repo.createIdentity({id:randomUUID(),subjectId:'synthetic-passenger-'+i,subjectType:'passenger',phoneE164:'+558899982730'+i,...(fullName?{fullName}:{}),status:'active',createdAt:time,updatedAt:time});
  server=spawn(process.execPath,['--import','tsx','src/server.ts'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATABASE_URL:url.toString(),PORT:'18778',NODE_ENV:'test',ROUTING_PROVIDER:'google',GOOGLE_MAPS_SERVER_API_KEY:'',GOOGLE_PLACES_API_KEY:'',MERCADO_PAGO_MODE:'disabled',PUSH_PROVIDER:'disabled',GEO_CATALOG_SEARCH_ENABLED:'false',GEO_PASSENGER_LEARNING_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  const logs:string[]=[];server.stderr?.on('data',b=>logs.push(String(b)));
  let ready=false;
  for(let i=0;i<100;i++){
   if(server.exitCode!==null)throw Error('Synthetic Core exited: '+logs.join('').slice(-3000));
   try{if((await request('/ready')).status===200){ready=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready);
  assert.equal((await request('/v1/admin/passengers?query=joao')).status,401);
  assert.equal((await request('/v1/admin/passengers?query=joao',denied.token)).status,403);
  const named=await request('/v1/admin/passengers?query=joao',key.token);
  assert.equal(named.status,200);assert.equal(named.body.items.length,2);
  assert.deepEqual(named.body.items.map((x:{fullName:string})=>x.fullName).sort(),['João Silva','João Souza']);
  const partial=await request('/v1/admin/passengers?query=SILVA',key.token);
  assert.equal(partial.body.items[0].passengerId,'synthetic-passenger-0');
  assert.equal(partial.body.items[0].fullName,'João Silva');
  assert.equal(Object.hasOwn(partial.body.items[0],'passwordHash'),false);
  const first=await request('/v1/admin/passengers?query=joao&limit=1',key.token);
  assert.ok(first.body.nextCursor);
  const second=await request('/v1/admin/passengers?query=joao&limit=1&cursor='+encodeURIComponent(first.body.nextCursor),key.token);
  assert.equal(second.body.items.length,1);assert.notEqual(first.body.items[0].passengerId,second.body.items[0].passengerId);
  const unnamed=await request('/v1/admin/passengers?query=synthetic-passenger-2',key.token);
  assert.equal(unnamed.body.items[0].fullName,null);
 }finally{
  if(server&&server.exitCode===null){const stopped=once(server,'exit');server.kill('SIGTERM');await Promise.race([stopped,new Promise(r=>setTimeout(r,3000))]);if(server.exitCode===null)server.kill('SIGKILL');}
  await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();
 }
});
