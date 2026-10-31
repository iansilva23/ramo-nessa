import {checkoutPresentation, isAbandonedCheckoutExpired} from './ride-checkout-presentation.js';
import type {RideRepository} from './ride-repository.js';
import type {FinanceRepository} from '../payments/finance-repository.js';
import {passengerRideView} from './passenger-ride-view.js';
import type {PostgresBoardingStore} from './boarding-store.js';
export const RECOVERABLE_RIDE_STATES=['INTERRUPTED','AWAITING_PAYMENT','PAID','SEARCHING_DRIVER','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','NO_DRIVER_FOUND'] as const;
export async function resumePassengerRide(input:{rides:RideRepository;finance:FinanceRepository;boarding:PostgresBoardingStore|null;passengerId:string;lastRideId?:string;rideId?:string;now?:Date}){
 let ride=input.rideId ? await input.rides.findById(input.rideId) : await input.rides.findRecoverableByPassengerId(input.passengerId);
 if(input.rideId && ride?.passengerId!==input.passengerId)return {ride:null};
 if(!ride&&!input.rideId&&input.lastRideId){const last=await input.rides.findById(input.lastRideId);if(last?.passengerId===input.passengerId)ride=last;}
 if(!ride)return {ride:null};
 const now=input.now??new Date();
 if(!input.rideId&&!input.lastRideId){
  const payment=await input.finance.findLatestPaymentByRideId(ride.id);
  if(isAbandonedCheckoutExpired(ride,payment,now)){
   const candidates=await input.rides.listAdminRecentByPassengerId(input.passengerId,50);
   ride=null;
   for(const candidate of candidates){
    if(!(RECOVERABLE_RIDE_STATES as readonly string[]).includes(candidate.state))continue;
    const existing=await input.finance.findLatestPaymentByRideId(candidate.id);
    if(!isAbandonedCheckoutExpired(candidate,existing,now)){ride=candidate;break;}
   }
  }
 }
 if(!ride)return {ride:null};
 const payment=await input.finance.findLatestPaymentByRideId(ride.id);
 const pix=ride.state==='AWAITING_PAYMENT'&&payment?.method==='pix'&&payment.status==='pending'&&input.boarding?await input.boarding.checkout(ride.id,payment.id):null;
 return {ride:{...passengerRideView(ride),...checkoutPresentation(ride,payment,now)},payment:payment?{id:payment.id,method:payment.method,status:payment.status,amountCents:payment.amountCents}:null,pix};
}
