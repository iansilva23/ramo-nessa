import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mapPreparationArguments,assertMapProviders,mapWebSource} from './prepare-web-map-update.mjs';

test('preparation accepts only an explicit ZIP and digest for the reviewed source',()=>{
  assert.match(mapWebSource,/^[a-f0-9]{40}$/);
  assert.deepEqual(mapPreparationArguments(['/tmp/maps.zip','a'.repeat(64)]),{archive:'/tmp/maps.zip',archiveSha256:'a'.repeat(64)});
  for(const args of [[],['maps.zip','a'.repeat(64)],['/tmp/maps.zip','bad'],['/tmp/maps.tar','a'.repeat(64)],['/tmp/maps.zip','a'.repeat(64),'--activate']])assert.throws(()=>mapPreparationArguments(args));
});
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'map-provider-contract-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const old=join(root,'old'),next=join(root,'next'),key='AIza'+'x'.repeat(35);
  for(const base of [old,next])for(const role of ['passenger','driver']){
    mkdirSync(join(base,role),{recursive:true});
    writeFileSync(join(base,role,'index.html'),'<script src="https://maps.googleapis.com/maps/api/js?key='+key+'"></script>');
    writeFileSync(join(base,role,'ramo_push_config.js'),'// fixture\nself.ramoPushConfig = '+JSON.stringify({apiKey:'fixture',appId:role,projectId:'ramo-nessa',messagingSenderId:'fixture',vapidKey:'fixture'})+';\n');
  }
  return {old,next,key};
}
test('preserves both public provider configurations without network calls',t=>{const f=fixture(t);assert.doesNotThrow(()=>assertMapProviders(f.old,f.next));});
test('refuses a Maps key change and never prints provider values',t=>{
  const f=fixture(t);writeFileSync(join(f.next,'passenger','index.html'),'<script src="https://maps.googleapis.com/maps/api/js?key=AIza'+'y'.repeat(35)+'"></script>');
  assert.throws(()=>assertMapProviders(f.old,f.next),error=>!error.message.includes(f.key)&&error.message.includes('diverge'));
});
test('refuses swapped passenger/driver Firebase configuration',t=>{
  const f=fixture(t);writeFileSync(join(f.next,'driver','ramo_push_config.js'),'// fixture\nself.ramoPushConfig = '+JSON.stringify({apiKey:'fixture',appId:'passenger',projectId:'ramo-nessa',messagingSenderId:'fixture',vapidKey:'fixture'})+';\n');
  assert.throws(()=>assertMapProviders(f.old,f.next));
});
