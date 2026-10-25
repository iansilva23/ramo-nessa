import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createRide} from '../src/rides/create-ride.js';
import {resumePassengerRide} from '../src/rides/ride-resumption.js';
import {passengerActivityForApp} from '../src/rides/passenger-activity-service.js';
import {InMemoryRideRepository} from '../src/rides/repositories/in-memory-ride-repository.js';
import {InMemoryFinanceRepository} from '../src/payments/repositories/in-memory-finance-repository.js';
import {InMemoryDriverSupplyRepository} from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import {InMemoryDriverRegistryRepository} from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import {InMemoryDriverSupportRepository} from '../src/drivers/repositories/in-memory-driver-support-repository.js';
import {createDriverSupportTicket, createPassengerSupportTicket, listSupportTicketsForAdmin, listPassengerSupportTickets} from '../src/drivers/driver-support-service.js';
import {currentDriverRide} from '../src/drivers/driver-ride-service.js';

async function fixture(){
 const rides=new InMemoryRideRepository(),finance=new InMemoryFinanceRepository(),drivers=new InMemoryDriverSupplyRepository(),registry=new InMemoryDriverRegistryRepository(),repository=new InMemoryDriverSupportRepository();
 const ride=await createRide(rides,{passengerId:'passenger-one',quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day'}});
 const active=await rides.save({...ride,state:'DRIVER_ARRIVED',driverId:'driver-one',paymentMethod:'pix',paymentStatus:'paid'});
 const now=new Date().toISOString();
 await drivers.upsert({driverId:'driver-one',vehicleId:'vehicle-one',categories:['comfort_black'],fourByFour:true,seatCapacity:4,online:false,busy:false,latitude:-2.8,longitude:-40.5,locationUpdatedAt:now,updatedAt:now});
 await registry.upsertProfile({driverId:'driver-one',fullName:'João Teste',status:'approved',createdAt:now,updatedAt:now});
 const payment=await finance.createPayment({id:randomUUID(),rideId:ride.id,method:'pix',processor:'test',status:'paid',amountCents:ride.quote.totalAmountCents,idempotencyKey:randomUUID(),createdAt:now,updatedAt:now});
 return {rides,finance,drivers,registry,repository,ride:active,payment};
}
test('activity keeps an older active ride ahead of recent history and reopening is read-only',async()=>{
 const f=await fixture();
 for(let n=0;n<35;n++)await f.rides.create({...f.ride,id:randomUUID(),state:'COMPLETED',updatedAt:new Date(Date.now()+n*1000).toISOString()});
 const activity=await passengerActivityForApp({rides:f.rides,passengerId:f.ride.passengerId,limit:3,registry:f.registry});
 assert.equal(activity.rides[0]?.id,f.ride.id);assert.equal(activity.rides[0]?.paymentStatus,'paid');
 f.finance.createPayment=async()=>{throw Error('Recovery cannot charge');};
 for(let n=0;n<3;n++){
 const restored=await resumePassengerRide({...f,boarding:null,passengerId:f.ride.passengerId,rideId:f.ride.id});
 assert.equal(restored.ride?.id,f.ride.id);assert.equal(restored.payment?.id,f.payment.id);
 }
 assert.equal((await currentDriverRide({...f,driverId:'driver-one'}))?.id,f.ride.id,'completed history and supply flags must not hide an active assignment');
});
test('selected ride cannot switch to another active ride or disclose another passenger',async()=>{
 const f=await fixture();
 const other=await f.rides.create({...f.ride,id:randomUUID(),passengerId:'someone-else',state:'IN_PROGRESS'});
 assert.deepEqual(await resumePassengerRide({...f,boarding:null,passengerId:f.ride.passengerId,rideId:other.id}),{ride:null});
 const pending=await f.rides.create({...f.ride,id:randomUUID(),state:'AWAITING_PAYMENT'});
 assert.equal((await resumePassengerRide({...f,boarding:null,passengerId:f.ride.passengerId,rideId:pending.id})).ride?.id,pending.id);
});
test('both roles link support to server evidence, with ownership checks and a frozen snapshot',async()=>{
 const f=await fixture();const deps={rides:f.rides,finance:f.finance,drivers:f.drivers,registry:f.registry};
 const ticket=await createPassengerSupportTicket({repository:f.repository,passengerId:f.ride.passengerId,rideDependencies:deps,rideId:f.ride.id,category:'ride',subject:'Motorista não chegou',message:'O motorista não está no ponto de embarque.'});
 assert.equal(ticket.rideId,f.ride.id);assert.ok(!('rideContext' in ticket),'private evidence is exposed only to moderation');
 await createDriverSupportTicket({repository:f.repository,driverId:'driver-one',rideDependencies:deps,rideId:f.ride.id,category:'ride',subject:'Passageiro ausente',message:'Não encontrei o passageiro no ponto combinado.'});
 await f.rides.save({...f.ride,state:'IN_PROGRESS'});
 const admin=await listSupportTicketsForAdmin({repository:f.repository});
 assert.equal(admin.tickets.length,2);assert.equal(admin.tickets[0]?.rideContext?.ride.state,'DRIVER_ARRIVED');
 assert.equal(admin.tickets[0]?.rideContext?.payment?.id,f.payment.id);
 assert.deepEqual(admin.tickets[0]?.rideContext?.events,[],'historical GPS and arrival times must never be invented');
 assert.equal((await listPassengerSupportTickets({repository:f.repository,passengerId:'another-passenger'})).tickets.length,0);
 for(const requester of ['passenger','driver'] as const){
 const create=requester==='passenger'?()=>createPassengerSupportTicket({repository:f.repository,passengerId:'another-passenger',rideDependencies:deps,rideId:f.ride.id,category:'ride',subject:'Invasão',message:'Não pode vincular a corrida de outra pessoa.'}):()=>createDriverSupportTicket({repository:f.repository,driverId:'another-driver',rideDependencies:deps,rideId:f.ride.id,category:'ride',subject:'Invasão',message:'Não pode vincular a corrida de outra pessoa.'});
 await assert.rejects(create,{code:'SUPPORT_RIDE_UNAVAILABLE'});
 }
});

test('PostgreSQL freezes arrival GPS with observation time and persists moderation context', {skip: !process.env.DATABASE_URL}, async()=>{
 const {createPostgresPool}=await import('../src/db/postgres.js');
 const {PostgresRideRepository}=await import('../src/rides/repositories/postgres-ride-repository.js');
 const {PostgresDriverSupportRepository}=await import('../src/drivers/repositories/postgres-driver-support-repository.js');
 const pool=createPostgresPool(process.env.DATABASE_URL!);
 const f=await fixture(),rides=new PostgresRideRepository(pool),repository=new PostgresDriverSupportRepository(pool);
 const driverId='activity-'+randomUUID(), passengerId='activity-'+randomUUID(), identityId=randomUUID();
 const ride={...f.ride,id:randomUUID(),driverId,passengerId,state:'DRIVER_ASSIGNED' as const};
 const tickets:string[]=[];
 try{
  await pool.query("INSERT INTO driver_profiles(driver_id,full_name,status,created_at,updated_at) VALUES ($1,'Motorista teste','approved',NOW(),NOW())",[driverId]);
  await pool.query("INSERT INTO auth_identities(id,subject_id,subject_type,phone_e164,status,created_at,updated_at) VALUES($1,$2,'passenger',$3,'active',NOW(),NOW())",[identityId,passengerId,'+55889'+String(Math.floor(10000000+Math.random()*89999999))]);
  await pool.query("INSERT INTO driver_supply(driver_id,vehicle_id,categories,four_by_four,seat_capacity,online,latitude,longitude,location_updated_at) VALUES($1,$2,ARRAY['comfort_black'],true,4,false,-2.8,-40.5,'2026-10-25T14:38:00Z')",[driverId,randomUUID()]);
  await rides.create(ride);
  const arrived={...ride,state:'DRIVER_ARRIVED' as const};
  await rides.save(arrived);await rides.save(arrived);
  const events=await rides.listActivityEvents(ride.id);
  assert.equal(events.length,2,'same-state saves must not duplicate timeline entries');
  assert.equal(Date.parse(events[1]!.driverLocation!.observedAt),Date.parse('2026-10-25T14:38:00Z')); 
  assert.equal(events[1]?.driverLocation?.accuracyMeters,null,'missing accuracy must stay unknown');
  await pool.query('UPDATE driver_supply SET latitude=-3,location_updated_at=NOW() WHERE driver_id=$1',[driverId]);
  const ticket=await createPassengerSupportTicket({repository,passengerId,rideId:ride.id,rideDependencies:{...f,rides},category:'ride',subject:'Chegada divergente',message:'Não encontrei o motorista no ponto de embarque.'});
  tickets.push(ticket.id);
  const stored=await repository.findById(ticket.id);
  assert.equal(stored?.rideContext?.events[1]?.driverLocation?.latitude,-2.8,'later GPS must not rewrite arrival evidence');
  await rides.save({...arrived,state:'IN_PROGRESS'});
  assert.equal((await repository.findById(ticket.id))?.rideContext?.ride.state,'DRIVER_ARRIVED');
  assert.equal((await repository.listByPassenger(passengerId,50,ride.id)).length,1);
  assert.equal((await repository.listByPassenger(passengerId,50,randomUUID())).length,0);
 }finally{
  await pool.query('DELETE FROM driver_support_tickets WHERE id=ANY($1::uuid[])',[tickets]);
  await pool.query('DELETE FROM rides WHERE id=$1',[ride.id]);
  await pool.query('DELETE FROM driver_supply WHERE driver_id=$1',[driverId]);
  await pool.query('DELETE FROM driver_profiles WHERE driver_id=$1',[driverId]);
  await pool.query('DELETE FROM auth_identities WHERE id=$1',[identityId]);
  await pool.end();
 }
});
