import { updateDriverSupplyFromApp } from '../src/drivers/driver-app-service.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresRideMatchingRepository } from '../src/matching/postgres-ride-matching-repository.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresDriverSupplyRepository } from '../src/drivers/repositories/postgres-driver-supply-repository.js';

test('isolated PostgreSQL serializes simultaneous offer acceptance and rejection', { skip: process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only' }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/ramo_lock_test');
  const pool = createPostgresPool(url.toString());
  const rides = new PostgresRideRepository(pool);
  const drivers = new PostgresDriverSupplyRepository(pool);
  const matching = new PostgresRideMatchingRepository(pool);
  const start = new Date('2026-10-01T12:00:00.000Z');
  const event = new Date(start.getTime() + 5000).toISOString();
  try {
    for (let index = 0; index < 30; index++) {
      const rideId = randomUUID();
      const driverId = 'race-driver-' + randomUUID();
      await rides.create({
        id: rideId, passengerId: 'race-passenger-' + randomUUID(),
        state: 'PAID', paymentStatus: 'paid',
        origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' },
        category: 'car', period: 'day', passengers: 1,
        quote: { ruleId: 'test', baseAmountCents: 1000, pickupCompensationCents: 0,
          totalAmountCents: 1000, platformCommissionCents: 100, driverNetCents: 900 },
        createdAt: start.toISOString(), updatedAt: start.toISOString(),
      });
      await drivers.upsert({
        driverId, vehicleId: 'race-vehicle-' + randomUUID(), categories: ['car'],
        fourByFour: false, seatCapacity: 4, online: true, busy: false,
        latitude: -2.821, longitude: -40.414,
        locationUpdatedAt: start.toISOString(), updatedAt: start.toISOString(),
      });
      const created = await matching.createOffer({
        rideId, driverId, approximatePickupDistanceKm: 1,
        createdAt: start.toISOString(),
        expiresAt: new Date(start.getTime() + 35000).toISOString(),
      });
      const accept = () => matching.acceptOffer({offerId: created.offer.id, driverId, acceptedAt: event});
      const reject = () => matching.rejectOffer({offerId: created.offer.id, driverId, rejectedAt: event});
      const attempts = index % 2 === 0 ? [accept(), reject()] : [reject(), accept()];
      const results = await Promise.allSettled(attempts);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const offer = await matching.findOfferById(created.offer.id);
      const ride = await rides.findById(rideId);
      const supply = await drivers.findByDriverId(driverId);
      assert.ok(offer && ride && supply);
      if (offer.status === 'ACCEPTED') {
        assert.equal(ride.driverId, driverId);
        assert.equal(ride.state, 'DRIVER_ASSIGNED');
        assert.equal(supply.busy, true);
      } else {
        assert.equal(offer.status, 'REJECTED');
        assert.notEqual(ride.driverId, driverId);
        assert.equal(supply.busy, false);
      }
    }
  } finally {
    await pool.end();
  }
});

