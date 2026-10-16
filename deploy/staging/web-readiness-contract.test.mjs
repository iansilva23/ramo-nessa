import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMigrationHistory,requireSnapshot,sha256 } from './web-readiness-contract.mjs';
const a=sha256('applied'),b=sha256('pending');
test('migration comparison matches every applied checksum and returns only new SQL',()=>{
 assert.deepEqual(compareMigrationHistory([{filename:'001.sql',checksum:a}],new Map([['001.sql',a],['085_web_push_preferences.sql',b]])),{applied:1,matched:1,pending:[{filename:'085_web_push_preferences.sql',checksum:b}]});
});
test('unknown, duplicate, absent and mismatched migration checksums block rollout',()=>{
 const expected=new Map([['001.sql',a]]);
 for(const rows of [[],[{filename:'other.sql',checksum:a}],[{filename:'001.sql',checksum:a},{filename:'001.sql',checksum:a}],[{filename:'001.sql',checksum:null}],[{filename:'001.sql',checksum:b}]])assert.throws(()=>compareMigrationHistory(rows,expected));
});
test('snapshot checks block changed config, code, image or health',()=>{
 const expected={head:'head',caddySha256:a,images:{core:'image'}};
 const actual={head:'head',caddySha256:a,containers:{core:{image:'image',health:'healthy'}}};
 assert.doesNotThrow(()=>requireSnapshot(actual,expected));
 for(const change of [{head:'changed'},{caddySha256:b},{containers:{}},{containers:{core:{image:'other',health:'healthy'}}},{containers:{core:{image:'image',health:'unhealthy'}}}])assert.throws(()=>requireSnapshot({...actual,...change},expected));
});
