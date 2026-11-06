import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,readFileSync,statSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSandboxWebhookServer,sandboxWebhookPath} from './asaas-sandbox-webhook-http.mjs';
import {sandboxCaddyCandidate,guardedWrite} from './asaas-sandbox-webhook-contract.mjs';
const token='webhook-test-token-fixture-12345678901234567890';
async function fixture(t,overrides={}){
 const calls=[],events=new Set();
 const server=createSandboxWebhookServer({token,healthy:async()=>{},receive:async(auth,body)=>{
  calls.push('receive');assert.equal(auth,token);if(!body?.id||!body.transfer?.id)throw Object.assign(Error('bad'),{status:400});
  return events.has(body.id)?{duplicate:true}:{duplicate:false,payoutId:'fixture-payout',result:{status:'paid'}};
 },apply:async()=>calls.push('apply'),complete:async id=>{calls.push('complete');events.add(id);},receipt:async e=>calls.push(e),...overrides});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const origin='http://127.0.0.1:'+server.address().port;
 const send=(body={},extra={})=>fetch(origin+sandboxWebhookPath,{method:'POST',headers:{'content-type':'application/json','asaas-access-token':token},body:JSON.stringify(body),...extra});
 return {server,calls,send,origin};
}
const event={id:'evt-local-public-fixture',event:'TRANSFER_DONE',transfer:{id:'transfer-fixture'}};
test('auth rejected before processing; exact path, POST and JSON enforced',async t=>{
 const {send,origin,calls}=await fixture(t);
 assert.equal((await send(event,{headers:{'content-type':'application/json'}})).status,401);
 assert.equal((await fetch(origin+sandboxWebhookPath)).status,405);
 assert.equal((await fetch(origin+sandboxWebhookPath+'?other=1')).status,404);
 assert.equal((await send(event,{headers:{'asaas-access-token':token,'content-type':'text/plain'}})).status,415);
 assert.equal((await send(event,{body:'{'})).status,400);
 assert.equal((await send('x'.repeat(70000))).status,413);
 assert.deepEqual(calls,[]);
});
test('acknowledge only after apply/complete; duplicate does not apply twice; local probe marked',async t=>{
 const {send,calls}=await fixture(t);
 assert.equal((await send(event)).status,200);assert.deepEqual(calls.slice(0,3),['receive','apply','complete']);
 assert.equal(calls[3].localProbe,true);assert.equal(calls[3].status,'paid');
 assert.equal((await send(event)).status,200);assert.equal(calls.filter(x=>x==='apply').length,1);assert.equal(calls.at(-1).duplicate,true);
});
test('canonical/API or ledger failure returns retryable status without completing event',async t=>{
 const {send,calls}=await fixture(t,{apply:async()=>{throw Error('fixture secret must not escape');}});
 const r=await send({...event,id:'evt-incoming-fixture'});assert.equal(r.status,503);assert.equal(await r.text(),'{"ok":false}');assert.deepEqual(calls,['receive']);
});
test('provider validation returns 400 and records no success; health is independent',async t=>{
 const {send,origin,calls}=await fixture(t);assert.equal((await send({})).status,400);assert.deepEqual(calls,['receive']);
 assert.equal((await fetch(origin+'/healthz')).status,200);
});
test('incoming authenticated event is distinguished from operator local probe',async t=>{
 const {send,calls}=await fixture(t);await send({...event,id:'evt_asaas_fixture'});assert.equal(calls.at(-1).localProbe,false);
});
test('Caddy insertion preserves existing bytes, refuses ambiguous markers and unsafe alias',()=>{
 const alias='ramo-asaas-sandbox-'+'a'.repeat(32)+'-receiver',before='{\n admin off\n}\nexample.invalid {\n  @api path /v1/* /health /ready\n  handle @api { reverse_proxy core:8080 }\n}\n';
 const after=sandboxCaddyCandidate(before,alias);
 assert.equal(after.replace(/  # Temporary[^]*?(?=  @api)/,''),before);
 assert.match(after,/handle \/__asaas_sandbox\/transfers/);assert.throws(()=>sandboxCaddyCandidate(after,alias));
 assert.throws(()=>sandboxCaddyCandidate(before+before,alias));assert.throws(()=>sandboxCaddyCandidate(before,'bad:80\n}'));
 const crlf=before.replaceAll('\n','\r\n');assert.ok(!sandboxCaddyCandidate(crlf,alias).replaceAll('\r\n','').includes('\n'));
});
test('in-place activation and rollback retain inode, refuse changed config and symlinks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'asaas-caddy-'));try{
  const file=join(dir,'Caddyfile');writeFileSync(file,'old');const inode=statSync(file).ino;
  guardedWrite(file,'old','new longer');assert.equal(statSync(file).ino,inode);assert.equal(readFileSync(file,'utf8'),'new longer');
  assert.throws(()=>guardedWrite(file,'old','oops'));assert.equal(readFileSync(file,'utf8'),'new longer');
  guardedWrite(file,'new longer','old');assert.equal(statSync(file).ino,inode);assert.equal(readFileSync(file,'utf8'),'old');
  symlinkSync(file,join(dir,'link'));assert.throws(()=>guardedWrite(join(dir,'link'),'old','new'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
