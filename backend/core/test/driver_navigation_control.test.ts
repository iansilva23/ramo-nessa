import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {initialNavigationState,reserveNavigation,NavigationControlError,DriverNavigationControlStore} from '../src/routing/driver-navigation-control.js';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresRideRepository} from '../src/rides/repositories/postgres-ride-repository.js';
import {createRide} from '../src/rides/create-ride.js';

test('one route per phase plus four additional requests; no budget reset on a new phase',()=>{
 let s=initialNavigationState();
 s=reserveNavigation(s,'pickup',100000);assert.equal(s.recalculations,0);
 for(let i=1;i<=4;i++){s=reserveNavigation({...s,inFlightUntil:null},'pickup',100000+i*20000);assert.equal(s.recalculations,i);}
 assert.throws(()=>reserveNavigation({...s,inFlightUntil:null},'pickup',200000),(e:unknown)=>e instanceof NavigationControlError&&e.code==='NAVIGATION_LIMIT');
 s=reserveNavigation({...s,inFlightUntil:null},'dropoff',200000);assert.equal(s.recalculations,4);
 assert.throws(()=>reserveNavigation({...s,inFlightUntil:null},'dropoff',220000));
});
test('paused/own/external modes and concurrent or rapid calls cannot reserve a route',()=>{
 for(const mode of ['paused','own','external'] as const)assert.throws(()=>reserveNavigation({...initialNavigationState(),mode},'pickup',100000));
 const s=reserveNavigation(initialNavigationState(),'pickup',100000);
 assert.throws(()=>reserveNavigation(s,'pickup',100001));
 assert.throws(()=>reserveNavigation({...s,inFlightUntil:null},'pickup',100001));
 assert.equal(reserveNavigation({...s,inFlightUntil:null},'pickup',120000).recalculations,1);
});
test('PostgreSQL serializes reservations, persists choices across store recreation and never calls a provider after cap',
 {skip:process.env.RAMO_NAVIGATION_POSTGRES!=='true'},async()=>{
 const pool=createPostgresPool(process.env.DATABASE_URL!),repo=new PostgresRideRepository(pool),driverId='navigation-'+randomUUID();
 try {
  const ride=await createRide(repo,{passengerId:'navigation-passenger-'+randomUUID(),quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day'}});
  await repo.save({...ride,driverId,state:'DRIVER_ASSIGNED',pickupLatitude:-2.82,pickupLongitude:-40.41,dropoffLatitude:-2.79,dropoffLongitude:-40.51});
  const store=new DriverNavigationControlStore(pool);
  assert.equal((await store.policy()).enabled,false);
  const actor={kind:'user' as const,id:'navigation-test',name:'Navigation test'};
  await store.savePolicy({enabled:true,revision:0},actor);
  await assert.rejects(store.state(ride.id,'another-driver'),(e:unknown)=>e instanceof NavigationControlError&&e.status===404);
  let r=await store.reserve(ride.id,driverId,'initial');await store.finish(ride.id,r.token,true);
  const age=()=>pool.query("UPDATE driver_navigation_control SET last_request_at=now()-interval '20 seconds' WHERE ride_id=$1",[ride.id]);
  await age();
  const concurrent=await Promise.allSettled(Array.from({length:6},()=>store.reserve(ride.id,driverId,'off_route')));
  const winners=concurrent.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof store.reserve>>>=>r.status==='fulfilled');
  assert.equal(winners.length,1);await store.finish(ride.id,winners[0]!.value.token,true);
  for(let i=0;i<3;i++){await age();r=await store.reserve(ride.id,driverId,'off_route');await store.finish(ride.id,r.token,i!==0);}
  await age();
  assert.equal((await store.state(ride.id,driverId)).recalculations,4);
  await assert.rejects(store.reserve(ride.id,driverId,'resume'),(e:unknown)=>e instanceof NavigationControlError&&e.code==='NAVIGATION_LIMIT');
  assert.equal((await pool.query('SELECT count(*)::int n FROM driver_navigation_requests WHERE ride_id=$1',[ride.id])).rows[0].n,5);
  await store.mode(ride.id,driverId,'external');
  assert.equal((await new DriverNavigationControlStore(pool).state(ride.id,driverId)).mode,'external');
  await assert.rejects(store.reserve(ride.id,driverId,'initial'));
  await assert.rejects(store.mode(ride.id,driverId,'internal'));
  assert.equal((await repo.findById(ride.id))?.state,'DRIVER_ASSIGNED');
 }finally{await pool.query('UPDATE driver_navigation_policy SET enabled=false,revision=0');await pool.end();}
});
