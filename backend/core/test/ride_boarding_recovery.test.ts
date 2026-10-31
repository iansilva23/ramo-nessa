import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresBoardingStore,validateBoardingPolicy,BOARDING_CATEGORIES} from '../src/rides/boarding-store.js';
import {resumePassengerRide} from '../src/rides/ride-resumption.js';
import {InMemoryRideRepository} from '../src/rides/repositories/in-memory-ride-repository.js';
import {InMemoryFinanceRepository} from '../src/payments/repositories/in-memory-finance-repository.js';
import {createRide} from '../src/rides/create-ride.js';
import {boardingRoutes} from '../src/rides/boarding-routes.js';
import {DocumentExpiryNotifier} from '../src/drivers/document-expiry.js';
const actor={kind:'user' as const,id:'owner',name:'Responsável'};
const categories=Object.fromEntries(BOARDING_CATEGORIES.map(k=>[k,true]));
test('boarding policy requires an explicit switch and exactly the supported categories',()=>{
 assert.throws(()=>validateBoardingPolicy({categories,revision:0}));
 assert.throws(()=>validateBoardingPolicy({enabled:true,categories:{...categories,unknown:true},revision:0}));
 assert.equal(validateBoardingPolicy({enabled:false,categories,revision:0}).enabled,false);
});
test('passenger recovery is account scoped, prefers in-progress travel, and restores terminal hints',async()=>{
 const rides=new InMemoryRideRepository(),finance=new InMemoryFinanceRepository();
 const ride=await createRide(rides,{passengerId:'passenger-recovery',quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day',passengers:1},now:new Date('2026-10-24T12:00:00Z')});
 await rides.save({...ride,state:'IN_PROGRESS',driverId:'driver-one',updatedAt:'2026-10-24T12:10:00Z'});
 let result=await resumePassengerRide({rides,finance,boarding:null,passengerId:ride.passengerId});
 assert.equal(result.ride?.state,'IN_PROGRESS');assert.equal(result.ride?.id,ride.id);
 assert.equal((await resumePassengerRide({rides,finance,boarding:null,passengerId:'someone-else',lastRideId:ride.id})).ride,null);
 await rides.save({...ride,state:'COMPLETED'});
 assert.equal((await resumePassengerRide({rides,finance,boarding:null,passengerId:ride.passengerId})).ride,null);
 result=await resumePassengerRide({rides,finance,boarding:null,passengerId:ride.passengerId,lastRideId:ride.id});
 assert.equal(result.ride?.state,'COMPLETED');
});
test('boarding endpoints authenticate role and ownership before returning a status',async()=>{
 const rides=new InMemoryRideRepository(),finance=new InMemoryFinanceRepository();let status=0,body:any;
 const input={url:new URL('https://test/v1/rides/'+randomUUID()+'/boarding'),method:'GET',store:null,rides,finance,
  passenger:async()=>{throw Error('unauthenticated');},driver:async()=>'',authorize:async()=>actor,body:async()=>({}),json:(s:number,b:unknown)=>{status=s;body=b;}};
 await assert.rejects(()=>boardingRoutes(input),/unauthenticated/);
 await boardingRoutes({...input,passenger:async()=>'other'});assert.equal(status,404);assert.equal(body.error,'RIDE_NOT_FOUND');
});
test('reopening repeatedly preserves the same pending payment without creating another intent',async()=>{
 const rides=new InMemoryRideRepository(),finance=new InMemoryFinanceRepository();
 const ride=await createRide(rides,{passengerId:'payment-recovery',quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day',passengers:1}});
 await rides.save({...ride,state:'AWAITING_PAYMENT'});
 const payment=await finance.createPayment({id:randomUUID(),rideId:ride.id,method:'pix',processor:'mercado-pago-orders',status:'pending',amountCents:ride.quote.totalAmountCents,idempotencyKey:'recovery-existing-payment',createdAt:ride.createdAt,updatedAt:ride.updatedAt});
 finance.createPayment=async()=>{throw new Error('Recovery must never create a payment');};
 const results=await Promise.all(Array.from({length:5},()=>resumePassengerRide({rides,finance,boarding:null,passengerId:ride.passengerId})));
 for(const result of results){assert.equal(result.payment?.id,payment.id);assert.equal(result.payment?.status,'pending');assert.equal(result.ride?.id,ride.id);}
 assert.equal((await finance.findLatestPaymentByRideId(ride.id))?.id,payment.id);
});
test('PostgreSQL boarding defaults off, survives restart, enforces 5 attempts atomically, and audits support',{skip:process.env.RAMO_BOARDING_POSTGRES!=='true',timeout:60000},async()=>{
 const root=createPostgresPool(process.env.DATABASE_URL!),schema='boarding_'+randomUUID().replaceAll('-','');
 const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+',public');const pool=createPostgresPool(url.toString());
 try{
  await root.query('CREATE SCHEMA '+schema);
  await pool.query("CREATE TABLE rides(id uuid PRIMARY KEY,passenger_id text,driver_id text,state text,category text,updated_at timestamptz DEFAULT now());CREATE TABLE payments(id uuid PRIMARY KEY);CREATE TABLE driver_documents(id uuid PRIMARY KEY,driver_id text,document_type text,is_current boolean,status text,expires_on date)");
  const migration=await readFile(new URL('../migrations/094_ride_boarding_recovery.sql',import.meta.url),'utf8');await pool.query(migration);await pool.query(migration);
  let store=new PostgresBoardingStore(pool);assert.equal((await store.policy()).enabled,false);
  const add=async(category='moto')=>{const id=randomUUID();await pool.query("INSERT INTO rides(id,passenger_id,driver_id,state,category) VALUES($1,'passenger','driver','DRIVER_ARRIVED',$2)",[id,category]);return id;};
  const old=await add();assert.deepEqual(await store.view(old,true),{required:false});await store.start(old,'driver',undefined);
  let policy=await store.savePolicy({enabled:true,categories,revision:0},actor);
  await assert.rejects(()=>store.savePolicy({enabled:true,categories,revision:0},actor),{code:'POLICY_CHANGED'});
  const id=await add();const view=await store.view(id,true);assert.match(view.code??'',/^\d{3}$/);assert.equal('code' in await store.view(id,false),false);
  await assert.rejects(()=>store.start(id,'wrong-driver','000'),{status:404});
  const wrong=view.code==='000'?'001':'000';
  const results=await Promise.allSettled(Array.from({length:9},()=>store.start(id,'driver',wrong)));
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal((await store.view(id,true)).remainingAttempts,0);
  store=new PostgresBoardingStore(pool);assert.equal((await store.view(id,true)).code,view.code);
  await assert.rejects(()=>store.start(id,'driver',view.code),{code:'BOARDING_BLOCKED'});
  await store.override(id,actor,'Suporte confirmou o encontro pessoalmente');await store.start(id,'driver',undefined);
  assert.equal((await pool.query('SELECT state FROM rides WHERE id=$1',[id])).rows[0].state,'IN_PROGRESS');
  assert.equal('code' in await store.view(id,true),false);
  await store.start(id,'driver','bad'); // Lost-response retries do not consume attempts or restart the ride.
  const success=await add();const successCode=(await store.view(success,true)).code;await store.start(success,'driver',successCode);
  assert.equal((await store.view(success,true)).required,false);
  policy=await store.savePolicy({enabled:false,categories,revision:policy.revision},actor);
  assert.equal((await store.view(await add(),true)).required,false);
  assert.equal((await pool.query('SELECT count(*)::int n FROM ride_boarding_audit')).rows[0].n,3);
  policy=await store.savePolicy({enabled:true,categories:{...categories,delivery:false},revision:policy.revision},actor);
  assert.equal((await store.view(await add('delivery'),true)).required,false);
  const paymentId=randomUUID();await pool.query('INSERT INTO payments(id) VALUES($1)',[paymentId]);await store.saveCheckout(success,paymentId,{pix:{qrCode:'synthetic-code'}});
  assert.equal((await new PostgresBoardingStore(pool).checkout(success,paymentId)).pix.qrCode,'synthetic-code');
  assert.equal(await store.checkout(success,randomUUID()),null);
  // A successful delivery is persisted once across concurrent workers and restarts.
  const documentId=randomUUID();
  await pool.query("INSERT INTO driver_documents(id,driver_id,document_type,is_current,status,expires_on) VALUES($1,'driver-expiry','driver_license',true,'approved','2026-10-25')",[documentId]);
  const messages:string[]=[];
  const notify=async(driverId:string,message:string)=>{assert.equal(driverId,'driver-expiry');messages.push(message);return true;};
  await Promise.all(Array.from({length:3},()=>new DocumentExpiryNotifier(pool).run(notify,new Date('2026-10-24T12:00:00Z'))));
  assert.equal(messages.length,1);assert.match(messages[0]!,/25\/10\/2026/);
  await new DocumentExpiryNotifier(pool).run(notify,new Date('2026-10-26T02:59:00Z'));assert.equal(messages.length,1);
  let attempts=0;
  await new DocumentExpiryNotifier(pool).run(async()=>{attempts++;return false;},new Date('2026-10-26T03:00:00Z'));assert.equal(attempts,1);
  await new DocumentExpiryNotifier(pool).run(notify,new Date('2026-10-26T03:00:00Z'));assert.equal(messages.length,2);assert.match(messages[1]!,/venceu/);
  await new DocumentExpiryNotifier(pool).run(notify,new Date('2026-10-27T12:00:00Z'));assert.equal(messages.length,2);
 }finally{await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();}
});
