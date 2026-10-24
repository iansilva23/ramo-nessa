import type {AdminActor,AdminScope} from '../admin/admin-repository.js';
import type {RideRepository} from './ride-repository.js';
import type {AuthOtpRepository} from '../auth/auth-otp-repository.js';
import {CancellationError} from './manual-cancellation-policy.js';
import {publicCancellation,type PostgresManualCancellationStore,type ManualCancellation} from './manual-cancellation-store.js';
export async function handleManualCancellationRoutes(input:{
 path:string;method:string;store:PostgresManualCancellationStore|null;rides:RideRepository;identities:AuthOtpRepository;
 passenger():Promise<string>;driver():Promise<string>;authorize(scope:AdminScope):Promise<AdminActor>;
 readBody():Promise<unknown>;json(status:number,value:unknown):void;cancelled(record:ManualCancellation):Promise<void>;
}):Promise<boolean>{
 const {path,method,store}=input;
 const passenger=path.match(/^\/v1\/rides\/([0-9a-f-]{36})\/(cancellation|refund-pix|cancel-search)$/i);
 if(passenger?.[2]==='cancel-search'&&!store)return false;
 const driver=path.match(/^\/v1\/driver\/me\/rides\/([0-9a-f-]{36})\/identification$/i);
 const adminCase=path.match(/^\/v1\/admin\/manual-refunds\/([0-9a-f-]{36})\/(review|paid)$/i);
 const adminDetail=path.match(/^\/v1\/admin\/manual-refunds\/([0-9a-f-]{36})$/i);
 const adminCancel=path.match(/^\/v1\/admin\/rides\/([0-9a-f-]{36})\/cancel$/i);
 if(!passenger&&!driver&&!adminCase&&!adminDetail&&!adminCancel&&!['/v1/admin/manual-refunds','/v1/admin/cancellation-policy'].includes(path))return false;
 try{
  if(driver&&method==='GET'){
   const driverId=await input.driver(),ride=await input.rides.findById(driver[1]!);
   if(!ride||ride.driverId!==driverId){input.json(404,{error:'RIDE_NOT_FOUND'});return true;}
   const identity=await input.identities.findIdentityBySubject('passenger',ride.passengerId);
   const cancellation=await store?.find(ride.id);
   input.json(200,{passengerName:identity?.fullName?.trim()||'Passageiro Ramo Nessa',
    terms:store?await store.terms(ride.id):null,cancellationFeeCents:cancellation?.creditedFeeCents??0});return true;
  }
  if(passenger){
   const passengerId=await input.passenger(),ride=await input.rides.findById(passenger[1]!);
   if(!ride||ride.passengerId!==passengerId){input.json(404,{error:'RIDE_NOT_FOUND'});return true;}
   if(!store)throw new CancellationError('POSTGRES_REQUIRED','Devoluções manuais exigem armazenamento persistente.',503);
   if(method==='GET'&&passenger[2]==='cancellation'){
    const c=await store.find(ride.id),terms=await store.terms(ride.id);
    input.json(200,{terms,cancellation:c?publicCancellation(c):null,
     canCancel:terms.systemEnabled&&['PAID','SEARCHING_DRIVER','NO_DRIVER_FOUND','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(ride.state)});return true;
   }
   if(method==='POST'&&['cancellation','cancel-search'].includes(passenger[2]!)){
    const body=await input.readBody() as {reason?:unknown};
    const c=await store.cancel({rideId:ride.id,passengerId,actor:passengerId,passenger:true,reason:typeof body?.reason==='string'?body.reason:'Desistência do passageiro'});
    await input.cancelled(c);input.json(200,{cancellation:publicCancellation(c),refundStatus:'manual_review'});return true;
   }
   if(method==='PUT'&&passenger[2]==='refund-pix'){
    const body=await input.readBody();const c=await store.setPix(ride.id,passengerId,body);
    input.json(200,{cancellation:publicCancellation(c)});return true;
   }
  }else{
   const actor=await input.authorize(method==='GET'?'finance:read':'finance:write');
   if(!store)throw new CancellationError('POSTGRES_REQUIRED','Devoluções manuais exigem armazenamento persistente.',503);
   const actorKey=JSON.stringify(actor);
   if(adminDetail&&method==='GET'){
    const c=await store.find(adminDetail[1]!);if(!c){input.json(404,{error:'CASE_NOT_FOUND'});return true;}
    input.json(200,{...c,terms:await store.terms(c.rideId)});return true;
   }
   if(path==='/v1/admin/manual-refunds'&&method==='GET'){input.json(200,{items:await store.list()});return true;}
   if(path==='/v1/admin/cancellation-policy'&&method==='GET'){input.json(200,await store.policy());return true;}
   if(path==='/v1/admin/cancellation-policy'&&method==='PUT'){
    const b=await input.readBody() as {rules?:unknown;revision?:unknown;systemEnabled?:unknown};
    if(typeof b?.systemEnabled!=='boolean')throw new CancellationError('INVALID_SWITCH','Informe se o sistema está ativado ou desativado.',400);
    input.json(200,await store.savePolicy(b?.rules,Number(b?.revision),actorKey,b.systemEnabled));return true;
   }
   if(adminCancel&&method==='POST'){
    await input.authorize('rides:write');
    const ride=await input.rides.findById(adminCancel[1]!);
    if(!ride){input.json(404,{error:'RIDE_NOT_FOUND'});return true;}
    if(!ride.manualRefund&&!(await store.policy()).systemEnabled)return false;
    if(!ride.manualRefund&&['CANCELLED_BY_ADMIN','REFUND_PENDING','REFUNDED'].includes(ride.state))return false;
    const b=await input.readBody() as {reason?:unknown};
    const c=await store.cancel({rideId:ride.id,passengerId:ride.passengerId,actor:actorKey,passenger:false,reason:typeof b?.reason==='string'?b.reason:''});
    await input.cancelled(c);input.json(200,{ride:{id:ride.id,state:'CANCELLED_BY_PASSENGER'},refundStatus:'manual_review',cancellation:c});return true;
   }
   if(adminCase&&method==='POST'){
    const b=await input.readBody() as {revision?:unknown;feeCents?:unknown;note?:unknown;bankReference?:unknown;receipt?:unknown};
    const id=adminCase[1]!;
    const result=adminCase[2]==='review'?await store.review(id,Number(b?.feeCents),Number(b?.revision),actorKey,typeof b?.note==='string'?b.note:''):
     await store.markRefunded(id,Number(b?.revision),actorKey,typeof b?.bankReference==='string'?b.bankReference:'',b?.receipt);
    input.json(200,result);return true;
   }
  }
  input.json(405,{error:'METHOD_NOT_ALLOWED'});return true;
 }catch(e){
  if(e instanceof CancellationError){input.json(e.status,{error:e.code,message:e.message});return true;}
  if(e&&typeof e==='object'&&'code' in e&&e.code==='23505'){input.json(409,{error:'DUPLICATE_BANK_REFERENCE',message:'Identificador de transferência já registrado.'});return true;}
  throw e;
 }
}
