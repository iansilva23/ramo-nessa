import assert from 'node:assert/strict';
import test from 'node:test';
import { geoStorageLevel, parseGeoStoragePolicy, InMemoryGeoStorageMaintenance } from '../src/places/geo-storage-maintenance.js';

test('validates storage policy and safe retention minimum',()=>{
 const valid={maxStorageMb:128,alertPercent:80,retentionDays:120,autoCleanupEnabled:false};
 assert.deepEqual(parseGeoStoragePolicy(valid),valid);
 for(const bad of [{...valid,maxStorageMb:0},{...valid,maxStorageMb:3000},
  {...valid,retentionDays:90},{...valid,alertPercent:99},{...valid,autoCleanupEnabled:'yes'}]){
  assert.throws(()=>parseGeoStoragePolicy(bad),/INVALID_POLICY/);
 }
});
test('thresholds distinguish warning, limit and normal capacity',()=>{
 const p={maxStorageMb:128,alertPercent:80,retentionDays:120,autoCleanupEnabled:false,lastCleanupAt:null};
 assert.equal(geoStorageLevel(15*1048576,p),'ok');
 assert.equal(geoStorageLevel(105*1048576,p),'warning');
 assert.equal(geoStorageLevel(128*1048576,p),'limit');
});
test('memory fallback remains nondestructive and opt-in',async()=>{
 const m=new InMemoryGeoStorageMaintenance();
 assert.equal((await m.report()).policy.autoCleanupEnabled,false);
 assert.deepEqual(await m.cleanup({dryRun:true}),{removed:0,eligible:0,dryRun:true});
 await m.updatePolicy({maxStorageMb:32,alertPercent:75,retentionDays:120,autoCleanupEnabled:false});
 assert.equal((await m.report()).policy.maxStorageMb,32);
});
