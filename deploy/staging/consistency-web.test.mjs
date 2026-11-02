import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {assertConsistencyGatewayDelta} from './consistency-web-contract.mjs';
import {prepareConsistency,activateConsistency} from './consistency-web-update.mjs';
test('only the reviewed Gateway image and readonly Web mount may change',()=>{
 const before={services:{gateway:{image:'old',environment:{TOKEN:'literal-$-value'},ports:['443:443'],volumes:[{target:'/srv/web',type:'bind',read_only:true,source:'/old'}]}}};
 const next=structuredClone(before);next.services.gateway.image='overlay';next.services.gateway.volumes[0].source='/new';
 assert.doesNotThrow(()=>assertConsistencyGatewayDelta(before,next,'overlay','/new'));
 next.services.gateway.environment.TOKEN='changed';assert.throws(()=>assertConsistencyGatewayDelta(before,next,'overlay','/new'));
});
test('invalid arguments are rejected before filesystem or Docker access',async()=>{
 for(const args of [[],['relative.zip','a'.repeat(64)],['/tmp/a.zip','bad']])await assert.rejects(prepareConsistency(args));
 await assert.rejects(activateConsistency(['/other','a'.repeat(64)]));
});
test('migration stays off and adopted recovery state prevents incompatible Core rollback',async()=>{
 const installer=await readFile(new URL('./consistency-web-update.mjs',import.meta.url),'utf8');
 const migration=await readFile(new URL('./consistency-migrations.mjs',import.meta.url),'utf8');
 assert.match(installer,/h\.recoveryState\(\)!==adoptionBaseline/);
 assert.match(migration,/BEGIN/);assert.match(migration,/CONSISTENCY_BOARDING_MUST_REMAIN_DISABLED/);
 assert.doesNotMatch(installer,/pg_restore|UPDATE ride_boarding_policy SET enabled=true/);
});

