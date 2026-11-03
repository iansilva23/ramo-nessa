import test from 'node:test';
import assert from 'node:assert/strict';
import {receiverPlan,assertReceiverDelta,assertReceiverRuntime,receiverEnvironment} from './asaas-production-receiver-contract.mjs';
const image='sha256:'+'a'.repeat(64);
const fixture=()=>({name:'ramo-nessa-staging',services:{core:{
 image:'before',environment:{DRIVER_PAYOUT_PROVIDER_NAME:'asaas',ASAAS_PAYOUTS_ENABLED:'false',MERCADO_PAGO_MODE:'test',SECRET:'literal-$$abc-\${UNKNOWN}'},
 volumes:[{type:'volume',source:'documents',target:'/var/lib/ramo-nessa'}],networks:{default:{aliases:['core']}},read_only:true,cap_drop:['ALL'],
}},networks:{default:{external:true,name:'existing'}},volumes:{documents:{external:true,name:'existing-documents'}}});
test('receiver plan adds only immutable image, receive-only environment and two read-only binds',()=>{
 const before=fixture(),original=structuredClone(before),after=receiverPlan(before,image);
 assert.deepEqual(before,original);assertReceiverDelta(before,after,image);
 assert.equal(after.services.core.environment.SECRET,before.services.core.environment.SECRET);
 assert.equal(after.services.core.environment.MERCADO_PAGO_MODE,'test');
 assert.equal(after.services.core.volumes.length,3);
 assert.ok(after.services.core.volumes.slice(1).every(x=>x.read_only&&x.bind.create_host_path===false));
 assert.deepEqual(after.networks,before.networks);assert.deepEqual(after.volumes,before.volumes);
 assertReceiverRuntime(after.services.core.environment);
});
test('receiver plan rejects sending, preexisting credentials, mixed providers, unsafe secret paths and mutable images',()=>{
 for(const env of [{ASAAS_PAYOUTS_ENABLED:'true'},{ASAAS_API_KEY:'secret'},{ASAAS_WEBHOOK_ENABLED:'true'},{DRIVER_PAYOUT_PROVIDER_NAME:'other'}]){
  const before=fixture();Object.assign(before.services.core.environment,env);assert.throws(()=>receiverPlan(before,image));
 }
 assert.throws(()=>receiverPlan(fixture(),'image:latest'));
 assert.throws(()=>receiverPlan(fixture(),image,'/tmp/\${SECRET}'));
});
test('delta validation refuses ports, database, network, policy and secret mount changes',()=>{
 for(const edit of [
  m=>{m.services.core.environment.DATABASE_URL='other';},
  m=>{m.services.core.environment.ASAAS_PAYOUTS_ENABLED='true';},
  m=>{m.services.core.volumes[1].read_only=false;},
  m=>{m.networks.default.name='other';},
  m=>{m.services.core.ports=['8080:8080'];},
 ]){
  const before=fixture(),after=receiverPlan(before,image);edit(after);assert.throws(()=>assertReceiverDelta(before,after,image));
 }
 assert.throws(()=>assertReceiverRuntime({...receiverEnvironment,ASAAS_PAYOUTS_ENABLED:'true'}));
});
