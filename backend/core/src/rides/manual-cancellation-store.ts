import type {Pool,PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {assertBalanced,type LedgerEntry} from '../payments/ledger.js';
import {insertLedger,accountBalanceCents} from '../payments/repositories/postgres-finance-repository.js';
import {CancellationError,cancellationFee,cancellationTerms,defaultCancellationPolicy,validateCancellationPolicy,validateRefundPix,validateCancellationReceipt,
 type CancellationPolicy,type CancellationRule,type RefundPix,type CancellationReceipt} from './manual-cancellation-policy.js';

export interface ManualCancellation {
 rideId:string;passengerId:string;driverId:string|null;paymentId:string|null;paidCents:number;
 creditedFeeCents:number;feeCents:number;status:'awaiting_pix'|'review'|'approved'|'refunded';
 reason:string;pix:RefundPix|null;receipt:CancellationReceipt|null;bankReference:string|null;
 revision:number;createdAt:string;updatedAt:string;reviewedBy:string|null;refundedAt:string|null;
 passengerName?:string;driverName?:string;category?:string;
}
type Row = {ride_id:string;passenger_id:string;driver_id:string|null;payment_id:string|null;paid_cents:number;
 credited_fee_cents:number;fee_cents:number;status:ManualCancellation['status'];reason:string;pix:RefundPix|null;
 receipt:CancellationReceipt|null;bank_reference:string|null;revision:number;created_at:Date;updated_at:Date;
 reviewed_by:string|null;refunded_at:Date|null;passenger_name?:string;driver_name?:string;category?:string};
function record(r:Row):ManualCancellation{return {
 rideId:r.ride_id,passengerId:r.passenger_id,driverId:r.driver_id,paymentId:r.payment_id,paidCents:r.paid_cents,
 creditedFeeCents:r.credited_fee_cents,feeCents:r.fee_cents,status:r.status,reason:r.reason,pix:r.pix,receipt:r.receipt,
 bankReference:r.bank_reference,revision:r.revision,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString(),
 reviewedBy:r.reviewed_by,refundedAt:r.refunded_at?.toISOString()??null,
 ...(r.passenger_name?{passengerName:r.passenger_name}:{}),...(r.driver_name?{driverName:r.driver_name}:{}),
 ...(r.category?{category:r.category}:{})};}
export function publicCancellation(c:ManualCancellation) {
 return {rideId:c.rideId,paidCents:c.paidCents,feeCents:c.feeCents,refundCents:c.paidCents-c.feeCents,
 status:c.status,pix:c.pix,refundedAt:c.refundedAt,updatedAt:c.updatedAt};
}
export class PostgresManualCancellationStore {
 constructor(private pool:Pool){}
 private async transaction<T>(work:(c:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 private async audit(c:PoolClient,rideId:string|null,actor:string,action:string,metadata:unknown){
  await c.query('INSERT INTO ride_manual_cancellation_audit(ride_id,actor,action,metadata) VALUES($1,$2,$3,$4)',[rideId,actor,action,JSON.stringify(metadata)]);
 }
 private async ledger(c:PoolClient,rideId:string,paymentId:string|null,kind:string,referenceKey:string,entries:LedgerEntry[]){
  if(!entries.length)return;assertBalanced(entries);
  await insertLedger(c,{id:randomUUID(),kind,rideId,...(paymentId?{paymentId}:{}),referenceKey,entries,createdAt:new Date().toISOString()});
 }
 async policy():Promise<{revision:number;rules:CancellationPolicy}>{
  const r=await this.pool.query<{revision:number;rules:CancellationPolicy}>('SELECT revision,rules FROM ride_cancellation_policy WHERE id=true');
  return r.rows[0]??{revision:0,rules:defaultCancellationPolicy()};
 }
 async savePolicy(rules:unknown,revision:number,actor:string){
  const validated=validateCancellationPolicy(rules);
  return this.transaction(async c=>{
   const r=await c.query<{revision:number;rules:CancellationPolicy}>('UPDATE ride_cancellation_policy SET rules=$1,revision=revision+1 WHERE id=true AND revision=$2 RETURNING revision,rules',[JSON.stringify(validated),revision]);
   if(!r.rows[0])throw new CancellationError('POLICY_CHANGED','Outra pessoa alterou as regras. Atualize antes de salvar.');
   await this.audit(c,null,actor,'policy.updated',{revision:r.rows[0].revision,rules:validated});return r.rows[0];
  });
 }
 async terms(rideId:string,now=new Date()){
  const r=await this.pool.query<{rule:CancellationRule;accepted_at:Date|null}>('SELECT rule,accepted_at FROM ride_cancellation_terms WHERE ride_id=$1',[rideId]);
  const v=r.rows[0];if(!v)throw new CancellationError('TERMS_NOT_FOUND','Regras da corrida indisponíveis.');
  return cancellationTerms(v.rule,v.accepted_at?.toISOString()??null,now);
 }
 async find(rideId:string):Promise<ManualCancellation|null>{
  const r=await this.pool.query<Row>('SELECT * FROM ride_manual_cancellations WHERE ride_id=$1',[rideId]);
  return r.rows[0]?record(r.rows[0]):null;
 }
 async list():Promise<ManualCancellation[]>{
  const r=await this.pool.query<Row>("SELECT c.*,p.full_name AS passenger_name,d.full_name AS driver_name,r.category FROM ride_manual_cancellations c JOIN rides r ON r.id=c.ride_id LEFT JOIN auth_identities p ON p.subject_type='passenger' AND p.subject_id::text=c.passenger_id LEFT JOIN driver_profiles d ON d.driver_id::text=c.driver_id ORDER BY c.updated_at DESC LIMIT 300");
  return r.rows.map(record);
 }
 async cancel(input:{rideId:string;passengerId:string;actor:string;passenger:boolean;reason:string;now?:Date}):Promise<ManualCancellation>{
  const now=input.now??new Date();
  if(!input.reason.trim()||input.reason.length>500)throw new CancellationError('INVALID_REASON','Informe o motivo do cancelamento.',400);
  return this.transaction(async c=>{
   const q=await c.query<{id:string;state:string;passenger_id:string;driver_id:string|null;manual_refund:boolean;payment_method:string|null}>('SELECT id,state,passenger_id,driver_id,manual_refund,payment_method FROM rides WHERE id=$1 FOR UPDATE',[input.rideId]);
   const ride=q.rows[0];
   if(!ride||ride.passenger_id!==input.passengerId)throw new CancellationError('RIDE_NOT_FOUND','Corrida não encontrada.',404);
   const existing=(await c.query<Row>('SELECT * FROM ride_manual_cancellations WHERE ride_id=$1',[ride.id])).rows[0];
   if(existing)return record(existing);
   if(!['PAID','SEARCHING_DRIVER','NO_DRIVER_FOUND','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(ride.state))throw new CancellationError('RIDE_NOT_CANCELLABLE','Esta corrida não pode ser cancelada nesta etapa.');
   const p=(await c.query<{id:string;amount_cents:number;status:string}>("SELECT id,amount_cents,status FROM payments WHERE ride_id=$1 AND status='paid' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[ride.id])).rows[0];
   const paidCents=p?.amount_cents??0;
   const t=(await c.query<{rule:CancellationRule;accepted_at:Date|null}>('SELECT rule,accepted_at FROM ride_cancellation_terms WHERE ride_id=$1 FOR UPDATE',[ride.id])).rows[0];
   if(!t)throw new CancellationError('TERMS_NOT_FOUND','Regras da corrida indisponíveis.');
   const fee=cancellationFee({rule:t.rule,acceptedAt:t.accepted_at?.toISOString()??null,now,paidCents,passenger:input.passenger});
   if(fee>0&&!ride.driver_id)throw new CancellationError('DRIVER_NOT_FOUND','A taxa exige um motorista vinculado.');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ride:'+ride.id+':escrow']);
   const escrow=await accountBalanceCents(c,'ride:'+ride.id+':escrow');
   if(escrow<paidCents)throw new CancellationError('PAYMENT_RECONCILIATION_REQUIRED','Pagamento já ajustado. Confira a conciliação antes de cancelar.');
   if(fee>0)await this.ledger(c,ride.id,p?.id??null,'RIDE_CANCELLATION_FEE','ride-cancel-fee:'+ride.id,[
    {accountKey:'ride:'+ride.id+':escrow',direction:'debit',amountCents:fee},
    {accountKey:'driver:'+ride.driver_id+':payable',direction:'credit',amountCents:fee}]);
   await c.query("UPDATE rides SET state='CANCELLED_BY_PASSENGER',manual_refund=true,updated_at=$2 WHERE id=$1",[ride.id,now]);
   await c.query("UPDATE ride_offers SET status='CANCELLED',updated_at=$2 WHERE ride_id=$1 AND status='OFFERED'",[ride.id,now]);
   await c.query('UPDATE driver_supply SET reserved_ride_id=NULL,reserved_until=NULL,updated_at=$2 WHERE reserved_ride_id=$1',[ride.id,now]);
   if(ride.driver_id)await c.query("UPDATE driver_supply SET busy=false,updated_at=$2 WHERE driver_id=$1 AND NOT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND state IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS'))",[ride.driver_id,now]);
   const r=await c.query<Row>("INSERT INTO ride_manual_cancellations(ride_id,passenger_id,driver_id,payment_id,paid_cents,credited_fee_cents,fee_cents,status,reason,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$9) RETURNING *",
    [ride.id,input.passengerId,ride.driver_id,p?.id??null,paidCents,fee,paidCents>fee?'awaiting_pix':'review',input.reason.trim(),now]);
   await this.audit(c,ride.id,input.actor,'ride.cancelled',{paidCents,feeCents:fee,source:input.passenger?'passenger':'admin'});
   return record(r.rows[0]!);
  });
 }
 async setPix(rideId:string,passengerId:string,value:unknown){
  const pix=validateRefundPix(value);
  return this.transaction(async c=>{
   const r=await c.query<Row>("UPDATE ride_manual_cancellations SET pix=$3,status='review',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1,updated_at=now() WHERE ride_id=$1 AND passenger_id=$2 AND status IN ('awaiting_pix','review') RETURNING *",[rideId,passengerId,JSON.stringify(pix)]);
   if(!r.rows[0])throw new CancellationError('PIX_LOCKED','Devolução aprovada ou concluída. Peça ao suporte para revisar os dados.');
   await this.audit(c,rideId,passengerId,'pix.updated',{});return record(r.rows[0]);
  });
 }
 async review(rideId:string,feeCents:number,revision:number,actor:string,note:string){
  if(!Number.isSafeInteger(feeCents)||feeCents<0||!note.trim()||note.length>500)throw new CancellationError('INVALID_REVIEW','Informe um valor válido e a justificativa.',400);
  return this.transaction(async c=>{
   const r=(await c.query<Row>('SELECT * FROM ride_manual_cancellations WHERE ride_id=$1 FOR UPDATE',[rideId])).rows[0];
   if(!r||r.revision!==revision||r.status==='refunded')throw new CancellationError('CASE_CHANGED','Caso alterado ou concluído. Atualize a ficha.');
   if(feeCents>r.credited_fee_cents)throw new CancellationError('FEE_EXCEEDS_AGREEMENT','A taxa não pode superar a regra informada para esta corrida.');
   const refund=r.paid_cents-feeCents;
   if(refund>0&&!r.pix)throw new CancellationError('PIX_REQUIRED','Aguarde os dados Pix do passageiro antes de aprovar.');
   const difference=r.fee_cents-feeCents;
   if(difference!==0){
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['platform:revenue']);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ride:'+rideId+':escrow']);
    const amount=Math.abs(difference);
    await this.ledger(c,rideId,r.payment_id,'CANCELLATION_COMPANY_ADJUSTMENT','cancel-review:'+rideId+':'+(revision+1),[
      {accountKey:'platform:revenue',direction:difference>0?'debit':'credit',amountCents:amount},
      {accountKey:'ride:'+rideId+':escrow',direction:difference>0?'credit':'debit',amountCents:amount}]);
   }
   const next=await c.query<Row>("UPDATE ride_manual_cancellations SET fee_cents=$2,status='approved',reviewed_by=$3,reviewed_at=now(),revision=revision+1,updated_at=now() WHERE ride_id=$1 RETURNING *",[rideId,feeCents,actor]);
   await this.audit(c,rideId,actor,'refund.approved',{feeCents,refundCents:refund,companyCostCents:r.credited_fee_cents-feeCents,note});
   return record(next.rows[0]!);
  });
 }
 async markRefunded(rideId:string,revision:number,actor:string,bankReference:string,receiptValue:unknown){
  const receipt=validateCancellationReceipt(receiptValue);
  if(typeof bankReference!=='string'||bankReference.trim().length<8||bankReference.length>150)throw new CancellationError('INVALID_BANK_REFERENCE','Informe o identificador da transferência no banco.',400);
  return this.transaction(async c=>{
   const r=(await c.query<Row>('SELECT * FROM ride_manual_cancellations WHERE ride_id=$1 FOR UPDATE',[rideId])).rows[0];
   if(r?.status==='refunded'){
    if(r.bank_reference===bankReference.trim())return record(r);
    throw new CancellationError('ALREADY_REFUNDED','Devolução já registrada.');
   }
   if(!r||r.status!=='approved'||r.revision!==revision)throw new CancellationError('CASE_CHANGED','Aprove e atualize o caso antes de registrar a devolução.');
   const amount=r.paid_cents-r.fee_cents;
   if(amount>0){
    if(!r.pix)throw new CancellationError('PIX_REQUIRED','Dados Pix ausentes.');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ride:'+rideId+':escrow']);
    if(await accountBalanceCents(c,'ride:'+rideId+':escrow')<amount)throw new CancellationError('ESCROW_CHANGED','Saldo da corrida alterado. Confira a conciliação.');
    await this.ledger(c,rideId,r.payment_id,'MANUAL_PASSENGER_REFUND','manual-passenger-refund:'+rideId,[
     {accountKey:'ride:'+rideId+':escrow',direction:'debit',amountCents:amount},
     {accountKey:'processor:manual-pix:clearing',direction:'credit',amountCents:amount}]);
   }
   const next=await c.query<Row>("UPDATE ride_manual_cancellations SET status='refunded',receipt=$2,bank_reference=$3,refunded_at=now(),revision=revision+1,updated_at=now() WHERE ride_id=$1 RETURNING *",[rideId,JSON.stringify(receipt),bankReference.trim()]);
   await this.audit(c,rideId,actor,'refund.recorded',{amountCents:amount,bankReference:bankReference.trim()});
   return record(next.rows[0]!);
  });
 }
}
