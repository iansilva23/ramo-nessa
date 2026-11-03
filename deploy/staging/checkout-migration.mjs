// Runs inside the old Core using its existing private database configuration.
// Only the hash-pinned additive column is applied; old financial data is never restored.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const filename='088_ride_payment_window.sql';
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const current=applied.find(r=>r.filename===filename),previous=applied.filter(r=>r.filename!==filename);
 if(JSON.stringify(previous)!==JSON.stringify(payload.baselineMigrations))throw Error('CHECKOUT_DATABASE_HISTORY_CHANGED');
 const checksum=hash(payload.sql);
 if(checksum!==payload.checksum||current&&current.checksum!==checksum)throw Error('CHECKOUT_MIGRATION_CHANGED');
 if(!current){
  await c.query(payload.sql);
  await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);
 }
 const column=(await c.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='rides' AND column_name='payment_expires_at'")).rows;
 if(column.length!==1||column[0].data_type!=='timestamp with time zone'||column[0].is_nullable!=='YES'||column[0].column_default!==null)throw Error('CHECKOUT_MIGRATION_COLUMN');
 await c.query('COMMIT');console.log(JSON.stringify({applied:!current,additiveColumnRetainedOnRollback:true}));
}catch(e){await c.query('ROLLBACK');console.error('CHECKOUT_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}
