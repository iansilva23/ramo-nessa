import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {Pool} from 'pg';
import {SelfAccountDeletion} from '../src/account-deletion/self-account-deletion.js';
import type {DeletablePrivateDocumentStorage} from '../src/drivers/driver-document-private-storage.js';

const enabled=Boolean(process.env.DATABASE_URL);
async function fixture(role:'driver'|'passenger'='passenger'){
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:6});
 const id=`self-${randomUUID()}`,identity=randomUUID(),session=randomUUID();
 await pool.query(`INSERT INTO auth_identities(id,subject_type,subject_id,phone_e164,email_normalized,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active',now(),now())`,[identity,role,id,'+5588'+String(Math.floor(Math.random()*900000000)+100000000),id+'@example.test']);
 await pool.query(`INSERT INTO auth_sessions(id,subject_id,subject_type,token_hash,created_at,expires_at)VALUES($1,$2,$3,$4,now(),now()+interval '1 hour')`,[session,id,role,randomUUID()]);
 if(role==='driver')await pool.query(`INSERT INTO driver_profiles(driver_id,full_name,status,created_at,updated_at)VALUES($1,'Motorista de teste','approved',now(),now())`,[id]);
 const store=new SelfAccountDeletion(pool);
 const cleanup=async()=>{
  await pool.query('DELETE FROM passenger_payment_customers WHERE passenger_id=$1',[id]);
  await pool.query('DELETE FROM self_account_deletions WHERE subject_id=$1',[id]);
  await pool.query('DELETE FROM data_subject_requests WHERE subject_id=$1',[id]);
  await pool.query('DELETE FROM ledger_entries WHERE account_key=$1',[`${role}:${id}:wallet`]);
  await pool.query('DELETE FROM auth_sessions WHERE subject_id=$1',[id]);
  await pool.query('DELETE FROM auth_identities WHERE subject_id=$1',[id]);
  await pool.query('DELETE FROM driver_payout_destinations WHERE driver_id=$1',[id]);
  await pool.query('DELETE FROM passenger_promotion_preferences WHERE passenger_id=$1',[id]);
  await pool.query('DELETE FROM driver_supply WHERE driver_id=$1',[id]);
  await pool.query('DELETE FROM driver_profiles WHERE driver_id=$1',[id]);
  await pool.end();
 };
 return {pool,id,identity,session,role,store,cleanup};
}
const noCard=async()=>{throw Error('No card call expected');};
test('self deletion requires confirmation, excludes only its subject and revokes sessions',{skip:!enabled},async()=>{
 const f=await fixture();const other=await fixture();
 try{
  await assert.rejects(f.store.start(f.role,f.id,false,true));
  assert.equal((await f.store.overview(f.role,f.id)).eligible,true);
  const job=await f.store.start(f.role,f.id,true,true);
  assert.deepEqual(job.sessions,[f.session]);
  assert.equal((await f.pool.query('SELECT 1 FROM auth_sessions WHERE id=$1',[f.session])).rowCount,0);
  await f.store.processPending(null,noCard);
  assert.equal((await f.store.receiptStatus(job.receipt)).status,'deleted');
  assert.equal((await f.pool.query('SELECT 1 FROM auth_identities WHERE id=$1',[f.identity])).rowCount,0);
  assert.equal((await f.pool.query('SELECT 1 FROM auth_identities WHERE id=$1',[other.identity])).rowCount,1);
  await assert.rejects(f.pool.query(`INSERT INTO auth_identities(id,subject_type,subject_id,phone_e164,status,created_at,updated_at)VALUES($1,'passenger',$2,'+5588999999911','active',now(),now())`,[randomUUID(),f.id]));
  await assert.rejects(f.store.receiptStatus('0'.repeat(64)));
 }finally{await f.cleanup();await other.cleanup();}
});
test('positive balance blocks self deletion and preserves every ledger entry',{skip:!enabled},async()=>{
 const f=await fixture();const transaction=randomUUID();
 try{
  await f.pool.query("INSERT INTO ledger_transactions(id,kind,reference_key)VALUES($1,'self-delete-test',$2)",[transaction,transaction]);
  await f.pool.query("INSERT INTO ledger_entries(transaction_id,account_key,direction,amount_cents)VALUES($1,$2,'credit',1234)",[transaction,`passenger:${f.id}:wallet`]);
  const overview=await f.store.overview('passenger',f.id);assert.equal(overview.eligible,false);assert.equal(overview.balanceCents,1234);
  await assert.rejects(f.store.start('passenger',f.id,true,true));
  assert.equal((await f.pool.query('SELECT 1 FROM auth_sessions WHERE id=$1',[f.session])).rowCount,1);
  assert.equal((await f.pool.query('SELECT amount_cents FROM ledger_entries WHERE transaction_id=$1',[transaction])).rows[0].amount_cents,1234);
 }finally{await f.cleanup();const pool=new Pool({connectionString:process.env.DATABASE_URL});await pool.query('DELETE FROM ledger_transactions WHERE id=$1',[transaction]);await pool.end();}
});
test('document cleanup failure remains pending and retry completes without losing references',{skip:!enabled},async()=>{
 const f=await fixture('driver');let attempts=0;
 const key=`drivers/${f.id}/driver_license/file.pdf`;
 try{
  await f.pool.query(`INSERT INTO driver_documents(id,driver_id,document_type,storage_key,content_sha256,mime_type,size_bytes,status,is_current,submitted_at,created_at,updated_at)VALUES($1,$2,'driver_license',$3,$4,'application/pdf',20,'pending',true,now(),now(),now())`,[randomUUID(),f.id,key,'a'.repeat(64)]);
  await assert.rejects(f.store.start('driver',f.id,true,false));
  await f.pool.query("INSERT INTO driver_supply(driver_id,vehicle_id,categories,seat_capacity,online,latitude,longitude,location_updated_at)VALUES($1,'vehicle-test',ARRAY['car'],4,false,1,2,now())",[f.id]);
  await f.pool.query("INSERT INTO driver_payout_destinations(driver_id,pix_key_type,pix_key)VALUES($1,'email',$2)",[f.id,f.id+'@example.test']);
  const job=await f.store.start('driver',f.id,true,true);
  await assert.rejects(f.pool.query("UPDATE driver_payout_destinations SET pix_key='late@example.test' WHERE driver_id=$1",[f.id]));
  const storage={delete:async(k:string)=>{assert.equal(k,key);attempts++;if(attempts===1)throw Error('temporary');}} as DeletablePrivateDocumentStorage;
  await f.store.processPending(storage,noCard);
  assert.equal((await f.store.receiptStatus(job.receipt)).status,'processing');
  assert.equal((await f.pool.query('SELECT storage_key FROM driver_documents WHERE driver_id=$1',[f.id])).rows[0].storage_key,key);
  await f.store.processPending(storage,noCard);
  assert.equal((await f.store.receiptStatus(job.receipt)).status,'deleted');assert.equal(attempts,2);
  const profile=(await f.pool.query('SELECT full_name,status FROM driver_profiles WHERE driver_id=$1',[f.id])).rows[0];assert.equal(profile.full_name,'Conta excluída');assert.equal(profile.status,'suspended');
  assert.equal((await f.pool.query('SELECT 1 FROM driver_payout_destinations WHERE driver_id=$1',[f.id])).rowCount,0);
  await assert.rejects(f.pool.query('UPDATE driver_supply SET latitude=42 WHERE driver_id=$1',[f.id]));
  assert.equal(Number((await f.pool.query('SELECT latitude FROM driver_supply WHERE driver_id=$1',[f.id])).rows[0].latitude),0);
  assert.equal((await f.pool.query('SELECT 1 FROM driver_documents WHERE driver_id=$1',[f.id])).rowCount,0);
 }finally{await f.cleanup();}
});
test('saved cards require the matching gateway and remote removal before completion',{skip:!enabled},async()=>{
 const f=await fixture();let calls=0;
 try{
  await f.pool.query('INSERT INTO passenger_payment_customers VALUES($1,$2,$3)',[f.id,'synthetic-scope','customer-test']);
  await f.pool.query(`INSERT INTO passenger_saved_cards(passenger_id,gateway_scope,card_id,last_four_digits,payment_method_id,payment_method_type)VALUES($1,'synthetic-scope','card-test','1234','visa','credit_card')`,[f.id]);
  await assert.rejects(f.store.start('passenger',f.id,true,true,'wrong-scope'));
  const job=await f.store.start('passenger',f.id,true,true,'synthetic-scope');
  await f.store.processPending(null,async card=>{assert.deepEqual(card,{scope:'synthetic-scope',customer:'customer-test',card:'card-test'});calls++;});
  assert.equal(calls,1);assert.equal((await f.store.receiptStatus(job.receipt)).status,'deleted');
  assert.equal((await f.pool.query('SELECT 1 FROM passenger_saved_cards WHERE passenger_id=$1',[f.id])).rowCount,0);
 }finally{await f.cleanup();}
});

