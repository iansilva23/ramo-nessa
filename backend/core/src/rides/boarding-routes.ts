import type {AdminActor,AdminScope} from '../admin/admin-repository.js';
import type {RideRepository} from './ride-repository.js';
import type {FinanceRepository} from '../payments/finance-repository.js';
import {BoardingError,type PostgresBoardingStore} from './boarding-store.js';
import {resumePassengerRide} from './ride-resumption.js';
export async function boardingRoutes(i:{url:URL;method:string;store:PostgresBoardingStore|null;rides:RideRepository;finance:FinanceRepository;
 passenger():Promise<string>;driver():Promise<string>;authorize(scope:AdminScope):Promise<AdminActor>;body():Promise<unknown>;json(status:number,value:unknown):void;}):Promise<boolean>{
 const path=i.url.pathname;
 const passenger=path.match(/^\/v1\/rides\/([0-9a-f-]{36})\/boarding$/i);
 const driver=path.match(/^\/v1\/driver\/me\/rides\/([0-9a-f-]{36})\/boarding$/i);
 const override=path.match(/^\/v1\/admin\/rides\/([0-9a-f-]{36})\/boarding-override$/i);
 if(!passenger&&!driver&&!override&&!['/v1/passenger/me/ride','/v1/admin/boarding-policy'].includes(path))return false;
 try{
  if(path==='/v1/passenger/me/ride'&&i.method==='GET'){
   const id=await i.passenger(),last=i.url.searchParams.get('lastRideId');
   i.json(200,await resumePassengerRide({rides:i.rides,finance:i.finance,boarding:i.store,passengerId:id,...(last&&/^[0-9a-f-]{36}$/i.test(last)?{lastRideId:last}:{})}));return true;
  }
  if((passenger||driver)&&i.method==='GET'){
   const role=!!passenger,id=role?await i.passenger():await i.driver(),ride=await i.rides.findById((passenger??driver)![1]!);
   if(!ride||(role?ride.passengerId:ride.driverId)!==id)throw new BoardingError('RIDE_NOT_FOUND','Corrida não encontrada.',404);
   i.json(200,i.store?await i.store.view(ride.id,role):{required:false});return true;
  }
  if(path==='/v1/admin/boarding-policy'){
   const actor=await i.authorize(i.method==='GET'?'rides:read':'rides:write');
   if(!i.store)throw new BoardingError('POSTGRES_REQUIRED','Esta configuração exige banco persistente.',503);
   if(i.method==='GET'){i.json(200,await i.store.policy());return true;}
   if(i.method==='PUT'){i.json(200,await i.store.savePolicy(await i.body(),actor));return true;}
  }
  if(override&&i.method==='POST'){
   const actor=await i.authorize('rides:write');
   if(!i.store)throw new BoardingError('POSTGRES_REQUIRED','Esta ação exige banco persistente.',503);
   const body=await i.body() as {reason?:unknown};i.json(200,await i.store.override(override[1]!,actor,body?.reason));return true;
  }
  i.json(405,{error:'METHOD_NOT_ALLOWED'});return true;
 }catch(e){if(!(e instanceof BoardingError))throw e;i.json(e.status,{error:e.code,message:e.message});return true;}
}
