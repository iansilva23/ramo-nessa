import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateActivationReadiness,assertSchemaAfter,switchDisabledRuntime} from './asaas-disabled-activation-contract.mjs';
const revision='5ffae79687965042765f40f53cd32e57510dfbfe';
function ready(){const now=Date.now();return{now,plan:{candidateRevision:revision,asaasEnabled:false,migrationApplied:false,servicesChanged:false,sandboxAccepted:true,operatorReportedHttp200:true,scope:['migration086','core','admin-gateway']},fresh:{candidateRevision:revision,stage:'before-activation',createdAt:new Date(now-60000).toISOString(),migrationAppliedToActive:false,asaasActivated:false},closed:{phase:'closed',enabled:false},manifest:{candidateRevision:revision,restored:true,migrationOnlyOnCopy:true,oldAndNewRepositoryRead:true,businessDataUnchanged:true}};}
test('activation requires accepted closed Sandbox, verified recent backup and the exact disabled scope',()=>{
 assert.doesNotThrow(()=>validateActivationReadiness(ready()));
 for(const field of ['asaasEnabled','migrationApplied','servicesChanged']){const r=ready();r.plan[field]=true;assert.throws(()=>validateActivationReadiness(r));}
 for(const field of ['restored','migrationOnlyOnCopy','oldAndNewRepositoryRead','businessDataUnchanged']){const r=ready();r.manifest[field]=false;assert.throws(()=>validateActivationReadiness(r));}
 const stale=ready();stale.fresh.createdAt=new Date(stale.now-3600001).toISOString();assert.throws(()=>validateActivationReadiness(stale));
 const open=ready();open.closed.enabled=true;assert.throws(()=>validateActivationReadiness(open));const scope=ready();scope.plan.scope.push('passenger');assert.throws(()=>validateActivationReadiness(scope));
});
test('schema verification allows precisely one expected migration and no changed historical checksum',()=>{
 const before=[{filename:'085_web_push_preferences.sql',checksum:'old'}],extra={filename:'086_asaas_driver_payouts.sql',checksum:'new'};
 assert.doesNotThrow(()=>assertSchemaAfter(before,[extra,...before],'new'));
 assert.throws(()=>assertSchemaAfter(before,[{...before[0],checksum:'changed'},extra],'new'));
 assert.throws(()=>assertSchemaAfter(before,[...before,extra,{filename:'087_new.sql',checksum:'other'}],'new'));
});
function actions(calls,failAt){return Object.fromEntries(['migrate','upCore','checkCore','upGateway','checkGateway','verify','rollbackCore','rollbackGateway','verifyRollback'].map(name=>[name,async()=>{calls.push(name);if(name===failAt)throw Error('fixture failure');}]));}
test('successful switch migrates, updates Core then gateway and verifies; never restores data',async()=>{
 const calls=[];await switchDisabledRuntime(actions(calls));assert.deepEqual(calls,['migrate','upCore','checkCore','upGateway','checkGateway','verify']);
});
test('migration failure touches no image; Core failure restores only Core; gateway failure restores both',async()=>{
 for(const [failure,expected] of [['migrate',['migrate']],['checkCore',['migrate','upCore','checkCore','rollbackCore','verifyRollback']],['checkGateway',['migrate','upCore','checkCore','upGateway','checkGateway','rollbackCore','rollbackGateway','verifyRollback']]]){
  const calls=[];await assert.rejects(switchDisabledRuntime(actions(calls,failure)));assert.deepEqual(calls,expected);
 }
});
test('failed Core rollback still attempts gateway rollback and reports incomplete recovery',async()=>{
 const calls=[],a=actions(calls,'verify');a.rollbackCore=async()=>{calls.push('rollbackCore');throw Error('fixture rollback failed');};
 await assert.rejects(switchDisabledRuntime(a),e=>e.rollbackComplete===false&&e.rollbackFailures.includes('core'));
 assert.deepEqual(calls.slice(-3),['rollbackCore','rollbackGateway','verifyRollback']);
});