test('a concurrent ledger write is serialized before the final deletion check',{skip:!enabled},async()=>{
 const f=await fixture();const transaction=randomUUID();const writer=await f.pool.connect();
 try{
  await writer.query('BEGIN');
  await writer.query("INSERT INTO ledger_transactions(id,kind,reference_key)VALUES($1,'self-delete-concurrent',$2)",[transaction,transaction]);
  await writer.query("INSERT INTO ledger_entries(transaction_id,account_key,direction,amount_cents)VALUES($1,$2,'credit',100)",[transaction,`passenger:${f.id}:wallet`]);
  const deletion=f.store.start('passenger',f.id,true,true);
  // The writer already holds a conflicting table lock. Commit before checking the result.
  await writer.query('COMMIT');
  await assert.rejects(deletion);
  assert.equal((await f.pool.query('SELECT status FROM auth_identities WHERE id=$1',[f.identity])).rows[0].status,'active');
 }finally{await writer.query('ROLLBACK');writer.release();await f.cleanup();const p=new Pool({connectionString:process.env.DATABASE_URL});await p.query('DELETE FROM ledger_transactions WHERE id=$1',[transaction]);await p.end();}
});
test('new operations and shared document references cannot escape closure guards',{skip:!enabled},async()=>{
 const f=await fixture('driver');const other=await fixture('driver');
 const key=`drivers/${f.id}/driver_license/shared.pdf`;
 try{
  for(const subject of [f.id,other.id])await f.pool.query(`INSERT INTO driver_documents(id,driver_id,document_type,storage_key,content_sha256,mime_type,size_bytes,status,is_current,submitted_at,created_at,updated_at)VALUES($1,$2,'driver_license',$3,$4,'application/pdf',20,'pending',true,now(),now(),now())`,[randomUUID(),subject,key,'b'.repeat(64)]);
  await assert.rejects(f.store.start('driver',f.id,true,true));
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM driver_documents WHERE storage_key=$1',[key])).rows[0].n,2);
  await f.pool.query('DELETE FROM driver_documents WHERE driver_id=$1',[other.id]);
  const job=await f.store.start('driver',f.id,true,true);
  await assert.rejects(f.pool.query(`INSERT INTO auth_sessions(id,subject_type,subject_id,token_hash,created_at,expires_at)VALUES($1,'driver',$2,$3,now(),now()+interval '1 hour')`,[randomUUID(),f.id,randomUUID()]));
  await assert.rejects(f.pool.query(`UPDATE driver_profiles SET full_name='Tentativa de reativação' WHERE driver_id=$1`,[f.id]));
  assert.equal((await f.store.receiptStatus(job.receipt)).status,'processing');
 }finally{await f.cleanup();await other.cleanup();}
});

