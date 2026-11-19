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

test('homologation reports independent occurrence controls and aggregate counts without requiring migration 097',()=>{
 assert.match(databaseInspection,/to_regclass/);
 assert.match(databaseInspection,/table_absent/);
 assert.match(databaseInspection,/SELECT enabled,bonus_enabled,bonus_cents,revision FROM ride_occurrence_policy/);
 assert.match(databaseInspection,/SELECT kind,status,count/);
 assert.doesNotMatch(databaseInspection,/SELECT \*|driver_statement|passenger_statement|injured_driver_id|actor/);
 assert.doesNotMatch(databaseInspection,/\b(UPDATE|DELETE|INSERT|ALTER|DROP|COMMIT)\b/i);
});
