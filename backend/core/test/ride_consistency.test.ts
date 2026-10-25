import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRide} from '../src/rides/create-ride.js';
import {InMemoryRideRepository} from '../src/rides/repositories/in-memory-ride-repository.js';
import {InMemoryDriverSupplyRepository} from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import {InMemoryRideMatchingRepository} from '../src/matching/in-memory-ride-matching-repository.js';
import {InMemoryFinanceRepository} from '../src/payments/repositories/in-memory-finance-repository.js';
import {confirmRidePayment} from '../src/rides/confirm-payment.js';
import {resumePassengerRide} from '../src/rides/ride-resumption.js';
import {passengerActivityForApp} from '../src/rides/passenger-activity-service.js';
import {createPaymentForRide} from '../src/payments/create-payment.js';

async function fixture() {
 const rides=new InMemoryRideRepository(),drivers=new InMemoryDriverSupplyRepository();
 const finance=new InMemoryFinanceRepository(),matching=new InMemoryRideMatchingRepository(rides,drivers);
 const base=await createRide(rides,{passengerId:'consistency-passenger',quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day',passengers:1}});
 const ride=await rides.save({...base,state:'AWAITING_PAYMENT',driverConsentRequired:true,driverId:'consistency-driver',reservedDriverId:'consistency-driver',driverHoldExpiresAt:new Date(Date.now()+60000).toISOString()});
 return {rides,drivers,finance,matching,ride};
}
test('driver cancellation of accepted prepayment hold is terminal, owned and idempotent',async()=>{
 const c=await fixture();
 await assert.rejects(c.matching.releasePrepaymentHold({rideId:c.ride.id,at:new Date().toISOString(),cancelledByDriverId:'other-driver'}));
 assert.equal((await c.rides.findById(c.ride.id))?.state,'AWAITING_PAYMENT');
 const cancel=()=>c.matching.releasePrepaymentHold({rideId:c.ride.id,at:new Date().toISOString(),cancelledByDriverId:'consistency-driver'});
 const closed=await cancel();assert.equal(closed.state,'CANCELLED_BY_DRIVER');assert.equal(closed.driverId,'consistency-driver');
 assert.equal((await cancel()).state,'CANCELLED_BY_DRIVER');
 await assert.rejects(createPaymentForRide(c.finance,{ride:closed,method:'pix',processor:'test',idempotencyKey:'closed-trip-payment'}),{code:'RIDE_NOT_AWAITING_PAYMENT'});
 const activity=await passengerActivityForApp({rides:c.rides,passengerId:c.ride.passengerId});
 assert.equal(activity.rides.find(r=>r.id===c.ride.id)?.state,'CANCELLED_BY_DRIVER');
 const resumed=await resumePassengerRide({...c,boarding:null,passengerId:c.ride.passengerId,rideId:c.ride.id});
 assert.equal(resumed.ride?.state,'CANCELLED_BY_DRIVER');
 assert.equal((await resumePassengerRide({...c,boarding:null,passengerId:c.ride.passengerId})).ride,null);
});
test('ordinary hold release keeps existing semantics without fabricating a cancellation',async()=>{
 const c=await fixture();const released=await c.matching.releasePrepaymentHold({rideId:c.ride.id,at:new Date().toISOString()});
 assert.equal(released.state,'AWAITING_PAYMENT');assert.equal(released.driverId,undefined);
});
test('late confirmed Pix is recorded against cancelled ride without reactivation',async()=>{
 const c=await fixture();await c.matching.releasePrepaymentHold({rideId:c.ride.id,at:new Date().toISOString(),cancelledByDriverId:'consistency-driver'});
 const payment={id:randomUUID(),rideId:c.ride.id,method:'pix' as const,processor:'mercado-pago-orders',status:'paid' as const,amountCents:c.ride.quote.totalAmountCents,idempotencyKey:'late-closed-pix',createdAt:c.ride.createdAt,updatedAt:c.ride.updatedAt};
 for(let n=0;n<2;n++){
  const closed=await confirmRidePayment(c.rides,{rideId:c.ride.id,payment,notifyPassenger:false});
  assert.equal(closed.state,'CANCELLED_BY_DRIVER');assert.equal(closed.paymentStatus,'paid');assert.equal(closed.cancellationState,'CANCELLED_BY_DRIVER');
 }
 assert.equal(await c.rides.findRecoverableByPassengerId(c.ride.passengerId),null);
 const closed=(await c.rides.findById(c.ride.id))!;
 assert.equal((await c.rides.save({...closed,state:'REFUND_PENDING'})).cancellationState,'CANCELLED_BY_DRIVER');
});
test('activity rechecks the current ride when parallel reads straddle cancellation',async()=>{
 const c=await fixture();const old=c.ride;
 c.rides.findRecoverableByPassengerId=async()=>old;
 await c.rides.save({...old,state:'CANCELLED_BY_DRIVER'});
 const activity=await passengerActivityForApp({rides:c.rides,passengerId:old.passengerId});
 assert.equal(activity.rides.filter(r=>r.id===old.id).length,1);
 assert.equal(activity.rides[0]?.state,'CANCELLED_BY_DRIVER');
});