test('isolated PostgreSQL serializes acceptance and rejection before payment', { skip: process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only' }, async () => {
 const url = new URL(process.env.DATABASE_URL ?? '');
 assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/ramo_lock_test');
 const pool=createPostgresPool(url.toString()), rides=new PostgresRideRepository(pool);
 const drivers=new PostgresDriverSupplyRepository(pool), matching=new PostgresRideMatchingRepository(pool);
 const start=new Date('2026-10-01T12:00:00.000Z'), event=new Date(start.getTime()+5000).toISOString();
 const hold=new Date(start.getTime()+120000).toISOString();
 try {
  for(let index=0;index<30;index++){
   const rideId=randomUUID(), driverId='prepay-driver-'+randomUUID();
   const vehicleId='prepay-vehicle-'+randomUUID();
   await drivers.upsert({driverId,vehicleId,categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:start.toISOString(),updatedAt:start.toISOString()});
   await rides.create({id:rideId,passengerId:'prepay-passenger-'+randomUUID(),state:'AWAITING_PAYMENT',paymentStatus:'created',
    driverConsentRequired:true,reservedDriverId:driverId,driverHoldExpiresAt:hold,origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},
    category:'car',period:'day',passengers:1,quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},
    createdAt:start.toISOString(),updatedAt:start.toISOString()});
   await drivers.upsert({driverId,vehicleId,categories:['car'],fourByFour:false,seatCapacity:4,online:true,busy:false,
    reservedRideId:rideId,reservedUntil:hold,latitude:-2.821,longitude:-40.414,locationUpdatedAt:start.toISOString(),updatedAt:start.toISOString()});
   const created=await matching.createOffer({rideId,driverId,approximatePickupDistanceKm:1,createdAt:start.toISOString(),expiresAt:new Date(start.getTime()+35000).toISOString()});
   const accept=()=>matching.acceptOffer({offerId:created.offer.id,driverId,acceptedAt:event});
   const reject=()=>matching.rejectOffer({offerId:created.offer.id,driverId,rejectedAt:event});
   const results=await Promise.allSettled(index%2===0?[accept(),reject()]:[reject(),accept()]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const offer=await matching.findOfferById(created.offer.id), ride=await rides.findById(rideId), supply=await drivers.findByDriverId(driverId);
   assert.ok(offer && ride && supply);
   if(offer.status==='ACCEPTED'){assert.equal(ride.driverId,driverId);assert.equal(ride.state,'AWAITING_PAYMENT');assert.equal(supply.busy,false);assert.equal(supply.reservedRideId,rideId);}
   else {assert.equal(offer.status,'REJECTED');assert.notEqual(ride.driverId,driverId);assert.equal(supply.busy,false);}
  }
 } finally { await pool.end(); }
});

test('diagnostic: accepted prepayment hold is reserved before driver becomes busy', { skip: process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only' }, async () => {
 const url=new URL(process.env.DATABASE_URL ?? '');
 assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.pathname,'/ramo_lock_test');
 const pool=createPostgresPool(url.toString()), rides=new PostgresRideRepository(pool);
 const drivers=new PostgresDriverSupplyRepository(pool), matching=new PostgresRideMatchingRepository(pool);
 const start=new Date('2026-10-01T12:00:00.000Z'), hold=new Date(start.getTime()+120000).toISOString();
 const rideId=randomUUID(),driverId='diagnostic-driver-'+randomUUID(),vehicleId='diagnostic-vehicle-'+randomUUID();
 const supply={driverId,vehicleId,categories:['car'] as ('car')[],fourByFour:false,seatCapacity:4,online:true,busy:false,latitude:-2.821,longitude:-40.414,locationUpdatedAt:start.toISOString(),updatedAt:start.toISOString()};
 try {
  await drivers.upsert(supply);
  await rides.create({id:rideId,passengerId:'diagnostic-passenger-'+randomUUID(),state:'AWAITING_PAYMENT',paymentStatus:'created',driverConsentRequired:true,
   reservedDriverId:driverId,driverHoldExpiresAt:hold,origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},category:'car',period:'day',passengers:1,
   quote:{ruleId:'test',baseAmountCents:1000,pickupCompensationCents:0,totalAmountCents:1000,platformCommissionCents:100,driverNetCents:900},
   createdAt:start.toISOString(),updatedAt:start.toISOString()});
  await drivers.upsert({...supply,reservedRideId:rideId,reservedUntil:hold});
  const created=await matching.createOffer({rideId,driverId,approximatePickupDistanceKm:1,createdAt:start.toISOString(),expiresAt:new Date(start.getTime()+35000).toISOString()});
  await matching.acceptOffer({offerId:created.offer.id,driverId,acceptedAt:new Date(start.getTime()+5000).toISOString()});
  const before=await drivers.findByDriverId(driverId);
  assert.ok(before); assert.equal(before.busy,false); assert.equal(before.reservedRideId,rideId);
  const registry={findProfile:async()=>({status:'approved'}),findVehicleByDriverId:async()=>({id:vehicleId,status:'approved',categories:['car'],fourByFour:false,seatCapacity:4})} as unknown as Parameters<typeof updateDriverSupplyFromApp>[0]['registry'];
  const documents={} as Parameters<typeof updateDriverSupplyFromApp>[0]['documents'];
  const after=await updateDriverSupplyFromApp({drivers,registry,documents,driverId,online:false,now:new Date(start.getTime()+6000)});
  assert.equal(after.online,false, 'diagnostic documents existing offline behavior, not the required final behavior');
  assert.equal(after.reservedRideId,rideId);
 } finally {await pool.end();}
});


