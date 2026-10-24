import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresManualCancellationStore} from '../src/rides/manual-cancellation-store.js';
import {PostgresFinanceRepository} from '../src/payments/repositories/postgres-finance-repository.js';
import {PostgresRideRepository} from '../src/rides/repositories/postgres-ride-repository.js';
import {PostgresDriverSupplyRepository} from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import {defaultCancellationPolicy} from '../src/rides/manual-cancellation-policy.js';
import {automaticallyRefundRide} from '../src/rides/automatic-ride-refund-service.js';
import {InMemoryPromotionRepository} from '../src/promotions/repositories/in-memory-promotion-repository.js';
test('Postgres: frozen terms, deadline, retry, preserved driver credit and exactly one manual refund',
 {skip:process.env.RAMO_CANCELLATION_TEST_POSTGRES!=='true'},async()=>{
 const pool=createPostgresPool(process.env.DATABASE_URL!),store=new PostgresManualCancellationStore(pool),
 finance=new PostgresFinanceRepository(pool),rides=new PostgresRideRepository(pool),drivers=new PostgresDriverSupplyRepository(pool);
 const rideId=randomUUID(),driverId='cancel-driver-'+randomUUID(),passengerId='cancel-passenger-'+randomUUID(),paymentId=randomUUID(),offerId=randomUUID(),accepted='2026-10-24T01:00:00Z';
 const oldPolicy=await store.policy();
 try{
  const rules=defaultCancellationPolicy();rules.car={enabled:true,freeSeconds:40,feeCents:500};
  assert.equal(oldPolicy.systemEnabled,false);
  await store.savePolicy(rules,oldPolicy.revision,'test-admin');
  await drivers.upsert({driverId,vehicleId:'vehicle-'+driverId,categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:true,latitude:-2.82,longitude:-40.41,locationUpdatedAt:accepted,updatedAt:accepted});
  await rides.create({id:rideId,passengerId,driverId,state:'DRIVER_ASSIGNED',paymentStatus:'paid',paymentMethod:'pix',origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,
   quote:{ruleId:'manual-test',baseAmountCents:10000,pickupCompensationCents:0,totalAmountCents:10000,platformCommissionCents:1000,driverNetCents:9000},createdAt:accepted,updatedAt:accepted});
  await pool.query("INSERT INTO ride_offers(id,ride_id,driver_id,status,approximate_pickup_distance_km,expires_at,created_at,updated_at) VALUES($1,$2,$3,'OFFERED',1,$4,$4,$4)",[offerId,rideId,driverId,accepted]);
  await pool.query("UPDATE ride_offers SET status='ACCEPTED' WHERE id=$1",[offerId]);
  assert.equal((await store.terms(rideId,new Date(accepted))).cancelUntil,null);
  const disabled={rideId,passengerId,actor:passengerId,passenger:true,reason:'Teste',now:new Date(accepted)};
  await assert.rejects(store.cancel(disabled),e=>e instanceof Error&&e.message.includes('desativado'));
  await assert.rejects(store.cancel({...disabled,passenger:false}),e=>e instanceof Error&&e.message.includes('desativado'));
  assert.equal(await finance.getAccountBalanceCents('driver:'+driverId+':payable'),0);
  assert.equal(await store.find(rideId),null);
  const prepared=await store.policy();
  await store.savePolicy(prepared.rules,prepared.revision,'test-admin',true);
  assert.equal((await store.terms(rideId,new Date(accepted))).cancelUntil,'2026-10-24T01:00:40.000Z');
  const on=await store.policy();await store.savePolicy(on.rules,on.revision,'test-admin',false);
  await assert.rejects(store.cancel(disabled),/desativado/);
  const off=await store.policy();await store.savePolicy(off.rules,off.revision,'test-admin',true);
  const next=await store.policy();next.rules.car.feeCents=1500;await store.savePolicy(next.rules,next.revision,'test-admin');
  assert.equal((await store.terms(rideId)).rule.feeCents,500);
  await finance.createPayment({id:paymentId,rideId,method:'pix',processor:'fixture',status:'pending',amountCents:10000,idempotencyKey:randomUUID(),createdAt:accepted,updatedAt:accepted});
  await finance.capturePayment({paymentId,processorEventId:randomUUID()});
  const cancel={rideId,passengerId,actor:passengerId,passenger:true,reason:'Teste',now:new Date('2026-10-24T01:00:40Z')};
  await assert.rejects(store.cancel(cancel),/prazo/);
  const [first,second]=await Promise.all([store.cancel({...cancel,passenger:false,actor:'admin'}),store.cancel({...cancel,passenger:false,actor:'admin'})]);
  assert.equal(first.creditedFeeCents,500);assert.equal(second.creditedFeeCents,500);
  assert.equal(await finance.getAccountBalanceCents('driver:'+driverId+':payable'),500);
  assert.equal((await drivers.findByDriverId(driverId))?.busy,false);
  const stale=(await rides.findById(rideId))!;assert.equal(stale.manualRefund,true);
  await assert.rejects(rides.save({...stale,state:'IN_PROGRESS'}),/reativada/);
  await assert.rejects(automaticallyRefundRide({rides,finance,promotions:new InMemoryPromotionRepository(),gateway:null,rideId,passengerId}),/manual/);
  const pix=await store.setPix(rideId,passengerId,{type:'email',key:'fixture@example.test',holder:'Titular de teste'});
  const companyBefore=await finance.getAccountBalanceCents('platform:revenue');
  const approved=await store.review(rideId,200,pix.revision,'admin','Redução por análise');
  assert.equal(await finance.getAccountBalanceCents('driver:'+driverId+':payable'),500);
  assert.equal(await finance.getAccountBalanceCents('platform:revenue'),companyBefore-300);
  await assert.rejects(store.review(rideId,0,pix.revision,'admin','Stale'),/alterado/);
  await assert.rejects(store.setPix(rideId,passengerId,{type:'email',key:'other@example.test',holder:'Outro titular'}),/aprovada/);
  const receipt={name:'comprovante.pdf',contentType:'application/pdf',base64:Buffer.from('%PDF-1.4 fixture').toString('base64')},ref='BANK-FIXTURE-'+rideId;
  assert.equal((await store.markRefunded(rideId,approved.revision,'admin',ref,receipt)).status,'refunded');
  await store.markRefunded(rideId,approved.revision,'admin',ref,receipt);
  assert.equal(await finance.getAccountBalanceCents('ride:'+rideId+':escrow'),0);
  assert.equal(await finance.getAccountBalanceCents('driver:'+driverId+':payable'),500);
  assert.equal((await finance.listLedgerTransactionsForAccounts(['ride:'+rideId+':escrow'],100)).filter(t=>t.kind==='MANUAL_PASSENGER_REFUND').length,1);
  assert.equal((await store.list()).find(c=>c.rideId===rideId)?.paidCents,10000);
 }finally{
  const current=await store.policy();await store.savePolicy(oldPolicy.rules,current.revision,'test-cleanup',oldPolicy.systemEnabled);
  await pool.query('DELETE FROM ride_manual_cancellation_audit WHERE ride_id=$1',[rideId]);
  await pool.query('DELETE FROM ride_manual_cancellations WHERE ride_id=$1',[rideId]);
  await pool.query('DELETE FROM ledger_entries WHERE transaction_id IN(SELECT id FROM ledger_transactions WHERE ride_id=$1)',[rideId]);
  await pool.query('DELETE FROM ledger_transactions WHERE ride_id=$1',[rideId]);
  await pool.query('DELETE FROM payment_events WHERE payment_id=$1',[paymentId]);
  await pool.query('DELETE FROM payments WHERE ride_id=$1',[rideId]);
  await pool.query('DELETE FROM ride_offers WHERE ride_id=$1',[rideId]);
  await pool.query('DELETE FROM rides WHERE id=$1',[rideId]);
  await pool.query('DELETE FROM driver_supply WHERE driver_id=$1',[driverId]);await pool.end();
 }
});
