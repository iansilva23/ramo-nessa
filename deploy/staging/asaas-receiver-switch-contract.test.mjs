import test from 'node:test';
import assert from 'node:assert/strict';
import {switchReceiverCore} from './asaas-receiver-switch-contract.mjs';
test('receive-only switch completes using Core only',async()=>{
 const calls=[];const steps=Object.fromEntries(['up','check','verify','rollback','verifyRollback'].map(n=>[n,async()=>calls.push(n)]));
 await switchReceiverCore(steps);assert.deepEqual(calls,['up','check','verify']);
});
test('health, auth, runtime or interruption failure restores Core and verifies rollback',async()=>{
 for(const fail of ['up','check','verify']){
  const calls=[],steps=Object.fromEntries(['up','check','verify','rollback','verifyRollback'].map(n=>[n,async()=>{calls.push(n);if(n===fail)throw Error('failed');}]));
  await assert.rejects(switchReceiverCore(steps),e=>e.rollbackComplete===true);
  assert.deepEqual(calls.slice(-2),['rollback','verifyRollback']);
 }
});
test('unknown concurrent image or failed return reports review-required, never database restore',async()=>{
 const calls=[];const steps={up:async()=>{throw Error('health');},check:async()=>{},verify:async()=>{},
  rollback:async()=>{calls.push('refused-newer-image');throw Error('concurrent image');},
  verifyRollback:async()=>calls.push('must-not-assume-rollback')};
 await assert.rejects(switchReceiverCore(steps),e=>e.rollbackComplete===false&&e.rollbackFailures.includes('concurrent image'));
 assert.deepEqual(calls,['refused-newer-image']);
});
