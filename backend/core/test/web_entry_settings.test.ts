import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {MemoryWebEntrySettingsRepository,WebEntrySettingsError,parseWebEntryUpdate} from '../src/config/web-entry-settings.js';
import {webEntrySettingsRoutes} from '../src/config/web-entry-settings-routes.js';
import {InMemoryAdminRepository} from '../src/admin/repositories/in-memory-admin-repository.js';
import {InMemoryAdminHumanAuthRepository} from '../src/admin/repositories/in-memory-admin-human-auth-repository.js';
import {issueAdminApiKey,AdminAuthenticationError} from '../src/admin/admin-auth.js';
const actor={kind:'user' as const,id:'11111111-1111-4111-8111-111111111111',name:'Teste'};
test('entry setting starts disabled; toggles are persisted, revisioned and audited',async()=>{
  const admin=new InMemoryAdminRepository(),repo=new MemoryWebEntrySettingsRepository(admin);
  assert.equal((await repo.get()).enabled,false);
  const enabled=await repo.save({enabled:true,expectedRevision:0,actor});assert.equal(enabled.revision,1);
  assert.deepEqual(await repo.save({enabled:true,expectedRevision:1,actor}),enabled);
  const disabled=await repo.save({enabled:false,expectedRevision:1,actor});assert.equal(disabled.enabled,false);assert.equal(disabled.revision,2);
  const records=await admin.listAudit(10);assert.equal(records.length,2);
  const record=records.find(a=>a.metadata.revision===2)!;
  assert.deepEqual(record.actor,actor);assert.equal(record.metadata.previousEnabled,true);assert.equal(record.metadata.enabled,false);
});
test('concurrent administrators cannot overwrite a newer selection',async()=>{
  const admin=new InMemoryAdminRepository(),repo=new MemoryWebEntrySettingsRepository(admin);
  const results=await Promise.allSettled([repo.save({enabled:true,expectedRevision:0,actor}),repo.save({enabled:true,expectedRevision:0,actor})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);assert.equal((await admin.listAudit(10)).length,1);
});
test('audit failure does not change memory selection',async()=>{
  const admin=new InMemoryAdminRepository(),repo=new MemoryWebEntrySettingsRepository(admin);admin.appendAudit=async()=>{throw Error('audit unavailable');};
  await assert.rejects(repo.save({enabled:true,expectedRevision:0,actor}),/audit unavailable/);assert.equal((await repo.get()).enabled,false);
});
test('strict input rejects invented fields and coercions',()=>{
  for(const b of [null,[],{},true,{enabled:'false',expectedRevision:0},{enabled:1,expectedRevision:0},{enabled:true,expectedRevision:-1},{enabled:false,expectedRevision:1.5},{enabled:false,expectedRevision:'0'},{enabled:false,expectedRevision:0,price:100}])assert.throws(()=>parseWebEntryUpdate(b),WebEntrySettingsError);
  assert.deepEqual(parseWebEntryUpdate({enabled:false,expectedRevision:0}),{enabled:false,expectedRevision:0});
});
test('real HTTP routes require admin scope; public view is minimal and never authorizes app access',async t=>{
  const admin=new InMemoryAdminRepository(),humans=new InMemoryAdminHumanAuthRepository(),repo=new MemoryWebEntrySettingsRepository(admin);
  const writer=await issueAdminApiKey({repository:admin,name:'Writer',scopes:['communications:read','communications:write']});
  const reader=await issueAdminApiKey({repository:admin,name:'Reader',scopes:['communications:read']});
  const server=createServer(async(request,response)=>{
    const json=(r:typeof response,status:number,body:unknown)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(body));};
    try{
      if(!await webEntrySettingsRoutes({request,response,url:new URL(request.url!,'http://localhost'),repository:repo,admin,humans,json,readJson:async req=>{const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString());}}))json(response,404,{});
    }catch(e){json(response,e instanceof WebEntrySettingsError?e.status:e instanceof AdminAuthenticationError?e.code==='ADMIN_SCOPE_REQUIRED'?403:401:500,{error:e instanceof Error?e.message:'error'});}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());}));
  const addr=server.address();assert.ok(addr&&typeof addr!=='string');const base='http://127.0.0.1:'+addr.port;
  const req=(path:string,method='GET',body?:unknown,token?:string)=>fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const publicView=await req('/v1/public/web-entry-settings');assert.equal(publicView.headers.get('cache-control'),'no-store');assert.deepEqual(await publicView.json(),{enabled:false});
  assert.equal((await req('/v1/admin/web-entry-settings')).status,401);
  assert.equal((await req('/v1/admin/web-entry-settings','PATCH',{enabled:true,expectedRevision:0},reader.token)).status,403);
  assert.equal((await req('/v1/admin/web-entry-settings','PATCH',{enabled:'true',expectedRevision:0},writer.token)).status,400);
  assert.equal((await req('/v1/admin/web-entry-settings','PATCH',{enabled:true,expectedRevision:0},writer.token)).status,200);
  assert.deepEqual(await (await req('/v1/public/web-entry-settings')).json(),{enabled:true});
  assert.equal((await req('/v1/admin/web-entry-settings','PATCH',{enabled:false,expectedRevision:0},writer.token)).status,409);
  assert.equal((await req('/v1/admin/web-entry-settings','PATCH',{enabled:false,expectedRevision:1},writer.token)).status,200);
  assert.equal((await req('/v1/auth/web/session')).status,404,'presentation endpoint creates no authenticated session');
});