test('zero net balance permits deletion while preserving ledger and support evidence',{skip:!enabled},async()=>{
 const f=await fixture();const transaction=randomUUID(),ticket=randomUUID();
 try{
  await f.pool.query("INSERT INTO ledger_transactions(id,kind,reference_key)VALUES($1,'self-delete-history',$2)",[transaction,transaction]);
  await f.pool.query("INSERT INTO ledger_entries(transaction_id,account_key,direction,amount_cents)VALUES($1,$2,'credit',2500),($1,$2,'debit',2500)",[transaction,`passenger:${f.id}:wallet`]);
  await f.pool.query(`INSERT INTO driver_support_tickets(id,passenger_id,category,subject,message,status,created_at,updated_at)VALUES($1,$2,'account','Histórico de teste','Mensagem histórica de suporte.','open',now(),now())`,[ticket,f.id]);
  const job=await f.store.start('passenger',f.id,true,true);await f.store.processPending(null,noCard);
  assert.equal((await f.store.receiptStatus(job.receipt)).status,'deleted');
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM ledger_entries WHERE transaction_id=$1',[transaction])).rows[0].n,2);
  assert.equal((await f.pool.query('SELECT message FROM driver_support_tickets WHERE id=$1',[ticket])).rows[0].message,'Mensagem histórica de suporte.');
 }finally{await f.pool.query('DELETE FROM driver_support_tickets WHERE id=$1',[ticket]);await f.cleanup();const p=new Pool({connectionString:process.env.DATABASE_URL});await p.query('DELETE FROM ledger_transactions WHERE id=$1',[transaction]);await p.end();}
});

