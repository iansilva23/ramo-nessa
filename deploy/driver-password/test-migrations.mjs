import {readFile,readdir} from 'node:fs/promises';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
if(new URL(process.env.DATABASE_URL).hostname!=='test-pg')throw Error('Disposable database required');
const pool=createPostgresPool(process.env.DATABASE_URL);
try{for(const name of (await readdir('/release/core/test-migrations')).sort())await pool.query(await readFile('/release/core/test-migrations/'+name,'utf8'));}finally{await pool.end();}
