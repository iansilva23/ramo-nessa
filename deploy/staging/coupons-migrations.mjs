// Runs inside the current Core with its own private database configuration.
// Adds schema only. Never resets data, balances, payments, policies or documents.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const payload=JSON.parse(readFileSync(0,'utf8'));
const expected=[{"filename": "100_sponsored_coupon_presentation.sql", "checksum": "bd257526254245790f0ce52ba47dac65fd341662c4b10c441e3d798b5e2ed4ea"}];
if(!Array.isArray(payload.migrations)||payload.migrations.length!==expected.length)throw Error('ECONOMY_MIGRATION_SOURCE');
for(let n=0;n<expected.length;n++){
 const actual=payload.migrations[n],reviewed=expected[n];
 if(actual.filename!==reviewed.filename||actual.checksum!==reviewed.checksum||createHash('sha256').update(actual.sql).digest('hex')!==reviewed.checksum)throw Error('ECONOMY_MIGRATION_SOURCE');
}
const pool=createPostgresPool(process.env.DATABASE_URL),c=await pool.connect();
try{
 await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s'");
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
 const applied=(await c.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
 const names=new Set(expected.map(m=>m.filename));
 if(JSON.stringify(applied.filter(m=>!names.has(m.filename)))!==JSON.stringify(payload.baselineMigrations))throw Error('ECONOMY_DATABASE_HISTORY_CHANGED');
 const added=[];
 for(const migration of payload.migrations){
  const current=applied.find(m=>m.filename===migration.filename);
  if(current&&current.checksum!==migration.checksum)throw Error('ECONOMY_MIGRATION_CHANGED');
  if(!current){await c.query(migration.sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[migration.filename,migration.checksum]);added.push(migration.filename);}
 }
 if((await c.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='promotion_campaigns' AND column_name IN ('budget_cents','driver_presentation')")).rows[0].n!==2)throw Error('COUPONS_SCHEMA');
 await c.query('COMMIT');console.log(JSON.stringify({applied:added,existingCampaignsPreserved:true,existingPoliciesPreserved:true}));
}catch(e){await c.query('ROLLBACK');console.error('ECONOMY_MIGRATION_FAILED: '+e.message);process.exitCode=1;}
finally{c.release();await pool.end();}

