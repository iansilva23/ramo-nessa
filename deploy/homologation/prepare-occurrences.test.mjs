import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {buildPlan,prepare,project} from './prepare-occurrences.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('isolated plan reuses test stack, has no host interpolation, public ports or live image tags',async()=>{
 const a=await buildPlan(root),b=await buildPlan(root);assert.notEqual(a.compose,b.compose);assert.equal(a.project,project);
 assert.match(a.compose,/127\.0\.0\.1:18080:8080/);assert.doesNotMatch(a.compose,/\$\{|ramo-nessa-staging|:staging|ramo_test_postgres|external:|:80:80|:443:443/);
 assert.equal((a.compose.match(/^    mem_limit:/gm)||[]).length,6);assert.match(a.compose,/depends_on:\n      postgres:\n        condition: service_healthy/);
 assert.match(a.compose,/ALLOW_DEV_PAYMENT_GATEWAY: "false"/);assert.match(a.compose,/MERCADO_PAGO_ACCESS_TOKEN: ""/);assert.match(a.compose,/mem_limit: 512m/);
});
test('prepare writes private files and never overwrites an existing destination',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'ramo-plan-')),destination=join(temp,'ramo-homologacao-unit');try{
  const result=await prepare(destination,root);assert.equal(result.started,false);const original=await readFile(join(destination,'compose.yml'),'utf8');assert.equal((await stat(destination)).mode&0o777,0o700);assert.equal((await stat(join(destination,'compose.yml'))).mode&0o777,0o600);
  await assert.rejects(prepare(destination,root),{code:'EEXIST'});assert.equal(await readFile(join(destination,'compose.yml'),'utf8'),original);
  await assert.rejects(prepare(join(temp,'ramo-nessa-staging'),root));
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('simulator health override checks their own ports without credentials or changes to the active app',async()=>{
 const c=JSON.parse(await readFile(join(root,'deploy/homologation/runtime-health.json'),'utf8'));
 assert.deepEqual(Object.keys(c.services).sort(),['document-storage','google-maps-mock']);
 for(const [name,service] of Object.entries(c.services)){
  assert.deepEqual(Object.keys(service),['healthcheck']);
  const expression=service.healthcheck.test[3];
  assert.match(expression,new RegExp(name==='document-storage'?'8090':'8091'));
  assert.doesNotMatch(expression,/TOKEN|SECRET|PASSWORD|8080/);
 }
});
