import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {assertRecoveryGatewayDelta} from './recovery-web-contract.mjs';
import {prepareRecovery,activateRecovery} from './recovery-web-update.mjs';
test('only the reviewed Gateway image and readonly Web mount may change',()=>{
 const before={services:{gateway:{image:'old',environment:{TOKEN:'literal-$-value'},ports:['443:443'],volumes:[{target:'/srv/web',type:'bind',read_only:true,source:'/old'}]}}};
 const next=structuredClone(before);next.services.gateway.image='overlay';next.services.gateway.volumes[0].source='/new';
 assert.doesNotThrow(()=>assertRecoveryGatewayDelta(before,next,'overlay','/new'));
 next.services.gateway.environment.TOKEN='changed';assert.throws(()=>assertRecoveryGatewayDelta(before,next,'overlay','/new'));
});
test('invalid arguments are rejected before filesystem or Docker access',async()=>{
 for(const args of [[],['relative.zip','a'.repeat(64)],['/tmp/a.zip','bad']])await assert.rejects(prepareRecovery(args));
 await assert.rejects(activateRecovery(['/other','a'.repeat(64)]));
});
test('migration stays off and adopted recovery state prevents incompatible Core rollback',async()=>{
 const installer=await readFile(new URL('./recovery-web-update.mjs',import.meta.url),'utf8');
 const migration=await readFile(new URL('./recovery-migration.mjs',import.meta.url),'utf8');
 assert.match(installer,/h\.recoveryState\(\)!==adoptionBaseline/);
 assert.match(migration,/BEGIN/);assert.match(migration,/RECOVERY_POLICY_ALREADY_ADOPTED/);
 assert.doesNotMatch(installer,/pg_restore|UPDATE ride_boarding_policy SET enabled=true/);
});
