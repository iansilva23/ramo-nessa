// Pinned additive migration; no provider calls, resets or financial restoration.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8')),filename='091_manual_ride_cancellations.sql';
const expectedChecksum='e0078d1e6501462c66618f6c9f828b4a1616508a435c3ce45c61d170b8936298';
const checksum=createHash('sha256').update(payload.sql).digest('hex');
if(checksum!==expectedChecksum||payload.checksum!==expectedChecksum)throw Error('IDENTITY_MIGRATION_SOURCE');
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const rows=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const current=rows.find(r=>r.filename===filename),previous=rows.filter(r=>r.filename!==filename);
 if(JSON.stringify(previous)!==JSON.stringify(payload.baselineMigrations))throw Error('IDENTITY_DATABASE_HISTORY_CHANGED');
 if(current&&current.checksum!==checksum)throw Error('IDENTITY_MIGRATION_CHANGED');
 if(!current){await c.query(payload.sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);}
 for(const table of ['ride_cancellation_policy','ride_cancellation_terms','ride_manual_cancellations','ride_manual_cancellation_audit']){
  const r=await c.query('SELECT to_regclass($1)::text AS name',['public.'+table]);if(r.rows[0]?.name!==table)throw Error('IDENTITY_MIGRATION_TABLE');
 }
 const column=(await c.query("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='rides' AND column_name='manual_refund'")).rows[0];
 if(column?.data_type!=='boolean'||column?.is_nullable!=='NO')throw Error('IDENTITY_MANUAL_REFUND_COLUMN');
 const triggers=(await c.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('snapshot_ride_cancellation_terms','remember_ride_driver_acceptance','protect_manually_cancelled_ride')")).rows;
 if(triggers.length!==3)throw Error('IDENTITY_MIGRATION_TRIGGERS');
 const missing=(await c.query("SELECT count(*)::int AS count FROM rides r LEFT JOIN ride_cancellation_terms t ON t.ride_id=r.id WHERE t.ride_id IS NULL")).rows[0];
 if(missing?.count!==0)throw Error('IDENTITY_MISSING_TERMS');
 await c.query('COMMIT');console.log(JSON.stringify({applied:!current,additiveSchemaRetainedOnRollback:true}));
}catch(e){await c.query('ROLLBACK');console.error('IDENTITY_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}
