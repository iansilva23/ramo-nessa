import test from 'node:test';
import assert from 'node:assert/strict';
import {switchDriverWeb} from './asaas-driver-web-switch-contract.mjs';
test('healthy switch executes only up/check/verify',async()=>{
 const calls=[],steps=Object.fromEntries(['up','check','verify','rollback','verifyRollback'].map(k=>[k,async()=>calls.push(k)]));
 await switchDriverWeb(steps);assert.deepEqual(calls,['up','check','verify']);
});
for(const failure of ['up','check','verify'])test('failure in '+failure+' restores and verifies gateway',async()=>{
 const calls=[],steps=Object.fromEntries(['up','check','verify','rollback','verifyRollback'].map(k=>[k,async()=>{calls.push(k);if(k===failure)throw Error('fixture');}]));
 await assert.rejects(switchDriverWeb(steps),e=>e.rollbackComplete===true&&e.cause.message==='fixture');
 assert.deepEqual(calls.slice(-2),['rollback','verifyRollback']);
});
test('refused rollback does not claim recovery or verify a different deployment',async()=>{
 let verified=false;await assert.rejects(switchDriverWeb({up:async()=>{throw Error('switch');},rollback:async()=>{throw Error('concurrent deployment');},verifyRollback:async()=>{verified=true;}}),e=>e.rollbackComplete===false&&e.rollbackFailures[0]==='concurrent deployment');assert.equal(verified,false);
});
