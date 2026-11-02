import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,mkdir,readFile,writeFile,copyFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadPublicWebConfiguration,validatePublicWebConfiguration } from './public_web_configuration.mjs';
const original=await loadPublicWebConfiguration();
const key='AIza'+'Z'.repeat(35); // Provider-invalid fixture, never sent to Google.
test('approved configuration uses two distinct Web registrations in the selected project',()=>{
 const result=validatePublicWebConfiguration(original);
 assert.notEqual(result.apps.passenger.appId,result.apps.driver.appId);
 assert.equal(result.apps.passenger.projectId,result.expectedProject);
 assert.equal(result.apps.driver.messagingSenderId,result.apps.passenger.messagingSenderId);
 result.apps.passenger.apiKey='changed';assert.notEqual(result.apps.passenger.apiKey,original.apps.passenger.apiKey);
});
test('private/additional fields, native appIds, mismatch, invalid origin or VAPID are rejected without echo',()=>{
 const invalid=[];
 const a=structuredClone(original);a.apps.passenger.private_key='private-fixture-never-log';invalid.push(a);
 const b=structuredClone(original);b.apps.driver.appId=b.apps.passenger.appId;invalid.push(b);
 const c=structuredClone(original);c.apps.driver.appId='1:938646689425:android:fixture';invalid.push(c);
 const d=structuredClone(original);d.apps.driver.projectId='another-project';invalid.push(d);
 for(const origin of ['http://app.example.com','https://u:p@example.com','https://example.com/path','https://example.com/'])invalid.push({...original,expectedOrigin:origin});
 const e=structuredClone(original);e.apps.passenger.vapidKey='A'.repeat(87);invalid.push(e);
 const f=structuredClone(original);f.apps.driver.messagingSenderId='123';invalid.push(f);
 invalid.push({...original,extra:'private-fixture-never-log'});
 for(const value of invalid)assert.throws(()=>validatePublicWebConfiguration(value),error=>!error.message.includes('private-fixture-never-log'));
});
async function workspace(t){
 const root=await mkdtemp(join(tmpdir(),'ramo-configured-web-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const dir of ['scripts/web','config/web','packages/ramo_push/web','apps/passenger/web','apps/driver/web'])await mkdir(join(root,dir),{recursive:true});
 for(const file of ['public_web_configuration.mjs','maps_web_config.mjs','prepare_configured_web.mjs','prepare_web_push.mjs','prepare_web_maps.mjs','write_homologation_manifest.mjs','verify_web_homologation.mjs','verify_web_bundle.mjs'])await copyFile(new URL('./'+file,import.meta.url),join(root,'scripts/web',file));
 await writeFile(join(root,'config/web/firebase.public.json'),JSON.stringify(original));
 for(const file of ['ramo_web_push.js','ramo_push_worker.js'])await writeFile(join(root,'packages/ramo_push/web',file),'// Non-executable structural fixture\n');
 for(const role of ['passenger','driver']){
  await writeFile(join(root,'apps',role,'web/index.html'),'<script src="https://maps.googleapis.com/maps/api/js?key=__RAMO_GOOGLE_MAPS_WEB_KEY__"></script><script src="ramo_web_push.js"></script>');
  await writeFile(join(root,'apps',role,'web/ramo_push_config.js'),'// Public fixture\nself.ramoPushConfig = null;\n');
 }
 return root;
}
test('strict preparation fails on missing Maps before changing either app',async t=>{
 const root=await workspace(t),path=join(root,'apps/passenger/web/index.html'),before=await readFile(path,'utf8');
 const result=spawnSync(process.execPath,[join(root,'scripts/web/prepare_configured_web.mjs'),'--role=passenger'],{env:{...process.env,RAMO_GOOGLE_MAPS_WEB_API_KEY:''},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.equal(await readFile(path,'utf8'),before);assert.ok((await readFile(join(root,'apps/passenger/web/ramo_push_config.js'),'utf8')).includes('null;'));
});
test('strict preparation writes role-specific public config and Maps for both apps, no private settings',async t=>{
 const root=await workspace(t);
 for(const role of ['passenger','driver']){
  const result=spawnSync(process.execPath,[join(root,'scripts/web/prepare_configured_web.mjs'),'--role='+role],{env:{...process.env,RAMO_GOOGLE_MAPS_WEB_API_KEY:key},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const config=await readFile(join(root,'apps',role,'web/ramo_push_config.js'),'utf8');
  assert.ok(config.includes(original.apps[role].appId));assert.ok(!config.includes('private_key'));
  assert.ok((await readFile(join(root,'apps',role,'web/index.html'),'utf8')).includes(key));
  assert.ok(!result.stdout.includes(key)&&!result.stdout.includes(original.apps[role].apiKey));
 }
});
test('pair manifest verifies approved roles and hashes every bundle file without authorizing providers',async t=>{
 const root=await workspace(t);
 for(const role of ['passenger','driver']){
  const dir=join(root,'apps',role,'web');await mkdir(join(dir,'icons'));await mkdir(join(dir,'assets'));
  const route=role==='passenger'?'/passageiro/':'/motorista/';
  await writeFile(join(dir,'index.html'),'<base href="'+route+'"><script src="ramo_push_config.js"></script><script src="ramo_web_push.js"></script><script src="https://maps.googleapis.com/maps/api/js?key='+key+'"></script>'+(role==='passenger'?'<script type="module" src="ramo_card_fields.js"></script>':''));
  await writeFile(join(dir,'ramo_push_config.js'),'// Public fixture\nself.ramoPushConfig = '+JSON.stringify(original.apps[role])+';\n');
  await writeFile(join(dir,'manifest.json'),JSON.stringify({display:'standalone',start_url:'.',scope:'.',icons:[192,512].map(size=>({src:'icons/Icon-'+size+'.png',sizes:size+'x'+size}))}));
  for(const file of ['flutter_bootstrap.js','main.dart.js','ramo_web_push.js','ramo_push_worker.js',...(role==='passenger'?['ramo_card_fields.js']:[])])await writeFile(join(dir,file),'// Synthetic structural fixture, not Flutter\n');
  for(const size of [192,512]){const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(size,16);png.writeUInt32BE(size,20);await writeFile(join(dir,'icons/Icon-'+size+'.png'),png);}
 }
 const output=join(root,'release.json'),args=[join(root,'scripts/web/write_homologation_manifest.mjs'),'--passenger='+join(root,'apps/passenger/web'),'--driver='+join(root,'apps/driver/web'),'--commit='+'a'.repeat(40),'--output='+output];
 const result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const manifest=JSON.parse(await readFile(output,'utf8'));assert.equal(manifest.providerHomologation,false);assert.equal(manifest.commit,'a'.repeat(40));
 const entry=manifest.roles.passenger.files.find(f=>f.path==='main.dart.js');assert.equal(entry.sha256,createHash('sha256').update(await readFile(join(root,'apps/passenger/web/main.dart.js'))).digest('hex'));
 await rm(output);await writeFile(join(root,'apps/passenger/web/ramo_push_config.js'),'// Public fixture\nself.ramoPushConfig = '+JSON.stringify({...original.apps.passenger,apiKey:key})+';\n');
 const mismatch=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(mismatch.status,0);assert.ok(mismatch.stderr.includes('configuração pública aprovada'));assert.ok(!mismatch.stderr.includes(key));
});
