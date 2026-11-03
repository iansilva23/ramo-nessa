import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
if(new URL(process.env.DATABASE_URL).hostname!=='test-pg')throw Error('Disposable database required');
const pool=createPostgresPool(process.env.DATABASE_URL);
try{
 await pool.query('CREATE TABLE schema_migrations(filename text PRIMARY KEY,checksum text,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of (await readdir('/release/core/test-migrations')).filter(n=>n!=='101_driver_password_login.sql').sort()){
  const sql=await readFile('/release/core/test-migrations/'+name,'utf8');
  await pool.query(sql);
  await pool.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);
 }
}finally{await pool.end();}
