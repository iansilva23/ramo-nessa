import type {RideRepository} from './ride-repository.js';
import type {FinanceRepository} from '../payments/finance-repository.js';
import {passengerRideView} from './passenger-ride-view.js';
import type {PostgresBoardingStore} from './boarding-store.js';
export const RECOVERABLE_RIDE_STATES=['AWAITING_PAYMENT','PAID','SEARCHING_DRIVER','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','NO_DRIVER_FOUND','REFUND_PENDING'] as const;
export async function resumePassengerRide(input:{rides:RideRepository;finance:FinanceRepository;boarding:PostgresBoardingStore|null;passengerId:string;lastRideId?:string}){
 let ride=await input.rides.findRecoverableByPassengerId(input.passengerId);
 if(!ride&&input.lastRideId){const last=await input.rides.findById(input.lastRideId);if(last?.passengerId===input.passengerId)ride=last;}
 if(!ride)return {ride:null};
 const payment=await input.finance.findLatestPaymentByRideId(ride.id);
 const pix=payment?.method==='pix'&&payment.status==='pending'&&input.boarding?await input.boarding.checkout(ride.id,payment.id):null;
 return {ride:passengerRideView(ride),payment:payment?{id:payment.id,method:payment.method,status:payment.status}:null,pix};
}
