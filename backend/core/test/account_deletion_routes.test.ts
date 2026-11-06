import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {accountDeletionRoutes} from '../src/account-deletion/account-deletion-routes.js';
import type {SelfAccountDeletion} from '../src/account-deletion/self-account-deletion.js';

async function setup(enabled=true){
 const calls:{role:string;id:string;confirmed:unknown}[]=[];let authenticated=0,disconnected=0;
 const service={
  overview:async()=>({available:true,eligible:true,balanceCents:0}),
  start:async(role:string,id:string,confirmed:unknown)=>{calls.push({role,id,confirmed});return {id:'synthetic-job',receipt:'a'.repeat(64),sessions:['session-1'],status:'processing'};},
  receiptStatus:async(receipt:unknown)=>{assert.equal(receipt,'a'.repeat(64));return {id:'synthetic-job',status:'processing'};},
 } as unknown as SelfAccountDeletion;
 const server=createServer(async(request,response)=>{
  try{
   const matched=await accountDeletionRoutes({request,response,url:new URL(request.url!,'http://localhost'),enabled,service,storage:null,
    authenticate:async()=>{authenticated++;return {subjectType:'driver',subjectId:'authenticated-owner'};},
    readJson:async req=>{const data=[];for await(const chunk of req)data.push(chunk);return JSON.parse(Buffer.concat(data).toString());},
    json:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));},
    disconnect:()=>{disconnected++;},process:async()=>{throw Error('Simulated cleanup outage');}});
   if(!matched){response.writeHead(404);response.end();}
  }catch{response.writeHead(500);response.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
 return {url:`http://127.0.0.1:${address.port}`,calls,authenticated:()=>authenticated,disconnected:()=>disconnected,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
test('feature is disabled by default without authenticating or deleting',async()=>{
 const s=await setup(false);try{
  const get=await fetch(s.url+'/v1/me/account-deletion');assert.equal((await get.json()).available,false);
  const post=await fetch(s.url+'/v1/me/account-deletion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmed:true})});
  assert.equal(post.status,503);assert.equal(s.authenticated(),0);assert.equal(s.calls.length,0);
 }finally{await s.close();}
});
test('session determines deletion target; cleanup outage preserves the receipt and pending status',async()=>{
 const s=await setup();try{
  const response=await fetch(s.url+'/v1/me/account-deletion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmed:true,subjectId:'victim',subjectType:'passenger'})});
  assert.equal(response.status,202);const body=await response.json();
  assert.equal(body.status,'processing');assert.equal(body.receipt,'a'.repeat(64));
  assert.deepEqual(s.calls,[{role:'driver',id:'authenticated-owner',confirmed:true}]);assert.equal(s.disconnected(),1);assert.equal('sessions' in body,false);
 }finally{await s.close();}
});
test('receipt lookup uses the opaque body token and does not require the revoked session',async()=>{
 const s=await setup();try{
  const response=await fetch(s.url+'/v1/account-deletion/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({receipt:'a'.repeat(64)})});
  assert.equal(response.status,200);assert.equal(s.authenticated(),0);assert.equal(s.calls.length,0);
 }finally{await s.close();}
});
test('external page is public, non-cacheable and uses a separate same-origin script',async()=>{
 const s=await setup(false);try{
  const response=await fetch(s.url+'/v1/account-deletion/page');const html=await response.text();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);
  assert.match(html,/Ramo Nessa/);assert.match(html,/\/v1\/account-deletion\/app.js/);assert.equal(s.authenticated(),0);
 }finally{await s.close();}
});
