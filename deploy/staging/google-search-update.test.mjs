import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFingerprint,assertImageDelta,switchSearch,baselineSource,lockSha} from './google-search-update-contract.mjs';
test('rejects a concurrent Core or lock even when financial filenames look unchanged',()=>{
  assert.doesNotThrow(()=>assertFingerprint({source:{sha256:baselineSource},packageLockSha256:lockSha},baselineSource));
  assert.throws(()=>assertFingerprint({source:{sha256:'other'},packageLockSha256:lockSha},baselineSource));
  assert.throws(()=>assertFingerprint({source:{sha256:baselineSource},packageLockSha256:'other'},baselineSource));
  assert.throws(()=>assertImageDelta({Config:{Env:['SECRET=old']}},{Config:{Env:['SECRET=new']}}));
});
for(const failure of ['coreUp','coreVerify','gatewayUp','verify'])test('restores old Web before old Core after '+failure,async()=>{
  const calls=[],steps=Object.fromEntries(['coreUp','coreVerify','gatewayUp','verify','gatewayRollback','coreRollback','verifyRollback'].map(name=>[name,async()=>{calls.push(name);if(name===failure)throw Error('forced');}]));
  await assert.rejects(switchSearch(steps),e=>e.rollbackComplete===true);
  assert.deepEqual(calls.slice(-3),['gatewayRollback','coreRollback','verifyRollback']);
});
test('does not downgrade Core if concurrent Gateway prevents safe return',async()=>{
  let touched=false;
  await assert.rejects(switchSearch({coreUp:async()=>{throw Error('fail');},gatewayRollback:async()=>{throw Error('concurrent gateway');},coreRollback:async()=>{touched=true;}}),e=>e.rollbackComplete===false&&e.rollbackFailures.length===1);
  assert.equal(touched,false);
});
test('reports an unverified return accurately',async()=>{
  await assert.rejects(switchSearch({coreUp:async()=>{throw Error('fail');},gatewayRollback:async()=>{},coreRollback:async()=>{},verifyRollback:async()=>{throw Error('bad public bytes');}}),e=>e.rollbackComplete===false);
});
test('successful switch does not run rollback',async()=>{
  const calls=[];await switchSearch(Object.fromEntries(['coreUp','coreVerify','gatewayUp','verify'].map(n=>[n,async()=>{calls.push(n);}])));
  assert.deepEqual(calls,['coreUp','coreVerify','gatewayUp','verify']);
});
