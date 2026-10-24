import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMigrations, argumentsFor } from './prepare-regions-pricing.mjs';
test('requires pinned candidate and private verified backup reference',()=>{
  assert.deepEqual(argumentsFor(['a'.repeat(40),'/var/backups/ramo-nessa-regions/checkpoint','b'.repeat(64)]).revision,'a'.repeat(40));
  for(const args of [[],['main','/tmp/backup','b'.repeat(64)],['a'.repeat(40),'/var/backups/ramo-nessa-regions/../other','b'.repeat(64)],['a'.repeat(40),'/var/backups/ramo-nessa-regions/checkpoint','bad']])assert.throws(()=>argumentsFor(args));
});
test('requires exact migration set and every checksum; never silently applies a pending migration',()=>{
  assert.doesNotThrow(()=>checkMigrations([{filename:'one.sql',checksum:'a'}],{'one.sql':'a'}));
  for(const [rows,files] of [[[],{'one.sql':'a'}],[[{filename:'one.sql',checksum:'b'}],{'one.sql':'a'}],[[{filename:'unknown.sql',checksum:'a'}],{'one.sql':'a'}],[[{filename:'one.sql',checksum:'a'},{filename:'one.sql',checksum:'a'}],{'one.sql':'a','two.sql':'a'}]])assert.throws(()=>checkMigrations(rows,files));
});
