// Executed inside the active Core using its unchanged private DB configuration.
// Add only the pinned receipt table. A rollback retains it and never restores data.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const filename='090_passenger_ratings.sql';
const expectedChecksum='97db636a1fa96b0334a36d68a4b27cf2a9093a6d2363c6512d6a4a94d4a5bc46';
const checksum=createHash('sha256').update(payload.sql).digest('hex');
if(checksum!==expectedChecksum||payload.checksum!==expectedChecksum)throw Error('RATING_MIGRATION_SOURCE');
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const current=applied.find(r=>r.filename===filename),previous=applied.filter(r=>r.filename!==filename);
 if(JSON.stringify(previous)!==JSON.stringify(payload.baselineMigrations))throw Error('RATING_DATABASE_HISTORY_CHANGED');
 if(current&&current.checksum!==checksum)throw Error('RATING_MIGRATION_CHANGED');
 if(!current){
  await c.query(payload.sql);
  await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);
 }
 const columns=(await c.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='passenger_ratings' ORDER BY ordinal_position")).rows;
 const expected=[['ride_id','uuid','NO'],['driver_id','text','NO'],['passenger_id','text','NO'],['stars','integer','NO'],['reasons','ARRAY','NO'],['comment','text','YES'],['created_at','timestamp with time zone','NO']].map(([column_name,data_type,is_nullable])=>({column_name,data_type,is_nullable}));
 if(JSON.stringify(columns)!==JSON.stringify(expected))throw Error('RATING_MIGRATION_TABLE');
 const constraints=(await c.query("SELECT contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.passenger_ratings'::regclass ORDER BY contype")).rows;
 if(!constraints.some(r=>r.contype==='p'&&r.definition==='PRIMARY KEY (ride_id)')||
    !constraints.some(r=>r.contype==='f'&&r.definition==='FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE')||
    !['stars','reasons','comment'].every(name=>constraints.some(r=>r.contype==='c'&&r.definition.includes(name))))throw Error('RATING_MIGRATION_CONSTRAINTS');
 await c.query('COMMIT');console.log(JSON.stringify({applied:!current,additiveTableRetainedOnRollback:true}));
}catch(e){await c.query('ROLLBACK');console.error('RATING_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}
