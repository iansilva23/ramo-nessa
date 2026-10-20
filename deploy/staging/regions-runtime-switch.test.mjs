import {test} from 'node:test';
import assert from 'node:assert/strict';
import {switchRegionsRuntime} from './regions-runtime-switch.mjs';
function fixture(fail,recovery='restored'){
 const calls=[];const steps={};for(const name of ['preflight','upCore','checkCore','upGateway','checkGateway','beforeReset','applyReset','verify','rollbackCore','rollbackGateway','verifyRollback'])steps[name]=async()=>{calls.push(name);if(name===fail)throw Error('synthetic');};
 steps.restoreCatalogIfUnchanged=async()=>{calls.push('restoreCatalogIfUnchanged');if(recovery==='error')throw Error('db-unavailable');return recovery;};return {calls,steps};
}
test('successful activation checks both services before applying reset and verifying',async()=>{
 const {calls,steps}=fixture();assert.deepEqual(await switchRegionsRuntime(steps),{activated:true});assert.deepEqual(calls,['preflight','upCore','checkCore','upGateway','checkGateway','beforeReset','applyReset','verify']);
});
test('failure before reset returns only touched services, without catalog mutation',async()=>{
 for(const phase of ['upCore','checkCore','upGateway','checkGateway','beforeReset']){
  const {calls,steps}=fixture(phase);await assert.rejects(switchRegionsRuntime(steps),e=>e.rollbackComplete===true);
  assert.ok(calls.includes('rollbackCore'));assert.equal(calls.includes('rollbackGateway'),!['upCore','checkCore'].includes(phase));assert.ok(!calls.includes('restoreCatalogIfUnchanged'));
 }
});
test('uncertain reset response is reconciled and catalog recovery precedes any code rollback',async()=>{
 for(const phase of ['applyReset','verify']){const {calls,steps}=fixture(phase);await assert.rejects(switchRegionsRuntime(steps),e=>e.rollbackComplete===true);assert.ok(calls.indexOf('restoreCatalogIfUnchanged')<calls.indexOf('rollbackCore'));}
});
test('later administrator changes or unavailable database never reactivate the old engine',async()=>{
 for(const recovery of ['conflict','unknown','error']){const {calls,steps}=fixture('verify',recovery);await assert.rejects(switchRegionsRuntime(steps),e=>e.candidatePreserved===true&&e.rollbackComplete===false);assert.ok(!calls.includes('rollbackCore'));assert.ok(!calls.includes('rollbackGateway'));}
});
test('preflight failure makes no service or reset attempt',async()=>{
 const {calls,steps}=fixture('preflight');await assert.rejects(switchRegionsRuntime(steps));assert.deepEqual(calls,['preflight']);
});
