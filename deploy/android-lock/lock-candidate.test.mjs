import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const coreDist=process.env.RAMO_LOCK_CORE_DIST || '/app/dist';
const core=path=>import(pathToFileURL(resolve(coreDist,'src',path)).href);
const {createPostgresPool}=await core('db/postgres.js');
const {PostgresRideMatchingRepository}=await core('matching/postgres-ride-matching-repository.js');
const {PostgresRideRepository}=await core('rides/repositories/postgres-ride-repository.js');
const {PostgresDriverSupplyRepository}=await core('drivers/repositories/postgres-driver-supply-repository.js');
const {advancePendingRideDispatch}=await core('rides/pending-dispatch-service.js');
const {dispatchRideAfterPayment}=await core('rides/dispatch-after-payment.js');
test('screen lock and acceptance serialize without abandoning an accepted paid ride', { skip: process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only' }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/ramo_lock_test');
  const pool = createPostgresPool(url.toString()), rides = new PostgresRideRepository(pool);
  const drivers = new PostgresDriverSupplyRepository(pool), matching = new PostgresRideMatchingRepository(pool);
  const start = new Date('2026-10-01T12:00:00.000Z'), at = new Date(start.getTime()+5000).toISOString();
  try {
    for (let i=0; i<33; i++) {
      const rideId=randomUUID(), driverId='atomic-lock-'+randomUUID();
      await rides.create({id:rideId, passengerId:'test-'+randomUUID(), state:'PAID', paymentStatus:'paid',
        origin:{zoneId:'prea'}, destination:{zoneId:'jijoca'}, category:'car', period:'day', passengers:1,
        quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},
        createdAt:start.toISOString(),updatedAt:start.toISOString()});
      await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,
        online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:start.toISOString(),updatedAt:start.toISOString()});
      const created=await matching.createOffer({rideId,driverId,approximatePickupDistanceKm:1,createdAt:start.toISOString(),
        expiresAt:new Date(start.getTime()+35000).toISOString()});
      const lock=()=>matching.lockScreenPendingOffer({offerId:created.offer.id,driverId,at});
      const accept=()=>matching.acceptOffer({offerId:created.offer.id,driverId,acceptedAt:at});
      if(i===0) {
        await assert.rejects(() => matching.lockScreenPendingOffer({offerId:created.offer.id,driverId:'other-driver',at}));
        assert.equal((await matching.findOfferById(created.offer.id))?.status,'OFFERED');
        assert.equal(await lock(),'REJECTED');
        assert.equal(await lock(),'REJECTED'); // Retry is idempotent; the paid ride itself records pending work.
        await assert.rejects(accept);
      }
      else if(i===1) { await accept(); assert.equal(await lock(),'ACCEPTED'); }
      else if(i===32) { assert.equal(await matching.lockScreenPendingOffer({offerId:created.offer.id,driverId,at:new Date(start.getTime()+36000).toISOString()}),'EXPIRED'); }
      else await Promise.allSettled(i%2===0?[lock(),accept()]:[accept(),lock()]);
      const offer=await matching.findOfferById(created.offer.id),ride=await rides.findById(rideId),supply=await drivers.findByDriverId(driverId);
      assert.ok(offer && ride && supply);
      assert.equal(ride.paymentStatus,'paid');
      if(offer.status==='ACCEPTED') {
        assert.equal(ride.driverId,driverId); assert.equal(ride.state,'DRIVER_ASSIGNED');
        assert.equal(supply.busy,true); assert.equal(supply.online,true);
      } else {
        assert.equal(offer.status,i===32?'EXPIRED':'REJECTED'); assert.equal(supply.online,false);
        assert.equal(supply.busy,false); assert.notEqual(ride.driverId,driverId);
      }
    }
  } finally { await pool.end(); }
});

