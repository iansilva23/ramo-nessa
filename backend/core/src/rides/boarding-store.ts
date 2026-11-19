import type {Pool} from 'pg';
import type {AdminActor} from '../admin/admin-repository.js';

export const BOARDING_CATEGORIES = ['moto','car','buggy','delivery','comfort_black'] as const;
export class BoardingError extends Error {
 constructor(public code:string,message:string,public status=409,public remainingAttempts?:number){super(message);}
}
export interface BoardingPolicy {enabled:boolean;categories:Record<string,boolean>;revision:number}
export interface BoardingView {required:boolean;remainingAttempts?:number;blocked?:boolean;code?:string}
export function validateBoardingPolicy(value:unknown):BoardingPolicy {
 const b=value as BoardingPolicy;
 if(!b||typeof b.enabled!=='boolean'||!Number.isInteger(b.revision)||b.revision<0||
  !b.categories||Array.isArray(b.categories)||Object.keys(b.categories).length!==BOARDING_CATEGORIES.length||
  BOARDING_CATEGORIES.some(k=>typeof b.categories[k]!=='boolean'))
  throw new BoardingError('INVALID_BOARDING_POLICY','Informe a ativação e as cinco categorias.',400);
 return {enabled:b.enabled,revision:b.revision,categories:Object.fromEntries(BOARDING_CATEGORIES.map(k=>[k,b.categories[k]!]))};
}
export class PostgresBoardingStore {
 constructor(private pool:Pool){}
 async policy():Promise<BoardingPolicy>{return (await this.pool.query('SELECT enabled,categories,revision FROM ride_boarding_policy WHERE singleton=true')).rows[0];}
 async savePolicy(value:unknown,actor:AdminActor){
  const p=validateBoardingPolicy(value);
  const result=await this.pool.query(`WITH changed AS (UPDATE ride_boarding_policy SET enabled=$1,categories=$2,revision=revision+1,updated_at=now(),updated_by=$3 WHERE singleton=true AND revision=$4 RETURNING enabled,categories,revision),
   audit AS (INSERT INTO ride_boarding_audit(action,actor,details) SELECT 'policy.updated',$3::jsonb,to_jsonb(changed) FROM changed)
   SELECT * FROM changed`, [p.enabled,p.categories,JSON.stringify(actor),p.revision]);
  if(!result.rows[0])throw new BoardingError('POLICY_CHANGED','Outro administrador alterou a configuração. Atualize antes de salvar.');
  return result.rows[0] as BoardingPolicy;
 }
 async view(rideId:string,passenger:boolean):Promise<BoardingView>{
  const row=(await this.pool.query('SELECT b.*,r.state FROM ride_boarding_codes b JOIN rides r ON r.id=b.ride_id WHERE ride_id=$1',[rideId])).rows[0];
  if(!row)return {required:false};
  const active=['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(row.state);
  return {required:active&&!row.verified_at&&!row.override_at,remainingAttempts:5-row.attempts,blocked:row.attempts>=5&&!row.override_at,
   ...(passenger&&active&&!row.verified_at&&!row.override_at?{code:row.code}:{})};
 }
 // Both the attempt counter and transition are serialized on the ride row.
 // A failed attempt commits before the error is returned, including concurrent requests.
 async start(rideId:string,driverId:string,code:unknown){
  const c=await this.pool.connect();let failure:BoardingError|undefined;
  try{
   await c.query('BEGIN');
   const ride=(await c.query('SELECT state,driver_id FROM rides WHERE id=$1 FOR UPDATE',[rideId])).rows[0];
   if(!ride||ride.driver_id!==driverId)throw new BoardingError('RIDE_NOT_FOUND','Corrida não encontrada.',404);
   if(ride.state==='IN_PROGRESS'){await c.query('COMMIT');return;}
   if(ride.state!=='DRIVER_ARRIVED')throw new BoardingError('INVALID_RIDE_ACTION','Confirme a chegada antes de iniciar.');
   const pin=(await c.query('SELECT * FROM ride_boarding_codes WHERE ride_id=$1 FOR UPDATE',[rideId])).rows[0];
   if(pin&&!pin.override_at){
    if(pin.attempts>=5)throw new BoardingError('BOARDING_BLOCKED','Limite de tentativas atingido. Procure o suporte.',409,0);
    if(typeof code!=='string'||!/^\d{3}$/.test(code))throw new BoardingError('BOARDING_REQUIRED','Informe o código de três dígitos.',409,5-pin.attempts);
    if(code!==pin.code){
     const attempts=pin.attempts+1;
     await c.query('UPDATE ride_boarding_codes SET attempts=$2 WHERE ride_id=$1',[rideId,attempts]);
     failure=new BoardingError(attempts===5?'BOARDING_BLOCKED':'BOARDING_INCORRECT',attempts===5?'Limite de tentativas atingido. Procure o suporte.':`Código incorreto. Restam ${5-attempts} tentativas.`,409,5-attempts);
    }else await c.query('UPDATE ride_boarding_codes SET verified_at=now() WHERE ride_id=$1',[rideId]);
   }
   if(!failure)await c.query("UPDATE rides SET state='IN_PROGRESS',updated_at=now() WHERE id=$1",[rideId]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  if(failure)throw failure;
 }
 async override(rideId:string,actor:AdminActor,reason:unknown){
  if(typeof reason!=='string'||reason.trim().length<10||reason.length>500)throw new BoardingError('INVALID_REASON','Explique a liberação em 10 a 500 caracteres.',400);
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN');
   const ride=(await c.query('SELECT state FROM rides WHERE id=$1 FOR UPDATE',[rideId])).rows[0];
   if(!ride||!['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(ride.state))throw new BoardingError('INVALID_RIDE_STATE','A liberação exige uma corrida antes do embarque.');
   const row=(await c.query('UPDATE ride_boarding_codes SET override_reason=$2,override_actor=$3,override_at=COALESCE(override_at,now()) WHERE ride_id=$1 RETURNING ride_id',[rideId,reason.trim(),JSON.stringify(actor)])).rows[0];
   if(!row)throw new BoardingError('CODE_NOT_REQUIRED','Esta corrida não exige código.');
   await c.query("INSERT INTO ride_boarding_audit(ride_id,action,actor,details) VALUES($1,'boarding.override',$2,$3)",[rideId,JSON.stringify(actor),JSON.stringify({reason:reason.trim()})]);
   await c.query('COMMIT');return {released:true};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async saveCheckout(rideId:string,paymentId:string,payload:unknown){await this.pool.query('INSERT INTO ride_checkout_recovery(ride_id,payment_id,payload) VALUES($1,$2,$3) ON CONFLICT(ride_id) DO UPDATE SET payment_id=$2,payload=$3,updated_at=now()',[rideId,paymentId,JSON.stringify(payload)]);}
 async checkout(rideId:string,paymentId:string){return (await this.pool.query('SELECT payload FROM ride_checkout_recovery WHERE ride_id=$1 AND payment_id=$2',[rideId,paymentId])).rows[0]?.payload??null;}
}
