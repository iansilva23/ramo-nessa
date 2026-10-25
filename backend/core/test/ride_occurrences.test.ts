import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {RideOccurrenceStore,validateOccurrencePolicy} from '../src/rides/ride-occurrence-store.js';import {PostgresBoardingStore} from '../src/rides/boarding-store.js';import {createPostgresPool} from '../src/db/postgres.js';
import {bonusForMethod} from '../src/rides/occurrence-bonus.js';import {occurrenceBonusLedger,rideSettlementLedger} from '../src/payments/ledger.js';
const actor={kind:'user' as const,id:'owner',name:'Responsável'},amounts={moto:300,car:300,buggy:300,delivery:300,comfort_black:300};
test('switches are independent and require explicit valid settings',()=>{
 for(const enabled of [false,true])for(const bonusEnabled of [false,true])assert.equal(validateOccurrencePolicy({enabled,bonusEnabled,bonusCents:amounts,revision:0}).bonusEnabled,bonusEnabled);
 assert.throws(()=>validateOccurrencePolicy({enabled:true,bonusEnabled:true,bonusCents:{...amounts,car:-1},revision:0}));
});
test('bonus goes to next driver for cash and injured driver for Pix, without commission',()=>{
 const b={penaltyId:'p',amountCents:300,injuredDriverId:'old'};assert.equal(bonusForMethod(b,'cash','new').driverId,'new');assert.equal(bonusForMethod(b,'pix','new').driverId,'old');assert.throws(()=>bonusForMethod(b,'wallet','new'));
 const main=rideSettlementLedger({rideId:'r',paymentId:'p',driverId:'new',totalAmountCents:3300,fareAmountCents:3000,platformCommissionCents:300,driverNetCents:2700,paymentAdjustmentCents:0,occurrenceBonus:bonusForMethod(b,'pix','new'),createdAt:new Date().toISOString()});
 const extra=occurrenceBonusLedger({rideId:'r',paymentId:'p',...bonusForMethod(b,'pix','new'),createdAt:main.createdAt});
 assert.equal(main.entries.find(e=>e.accountKey==='platform:revenue')?.amountCents,300);assert.equal(main.entries.find(e=>e.accountKey==='driver:new:payable')?.amountCents,2700);assert.equal(extra.entries.find(e=>e.accountKey==='driver:old:payable')?.amountCents,300);assert.equal(extra.entries.filter(e=>e.accountKey.startsWith('platform:')).length,0);
});
test('PostgreSQL default off, same trip/payment continuation and new 3-digit code with persistent 5 attempts',{skip:process.env.RAMO_BOARDING_POSTGRES!=='true',timeout:60000},async()=>{
 const root=createPostgresPool(process.env.DATABASE_URL!),schema='occurrence_'+randomUUID().replaceAll('-','');const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+',public');const pool=createPostgresPool(url.toString());
 try{
  await root.query('CREATE SCHEMA '+schema);
  await pool.query(`CREATE TABLE rides(id uuid PRIMARY KEY,passenger_id text,driver_id text,state text,payment_method text,payment_status text,category text,updated_at timestamptz DEFAULT now(),driver_consent_required boolean DEFAULT false,reserved_driver_id text,driver_hold_expires_at timestamptz,payment_expires_at timestamptz,pickup_latitude numeric,pickup_longitude numeric);
   CREATE TABLE driver_documents(id uuid PRIMARY KEY,validity_controlled boolean,status text,expires_on date);
   CREATE TABLE payments(id uuid PRIMARY KEY,ride_id uuid,status text);
   CREATE TABLE driver_supply(driver_id text PRIMARY KEY,busy boolean);
   CREATE TABLE driver_support_tickets(id uuid PRIMARY KEY,driver_id text,category text,subject text,message text,status text,ride_id uuid,ride_context jsonb,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE ride_manual_cancellations(ride_id uuid,credited_fee_cents int);CREATE TABLE ledger_transactions(reference_key text);`);
  for(const m of ['094_ride_boarding_recovery.sql','097_ride_occurrences.sql'])await pool.query(await readFile(new URL('../migrations/'+m,import.meta.url),'utf8'));
  const store=new RideOccurrenceStore(pool),boarding=new PostgresBoardingStore(pool);
  const add=async(method='pix')=>{const id=randomUUID();await pool.query("INSERT INTO rides(id,passenger_id,driver_id,state,payment_method,payment_status,category) VALUES($1,'passenger','first','DRIVER_ARRIVED',$2,$3,'car')",[id,method,method==='cash'?'authorized':'paid']);return id;};
  const old=await add();assert.equal((await store.policy()).enabled,false);assert.equal((await store.policy()).bonusEnabled,false);
  await store.savePolicy({enabled:true,bonusEnabled:true,bonusCents:amounts,revision:0},actor);assert.equal((await store.view(old,'passenger','passenger')).enabled,false);
  await boarding.savePolicy({enabled:true,categories:Object.fromEntries(['moto','car','buggy','delivery','comfort_black'].map(k=>[k,true])),revision:0},actor);
  const id=await add(),code=(await boarding.view(id,true)).code!;assert.match(code,/^\d{3}$/);await pool.query("UPDATE ride_boarding_codes SET assignment_driver_id='first' WHERE ride_id=$1",[id]);await boarding.start(id,'first',code);
  const paymentId=randomUUID();await pool.query("INSERT INTO payments(id,ride_id,status) VALUES($1,$2,'paid')",[paymentId,id]);
  const opened=await store.begin({rideId:id,driverId:'first',kind:'mechanical',statement:'Problema mecânico confirmado.',context:{rideId:id} as never});assert.equal((await pool.query('SELECT state FROM rides WHERE id=$1',[id])).rows[0].state,'INTERRUPTED');
  const choice={id:opened.id,rideId:id,passengerId:'passenger',revision:0,choice:'continue',statement:'Quero continuar com outro motorista.',pickup:{latitude:-2.8,longitude:-40.4}};
  await assert.rejects(store.respond({...choice,passengerId:'other'}));await store.respond(choice);
  await pool.query("UPDATE rides SET driver_id='second',state='DRIVER_ASSIGNED' WHERE id=$1",[id]);const next=(await boarding.view(id,true)).code!;assert.match(next,/^\d{3}$/);assert.notEqual(next,code);
  assert.equal((await pool.query('SELECT count(*)::int n FROM ride_boarding_history WHERE ride_id=$1',[id])).rows[0].n,1);
  await pool.query("UPDATE rides SET state='DRIVER_ARRIVED' WHERE id=$1",[id]);for(let i=0;i<5;i++)await assert.rejects(boarding.start(id,'second',code));assert.equal((await new PostgresBoardingStore(pool).view(id,true)).blocked,true);
  await boarding.override(id,actor,'Suporte verificou o encontro presencial.');await boarding.start(id,'second',next);assert.equal((await store.view(id,'passenger','passenger')).items[0].status,'resolved');assert.equal((await pool.query('SELECT id FROM payments WHERE ride_id=$1',[id])).rows[0].id,paymentId);assert.equal((await pool.query('SELECT count(*)::int n FROM ledger_transactions')).rows[0].n,0);
  const cash=await add('cash');await assert.rejects(store.assertCashReceived(cash,'first'));await store.receiveCash(cash,'first');await store.assertCashReceived(cash,'first');await pool.query("UPDATE rides SET state='IN_PROGRESS' WHERE id=$1",[cash]);
  const cashCase=await store.begin({rideId:cash,driverId:'first',kind:'cash',statement:'Devolver o dinheiro recebido.',context:{rideId:cash} as never});await assert.rejects(store.respond({...choice,id:cashCase.id,rideId:cash}));const returned=await store.cashReturned(cashCase.id,'first');await store.respond({...choice,id:cashCase.id,rideId:cash,revision:returned.revision,choice:'cash_confirm',statement:'Recebi todo o dinheiro de volta.'});
 }finally{await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();}
});
