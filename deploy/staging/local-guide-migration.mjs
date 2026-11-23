// Executed by node inside the OLD running Core: uses its private DB configuration.
// Input contains only public migration source/checksums, never credentials.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const guide=applied.find(r=>r.filename==='087_local_guide.sql'),previous=applied.filter(r=>r.filename!=='087_local_guide.sql');
 if(JSON.stringify(previous)!==JSON.stringify(payload.baselineMigrations))throw Error('GUIDE_DATABASE_HISTORY_CHANGED');
 const checksum=hash(payload.sql);if(checksum!==payload.checksum||guide&&guide.checksum!==checksum)throw Error('GUIDE_MIGRATION_CHANGED');
 const digestTours=async()=> (await c.query("SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY slug)::text,'[]')) AS digest FROM agency_tours t")).rows[0].digest;
 const before=await digestTours();
 if(!guide){
  await c.query(payload.sql);
  await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',['087_local_guide.sql',checksum]);
 }
 if(before!==await digestTours())throw Error('GUIDE_LEGACY_TOURS_CHANGED');
 await c.query('COMMIT');console.log(JSON.stringify({applied:!guide,legacyToursPreserved:true,additiveTablesRetainedOnRollback:true}));
}catch(e){await c.query('ROLLBACK');console.error('GUIDE_MIGRATION_FAILED');process.exitCode=1;}
finally{c.release();await pool.end();}
