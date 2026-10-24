// Pinned additive migration; no provider calls, resets or financial restoration.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const pinned={
 '091_manual_ride_cancellations.sql':'e0078d1e6501462c66618f6c9f828b4a1616508a435c3ce45c61d170b8936298',
 '092_manual_cancellation_switch.sql':'00ce12935a9c9410dd77eeabdf9973c65433c88c32d859729c77b2a7d433cade',
};
if(JSON.stringify(payload.migrations?.map(m=>m.filename))!==JSON.stringify(Object.keys(pinned)))throw Error('IDENTITY_MIGRATION_SOURCE');
for(const m of payload.migrations)if(createHash('sha256').update(m.sql).digest('hex')!==pinned[m.filename]||m.checksum!==pinned[m.filename])throw Error('IDENTITY_MIGRATION_SOURCE');
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const rows=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const previous=rows.filter(r=>!(r.filename in pinned));
 if(JSON.stringify(previous)!==JSON.stringify(payload.baselineMigrations))throw Error('IDENTITY_DATABASE_HISTORY_CHANGED');
 const applied=[];
 for(const m of payload.migrations){
  const current=rows.find(r=>r.filename===m.filename);
  if(current&&current.checksum!==m.checksum)throw Error('IDENTITY_MIGRATION_CHANGED');
  if(!current){await c.query(m.sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[m.filename,m.checksum]);applied.push(m.filename);}
 }
 for(const table of ['ride_cancellation_policy','ride_cancellation_terms','ride_manual_cancellations','ride_manual_cancellation_audit']){
  const r=await c.query('SELECT to_regclass($1)::text AS name',['public.'+table]);if(r.rows[0]?.name!==table)throw Error('IDENTITY_MIGRATION_TABLE');
 }
 const column=(await c.query("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='rides' AND column_name='manual_refund'")).rows[0];
 if(column?.data_type!=='boolean'||column?.is_nullable!=='NO')throw Error('IDENTITY_MANUAL_REFUND_COLUMN');
 const activation=(await c.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='ride_cancellation_policy' AND column_name='system_enabled'")).rows[0];
 if(activation?.data_type!=='boolean'||activation?.is_nullable!=='NO'||activation?.column_default!=='false')throw Error('IDENTITY_DEFAULT_DISABLED_COLUMN');
 const triggers=(await c.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('snapshot_ride_cancellation_terms','remember_ride_driver_acceptance','protect_manually_cancelled_ride')")).rows;
 if(triggers.length!==3)throw Error('IDENTITY_MIGRATION_TRIGGERS');
 const missing=(await c.query("SELECT count(*)::int AS count FROM rides r LEFT JOIN ride_cancellation_terms t ON t.ride_id=r.id WHERE t.ride_id IS NULL")).rows[0];
 if(missing?.count!==0)throw Error('IDENTITY_MISSING_TERMS');
 await c.query('COMMIT');console.log(JSON.stringify({applied,additiveSchemaRetainedOnRollback:true}));
}catch(e){await c.query('ROLLBACK');console.error('IDENTITY_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}
