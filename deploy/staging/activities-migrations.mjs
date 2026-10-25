// Runs inside the current Core with its own private database configuration.
// Adds schema only. Never resets data, balances, payments, policies or documents.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const expected=[
 {filename:'094_ride_boarding_recovery.sql',checksum:'9b2579f40aabf2ed9b71c2ce83fe964d9d6ae5f8710c3c295a0491f200e37b8c'},
 {filename:'095_ride_activity_support.sql',checksum:'314d46d150953d3e95a2f5696436d25bc17edf1068031b9317e3a7bc5c0212e6'},
];
if(!Array.isArray(payload.migrations)||payload.migrations.length!==expected.length)throw Error('ACTIVITIES_MIGRATION_SOURCE');
for(let n=0;n<expected.length;n++){
 const actual=payload.migrations[n],reviewed=expected[n];
 if(actual.filename!==reviewed.filename||actual.checksum!==reviewed.checksum||createHash('sha256').update(actual.sql).digest('hex')!==reviewed.checksum)throw Error('ACTIVITIES_MIGRATION_SOURCE');
}
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const names=new Set(expected.map(m=>m.filename));
 if(JSON.stringify(applied.filter(m=>!names.has(m.filename)))!==JSON.stringify(payload.baselineMigrations))throw Error('ACTIVITIES_DATABASE_HISTORY_CHANGED');
 const added=[];
 for(const migration of payload.migrations){
  const current=applied.find(m=>m.filename===migration.filename);
  if(current&&current.checksum!==migration.checksum)throw Error('ACTIVITIES_MIGRATION_CHANGED');
  if(!current){await c.query(migration.sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[migration.filename,migration.checksum]);added.push(migration.filename);}
 }
 for(const table of ['ride_boarding_policy','ride_boarding_codes','ride_boarding_audit','ride_checkout_recovery','driver_document_expiry_notices','ride_activity_events']){
  if((await c.query('SELECT to_regclass($1) name',['public.'+table])).rows[0].name!==table)throw Error('ACTIVITIES_MIGRATION_TABLE');
 }
 const policy=(await c.query('SELECT enabled FROM ride_boarding_policy WHERE singleton=true')).rows[0];
 if(policy?.enabled!==false)throw Error('ACTIVITIES_BOARDING_MUST_REMAIN_DISABLED');
 const field=(await c.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_documents' AND column_name='validity_controlled'")).rows[0];
 if(field?.data_type!=='boolean'||field.is_nullable!=='NO'||field.column_default!=='false')throw Error('ACTIVITIES_DOCUMENT_VALIDITY_COLUMN');
 for(const name of ['rides_boarding_snapshot','rides_activity_event']){
  const count=(await c.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.rides'::regclass AND tgname=$1 AND NOT tgisinternal AND tgenabled='O'",[name])).rows[0].n;
  if(count!==1)throw Error('ACTIVITIES_SNAPSHOT_TRIGGER');
 }
 const columns=(await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_support_tickets' AND column_name IN ('ride_id','ride_context')")).rows;
 if(columns.length!==2)throw Error('ACTIVITIES_SUPPORT_COLUMNS');
 await c.query('COMMIT');console.log(JSON.stringify({applied:added,boardingEnabled:false,existingRidesPreserved:true,existingSupportPreserved:true}));
}catch(e){await c.query('ROLLBACK');console.error('ACTIVITIES_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}