test('an active ride or pending charge blocks deletion; finished history stays intact',{skip:!enabled},async()=>{
 const f=await fixture();const ride=randomUUID(),payment=randomUUID();
 try{
  await f.pool.query(`INSERT INTO rides(id,passenger_id,state,payment_status,origin_zone_id,destination_zone_id,category,price_period,passengers,pricing_rule_id,base_amount_cents,pickup_compensation_cents,total_amount_cents,platform_commission_cents,driver_net_cents)VALUES($1,$2,'AWAITING_PAYMENT','pending','prea','jijoca','car','day',1,'self-delete-ci',100,0,100,10,90)`,[ride,f.id]);
  assert.equal((await f.store.overview('passenger',f.id)).eligible,false);
  await assert.rejects(f.store.start('passenger',f.id,true,true));
  await f.pool.query("UPDATE rides SET state='COMPLETED' WHERE id=$1",[ride]);
  await f.pool.query("INSERT INTO payments(id,ride_id,method,processor,status,amount_cents,idempotency_key)VALUES($1,$2,'pix','synthetic','pending',100,$3)",[payment,ride,payment]);
  assert.match((await f.store.overview('passenger',f.id)).reason??'',/processamento/);
  await assert.rejects(f.store.start('passenger',f.id,true,true));
  await f.pool.query("UPDATE payments SET status='failed' WHERE id=$1",[payment]);
  const job=await f.store.start('passenger',f.id,true,true);await f.store.processPending(null,noCard);
  assert.equal((await f.store.receiptStatus(job.receipt)).status,'deleted');
  assert.equal((await f.pool.query('SELECT 1 FROM rides WHERE id=$1',[ride])).rowCount,1);
  assert.equal((await f.pool.query('SELECT 1 FROM payments WHERE id=$1',[payment])).rowCount,1);
 }finally{await f.pool.query('DELETE FROM payments WHERE id=$1',[payment]);await f.pool.query('DELETE FROM rides WHERE id=$1',[ride]);await f.cleanup();}
});

test('deletion waits for an in-flight external registration and captures its metadata',{skip:!enabled},async()=>{
 const f=await fixture('driver');
 let release!:()=>void,entered!:()=>void;
 const paused=new Promise<void>(resolve=>{release=resolve;});const started=new Promise<void>(resolve=>{entered=resolve;});
 const key=`drivers/${f.id}/driver_license/in-flight.pdf`;
 const upload=f.store.withOpenAccount('driver',f.id,async()=>{
  entered();await paused;
  await f.pool.query(`INSERT INTO driver_documents(id,driver_id,document_type,storage_key,content_sha256,mime_type,size_bytes,status,is_current,submitted_at,created_at,updated_at)VALUES($1,$2,'driver_license',$3,$4,'application/pdf',20,'pending',true,now(),now(),now())`,[randomUUID(),f.id,key,'c'.repeat(64)]);
 });
 await started;const closing=f.store.start('driver',f.id,true,true);
 try{
  let waiting=false;
  for(let i=0;i<50&&!waiting;i++){
   waiting=Boolean((await f.pool.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted LIMIT 1")).rowCount);
   if(!waiting)await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(waiting,true);release();await upload;const job=await closing;
  const cleanup=(await f.pool.query('SELECT cleanup FROM self_account_deletions WHERE id=$1',[job.id])).rows[0].cleanup;
  assert.deepEqual(cleanup.documents,[key]);
 }finally{release();await Promise.allSettled([upload,closing]);await f.cleanup();}
});
