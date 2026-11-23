import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createPostgresPool} from '../src/db/postgres.js';
test('PostgreSQL preserves cancellation authorship through refunds and rejects stale checkout writes',
 {skip:process.env.RAMO_BOARDING_POSTGRES!=='true'},async()=>{
 const root=createPostgresPool(process.env.DATABASE_URL!);
 const schema='consistency_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+',public');
 const pool=createPostgresPool(url.toString());
 try{
  await root.query('CREATE SCHEMA '+schema);
  await pool.query('CREATE TABLE rides(id uuid PRIMARY KEY,state text)');
  const sql=await readFile(new URL('../migrations/096_ride_cancellation_identity.sql',import.meta.url),'utf8');
  await pool.query(sql);await pool.query(sql);
  const id=randomUUID();await pool.query("INSERT INTO rides(id,state) VALUES($1,'AWAITING_PAYMENT')",[id]);
  await pool.query("UPDATE rides SET state='CANCELLED_BY_DRIVER' WHERE id=$1",[id]);
  for(const state of ['CREATED','AWAITING_PAYMENT','PAID','PAYMENT_FAILED']){
   await assert.rejects(pool.query('UPDATE rides SET state=$2 WHERE id=$1',[id,state]),/nao pode retornar ao checkout/);
  }
  await pool.query("UPDATE rides SET state='REFUND_PENDING' WHERE id=$1",[id]);
  await pool.query("UPDATE rides SET state='REFUNDED' WHERE id=$1",[id]);
  const row=(await pool.query('SELECT state,cancellation_state FROM rides WHERE id=$1',[id])).rows[0];
  assert.deepEqual(row,{state:'REFUNDED',cancellation_state:'CANCELLED_BY_DRIVER'});
 }finally{await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();}
});