test('diagnostic: going offline before acceptance leaves offer pending', { skip: process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only' }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/ramo_lock_test');
  const pool = createPostgresPool(url.toString());
  const rides = new PostgresRideRepository(pool), drivers = new PostgresDriverSupplyRepository(pool);
  const matching = new PostgresRideMatchingRepository(pool);
  const start = new Date('2026-10-01T12:00:00.000Z');
  const rideId = randomUUID(), driverId = 'offline-diagnostic-' + randomUUID(), vehicleId = randomUUID();
  try {
    await rides.create({ id: rideId, passengerId: 'diagnostic-' + randomUUID(), state: 'PAID', paymentStatus: 'paid',
      origin: {zoneId: 'prea'}, destination: {zoneId: 'jijoca'}, category: 'car', period: 'day', passengers: 1,
      quote: {ruleId:'test', baseAmountCents:1000, pickupCompensationCents:0, totalAmountCents:1000, platformCommissionCents:100, driverNetCents:900},
      createdAt:start.toISOString(), updatedAt:start.toISOString() });
    const supply = {driverId, vehicleId, categories:['car'] as ('car')[], fourByFour:false, seatCapacity:4,
      online:true, busy:false, latitude:-2.821, longitude:-40.414, locationUpdatedAt:start.toISOString(), updatedAt:start.toISOString()};
    await drivers.upsert(supply);
    const offer = await matching.createOffer({rideId, driverId, approximatePickupDistanceKm:1,
      createdAt:start.toISOString(), expiresAt:new Date(start.getTime()+35000).toISOString()});
    await drivers.upsert({...supply, online:false}, {preserveRideState:true});
    await assert.rejects(() => matching.acceptOffer({offerId:offer.offer.id, driverId,
      acceptedAt:new Date(start.getTime()+5000).toISOString()}), (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'DRIVER_NOT_AVAILABLE');
    assert.equal((await matching.findOfferById(offer.offer.id))?.status, 'OFFERED');
    assert.equal((await rides.findById(rideId))?.state, 'SEARCHING_DRIVER');
  } finally { await pool.end(); }
});


test('screen lock and acceptance serialize without abandoning an accepted paid ride', { skip: process.env.RAMO_LOCK_RACE_TEST !== 'isolated-ci-only' }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/ramo_lock_test');
  const pool = createPostgresPool(url.toString()), rides = new PostgresRideRepository(pool);
  const drivers = new PostgresDriverSupplyRepository(pool), matching = new PostgresRideMatchingRepository(pool);
  const start = new Date('2026-10-01T12:00:00.000Z'), at = new Date(start.getTime()+5000).toISOString();
  try {
    for (let i=0; i<32; i++) {
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
      if(i===0) { assert.equal(await lock(),'REJECTED'); await assert.rejects(accept); }
      else if(i===1) { await accept(); assert.equal(await lock(),'ACCEPTED'); }
      else await Promise.allSettled(i%2===0?[lock(),accept()]:[accept(),lock()]);
      const offer=await matching.findOfferById(created.offer.id),ride=await rides.findById(rideId),supply=await drivers.findByDriverId(driverId);
      assert.ok(offer && ride && supply);
      assert.equal(ride.paymentStatus,'paid');
      if(offer.status==='ACCEPTED') {
        assert.equal(ride.driverId,driverId); assert.equal(ride.state,'DRIVER_ASSIGNED');
        assert.equal(supply.busy,true); assert.equal(supply.online,true);
      } else {
        assert.equal(offer.status,'REJECTED'); assert.equal(supply.online,false);
        assert.equal(supply.busy,false); assert.notEqual(ride.driverId,driverId);
      }
    }
  } finally { await pool.end(); }
});
