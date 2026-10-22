import assert from 'node:assert/strict';
import test from 'node:test';
import {assertGuideGatewayDelta} from './local-guide-web-contract.mjs';
import {prepareGuide,activateGuide} from './local-guide-web-update.mjs';
test('only immutable gateway image and readonly Web source can change',()=>{
 const before={services:{gateway:{image:'old',environment:{TOKEN:'literal-$-value'},ports:['443:443'],volumes:[{target:'/srv/web',type:'bind',read_only:true,source:'/old'}]}}};
 const next=structuredClone(before);next.services.gateway.image='new';next.services.gateway.volumes[0].source='/new';assert.doesNotThrow(()=>assertGuideGatewayDelta(before,next,'new','/new'));
 next.services.gateway.environment.TOKEN='changed';assert.throws(()=>assertGuideGatewayDelta(before,next,'new','/new'));
});
test('invalid prepare/activate arguments are rejected before filesystem or Docker access',async()=>{
 for(const args of [[],['relative.zip','a'.repeat(64)],['/tmp/a.zip','bad']])await assert.rejects(prepareGuide(args));
 await assert.rejects(activateGuide(['/other','a'.repeat(64)]));
});