test('recovery invokes real dispatch and retry does not duplicate the offer', {skip:process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only'}, async()=>{
  const url=new URL(process.env.DATABASE_URL ?? ''); assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/ramo_lock_test');
  const pool=createPostgresPool(url.toString()), rides=new PostgresRideRepository(pool), drivers=new PostgresDriverSupplyRepository(pool), matching=new PostgresRideMatchingRepository(pool);
  const start=new Date('2026-10-01T12:00:00.000Z'), at=new Date(start.getTime()+5000);
  const rideId=randomUUID(), first='lock-first-'+randomUUID(), second='lock-next-'+randomUUID();
  try{
    await rides.create({id:rideId,passengerId:'recovery-'+randomUUID(),state:'PAID',paymentStatus:'paid',
      pickupLatitude:-2.821,pickupLongitude:-40.414,origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,
      quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},
      createdAt:start.toISOString(),updatedAt:start.toISOString()});
    for(const driverId of [first,second]) await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,
      online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:start.toISOString(),updatedAt:start.toISOString()});
    const offer=await matching.createOffer({rideId,driverId:first,approximatePickupDistanceKm:1,createdAt:start.toISOString(),expiresAt:new Date(start.getTime()+35000).toISOString()});
    assert.equal(await matching.lockScreenPendingOffer({offerId:offer.offer.id,driverId:first,at:at.toISOString()}),'REJECTED');
    const request={pool,offerId:offer.offer.id,dispatch:{rides,drivers,matching,now:at,canOfferDriver:async (id)=>id===second}};
    // Use the existing startup/periodic recovery, with no device retry.
    const failures = [];
    await advancePendingRideDispatch({
      rides, now:at,
      dispatch:(ride,now)=>dispatchRideAfterPayment({...request.dispatch,ride,now}),
      onFailure:(_rideId,error)=>failures.push(error),
    });
    assert.equal(failures.length,0);
    let active=(await matching.listOffersForRide(rideId)).filter(o=>o.status==='OFFERED');
    assert.equal(active.length,1); assert.equal(active[0]?.driverId,second);
    // Re-running the existing sweep must retain the active offer.
    await advancePendingRideDispatch({
      rides, now:at,
      dispatch:(ride,now)=>dispatchRideAfterPayment({...request.dispatch,ride,now}),
    });
    active=(await matching.listOffersForRide(rideId)).filter(o=>o.status==='OFFERED');
    assert.equal(active.length,1); assert.equal(active[0]?.driverId,second);
    assert.equal((await rides.findById(rideId))?.paymentStatus,'paid');
  }finally{await pool.end();}
});

test('idle lock serializes with creation of a paid offer', {skip:process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only'}, async()=>{
  const url=new URL(process.env.DATABASE_URL ?? ''); assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/ramo_lock_test');
  const pool=createPostgresPool(url.toString()),rides=new PostgresRideRepository(pool),drivers=new PostgresDriverSupplyRepository(pool),matching=new PostgresRideMatchingRepository(pool);
  const now=new Date('2026-10-01T12:00:00.000Z'),at=now.toISOString();
  try {
    for(let i=0;i<20;i++) {
      const driverId='idle-lock-'+randomUUID(),rideId=randomUUID();
      await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:at,updatedAt:at});
      await rides.create({id:rideId,passengerId:'test-'+randomUUID(),state:'PAID',paymentStatus:'paid',origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,
        quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},createdAt:at,updatedAt:at});
      const creation=matching.createOffer({rideId,driverId,approximatePickupDistanceKm:1,createdAt:at,expiresAt:new Date(now.getTime()+35000).toISOString()});
      const locked=matching.lockDriverScreen({driverId,at});
      const results=await Promise.allSettled([creation,locked]);
      assert.equal(results[1].status,'fulfilled');
      const outcome=await matching.lockDriverScreen({driverId,at});
      if(outcome.outcome==='OFFER_PENDING') {
        assert.ok(outcome.offerId);
        await matching.lockScreenPendingOffer({driverId,offerId:outcome.offerId,at});
      }
      assert.equal((await matching.lockDriverScreen({driverId,at})).outcome,'OFFLINE');
      assert.equal((await drivers.findByDriverId(driverId))?.online,false);
      assert.equal((await matching.listOffersForRide(rideId)).filter(o=>o.status==='OFFERED').length,0);
    }
  }finally{await pool.end();}
});


