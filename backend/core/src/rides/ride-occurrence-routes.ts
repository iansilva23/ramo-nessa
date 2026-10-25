import {OccurrenceError,type RideOccurrenceStore} from './ride-occurrence-store.js';
import type {AdminActor,AdminScope} from '../admin/admin-repository.js';
import type {RideSupportContext} from './ride-support-context.js';
export async function occurrenceRoutes(i:{path:string;method:string;store:RideOccurrenceStore|null;
 passenger():Promise<string>;driver():Promise<string>;authorize(scope:AdminScope):Promise<AdminActor>;
 body():Promise<any>;json(status:number,value:unknown):void;
 context(rideId:string,driverId:string):Promise<RideSupportContext>;
 refund(rideId:string):Promise<unknown>;settle(rideId:string,driverId:string):Promise<unknown>;dispatch(rideId:string):Promise<unknown>;publish(rideId:string):Promise<void>;
}){
 const passenger=i.path.match(/^\/v1\/rides\/([0-9a-f-]{36})\/occurrences(?:\/([0-9a-f-]{36}))?$/i);
 const driver=i.path.match(/^\/v1\/driver\/me\/rides\/([0-9a-f-]{36})\/(occurrences|cash-received)$/i);
 const returned=i.path.match(/^\/v1\/driver\/me\/occurrences\/([0-9a-f-]{36})\/cash-return$/i);
 const decision=i.path.match(/^\/v1\/admin\/ride-occurrences\/([0-9a-f-]{36})\/decision$/i);
 const admin=!!decision||['/v1/admin/occurrence-policy','/v1/admin/ride-occurrences'].includes(i.path);
 if(!passenger&&!driver&&!returned&&!admin)return false;
 try{
  if(admin){
   const actor=await i.authorize(i.method==='GET'?'support:read':'support:write');
   if(!i.store)throw new OccurrenceError('POSTGRES_REQUIRED','Recurso exige armazenamento persistente.',503);
   if(decision&&i.method==='POST'){
    const body=await i.body();if(['refund','pay_driver'].includes(body?.action)||body?.penalty===true)await i.authorize('finance:write');
    const record=await i.store.decide({id:decision[1]!,revision:body?.revision,action:body?.action,note:body?.note,penalty:body?.penalty===true,actor});
    const result=record.decision.action==='refund'?await i.refund(record.ride_id):record.decision.action==='pay_driver'?await i.settle(record.ride_id,record.driver_id):undefined;
    if(record.decision.action==='pay_driver')await i.store.finishDriverDecision(record.id);
    await i.publish(record.ride_id);i.json(200,{occurrence:record,result});return true;
   }
   if(i.path.endsWith('occurrence-policy')){
    if(i.method==='GET'){i.json(200,await i.store.policy());return true;}
    if(i.method==='PUT'){
     const body=await i.body();const previous=await i.store.policy();
     if(body?.bonusEnabled!==previous.bonusEnabled||JSON.stringify(body?.bonusCents)!==JSON.stringify(previous.bonusCents))await i.authorize('finance:write');
     i.json(200,await i.store.savePolicy(body,actor));return true;
    }
   }else if(i.method==='GET'){i.json(200,{items:await i.store.list()});return true;}
  }else{
   const subject=passenger?await i.passenger():await i.driver();
   if(!i.store)throw new OccurrenceError('POSTGRES_REQUIRED','Recurso desativado neste ambiente.',503);
   if(returned&&i.method==='POST'){const record=await i.store.cashReturned(returned[1]!,subject);await i.publish(record.ride_id);i.json(200,record);return true;}
   if(driver?.[2]==='cash-received'&&i.method==='POST'){i.json(200,await i.store.receiveCash(driver[1]!,subject));return true;}
   const rideId=(passenger??driver)![1]!;
   if(i.method==='GET'){i.json(200,await i.store.view(rideId,passenger?'passenger':'driver',subject));return true;}
   if(driver&&i.method==='POST'){
    const b=await i.body();const context=await i.context(rideId,subject);
    const record=await i.store.begin({rideId,driverId:subject,kind:b?.kind,statement:b?.statement,context});
    const refund=record.status==='refund_pending'?await i.refund(rideId):undefined;
    await i.publish(rideId);i.json(200,{occurrence:record,refund});return true;
   }
   if(passenger?.[2]&&i.method==='PUT'){
    const b=await i.body();await i.store.view(rideId,'passenger',subject);
    const record=await i.store.respond({id:passenger[2],rideId,passengerId:subject,revision:b?.revision,choice:b?.choice,statement:b?.statement,pickup:b?.pickup});
    const refund=record.status==='refund_pending'?await i.refund(rideId):undefined;
    const dispatch=record.status==='replacement_search'?await i.dispatch(rideId):undefined;
    await i.publish(rideId);i.json(200,{occurrence:record,refund,dispatch});return true;
   }
  }
  i.json(405,{error:'METHOD_NOT_ALLOWED'});return true;
 }catch(e){if(e instanceof OccurrenceError){i.json(e.status,{error:e.code,message:e.message});return true;}throw e;}
}
