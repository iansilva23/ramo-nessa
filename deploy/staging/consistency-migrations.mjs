// Runs inside the current Core with its own private database configuration.
// Adds schema only. Never resets data, balances, payments, policies or documents.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const expected=[{"filename":"096_ride_cancellation_identity.sql","checksum":"a628055da767036c3e29ad1798c5cca884c1ff22e44f8943ff39719fcc8b3c23"},{"filename":"097_ride_occurrences.sql","checksum":"b46eb4aa822cfa0d1e1ba9715d647482dbac05773d14c1747e7c21c058783266"}];
if(!Array.isArray(payload.migrations)||payload.migrations.length!==expected.length)throw Error('CONSISTENCY_MIGRATION_SOURCE');
for(let n=0;n<expected.length;n++){
 const actual=payload.migrations[n],reviewed=expected[n];
 if(actual.filename!==reviewed.filename||actual.checksum!==reviewed.checksum||createHash('sha256').update(actual.sql).digest('hex')!==reviewed.checksum)throw Error('CONSISTENCY_MIGRATION_SOURCE');
}
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const names=new Set(expected.map(m=>m.filename));
 if(JSON.stringify(applied.filter(m=>!names.has(m.filename)))!==JSON.stringify(payload.baselineMigrations))throw Error('CONSISTENCY_DATABASE_HISTORY_CHANGED');
 const added=[];
 for(const migration of payload.migrations){
  const current=applied.find(m=>m.filename===migration.filename);
  if(current&&current.checksum!==migration.checksum)throw Error('CONSISTENCY_MIGRATION_CHANGED');
  if(!current){await c.query(migration.sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[migration.filename,migration.checksum]);added.push(migration.filename);}
 }
 for(const table of ['ride_occurrence_policy','ride_occurrences','ride_occurrence_penalties','ride_cash_receipts','ride_boarding_history']){
  if((await c.query('SELECT to_regclass($1) name',['public.'+table])).rows[0].name!==table)throw Error('CONSISTENCY_MIGRATION_TABLE');
 }
 const policy=(await c.query('SELECT enabled FROM ride_boarding_policy WHERE singleton=true')).rows[0];
 if(policy?.enabled!==false)throw Error('CONSISTENCY_BOARDING_MUST_REMAIN_DISABLED');
 const flags=(await c.query('SELECT enabled,bonus_enabled FROM ride_occurrence_policy WHERE singleton=true')).rows[0];
 if(flags?.enabled!==false||flags?.bonus_enabled!==false)throw Error('CONSISTENCY_FEATURES_MUST_REMAIN_DISABLED');
 for(const name of ['rides_boarding_snapshot','rides_activity_event','rides_occurrence_terms','rides_boarding_continuation','rides_occurrence_completion']){
  if((await c.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.rides'::regclass AND tgname=$1 AND NOT tgisinternal AND tgenabled='O'",[name])).rows[0].n!==1)throw Error('CONSISTENCY_SNAPSHOT_TRIGGER');
 }
 if((await c.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.ledger_transactions'::regclass AND tgname='ledger_occurrence_bonus' AND NOT tgisinternal AND tgenabled='O'")).rows[0].n!==1)throw Error('CONSISTENCY_LEDGER_TRIGGER');
 await c.query('COMMIT');console.log(JSON.stringify({applied:added,boardingEnabled:false,existingRidesPreserved:true,existingSupportPreserved:true}));
}catch(e){await c.query('ROLLBACK');console.error('CONSISTENCY_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}

