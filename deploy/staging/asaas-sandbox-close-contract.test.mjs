import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disableSandboxWebhook} from './asaas-sandbox-close-contract.mjs';
import {webhookUrl,transferEvents} from './asaas-webhook-exercise-contract.mjs';
const token='sandbox-webhook-fixture-only-12345678901234567890';
function fixture({enabled=true,lost=false,refuse=false,wrongUrl=false,wrongToken=false}={}){
 const calls=[],owned={id:'webhook-fixture-uuid',url:wrongUrl?'https://other.invalid':webhookUrl,enabled,interrupted:false,apiVersion:3,sendType:'SEQUENTIALLY',events:[...transferEvents],authToken:wrongToken?'wrong-token':token};
 const unrelated={id:'unrelated',url:'https://unrelated.invalid',enabled:true};
 const fetcher=async(input,init)=>{const url=new URL(input);assert.equal(url.origin,'https://api-sandbox.asaas.com');assert.equal(init.redirect,'error');calls.push({path:url.pathname,method:init.method,body:init.body});
  if(init.method==='GET')return Response.json({hasMore:false,data:[{...owned},unrelated]});
  assert.equal(init.method,'PUT');assert.equal(url.pathname,'/v3/webhooks/'+owned.id);assert.deepEqual(JSON.parse(init.body),{enabled:false});
  if(refuse)return new Response('',{status:503});owned.enabled=false;if(lost)throw Error('fixture response lost');return Response.json(owned);
 };
 return{calls,fetcher,owned,unrelated};
}
test('disable only the exact owned Sandbox subscription, verify afterwards and leave other webhooks alone',async()=>{
 const f=fixture();const result=await disableSandboxWebhook({apiKey:'fixture',token,fetcher:f.fetcher});assert.equal(result.enabled,false);assert.equal(f.unrelated.enabled,true);assert.deepEqual(f.calls.map(x=>x.method),['GET','PUT','GET']);
});
test('already disabled subscription is read-only; lost update response is resolved by GET',async()=>{
 const f=fixture({enabled:false});assert.equal((await disableSandboxWebhook({apiKey:'fixture',token,fetcher:f.fetcher})).alreadyDisabled,true);assert.deepEqual(f.calls.map(x=>x.method),['GET','GET']);
 const lost=fixture({lost:true});assert.equal((await disableSandboxWebhook({apiKey:'fixture',token,fetcher:lost.fetcher})).updateResponseUncertain,true);assert.equal(lost.owned.enabled,false);
});
test('a failed/unconfirmed update or different token/URL cannot authorize receiver removal',async()=>{
 for(const options of [{refuse:true},{wrongUrl:true},{wrongToken:true}]){const f=fixture(options);await assert.rejects(disableSandboxWebhook({apiKey:'fixture',token,fetcher:f.fetcher}));assert.equal(f.unrelated.enabled,true);if(options.wrongUrl||options.wrongToken)assert.equal(f.calls.some(x=>x.method==='PUT'),false);}
});
