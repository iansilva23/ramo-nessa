import test from 'node:test';
import assert from 'node:assert/strict';
import {gatewayWebPlan,assertGatewayWebDelta,publicPushConfig,browserMapsKey} from './asaas-driver-web-contract.mjs';
const fixture=()=>({name:'ramo-nessa-staging',services:{gateway:{image:'sha256:'+'a'.repeat(64),environment:{SECRET:'literal-$$x-\${KEEP}'},volumes:[{type:'bind',source:'/before/bundles',target:'/srv/web',read_only:true},{type:'bind',source:'/before/Caddyfile',target:'/etc/caddy/Caddyfile',read_only:true},{type:'volume',source:'data',target:'/data'}],networks:{default:{aliases:['gateway']}}}},networks:{default:{name:'existing',external:true}},volumes:{data:{name:'existing-data',external:true}}});
test('gateway plan changes only static Web bind and leaves image, environment, Caddy and volumes untouched',()=>{
 const before=fixture(),original=structuredClone(before),after=gatewayWebPlan(before,'/next/bundles');
 assert.deepEqual(before,original);assert.equal(after.services.gateway.volumes[0].source,'/next/bundles');assertGatewayWebDelta(before,after,'/next/bundles');
 assert.deepEqual(after.services.gateway.environment,before.services.gateway.environment);
 assert.deepEqual(after.services.gateway.volumes.slice(1),before.services.gateway.volumes.slice(1));
});
test('extra service, mutable image, writable or ambiguous mount and unsafe path are refused',()=>{
 const bad=fixture();bad.services.core={image:'unchanged'};assert.throws(()=>gatewayWebPlan(bad));
 const mutable=fixture();mutable.services.gateway.image='latest';assert.throws(()=>gatewayWebPlan(mutable));
 const writable=fixture();writable.services.gateway.volumes[0].read_only=false;assert.throws(()=>gatewayWebPlan(writable));
 const duplicate=fixture();duplicate.services.gateway.volumes.push({...duplicate.services.gateway.volumes[0]});assert.throws(()=>gatewayWebPlan(duplicate));
 assert.throws(()=>gatewayWebPlan(fixture(),'/next/\${SECRET}'));
});
test('delta refuses new environment, database credentials, Caddy or image changes',()=>{
 for(const edit of [
  m=>{m.services.gateway.environment.EXTRA='x';},
  m=>{m.services.gateway.volumes[1].source='/other/Caddyfile';},
  m=>{m.services.gateway.image='sha256:'+'b'.repeat(64);},
  m=>{m.networks.default.name='other';},
 ]){
  const before=fixture(),after=gatewayWebPlan(before,'/next/bundles');edit(after);assert.throws(()=>assertGatewayWebDelta(before,after,'/next/bundles'));
 }
});
test('public browser configuration is read structurally without exposing it',()=>{
 const value={apiKey:'public-key',appId:'public-app',projectId:'ramo-nessa',messagingSenderId:'123',vapidKey:'public-vapid'};
 const source='// public only\nself.ramoPushConfig = '+JSON.stringify(value)+';\n';
 assert.deepEqual(publicPushConfig(source),value);
 const key='AIza'+'a'.repeat(35);assert.equal(browserMapsKey('<script src="https://maps.googleapis.com/maps/api/js?key='+key+'"></script>'),key);
 assert.throws(()=>publicPushConfig('self.config={}'));
 assert.throws(()=>browserMapsKey('<script src="https://maps.googleapis.com/maps/api/js?key=WEB_KEY_NOT_CONFIGURED_FOR_CI"></script>'));
});
