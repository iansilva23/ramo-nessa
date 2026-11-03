// Only migration 101. Never backfill checksums or execute older migrations here.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const pool=createPostgresPool(process.env.DATABASE_URL),client=await pool.connect();
const filename='101_driver_password_login.sql',sql=await readFile('/release/core/'+filename,'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
try{
 await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='8s'");
 await client.query("SET LOCAL statement_timeout='30s'");
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ramo-nessa-schema-migrations']);
 const prior=await client.query('SELECT checksum FROM schema_migrations WHERE filename=$1',[filename]);
 if(prior.rowCount){if(prior.rows[0].checksum!==checksum)throw Error('Conflicting migration');}
 else{
  const tables=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",[['driver_login_credentials','driver_password_reset_requests']]);
  if(tables.rowCount)throw Error('Untracked credential tables');
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[filename,checksum]);
 }
 await client.query('COMMIT');console.log(JSON.stringify({migration:filename,checksum,status:prior.rowCount?'already-applied':'applied',previousMigrationsChanged:false}));
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
