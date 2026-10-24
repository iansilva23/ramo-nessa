// Runs inside the active Core; uses its existing private database configuration.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const filename='094_ride_boarding_recovery.sql';
const checksum=createHash('sha256').update(payload.sql).digest('hex');
if(checksum!=='9b2579f40aabf2ed9b71c2ce83fe964d9d6ae5f8710c3c295a0491f200e37b8c'||payload.checksum!==checksum)throw Error('RECOVERY_MIGRATION_SOURCE');
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const current=applied.find(r=>r.filename===filename),previous=applied.filter(r=>r.filename!==filename);
 if(JSON.stringify(previous)!==JSON.stringify(payload.baselineMigrations))throw Error('RECOVERY_DATABASE_HISTORY_CHANGED');
 if(current&&current.checksum!==checksum)throw Error('RECOVERY_MIGRATION_CHANGED');
 if(!current){await c.query(payload.sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);}
 for(const table of ['ride_boarding_policy','ride_boarding_codes','ride_boarding_audit','ride_checkout_recovery','driver_document_expiry_notices']){
  if((await c.query('SELECT to_regclass($1) name',['public.'+table])).rows[0].name!==table)throw Error('RECOVERY_MIGRATION_TABLE');
 }
 const field=(await c.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_documents' AND column_name='validity_controlled'")).rows[0];
 if(field?.data_type!=='boolean'||field.is_nullable!=='NO'||field.column_default!=='false')throw Error('RECOVERY_DOCUMENT_VALIDITY_COLUMN');
 const policy=(await c.query('SELECT enabled,revision,categories FROM ride_boarding_policy WHERE singleton=true')).rows[0];
 if(policy?.enabled!==false||policy.revision!==0||['moto','car','buggy','delivery','comfort_black'].some(k=>policy.categories[k]!==true))throw Error('RECOVERY_POLICY_ALREADY_ADOPTED');
 for(const table of ['ride_boarding_codes','ride_boarding_audit','ride_checkout_recovery','driver_document_expiry_notices']){
  if(Number((await c.query('SELECT count(*) n FROM '+table)).rows[0].n)!==0)throw Error('RECOVERY_STATE_ALREADY_ADOPTED');
 }
 const trigger=(await c.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.rides'::regclass AND tgname='rides_boarding_snapshot' AND NOT tgisinternal AND tgenabled='O'")).rows[0].n;
 if(trigger!==1)throw Error('RECOVERY_SNAPSHOT_TRIGGER');
 await c.query('COMMIT');console.log(JSON.stringify({applied:!current,boardingEnabled:false,existingRidesPreserved:true}));
}catch(e){await c.query('ROLLBACK');console.error('RECOVERY_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}
