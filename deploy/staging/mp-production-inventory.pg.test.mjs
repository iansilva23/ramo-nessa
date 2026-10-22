import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readProductionInventory,summarizeProductionInventory,inventoryDigest} from './mp-production-preflight-contract.mjs';
const allowed=process.env.GITHUB_ACTIONS==='true'&&process.env.CI_TEST_DATABASE_URL==='postgresql://mp_ci:synthetic-only@127.0.0.1:5432/mp_cutover_ci';
test('PostgreSQL inventory is repeatable-read/read-only, complete, stable, and rolls back on failure',{skip:!allowed},async()=>{
  const require=createRequire(new URL('../../backend/core/package.json',import.meta.url));const {Pool}=require('pg');
  const pool=new Pool({connectionString:process.env.CI_TEST_DATABASE_URL}),client=await pool.connect();
  try{
    for(const name of ['payments','wallet_topups','driver_payouts','rides','ledger_transactions','ledger_entries'])await client.query(`CREATE TABLE ${name} (id text PRIMARY KEY, status text, state text, amount_cents integer, account_key text, direction text)`);
    await client.query("INSERT INTO ledger_entries VALUES ('1',NULL,NULL,16400,'passenger:fixture:wallet','credit'),('2',NULL,NULL,700,'passenger:fixture:wallet','debit')");
    await client.query("INSERT INTO payments (id,status,amount_cents) VALUES ('fixture-p','created',737)");
    const states=[];
    const wrapped={query:async(sql,args)=>{
      if(sql.startsWith('SELECT to_jsonb')){
        states.push((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only);
        assert.equal((await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation,'repeatable read');
      }return client.query(sql,args);
    }};
    const first=await readProductionInventory(wrapped),second=await readProductionInventory(client);
    assert.equal(inventoryDigest(first),inventoryDigest(second));assert.ok(states.length===6&&states.every(v=>v==='on'));
    assert.equal(summarizeProductionInventory(first).nonzeroLedgerAccounts['passenger:wallet'].totalCents,15700);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM payments')).rows[0].count,1);
    let reads=0;
    await assert.rejects(()=>readProductionInventory({query:async(sql,args)=>{
      if(sql.startsWith('SELECT to_jsonb')&&++reads===2)throw Error('fixture failure');return client.query(sql,args);
    }}),/fixture failure/);
    assert.equal((await client.query('SELECT 1 AS ready')).rows[0].ready,1);
  }finally{client.release();await pool.end();}
});
