// Executed inside the active Core using its unchanged private DB configuration.
// Add only the pinned receipt table. A rollback retains it and never restores data.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const filename='089_ride_chat_reads.sql';
const expectedChecksum='de94989d76ff5336d61ef982af92241fe0a9251f0471524128f062a0c7e73182';
const checksum=createHash('sha256').update(payload.sql).digest('hex');
if(checksum!==expectedChecksum||payload.checksum!==expectedChecksum)throw Error('CHAT_MIGRATION_SOURCE');
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const current=applied.find(r=>r.filename===filename),previous=applied.filter(r=>r.filename!==filename);
 if(JSON.stringify(previous)!==JSON.stringify(payload.baselineMigrations))throw Error('CHAT_DATABASE_HISTORY_CHANGED');
 if(current&&current.checksum!==checksum)throw Error('CHAT_MIGRATION_CHANGED');
 if(!current){
  await c.query(payload.sql);
  await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);
 }
 const columns=(await c.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='ride_chat_reads' ORDER BY ordinal_position")).rows;
 const expected=[['message_id','uuid'],['reader_type','text'],['reader_id','text'],['read_at','timestamp with time zone']].map(([column_name,data_type])=>({column_name,data_type,is_nullable:'NO'}));
 if(JSON.stringify(columns)!==JSON.stringify(expected))throw Error('CHAT_MIGRATION_TABLE');
 const constraints=(await c.query("SELECT contype,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.ride_chat_reads'::regclass ORDER BY contype")).rows;
 if(!constraints.some(r=>r.contype==='p'&&r.definition==='PRIMARY KEY (message_id, reader_type, reader_id)')||
    !constraints.some(r=>r.contype==='f'&&r.definition==='FOREIGN KEY (message_id) REFERENCES ride_chat_messages(id) ON DELETE CASCADE')||
    !constraints.some(r=>r.contype==='c'&&r.definition.includes('passenger')&&r.definition.includes('driver')))throw Error('CHAT_MIGRATION_CONSTRAINTS');
 await c.query('COMMIT');console.log(JSON.stringify({applied:!current,additiveTableRetainedOnRollback:true}));
}catch(e){await c.query('ROLLBACK');console.error('CHAT_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}
