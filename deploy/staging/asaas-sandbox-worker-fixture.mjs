// Rehearses interruption/restart with fake transport only; never receives a real key.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('Somente CI descartável.');
const path='/audit/data/remote-fixture.json';
globalThis.fetch=async(url,init={})=>{
 assert.equal(new URL(url).origin,'https://api-sandbox.asaas.com');
 const remote=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
 if(url.endsWith('/v3/finance/balance'))return Response.json({balance:19.01});
 if(init.method==='POST'){
  assert.equal(remote,null);const body=JSON.parse(init.body);
  writeFileSync(path,JSON.stringify({id:randomUUID(),externalReference:body.externalReference,value:body.value,status:'DONE',operationType:'PIX',bankAccount:{pixAddressKey:body.pixAddressKey}}),{mode:0o600});
  throw Error('CI: request accepted; response lost.');
 }
 if(url.includes('?'))return Response.json({data:remote?[remote]:[],hasMore:false});
 assert.ok(remote);return Response.json(remote);
};
await import('/audit/worker.mjs');
