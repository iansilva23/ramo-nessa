import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mapPreparationArguments,assertMapProviders,mapWebSource,assertWebMapLockDelta,assertWebRouteLockUnchanged} from './prepare-web-map-update.mjs';

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

const lockBefore=`packages:
  google_maps_flutter_android:
    dependency: transitive
    version: "2.20.0"
  google_maps_flutter_web:
    dependency: transitive
    description:
      name: google_maps_flutter_web
      sha256: ec802303734d907dea71adfe8037233966837acb10c5282ebdbc65fe33787750
      url: "https://pub.dev"
    source: hosted
    version: "0.6.4"
  preserved_future_feature:
    version: "1.0.0"
`;
const lockAfter=lockBefore.replace('ec802303734d907dea71adfe8037233966837acb10c5282ebdbc65fe33787750','de408355e21b0da7da17962b86c338d320d9bc1c5eb94e72a2d021955bda5aaa').replace('version: "0.6.4"','version: "0.6.4+2"');
test('only the verified Web patch may change in either app lock',()=>assert.doesNotThrow(()=>assertWebMapLockDelta(lockBefore,lockAfter)));
test('rejects Android or future feature dependency changes alongside Web patch',()=>{
  assert.throws(()=>assertWebMapLockDelta(lockBefore,lockAfter.replace('2.20.0','2.21.0')));
  assert.throws(()=>assertWebMapLockDelta(lockBefore,lockAfter.replace('1.0.0','2.0.0')));
});
test('refuses wrong Web archive checksum or unreviewed source version',()=>{
  assert.throws(()=>assertWebMapLockDelta(lockBefore,lockAfter.replace('de408355','ffffffff')));
  assert.throws(()=>assertWebMapLockDelta(lockBefore.replace('0.6.4','0.6.3'),lockAfter));
});

test('lock final newline normalization does not weaken native dependency preservation',()=>{
  assert.doesNotThrow(()=>assertWebMapLockDelta(lockBefore,lockAfter+'\n'));
  assert.throws(()=>assertWebMapLockDelta(lockBefore,lockAfter.replace('2.20.0','2.21.0')+'\n'));
});

test('managed route update preserves every dependency byte including Web map patch',()=>{
  assert.doesNotThrow(()=>assertWebRouteLockUnchanged(lockAfter,lockAfter));
  assert.throws(()=>assertWebRouteLockUnchanged(lockAfter,lockBefore));
  assert.throws(()=>assertWebRouteLockUnchanged(lockAfter,lockAfter.replace('2.20.0','2.21.0')));
});