test('candidate HTTP: authentication, idle lock, accepted ride and restart',
 {skip:process.env.RAMO_LOCK_RACE_TEST!=='isolated-ci-only', timeout:90000}, async()=>{
  const url=new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/ramo_lock_test');
  const pool=createPostgresPool(url.toString()),rides=new PostgresRideRepository(pool),drivers=new PostgresDriverSupplyRepository(pool),matching=new PostgresRideMatchingRepository(pool);
  const now=new Date(), at=now.toISOString(), idle='http-idle-'+randomUUID(), accepted='http-accepted-'+randomUUID(),rideId=randomUUID();
  let child;
  const base='http://127.0.0.1:18911';
  const log=resolve(process.env.TMPDIR || '/tmp','lock-http-'+process.pid+'.log');
  async function stop(){
    if(!child || child.exitCode!=null)return;
    const proc=child;
    await new Promise(resolve=>{
      const timer=setTimeout(()=>{proc.kill('SIGKILL');},5000);
      proc.once('exit',()=>{clearTimeout(timer);resolve();});
      proc.kill('SIGTERM');
    });
    child=undefined;
  }
  async function start(){
    const fd=openSync(log,'a',0o600);
    const secret='isolated-test-only-0123456789abcdef0123456789abcdef';
    child=spawn(process.execPath,[resolve(coreDist,'src/server.js')],{
      env:{...process.env,NODE_ENV:'test',PORT:'18911',ALLOW_DEV_IDENTITY:'true',
        ALLOW_DEV_OTP:'true',OTP_PROVIDER:'dev',OTP_HASH_SECRET:secret,OTP_RATE_LIMIT_SECRET:secret,
        PLACE_PROOF_SECRET:secret,ADMIN_LOGIN_RATE_LIMIT_SECRET:secret,
        DOCUMENT_STORAGE_LOCAL_DIR:'/tmp/ramo-lock-documents',DOCUMENT_STORAGE_BASE_URL:'',DOCUMENT_STORAGE_AUTH_TOKEN:'',
        ADMIN_MFA_ENCRYPTION_KEY:'11'.repeat(32),DOCUMENT_INSPECTION_ENCRYPTION_KEY:'22'.repeat(32),
        PUSH_PROVIDER:'disabled',FIREBASE_SERVICE_ACCOUNT_FILE:'',FIREBASE_SERVICE_ACCOUNT_JSON:'',
        GOOGLE_MAPS_SERVER_API_KEY:'',ROUTING_PROVIDER:'google',DB_SSL:'false',DB_POOL_MAX:'2',
        MERCADO_PAGO_ACCESS_TOKEN:'',MERCADO_PAGO_WEBHOOK_SECRET:'',MERCADO_PAGO_MODE:'test',
        ASAAS_API_KEY_FILE:'',ASAAS_WEBHOOK_TOKEN_FILE:'',ASAAS_PAYOUTS_ENABLED:'false',
        DRIVER_PAYOUT_PROVIDER_NAME:'',DRIVER_PAYOUT_PROVIDER_URL:'',DRIVER_PAYOUT_PROVIDER_TOKEN:'',ASAAS_WEBHOOK_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false',
        SHUTDOWN_TIMEOUT_MS:'2000'},
      stdio:['ignore',fd,fd]
    });
    closeSync(fd);
    for(let i=0;i<100;i++){
      if(child.exitCode!=null)throw new Error('Isolated HTTP server stopped: '+readFileSync(log,'utf8').slice(-4000));
      try{const res=await fetch(base+'/ready',{signal:AbortSignal.timeout(500)});await res.body?.cancel();if(res.ok)return;}catch{}
      await new Promise(r=>setTimeout(r,150));
    }
    throw new Error('Isolated HTTP server did not become ready; private log '+log);
  }
  async function locked(id){
    const res=await fetch(base+'/v1/driver/me/screen-lock',{method:'POST',headers:{'x-dev-driver-id':id},signal:AbortSignal.timeout(5000)});
    assert.equal(res.status,200);return res.json();
  }
  try {
    // Only this disposable test database contains these completed earlier fixtures.
    await pool.query("UPDATE rides SET state='CANCELLED_BY_ADMIN' WHERE state IN ('PAID','SEARCHING_DRIVER')");
    for(const driverId of [idle,accepted]) await drivers.upsert({driverId,vehicleId:randomUUID(),categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:at,updatedAt:at});
    await rides.create({id:rideId,passengerId:'http-passenger-'+randomUUID(),state:'PAID',paymentStatus:'paid',origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},createdAt:at,updatedAt:at});
    const offer=await matching.createOffer({rideId,driverId:accepted,approximatePickupDistanceKm:1,createdAt:at,expiresAt:new Date(now.getTime()+120000).toISOString()});
    await matching.acceptOffer({offerId:offer.offer.id,driverId:accepted,acceptedAt:at});
    await start();
    const denied=await fetch(base+'/v1/driver/me/screen-lock',{method:'POST',headers:{authorization:'Bearer invalid-isolated-token'},signal:AbortSignal.timeout(5000)});
    assert.equal(denied.status,401);await denied.body?.cancel();
    assert.equal((await drivers.findByDriverId(idle))?.online,true);
    assert.equal((await locked(idle)).outcome,'OFFLINE');
    assert.equal((await locked(idle)).outcome,'OFFLINE');
    assert.equal((await locked(accepted)).outcome,'ACCEPTED');
    assert.equal((await drivers.findByDriverId(accepted))?.online,true);
    assert.equal((await drivers.findByDriverId(accepted))?.busy,true);
    await stop();await start();
    assert.equal((await locked(idle)).outcome,'OFFLINE');
    assert.equal((await locked(accepted)).outcome,'ACCEPTED');
    assert.equal((await rides.findById(rideId))?.state,'DRIVER_ASSIGNED');
    assert.equal((await rides.findById(rideId))?.paymentStatus,'paid');
    const tables=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('payments','ledger_transactions')");
    assert.equal(tables.rowCount,2,'Financial audit tables must exist');
    for(const {tablename} of tables.rows){
      const result=await pool.query('SELECT count(*)::int AS count FROM "'+tablename+'"');
      assert.equal(result.rows[0].count,0,'No payment or ledger row may be created by these tests');
    }
    console.log('# diagnostic '+JSON.stringify({candidateHttp:true,restartRecovery:true,paidRidePreserved:true,testPaymentsCreated:0,testLedgerTransactionsCreated:0,realProviderRequests:0}));
  } finally {await stop();await pool.end();}
});

