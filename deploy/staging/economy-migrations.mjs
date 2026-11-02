// Runs inside the current Core with its own private database configuration.
// Adds schema only. Never resets data, balances, payments, policies or documents.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const expected=[{"filename": "099_driver_navigation_budget.sql", "checksum": "eb591ff37ca9790cbac46685aca24f1a1a47ff6f28488ba09b28f69550c30101"}];
if(!Array.isArray(payload.migrations)||payload.migrations.length!==expected.length)throw Error('ECONOMY_MIGRATION_SOURCE');
for(let n=0;n<expected.length;n++){
 const actual=payload.migrations[n],reviewed=expected[n];
 if(actual.filename!==reviewed.filename||actual.checksum!==reviewed.checksum||createHash('sha256').update(actual.sql).digest('hex')!==reviewed.checksum)throw Error('ECONOMY_MIGRATION_SOURCE');
}
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const names=new Set(expected.map(m=>m.filename));
 if(JSON.stringify(applied.filter(m=>!names.has(m.filename)))!==JSON.stringify(payload.baselineMigrations))throw Error('ECONOMY_DATABASE_HISTORY_CHANGED');
 const added=[];
 for(const migration of payload.migrations){
  const current=applied.find(m=>m.filename===migration.filename);
  if(current&&current.checksum!==migration.checksum)throw Error('ECONOMY_MIGRATION_CHANGED');
  if(!current){await c.query(migration.sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[migration.filename,migration.checksum]);added.push(migration.filename);}
 }
 for(const table of ['ride_occurrence_policy','ride_occurrences','ride_occurrence_penalties','ride_cash_receipts','ride_boarding_history']){
  if((await c.query('SELECT to_regclass($1) name',['public.'+table])).rows[0].name!==table)throw Error('ECONOMY_MIGRATION_TABLE');
 }
 const policy=(await c.query('SELECT enabled FROM ride_boarding_policy WHERE singleton=true')).rows[0];
 if(policy?.enabled!==false)throw Error('ECONOMY_BOARDING_MUST_REMAIN_DISABLED');
 const flags=(await c.query('SELECT enabled,bonus_enabled FROM ride_occurrence_policy WHERE singleton=true')).rows[0];
 if(flags?.enabled!==false||flags?.bonus_enabled!==false)throw Error('ECONOMY_FEATURES_MUST_REMAIN_DISABLED');
 for(const name of ['rides_boarding_snapshot','rides_activity_event','rides_occurrence_terms','rides_boarding_continuation','rides_occurrence_completion']){
  if((await c.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.rides'::regclass AND tgname=$1 AND NOT tgisinternal AND tgenabled='O'",[name])).rows[0].n!==1)throw Error('ECONOMY_SNAPSHOT_TRIGGER');
 }
 if((await c.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.ledger_transactions'::regclass AND tgname='ledger_occurrence_bonus' AND NOT tgisinternal AND tgenabled='O'")).rows[0].n!==1)throw Error('ECONOMY_LEDGER_TRIGGER');
 const labels=(await c.query("SELECT column_name,data_type,character_maximum_length,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='rides' AND column_name IN ('pickup_label','dropoff_label') ORDER BY column_name")).rows;
 if(labels.length!==2||labels.some(r=>r.data_type!=='character varying'||r.character_maximum_length!==240||r.is_nullable!=='YES'||r.column_default!==null))throw Error('ECONOMY_LABEL_SCHEMA');
 const navigation=(await c.query('SELECT enabled FROM driver_navigation_policy WHERE singleton=true')).rows;
 if(navigation.length!==1||navigation[0].enabled!==false)throw Error('ECONOMY_MUST_REMAIN_DISABLED');
 await c.query('COMMIT');console.log(JSON.stringify({applied:added,navigationEconomyEnabled:false,boardingEnabled:false,existingRidesPreserved:true,existingSupportPreserved:true}));
}catch(e){await c.query('ROLLBACK');console.error('ECONOMY_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}

