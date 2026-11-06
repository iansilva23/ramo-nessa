// Runs only inside a disposable Core container sharing an offline PostgreSQL namespace.
import assert from 'node:assert/strict';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
import {PostgresFinanceRepository} from '/app/dist/src/payments/repositories/postgres-finance-repository.js';
const url=new URL(process.env.DATABASE_URL??'https://invalid');
if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='5432'||url.pathname!=='/ramo_asaas_restore')throw Error('Banco descartável obrigatório.');
const pool=createPostgresPool(url.toString()),mode=process.argv[2];
try {
 const finance=new PostgresFinanceRepository(pool);
 if(mode==='fingerprint'){
  const tables=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const report={};
  for(const {tablename} of tables.rows){
   if(['schema_migrations','driver_payout_settings','asaas_driver_transfer_attempts','asaas_driver_transfer_events'].includes(tablename))continue;
   const name='"'+tablename.replaceAll('"','""')+'"';
   const r=await pool.query(`SELECT count(*)::text AS rows, coalesce(sum(('x'||substr(md5(row_to_json(t)::text),1,16))::bit(64)::bigint::numeric),0)::text AS digest_a, coalesce(sum(('x'||substr(md5(row_to_json(t)::text),17,16))::bit(64)::bigint::numeric),0)::text AS digest_b FROM public.${name} t`);
   report[tablename]=r.rows[0];
  }
  assert.ok(Object.keys(report).length>0);console.log(JSON.stringify(report));
 }else if(mode==='defaults'){
  const s=await finance.getDriverPayoutSettings();assert.equal(s.mode,'manual');assert.equal(s.automaticEnabled,false);assert.equal(s.anticipationMinimumCents,8000);assert.equal(s.anticipationFeeCents,1000);console.log('DEFAULTS_OK');
 }else if(mode==='set-custom'){
  await finance.setDriverPayoutAutomaticEnabled({mode:'manual',automaticEnabled:false,anticipationMinimumCents:12345,anticipationFeeCents:678});console.log('CUSTOM_SAVED');
 }else if(mode==='custom'){
  const s=await finance.getDriverPayoutSettings();assert.equal(s.anticipationMinimumCents,12345);assert.equal(s.anticipationFeeCents,678);assert.equal(s.mode,'manual');console.log('CUSTOM_OK');
 }else if(mode==='old-reader'){
  const s=await finance.getDriverPayoutSettings();assert.equal(s.mode,'manual');assert.equal(s.automaticEnabled,false);console.log('OLD_READER_OK');
 }else throw Error('Modo de prova inválido.');
}finally{await pool.end();}
