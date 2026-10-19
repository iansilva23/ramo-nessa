import {test} from 'node:test';
import assert from 'node:assert/strict';
import {environmentMap,assertEnvironmentMatches,servicePlan,escapeCompose,changesForAsaas,activationProject,composeEnvironmentToRuntime} from './asaas-activation-plan-contract.mjs';
function fixture(){
 const environment={NODE_ENV:'staging',MERCADO_PAGO_MODE:'test',GOOGLE_MAPS_SERVER_API_KEY:'fixture-key-with-$$dollars',OTP_PROVIDER:'entrar-whatsapp',DRIVER_PAYOUT_PROVIDER_NAME:''};
 const resolved={name:activationProject,services:{core:{image:'current:tag',build:{context:'/old'},depends_on:{postgres:{condition:'service_healthy'}},environment,volumes:[{type:'volume',source:'documents',target:'/var/lib/ramo-nessa'},{type:'bind',source:'/private/firebase.json',target:'/run/secrets/firebase',read_only:true}],networks:{default:null},restart:'unless-stopped',cap_drop:['ALL'],security_opt:['no-new-privileges:true']}},networks:{default:{name:'ramo-nessa-staging_default'}},volumes:{documents:{name:'ramo-nessa-staging_driver_documents'}}};
 const image={Config:{Env:['PATH=/usr/bin','NODE_VERSION=22']}};
 const container={Name:'/ramo-nessa-staging-core-1',Config:{Labels:{'com.docker.compose.project':activationProject,'com.docker.compose.service':'core'},Env:[...image.Config.Env,...Object.entries(composeEnvironmentToRuntime(environment)).map(([k,v])=>k+'='+v)]},NetworkSettings:{Networks:{'ramo-nessa-staging_default':{Aliases:['core','ramo-nessa-staging-core-1']}}},Mounts:[{Type:'volume',Name:'ramo-nessa-staging_driver_documents',Destination:'/var/lib/ramo-nessa',RW:true},{Type:'bind',Source:'/private/firebase.json',Destination:'/run/secrets/firebase',RW:false}]};
 return{resolved,container,image};
}
test('candidate changes only image and explicitly disabled Asaas configuration; preserves providers and mounts',()=>{
 const {resolved,container,image}=fixture();assertEnvironmentMatches(resolved.services.core,container,image);
 const plan=servicePlan(resolved,'core',container,'candidate:tag',{disabledAsaas:true});
 assert.equal(plan.services.core.image,'candidate:tag');assert.equal(plan.services.core.environment.MERCADO_PAGO_MODE,'test');
 assert.deepEqual(changesForAsaas(resolved.services.core.environment,plan.services.core.environment).sort(),['ASAAS_PAYOUTS_ENABLED','DRIVER_PAYOUT_PROVIDER_NAME']);
 assert.equal(plan.services.core.build,undefined);assert.equal(plan.services.core.depends_on,undefined);assert.equal(plan.services.core.pull_policy,'never');
 assert.deepEqual(plan.services.core.volumes,resolved.services.core.volumes);assert.deepEqual(plan.services.core.cap_drop,['ALL']);
 assert.equal(plan.volumes.documents.external,true);assert.equal(plan.volumes.documents.name,'ramo-nessa-staging_driver_documents');assert.equal(plan.networks.default.external,true);
 assert.deepEqual(plan.services.core.networks.default.aliases,['core','ramo-nessa-staging-core-1']);
});
test('rollback preserves current environment exactly, including payout state',()=>{
 const {resolved,container}=fixture(),plan=servicePlan(resolved,'core',container,'current:tag');
 assert.deepEqual(plan.services.core.environment,resolved.services.core.environment);assert.equal(plan.services.core.environment.ASAAS_PAYOUTS_ENABLED,undefined);
});
test('refuses source/runtime drift, changed volumes, writable credentials or an already armed provider',()=>{
 const {resolved,container,image}=fixture();const altered=structuredClone(container);altered.Config.Env.push('OTHER_FEATURE=live');assert.throws(()=>assertEnvironmentMatches(resolved.services.core,altered,image));
 assert.throws(()=>environmentMap(['A=one','A=two']));
 const badMount=structuredClone(container);badMount.Mounts[1].RW=true;assert.throws(()=>servicePlan(resolved,'core',badMount,'candidate'));
 for(const changes of [{ASAAS_PAYOUTS_ENABLED:'true'},{DRIVER_PAYOUT_PROVIDER_NAME:'mercado-pago-payouts'},{DRIVER_PAYOUT_PROVIDER_URL:'https://old.invalid'}]){const config=structuredClone(resolved);Object.assign(config.services.core.environment,changes);assert.throws(()=>servicePlan(config,'core',container,'candidate',{disabledAsaas:true}));}
 assert.throws(()=>changesForAsaas({MERCADO_PAGO_MODE:'test'},{MERCADO_PAGO_MODE:'production',ASAAS_PAYOUTS_ENABLED:'false',DRIVER_PAYOUT_PROVIDER_NAME:'asaas'}));
});
test('all literal dollars are escaped when resolved config becomes another Compose input',()=>{
 const input={services:{core:{environment:{PASSWORD:'$token-${SECRET}-$1-$$'},command:['sh','-c','echo "$RUNTIME"']}}};
 assert.equal(escapeCompose(input).services.core.environment.PASSWORD,'$$token-$${SECRET}-$$1-$$$$');
 assert.equal(escapeCompose(input).services.core.command[2],'echo "$$RUNTIME"');assert.equal(input.services.core.environment.PASSWORD,'$token-${SECRET}-$1-$$');
});

test('serialized Compose environment is decoded only for comparison with the actual container',()=>{
 const raw={SECRET:'$abc-${VALUE}-$1-$$'},serialized=escapeCompose(raw);
 assert.deepEqual(composeEnvironmentToRuntime(serialized),raw);
});
