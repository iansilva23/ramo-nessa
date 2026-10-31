import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {guideRoutes} from '../src/guide/guide-routes.js';
import {guideData} from '../src/guide/guide.js';
import {MemoryGuideStore} from '../src/guide/guide-store.js';
import {readJsonBody,readBinaryBody} from '../src/http/request-body.js';
import {InMemoryAdminRepository} from '../src/admin/repositories/in-memory-admin-repository.js';
import {InMemoryAdminHumanAuthRepository} from '../src/admin/repositories/in-memory-admin-human-auth-repository.js';
import {createAdminHumanUser,hashAdminHumanSessionToken} from '../src/admin/admin-human-auth-service.js';
import type {AdminScope} from '../src/admin/admin-repository.js';
test('actual Guide HTTP handler enforces read/write scopes, image privacy, publication and upload validation',async()=>{
 const d=guideData({name:'Localidade'}),store=new MemoryGuideStore({revision:0,entities:[{id:'local','kind':'locality',parentId:null,draft:d,published:d,archived:false}]}),admin=new InMemoryAdminRepository(),humans=new InMemoryAdminHumanAuthRepository();
 async function account(scopes:AdminScope[]){const a=await createAdminHumanUser({repository:humans,name:'Editor teste',email:randomUUID()+'@example.invalid',scopes,encryptionKey:Buffer.alloc(32,19)}),token='rn_admin_session_'+randomBytes(32).toString('base64url');await humans.createSession({id:randomUUID(),userId:a.user.id,tokenHash:hashAdminHumanSessionToken(token),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return token;}
 const writer=await account(['communications:read','communications:write']),reader=await account(['communications:read']);
 const json=(r:import('node:http').ServerResponse,s:number,b:unknown)=>{r.writeHead(s,{'content-type':'application/json'});r.end(JSON.stringify(b));};
 const server=createServer(async(request,response)=>{try{if(!await guideRoutes({request,response,url:new URL(request.url!,'http://127.0.0.1'),store,admin,humans,json,readJson:readJsonBody,readBinary:readBinaryBody}))json(response,404,{error:'NOT_FOUND'});}catch(e){const err=e as {code?:string;message:string};json(response,err.code==='ADMIN_SCOPE_REQUIRED'?403:401,{error:err.code,message:err.message});}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
 const req=(path:string,method='GET',token?:string,body?:unknown,type='application/json')=>fetch(origin+path,{method,headers:{'content-type':type,...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:body instanceof Buffer?body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});
 try{
  assert.equal((await req('/v1/admin/guide')).status,401);assert.equal((await req('/v1/admin/guide','GET',reader)).status,200);
  assert.equal((await req('/v1/admin/guide','PUT',reader,{expectedRevision:0})).status,403);
  assert.equal((await req('/v1/admin/guide/images','PUT',writer,Buffer.from('<svg/>'),'image/svg+xml')).status,415);
  assert.equal((await req('/v1/admin/guide/images','PUT',writer,Buffer.from('invalid'),'image/png')).status,422);
  const bytes=Buffer.from([137,80,78,71,13,10,26,10]),upload=await req('/v1/admin/guide/images','PUT',writer,bytes,'image/png');assert.equal(upload.status,201);const image=(await upload.json() as {url:string}).url;
  assert.equal((await req(image)).status,404);assert.equal((await req(image.replace('/content/','/admin/'),'GET',reader)).status,200);
  let revision=0;for(const body of [{op:'save',id:'category',kind:'category',parentId:'local',data:{name:'Gastronomia',template:'gastronomy',image}},{op:'publish',id:'category'}]){const response=await req('/v1/admin/guide','PUT',writer,{...body,expectedRevision:revision});assert.equal(response.status,200);revision=(await response.json() as {revision:number}).revision;}
  assert.equal((await req(image)).status,200);const visible=await(await req('/v1/content/guide')).json() as {entities:Record<string,unknown>[]};assert.ok(visible.entities.every(e=>!('draft'in e)&&!('published'in e)&&!('archived'in e)));
  assert.equal((await req('/v1/admin/guide/history','GET',reader)).status,200);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
