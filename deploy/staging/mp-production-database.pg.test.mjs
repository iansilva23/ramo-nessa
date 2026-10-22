import assert from 'node:assert/strict';import test from 'node:test';import {createRequire} from 'node:module';
import {contextInsideTransaction,maintainTestFinance,archiveTestBalances} from './mp-production-database.mjs';
import {inventoryDigest} from './mp-production-preflight-contract.mjs';import {seedConfirmedTests} from './mp-production-fixture.mjs';
const allowed=process.env.GITHUB_ACTIONS==='true'&&process.env.CI_ACTIVATION_DATABASE_URL==='postgresql://mp_ci:synthetic-only@127.0.0.1:5432/mp_activation_ci';
test('actual migrated PostgreSQL: archive, idempotency, reversals, concurrency and transaction rollback',{skip:!allowed},async t=>{
  const require=createRequire(new URL('../../backend/core/package.json',import.meta.url)),{Pool}=require('pg');
  const pool=new Pool({connectionString:process.env.CI_ACTIVATION_DATABASE_URL}),client=await pool.connect();
  const ref='mp-production-cutover:'+'a'.repeat(64),publicKey='APP_USR-fixture-new-public-key';
  async function setup(){
    await client.query('TRUNCATE ledger_entries,ledger_transactions,payments,wallet_topups,driver_payouts,rides CASCADE');
    await seedConfirmedTests(client);await client.query("UPDATE operational_settings SET mercado_pago_public_key='APP_USR-fixture-original-public-key' WHERE id=1");
    const before=await contextInsideTransaction(client),saved={};return {before,saved,receipts:{load:k=>saved[k]??null,save:(k,v)=>{if(saved[k])throw Error('duplicate');saved[k]=structuredClone(v);}},input:{mode:'apply',reference:ref,publicKey,before}};
  }
  try{
    await t.test('archives tests without deleting history, updates only intended fields and reverses with new ledger entries',async()=>{
      const f=await setup();assert.equal((await maintainTestFinance(client,f.input,f.receipts)).ridesClosed,5);
      assert.deepEqual(await maintainTestFinance(client,f.input,f.receipts),{alreadyApplied:true});
      await maintainTestFinance(client,{...f.input,mode:'verify'},f.receipts);
      const after=f.saved.apply.after;
      for(const name of ['wallet_topups','driver_payouts','schema_migrations','payment_policy_settings','driver_payout_settings'])assert.deepEqual(after[name],f.before[name]);
      assert.equal(after.payments.length,6);assert.equal(after.rides.length,9);assert.equal(after.rides.filter(r=>r.state==='CANCELLED_BY_ADMIN').length,5);
      assert.equal(after.operational_settings[0].mercado_pago_public_key,publicKey);
      const protectedOp=({...r})=>{delete r.mercado_pago_public_key;delete r.updated_at;return r;};assert.deepEqual(protectedOp(after.operational_settings[0]),protectedOp(f.before.operational_settings[0]));
      const accountBalance=(rows,key)=>rows.filter(e=>e.account_key===key).reduce((a,e)=>a+(e.direction==='credit'?e.amount_cents:-e.amount_cents),0);
      assert.equal(accountBalance(after.ledger_entries,'passenger:fixture-passenger:wallet'),0);assert.equal(accountBalance(after.ledger_entries,'platform:revenue'),0);
      assert.equal((await maintainTestFinance(client,{...f.input,mode:'reverse'},f.receipts)).reversed,true);
      assert.deepEqual(await maintainTestFinance(client,{...f.input,mode:'reverse'},f.receipts),{alreadyReversed:true});
      const reversed=await contextInsideTransaction(client);assert.deepEqual(reversed.payments,f.before.payments);assert.deepEqual(reversed.rides,f.before.rides);assert.deepEqual(reversed.operational_settings,f.before.operational_settings);
      assert.equal(accountBalance(reversed.ledger_entries,'passenger:fixture-passenger:wallet'),15700);assert.ok(reversed.ledger_entries.length>after.ledger_entries.length);
    });
    await t.test('rejects stale baseline, altered totals and post-cutover concurrent writes',async()=>{
      const f=await setup();await client.query('UPDATE operational_settings SET driver_offer_ttl_seconds=40 WHERE id=1');
      await assert.rejects(()=>maintainTestFinance(client,f.input,f.receipts),/MP_DATABASE_CHANGED/);
      const g=await setup();await maintainTestFinance(client,g.input,g.receipts);await client.query('UPDATE operational_settings SET driver_offer_ttl_seconds=41 WHERE id=1');
      await assert.rejects(()=>maintainTestFinance(client,{...g.input,mode:'reverse'},g.receipts),/MP_REVERSAL_REFUSED_CONCURRENT_CHANGE/);
      const current=await contextInsideTransaction(client);assert.equal(current.operational_settings[0].driver_offer_ttl_seconds,41);
    });
    await t.test('filesystem receipt failure rolls back every SQL change',async()=>{
      const f=await setup();await assert.rejects(()=>maintainTestFinance(client,f.input,{load:()=>null,save:()=>{throw Error('synthetic disk full');}}),/synthetic disk full/);
      assert.equal(inventoryDigest(await contextInsideTransaction(client)),inventoryDigest(f.before));
    });
    await t.test('concurrent attempts cannot archive twice',async()=>{
      const f=await setup(),other=await pool.connect();try{
        const results=await Promise.allSettled([maintainTestFinance(client,f.input,f.receipts),maintainTestFinance(other,f.input,f.receipts)]);
        assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal((await client.query('SELECT count(*)::int AS count FROM ledger_transactions WHERE reference_key=$1',[ref])).rows[0].count,1);
        assert.equal((await client.query('SELECT count(*)::int AS count FROM ledger_entries')).rows[0].count,f.before.ledger_entries.length+archiveTestBalances(f.before.ledger_entries).length);
      }finally{other.release();}
    });
  }finally{client.release();await pool.end();}
});
