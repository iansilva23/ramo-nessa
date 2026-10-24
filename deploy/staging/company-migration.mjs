// One additive table. No changes to ledger, balances, providers or existing data.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const p=JSON.parse(readFileSync(0,'utf8')),filename='093_company_management.sql',checksum='b6a84449eefe0ab1bfc178df82d58afc1c368b0f45156011803f41d7ae37de2a';
if(p.migrations?.length!==1||p.migrations[0].filename!==filename||p.migrations[0].checksum!==checksum||createHash('sha256').update(p.migrations[0].sql).digest('hex')!==checksum)throw Error('COMPANY_MIGRATION_SOURCE');
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s'");await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const rows=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows,current=rows.find(r=>r.filename===filename);
 if(JSON.stringify(rows.filter(r=>r.filename!==filename))!==JSON.stringify(p.baselineMigrations))throw Error('COMPANY_DATABASE_HISTORY_CHANGED');
 if(current&&current.checksum!==checksum)throw Error('COMPANY_MIGRATION_CHANGED');
 if(!current){await c.query(p.migrations[0].sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);}
 const table=(await c.query("SELECT to_regclass('public.company_management_records')::text name")).rows[0];if(table?.name!=='company_management_records')throw Error('COMPANY_MIGRATION_TABLE');
 const count=(await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='company_management_records' AND column_name IN ('id','kind','amount_cents','occurred_on','description','reference_id','attachment','actor','created_at')")).rows[0];if(count.n!==9)throw Error('COMPANY_MIGRATION_COLUMNS');
 await c.query('COMMIT');console.log(JSON.stringify({applied:!current,additiveSchemaRetainedOnRollback:true}));
}catch(e){await c.query('ROLLBACK');console.error('COMPANY_MIGRATION_FAILED: '+e.message);process.exitCode=1;}finally{c.release();await pool.end();}
