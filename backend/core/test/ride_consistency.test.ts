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
import {isAbandonedCheckoutExpired} from '../src/rides/ride-checkout-presentation.js';

async function fixture() {
 const rides=new InMemoryRideRepository(),drivers=new InMemoryDriverSupplyRepository();
 const finance=new InMemoryFinanceRepository(),matching=new InMemoryRideMatchingRepository(rides,drivers);
 const base=await createRide(rides,{passengerId:'consistency-passenger',quoteRequest:{origin:{zoneId:'prea'},destination:{zoneId:'jericoacoara'},category:'comfort_black',period:'day',passengers:1}});
 const ride=await rides.save({...base,state:'AWAITING_PAYMENT',driverConsentRequired:true,driverId:'consistency-driver',reservedDriverId:'consistency-driver',driverHoldExpiresAt:new Date(Date.now()+60000).toISOString()});
 return {rides,drivers,finance,matching,ride};
}
test('six unpaid expired attempts leave active Activities without rewriting cash cancellations',async()=>{
 const c=await fixture();const now=new Date('2026-10-25T16:00:00Z');
 const {driverId:_driver,reservedDriverId:_reserved,...attempt}=c.ride;
 await c.rides.save({...c.ride,state:'CANCELLED_BY_DRIVER',paymentMethod:'cash',paymentStatus:'authorized'});
 const ids=['deff08f0','3603b4f3','01a12e9f','ea983590','3857bc69','ebd88b5a'];
 for(const id of ids) await c.rides.create({...attempt,id,driverConsentRequired:false,driverHoldExpiresAt:'2026-10-23T04:23:10Z',paymentExpiresAt:'2026-10-23T04:32:10Z'});
 const result=await passengerActivityForApp({...c,passengerId:c.ride.passengerId,now});
 assert.equal(result.rides.filter(r=>r.state==='EXPIRED').length,6);
 assert.equal(result.rides.find(r=>r.id===c.ride.id)?.state,'CANCELLED_BY_DRIVER');
 for(const id of ids) assert.equal((await c.rides.findById(id))?.state,'AWAITING_PAYMENT');
 assert.equal((await resumePassengerRide({...c,boarding:null,passengerId:c.ride.passengerId,now})).ride,null);
 const selected=await resumePassengerRide({...c,boarding:null,passengerId:c.ride.passengerId,rideId:ids[0]!,now});
 assert.equal(selected.ride?.state,'EXPIRED');assert.equal(selected.pix,null);assert.equal(selected.payment,null);
});
test('expiration never hides confirmed, assigned or paid trips and requires a known deadline',async()=>{
 const c=await fixture();const {driverId:_driver,reservedDriverId:_reserved,...attempt}=c.ride;
 const now=new Date('2026-10-25T16:00:00Z');
 const expired={...attempt,driverConsentRequired:false,driverHoldExpiresAt:'2026-10-23T04:00:00Z',paymentExpiresAt:'2026-10-23T04:10:00Z'};
 assert.equal(isAbandonedCheckoutExpired(expired,null,now),true);
 for(const protectedRide of [
  {...expired,paymentExpiresAt:'2026-10-26T00:00:00Z'},
  {...expired,paymentExpiresAt:'invalid'},
  {...expired,paymentMethod:'cash' as const,paymentStatus:'authorized' as const},
  {...expired,state:'IN_PROGRESS' as const,paymentStatus:'paid' as const},
  {...expired,driverId:'assigned-driver'},
 ]) assert.equal(isAbandonedCheckoutExpired(protectedRide,null,now),false);
 for(const status of ['created','pending','paid','refunded'] as const){
  const payment={id:randomUUID(),rideId:expired.id,method:'pix' as const,processor:'mercado-pago-orders',status,amountCents:expired.quote.totalAmountCents,idempotencyKey:'protected-checkout-'+status,createdAt:expired.createdAt,updatedAt:expired.updatedAt};
  assert.equal(isAbandonedCheckoutExpired(expired,payment,now),false);
 }
});
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

test('cancelled ride never exposes a stale pending Pix checkout during recovery',async()=>{
 const c=await fixture();await c.rides.save({...c.ride,state:'CANCELLED_BY_DRIVER'});
 await c.finance.createPayment({id:randomUUID(),rideId:c.ride.id,method:'pix',processor:'mercado-pago-orders',status:'pending',amountCents:c.ride.quote.totalAmountCents,idempotencyKey:'cancelled-pending-pix',createdAt:c.ride.createdAt,updatedAt:c.ride.updatedAt});
 const boarding={checkout:async()=>{throw Error('Cancelled trips must not recover a payment QR code');}} as never;
 const result=await resumePassengerRide({...c,boarding,passengerId:c.ride.passengerId,rideId:c.ride.id});
 assert.equal(result.pix,null);assert.equal(result.payment?.status,'pending');assert.equal(result.ride?.state,'CANCELLED_BY_DRIVER');
});
