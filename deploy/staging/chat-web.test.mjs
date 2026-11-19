import assert from 'node:assert/strict';
import test from 'node:test';
import {assertChatGatewayDelta} from './chat-web-contract.mjs';
import {prepareChat,activateChat} from './chat-web-update.mjs';
test('only the readonly Web source changes; the gateway image and environment stay exact',()=>{
 const before={services:{gateway:{image:'old',environment:{TOKEN:'literal-$-value'},ports:['443:443'],volumes:[{target:'/srv/web',type:'bind',read_only:true,source:'/old'}]}}};
 const next=structuredClone(before);next.services.gateway.image='old';next.services.gateway.volumes[0].source='/new';assert.doesNotThrow(()=>assertChatGatewayDelta(before,next,'old','/new'));
 next.services.gateway.environment.TOKEN='changed';assert.throws(()=>assertChatGatewayDelta(before,next,'old','/new'));
});
test('invalid prepare/activate arguments are rejected before filesystem or Docker access',async()=>{
 for(const args of [[],['relative.zip','a'.repeat(64)],['/tmp/a.zip','bad']])await assert.rejects(prepareChat(args));
 await assert.rejects(activateChat(['/other','a'.repeat(64)]));
});
test('a replacement Gateway image is refused even when the Web mount is valid',()=>{
 const before={services:{gateway:{image:'old',volumes:[{target:'/srv/web',type:'bind',read_only:true,source:'/old'}]}}};
 const next=structuredClone(before);next.services.gateway.image='other';next.services.gateway.volumes[0].source='/new';
 assert.throws(()=>assertChatGatewayDelta(before,next,'other','/new'),/CHAT_GATEWAY_IMAGE_CHANGED/);
});
