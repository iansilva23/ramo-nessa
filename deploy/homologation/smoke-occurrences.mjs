// Runs only against an empty isolated database. No HTTP/gateway calls, real money,
// live policy updates, user accounts or PINs in the output.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function smoke(appRoot='/app'){
 if(process.env.RAMO_ISOLATED_OCCURRENCE_SMOKE!=='true'||process.env.NODE_ENV!=='development')throw Error('ISOLATED_ENV_REQUIRED');
 const database=new URL(process.env.DATABASE_URL);
 if(!['postgres','127.0.0.1','localhost'].includes(database.hostname)||database.searchParams.has('options'))throw Error('UNEXPECTED_DATABASE');
 const module=async path=>import(pathToFileURL(join(appRoot,'dist/src',path)).href);
 const {createPostgresPool}=await module('db/postgres.js');
 const {RideOccurrenceStore}=await module('rides/ride-occurrence-store.js');
 const {PostgresBoardingStore}=await module('rides/boarding-store.js');
 const {InMemoryFinanceRepository}=await module('payments/repositories/in-memory-finance-repository.js');
 const root=createPostgresPool(database.toString());let pool,created=false;const schema='homolog_smoke_'+randomUUID().replaceAll('-','');
 const checks=[];
 try{
  const baseline=(await root.query(`SELECT (SELECT count(*)::int FROM public.rides) AS rides,(SELECT count(*)::int FROM public.payments) AS payments,(SELECT enabled FROM public.ride_boarding_policy WHERE singleton) AS boarding,(SELECT enabled FROM public.ride_occurrence_policy WHERE singleton) AS occurrences,(SELECT bonus_enabled FROM public.ride_occurrence_policy WHERE singleton) AS bonus`)).rows[0];
  assert.deepEqual(baseline,{rides:0,payments:0,boarding:false,occurrences:false,bonus:false});checks.push('Banco isolado vazio e controles A/B/C desligados');
  await root.query('CREATE SCHEMA '+schema);created=true;
  database.searchParams.set('options','-c search_path='+schema+',public');pool=createPostgresPool(database.toString());
  await pool.query(`CREATE TABLE rides(id uuid PRIMARY KEY,passenger_id text,driver_id text,state text,payment_method text,payment_status text,category text,updated_at timestamptz DEFAULT now(),driver_consent_required boolean DEFAULT false,reserved_driver_id text,driver_hold_expires_at timestamptz,payment_expires_at timestamptz,pickup_latitude numeric,pickup_longitude numeric,destination text);
   CREATE TABLE driver_documents(id uuid PRIMARY KEY,validity_controlled boolean,status text,expires_on date);
   CREATE TABLE payments(id uuid PRIMARY KEY,ride_id uuid,status text);
   CREATE TABLE driver_supply(driver_id text PRIMARY KEY,busy boolean);
   CREATE TABLE driver_support_tickets(id uuid PRIMARY KEY,driver_id text,category text,subject text,message text,response text,status text,ride_id uuid,ride_context jsonb,created_at timestamptz,updated_at timestamptz);
   CREATE TABLE ride_manual_cancellations(ride_id uuid,credited_fee_cents int);
   CREATE TABLE ledger_transactions(reference_key text);`);
  for(const filename of ['094_ride_boarding_recovery.sql','097_ride_occurrences.sql'])await pool.query(await readFile(join(appRoot,'migrations',filename),'utf8'));
  const store=new RideOccurrenceStore(pool),boarding=new PostgresBoardingStore(pool),actor={kind:'user',id:'smoke-admin',name:'Homologação automática'};
  const add=async(method='pix')=>{const id=randomUUID();await pool.query("INSERT INTO rides(id,passenger_id,driver_id,state,payment_method,payment_status,category,destination) VALUES($1,'smoke-passenger','smoke-first','DRIVER_ARRIVED',$2,$3,'car','destino-preservado')",[id,method,method==='cash'?'authorized':'paid']);return id;};
  const old=await add();await store.savePolicy({enabled:true,bonusEnabled:false,bonusCents:{car:300,moto:300,buggy:300,delivery:300,comfort_black:300},revision:0},actor);
  assert.equal((await store.view(old,'passenger','smoke-passenger')).enabled,false);assert.equal((await store.policy()).bonusEnabled,false);assert.equal((await boarding.policy()).enabled,false);checks.push('Políticas independentes e regras de corridas anteriores preservadas (esquema temporário)');
  await boarding.savePolicy({enabled:true,categories:{car:true,moto:true,buggy:true,delivery:true,comfort_black:true},revision:0},actor);
  const ride=await add(),first=(await boarding.view(ride,true)).code;assert.match(first,/^\d{3}$/);await boarding.start(ride,'smoke-first',first);
  const payment=randomUUID();await pool.query("INSERT INTO payments VALUES($1,$2,'paid')",[payment,ride]);
  const opened=await store.begin({rideId:ride,driverId:'smoke-first',kind:'mechanical',statement:'Falha mecânica fictícia para homologação.',context:{rideId:ride,currentDriverLocation:{latitude:-2.8,longitude:-40.4,observedAt:new Date().toISOString()}}});
  await assert.rejects(store.respond({id:opened.id,rideId:ride,passengerId:'intruso',revision:0,choice:'continue',statement:'Tentativa fictícia sem autorização.',pickup:{latitude:-2.8,longitude:-40.4}}));checks.push('Outro passageiro não pode responder pela corrida');
  await store.respond({id:opened.id,rideId:ride,passengerId:'smoke-passenger',revision:0,choice:'continue',statement:'Solicito a continuação fictícia da corrida.',pickup:{latitude:-2.8,longitude:-40.4}});
  await pool.query("UPDATE rides SET driver_id='smoke-second',state='DRIVER_ASSIGNED' WHERE id=$1",[ride]);
  const second=(await boarding.view(ride,true)).code;assert.match(second,/^\d{3}$/);assert.notEqual(first,second);
  assert.equal((await pool.query('SELECT id FROM payments WHERE ride_id=$1',[ride])).rows[0].id,payment);assert.equal((await pool.query('SELECT destination FROM rides WHERE id=$1',[ride])).rows[0].destination,'destino-preservado');checks.push('Substituição mantém corrida/pagamento/destino e gera novo código de 3 dígitos');
  await pool.query("UPDATE rides SET state='DRIVER_ARRIVED' WHERE id=$1",[ride]);for(let i=0;i<5;i++)await assert.rejects(boarding.start(ride,'smoke-second',first));assert.equal((await new PostgresBoardingStore(pool).view(ride,true)).blocked,true);
  await boarding.override(ride,actor,'Encontro fictício validado pelo teste de suporte.');await boarding.start(ride,'smoke-second',second);
  assert.equal((await store.view(ride,'passenger','smoke-passenger')).items[0].status,'resolved');assert.equal((await pool.query('SELECT status FROM driver_support_tickets WHERE id=$1',[opened.ticket_id])).rows[0].status,'resolved');checks.push('Cinco erros persistidos, liberação pelo suporte e atendimento sincronizado');
  const cash=await add('cash');await assert.rejects(store.assertCashReceived(cash,'smoke-first'));await store.receiveCash(cash,'smoke-first');await store.assertCashReceived(cash,'smoke-first');await pool.query("UPDATE rides SET state='IN_PROGRESS' WHERE id=$1",[cash]);
  const c=await store.begin({rideId:cash,driverId:'smoke-first',kind:'cash',statement:'Devolução física fictícia em homologação.',context:{rideId:cash}});
  await assert.rejects(store.respond({id:c.id,rideId:cash,passengerId:'smoke-passenger',revision:0,choice:'continue',statement:'Teste de bloqueio de transferência em dinheiro.'}));
  const returned=await store.cashReturned(c.id,'smoke-first');await store.respond({id:c.id,rideId:cash,passengerId:'smoke-passenger',revision:returned.revision,choice:'cash_confirm',statement:'Confirmo a devolução fictícia em dinheiro.'});assert.equal((await pool.query('SELECT count(*)::int n FROM ledger_transactions')).rows[0].n,0);checks.push('Dinheiro exige recebimento; devolução física não cria transferência financeira');
  const finance=new InMemoryFinanceRepository(),bonusRide=randomUUID(),bonusPayment=randomUUID(),now=new Date().toISOString();
  await finance.createPayment({id:bonusPayment,rideId:bonusRide,method:'pix',processor:'simulado',status:'pending',amountCents:3300,idempotencyKey:randomUUID(),createdAt:now,updatedAt:now});await finance.capturePayment({paymentId:bonusPayment,processorEventId:randomUUID()});
  const input={rideId:bonusRide,paymentId:bonusPayment,driverId:'smoke-new',totalAmountCents:3300,fareAmountCents:3000,platformCommissionCents:300,driverNetCents:2700,occurrenceBonus:{amountCents:300,driverId:'smoke-injured'}};
  await finance.settleRide(input);assert.equal((await finance.settleRide(input)).duplicateSettlement,true);assert.equal(await finance.getAccountBalanceCents('platform:revenue'),300);assert.equal(await finance.getAccountBalanceCents('driver:smoke-new:payable'),2700);assert.equal(await finance.getAccountBalanceCents('driver:smoke-injured:payable'),300);assert.equal(await finance.getAccountBalanceCents(`ride:${bonusRide}:escrow`),0);checks.push('Liquidação simulada: bônus sem comissão e sem duplicidade');
 }finally{
  if(pool)await pool.end();
  try{if(created)await root.query('DROP SCHEMA '+schema+' CASCADE');}finally{await root.end();}
 }
 // A new connection verifies no settings/fixtures escaped the temporary schema.
 const verify=createPostgresPool(process.env.DATABASE_URL);try{
  assert.equal((await verify.query('SELECT count(*)::int n FROM public.rides')).rows[0].n,0);
  assert.equal((await verify.query('SELECT count(*)::int n FROM public.payments')).rows[0].n,0);
  assert.equal((await verify.query('SELECT enabled FROM public.ride_boarding_policy')).rows[0].enabled,false);
  const p=(await verify.query('SELECT enabled,bonus_enabled FROM public.ride_occurrence_policy')).rows[0];assert.equal(p.enabled,false);assert.equal(p.bonus_enabled,false);
  checks.push('Limpeza concluída: ambiente permanece vazio e A/B/C desligados');
 }finally{await verify.end();}
 return {ok:true,simulated:true,checks};
}
if(!process.argv[1]||process.argv[1]==='-'||import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await smoke(process.argv[2]||'/app'),null,2));}catch{console.error('TESTE NÃO APROVADO. Nenhuma confirmação financeira real foi executada; conferir o teste antes de prosseguir.');process.exitCode=1;}}
