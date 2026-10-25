import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect,inspectionSql,databaseInspection} from './inspect-ride-consistency.mjs';
test('diagnostics uses only inspect and read-only database exec; never prints credentials or PINs',()=>{
 const calls=[];inspect((program,args,options)=>{
  calls.push({program,args,options});return {status:0,stdout:'{}'};
 });
 assert.equal(calls.length,4);
 assert.ok(calls.every(c=>c.program==='docker'&&['inspect','exec'].includes(c.args[0])));
 assert.match(databaseInspection,/REPEATABLE READ READ ONLY/);
 assert.match(databaseInspection,/ROLLBACK/);
 assert.doesNotMatch(inspectionSql,/\b(UPDATE|DELETE|INSERT|ALTER|DROP)\b/i);
 assert.doesNotMatch(inspectionSql,/code|payload|token|full_name|latitude|longitude/);
 assert.match(inspectionSql,/LIMIT 30/);
});
test('diagnostics stops if expected container is unavailable',()=>{
 let count=0;assert.throws(()=>inspect(()=>{count++;return {status:1,stdout:''};}));assert.equal(count,1);
});
