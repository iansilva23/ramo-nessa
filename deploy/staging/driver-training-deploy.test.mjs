import test from 'node:test';
import assert from 'node:assert/strict';
import { assertKnownEditor, assertGatewayImage, prepareGatewayConfig } from './publish-driver-training.mjs';
const live='e9eb5d1904f0e5c90867004da96438e0d07d3315935a04c6706769e61675dc8b';
const gateway='sha256:b305f39894ae35a548baeadc81cc03236fa150f821d56fdcf2b6e19247f8e991';
test('accepts the two reviewed editors but rejects local/container drift and unknown code',()=>{
  assert.doesNotThrow(()=>assertKnownEditor(live,live));
  const original='6f8a10f6449c784610c524d67632c85632a05bff147ca1d302969c67555ea013';
  assert.doesNotThrow(()=>assertKnownEditor(original,original));
  assert.throws(()=>assertKnownEditor(original,live));assert.throws(()=>assertKnownEditor('a'.repeat(64),'a'.repeat(64)));
});
test('only the standard tag and observed cash-update image are accepted',()=>{
  assert.doesNotThrow(()=>assertGatewayImage(gateway));assert.doesNotThrow(()=>assertGatewayImage('ramo-nessa-admin-gateway:staging'));assert.throws(()=>assertGatewayImage('sha256:'+'c'.repeat(64)));
});
test('pinned gateway replacement preserves the active cash release and every other service/setting',()=>{
  const config={name:'ramo-nessa-staging',services:{gateway:{image:gateway,ports:[{target:443,published:'443'}],volumes:[{type:'bind',source:'/opt/cash-release/passenger',target:'/srv/passenger',read_only:true}],environment:{APP_DOMAIN:'app.example.test',LITERAL_EXAMPLE:'keep$$value${unchanged}'},networks:{default:null},healthcheck:{test:['CMD','true']}},core:{image:'core:active',environment:{PLACEHOLDER:'test-only'}},postgres:{image:'postgres:16'}},networks:{default:{name:'ramo-nessa-staging_default'}},volumes:{data:{name:'existing-volume'}}};
  const initial=structuredClone(config),id='sha256:'+'a'.repeat(64),result=prepareGatewayConfig(config,gateway,id);
  assert.equal(result.services.gateway.image,id);const restored=structuredClone(result);restored.services.gateway.image=gateway;assert.deepEqual(restored,initial);assert.deepEqual(config,initial);
  assert.throws(()=>prepareGatewayConfig(config,'another-image',id));assert.throws(()=>prepareGatewayConfig(config,gateway,'mutable:tag'));assert.throws(()=>prepareGatewayConfig({},gateway,id));
});
