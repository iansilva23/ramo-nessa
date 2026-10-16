import test from 'node:test';
import assert from 'node:assert/strict';
import { webCompose,coreDelta,requireIsolated,target } from './web-activation-contract.mjs';

test('Compose insertion preserves all existing bytes and refuses duplicate mounts',()=>{
  const original='before\n      - ./Caddyfile:/etc/caddy/Caddyfile:ro\nafter\n';
  const next=webCompose(original);
  assert.equal(next.replace('      - ./web-dist:/srv/web:ro\n',''),original);
  assert.throws(()=>webCompose(next));
  assert.throws(()=>webCompose('unknown'));
});
test('Core delta accepts only additions/modifications in exact Core prefix',()=>{
  const migration='A\tbackend/core/migrations/085_web_push_preferences.sql\n';
  assert.equal(coreDelta(migration+'M\tbackend/core/src/server.ts\n').length,2);
  for(const unexpected of ['D\tbackend/core/src/server.ts','R100\tbackend/core/a\tbackend/core/b','M\tdeploy/staging/.env','A\tbackend/core/../secret'])assert.throws(()=>coreDelta(migration+unexpected));
  assert.throws(()=>coreDelta('M\tbackend/core/src/server.ts'));
});
test('activation requires every isolated test evidence and exact target',()=>{
  const report={target,liveMigrationApplied:false};
  const keys=['passed','migration085Isolated','migrationIdempotent','originalPushRecordsPreserved','nativeOldRepository','nativeAndWebNewRepository','oldMigrationRunner','servicesUnchanged','disposableDatabaseRemoved'];
  for(const key of keys)report[key]=true;
  requireIsolated(report);
  for(const key of keys)assert.throws(()=>requireIsolated({...report,[key]:false}));
  assert.throws(()=>requireIsolated({...report,target:'another'}));
  assert.throws(()=>requireIsolated({...report,liveMigrationApplied:true}));
});
