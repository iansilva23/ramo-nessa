import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {AdminActor} from '../admin/admin-repository.js';
import type {RideSupportContext} from './ride-support-context.js';
export const OCCURRENCE_CATEGORIES=['moto','car','buggy','delivery','comfort_black'] as const;
export class OccurrenceError extends Error{constructor(public code:string,message:string,public status=409){super(message);}}
export interface OccurrencePolicy{enabled:boolean;bonusEnabled:boolean;bonusCents:Record<string,number>;revision:number}
export function validateOccurrencePolicy(value:unknown):OccurrencePolicy{
 const p=value as OccurrencePolicy;
 if(!p||typeof p.enabled!=='boolean'||typeof p.bonusEnabled!=='boolean'||!Number.isSafeInteger(p.revision)||p.revision<0||
  !p.bonusCents||Object.keys(p.bonusCents).length!==5||OCCURRENCE_CATEGORIES.some(k=>!Number.isSafeInteger(p.bonusCents[k])||p.bonusCents[k]!<0||p.bonusCents[k]!>100000))
  throw new OccurrenceError('INVALID_POLICY','Confira as ativações e os valores das cinco categorias.',400);
 return {enabled:p.enabled,bonusEnabled:p.bonusEnabled,bonusCents:Object.fromEntries(OCCURRENCE_CATEGORIES.map(k=>[k,p.bonusCents[k]!])),revision:p.revision};
}
export function occurrenceText(value:unknown){if(typeof value!=='string'||value.trim().length<10||value.length>2000)throw new OccurrenceError('INVALID_STATEMENT','Descreva o ocorrido em 10 a 2000 caracteres.',400);return value.trim();}
export function confirmedOccurrencePickup(context:any,now=Date.now()){
 const p=context?.currentDriverLocation??context?.events?.at(-1)?.driverLocation;
 const age=now-Date.parse(p?.observedAt);
 return p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180&&age>=0&&age<120000?{latitude:p.latitude as number,longitude:p.longitude as number}:null;
}
export class RideOccurrenceStore{
 constructor(private pool:Pool){}
 private async transaction<T>(work:(c:PoolClient)=>Promise<T>){const c=await this.pool.connect();try{await c.query('BEGIN');const r=await work(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 private async audit(c:PoolClient,id:string|null,action:string,actor:unknown,details:unknown){await c.query('INSERT INTO ride_occurrence_audit(occurrence_id,action,actor,details) VALUES($1,$2,$3,$4)',[id,action,JSON.stringify(actor),JSON.stringify(details)]);}
 async policy():Promise<OccurrencePolicy>{return (await this.pool.query('SELECT enabled,bonus_enabled AS "bonusEnabled",bonus_cents AS "bonusCents",revision FROM ride_occurrence_policy WHERE singleton=true')).rows[0];}
 async savePolicy(value:unknown,actor:AdminActor){const p=validateOccurrencePolicy(value);return this.transaction(async c=>{
  const row=(await c.query('UPDATE ride_occurrence_policy SET enabled=$1,bonus_enabled=$2,bonus_cents=$3,revision=revision+1,actor=$4,updated_at=now() WHERE singleton=true AND revision=$5 RETURNING enabled,bonus_enabled AS "bonusEnabled",bonus_cents AS "bonusCents",revision',[p.enabled,p.bonusEnabled,p.bonusCents,JSON.stringify(actor),p.revision])).rows[0];
  if(!row)throw new OccurrenceError('POLICY_CHANGED','Atualize as configurações antes de salvar.');await this.audit(c,null,'policy.updated',actor,row);return row;
 });}
 async view(rideId:string,role:'passenger'|'driver',subjectId:string){
  const ride=(await this.pool.query('SELECT passenger_id,driver_id,occurrence_terms FROM rides WHERE id=$1',[rideId])).rows[0];
  const involved=(await this.pool.query('SELECT 1 FROM ride_occurrences WHERE ride_id=$1 AND driver_id=$2',[rideId,subjectId])).rowCount;
  if(!ride||(role==='passenger'?ride.passenger_id!==subjectId:ride.driver_id!==subjectId&&!involved))throw new OccurrenceError('RIDE_NOT_FOUND','Corrida não encontrada.',404);
  const records=(await this.pool.query(`SELECT id,ride_id,driver_id,ticket_id,kind,status,driver_statement,passenger_statement,passenger_choice,cash_received_at,cash_returned_at,cash_return_confirmed,decision,revision,created_at,updated_at FROM ride_occurrences WHERE ride_id=$1 AND ($2::text IS NULL OR driver_id=$2) ORDER BY created_at`,[rideId,role==='driver'?subjectId:null])).rows;
  let pickup=null;
  if(role==='passenger'&&records.length){const context=(await this.pool.query('SELECT ride_context FROM driver_support_tickets WHERE id=$1',[records.at(-1).ticket_id])).rows[0]?.ride_context;pickup=confirmedOccurrencePickup(context);}
  return {pickup,enabled:ride.occurrence_terms.enabled,items:records,cashReceived:(await this.pool.query('SELECT 1 FROM ride_cash_receipts WHERE ride_id=$1',[rideId])).rowCount!==0};
 }
 async receiveCash(rideId:string,driverId:string){return this.transaction(async c=>{
  const ride=(await c.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE',[rideId])).rows[0];
  if(!ride||ride.driver_id!==driverId)throw new OccurrenceError('RIDE_NOT_FOUND','Corrida não encontrada.',404);
  if(!ride.occurrence_terms.enabled)throw new OccurrenceError('FEATURE_DISABLED','Recurso desativado para esta corrida.');
  if(ride.payment_method!=='cash'||!['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED'].includes(ride.state))throw new OccurrenceError('INVALID_STAGE','Confirme dinheiro recebido antes do início.');
  await c.query('INSERT INTO ride_cash_receipts(ride_id,driver_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[rideId,driverId]);return {confirmed:true};
 });}
 async assertCashReceived(rideId:string,driverId:string){
  const r=(await this.pool.query('SELECT state,payment_method,occurrence_terms FROM rides WHERE id=$1 AND driver_id=$2',[rideId,driverId])).rows[0];
  if(r?.occurrence_terms.enabled&&r.payment_method==='cash'&&r.state!=='IN_PROGRESS'&&!(await this.pool.query('SELECT 1 FROM ride_cash_receipts WHERE ride_id=$1 AND driver_id=$2',[rideId,driverId])).rowCount)throw new OccurrenceError('CASH_NOT_CONFIRMED','Confirme o recebimento em dinheiro antes de iniciar.');
 }
 async begin(input:{rideId:string;driverId:string;kind:unknown;statement:unknown;context:RideSupportContext}){
  const statement=occurrenceText(input.statement);const kind=String(input.kind);
  if(!['refund','mechanical','dispute','cash'].includes(kind))throw new OccurrenceError('INVALID_KIND','Selecione o motivo.',400);
  return this.transaction(async c=>{
   const r=(await c.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE',[input.rideId])).rows[0];
   if(!r||r.driver_id!==input.driverId)throw new OccurrenceError('RIDE_NOT_FOUND','Corrida não encontrada.',404);
   const existing=(await c.query("SELECT * FROM ride_occurrences WHERE ride_id=$1 AND status<>'resolved'",[r.id])).rows[0];if(existing){if(existing.driver_id!==input.driverId)throw new OccurrenceError('OCCURRENCE_OPEN','Há uma continuação em andamento. Procure o suporte.');return existing;}
   if(!r.occurrence_terms.enabled)throw new OccurrenceError('FEATURE_DISABLED','Novas ocorrências estão desativadas para esta corrida.');
   if(r.payment_method==='cash'?!['DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS'].includes(r.state):r.state!=='IN_PROGRESS')throw new OccurrenceError('INVALID_STAGE','Esta opção exige uma corrida iniciada.');
   if(r.payment_method==='cash'?kind!=='cash':r.payment_method!=='pix'||r.payment_status!=='paid'||kind==='cash')throw new OccurrenceError('INVALID_METHOD','Procedimento incompatível com o pagamento.');
   if(r.payment_method==='pix'&&(await c.query('SELECT 1 FROM ledger_transactions WHERE reference_key=$1',['ride-settlement:'+r.id])).rowCount)throw new OccurrenceError('FINANCIAL_REVIEW_REQUIRED','O valor já recebeu decisão financeira. Procure o suporte.');
   const id=randomUUID(),ticket=randomUUID();
   await c.query(`INSERT INTO driver_support_tickets(id,driver_id,category,subject,message,status,ride_id,ride_context,created_at,updated_at) VALUES($1,$2,'ride','Interrupção de corrida',$3,'open',$4,$5,now(),now())`,[ticket,input.driverId,statement,r.id,input.context]);
   const record=(await c.query(`INSERT INTO ride_occurrences(id,ride_id,driver_id,ticket_id,kind,status,driver_statement,cash_received_at) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT received_at FROM ride_cash_receipts WHERE ride_id=$2)) RETURNING *`,[id,r.id,input.driverId,ticket,kind,kind==='refund'?'refund_pending':'awaiting_passenger',statement])).rows[0];
   await c.query('UPDATE rides SET state=$2,updated_at=now() WHERE id=$1',[r.id,kind==='refund'?'CANCELLED_BY_DRIVER':'INTERRUPTED']);
   await c.query('UPDATE driver_supply SET busy=$2 WHERE driver_id=$1',[input.driverId,kind!=='refund']);await this.audit(c,id,'opened',{driverId:input.driverId},{kind});return record;
  });
 }
 async respond(input:{id:string;rideId:string;passengerId:string;revision:number;choice:unknown;statement:unknown;pickup?:{latitude:number;longitude:number}}){
  const statement=occurrenceText(input.statement),choice=String(input.choice);
  if(!['refund','continue','dispute','cash_confirm','cash_contest'].includes(choice))throw new OccurrenceError('INVALID_CHOICE','Escolha como continuar.',400);
  return this.transaction(async c=>{
   const o=(await c.query('SELECT o.*,r.passenger_id,r.state,r.payment_method,t.ride_context FROM ride_occurrences o JOIN rides r ON r.id=o.ride_id JOIN driver_support_tickets t ON t.id=o.ticket_id WHERE o.id=$1 FOR UPDATE OF r,o',[input.id])).rows[0];
   if(!o||o.ride_id!==input.rideId||o.passenger_id!==input.passengerId)throw new OccurrenceError('OCCURRENCE_NOT_FOUND','Ocorrência não encontrada.',404);
   if(o.revision!==input.revision||!['awaiting_passenger','review','replacement_search'].includes(o.status))throw new OccurrenceError('CASE_CHANGED','A ocorrência foi atualizada.');
   let status='review';
   if(choice==='continue'){
    if(o.status!=='awaiting_passenger'||o.kind!=='mechanical'||o.payment_method!=='pix')throw new OccurrenceError('INVALID_CHOICE','A substituição é exclusiva de problema mecânico em Pix.');
    const p=input.pickup;if(!p||!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180)throw new OccurrenceError('PICKUP_REQUIRED','Confirme um local seguro de embarque com GPS válido.',400);
    const trusted=confirmedOccurrencePickup(o.ride_context);if(!trusted||trusted.latitude!==p.latitude||trusted.longitude!==p.longitude)throw new OccurrenceError('PICKUP_UNVERIFIED','Atualize o GPS ou procure o suporte para confirmar o embarque.');
    await c.query("UPDATE rides SET occurrence_terms=jsonb_set(occurrence_terms,'{continuation}','true'::jsonb),state='SEARCHING_DRIVER',driver_id=NULL,driver_consent_required=false,reserved_driver_id=NULL,driver_hold_expires_at=NULL,pickup_latitude=$2,pickup_longitude=$3,updated_at=now() WHERE id=$1",[o.ride_id,p.latitude,p.longitude]);status='replacement_search';
   }else if(choice==='refund'){
    if(o.payment_method!=='pix'||!['mechanical','refund'].includes(o.kind))throw new OccurrenceError('INVALID_CHOICE','Solicite a análise do suporte.');
    await c.query("UPDATE rides SET state='CANCELLED_BY_DRIVER',updated_at=now() WHERE id=$1",[o.ride_id]);status='refund_pending';
   }else if(choice.startsWith('cash_')){
    if(o.kind!=='cash'||(choice==='cash_confirm'&&o.cash_received_at&&!o.cash_returned_at))throw new OccurrenceError('CASH_RETURN_UNCONFIRMED','Aguarde o registro da devolução pelo motorista.');
    await c.query("UPDATE rides SET state='CANCELLED_BY_DRIVER',updated_at=now() WHERE id=$1",[o.ride_id]);
   }
   if(choice==='continue'||choice==='refund'||choice.startsWith('cash_'))await c.query("UPDATE driver_supply SET busy=false WHERE driver_id=$1 AND NOT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND state IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','INTERRUPTED'))",[o.driver_id]);
   const result=(await c.query('UPDATE ride_occurrences SET passenger_statement=$2,passenger_choice=$3,status=$4,cash_return_confirmed=$5,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[o.id,statement,choice,status,choice==='cash_confirm'?true:choice==='cash_contest'?false:null])).rows[0];
   await c.query("UPDATE driver_support_tickets SET status='in_progress',updated_at=now() WHERE id=$1",[o.ticket_id]);
   await this.audit(c,o.id,'passenger.responded',{passengerId:input.passengerId},{choice});return result;
  });
 }
 async cashReturned(id:string,driverId:string){return this.transaction(async c=>{
  const o=(await c.query("UPDATE ride_occurrences SET cash_returned_at=COALESCE(cash_returned_at,now()),revision=revision+1,updated_at=now() WHERE id=$1 AND driver_id=$2 AND kind='cash' AND status IN ('awaiting_passenger','review') RETURNING *",[id,driverId])).rows[0];
  if(!o)throw new OccurrenceError('CASE_UNAVAILABLE','Ocorrência indisponível.');await this.audit(c,id,'cash.returned',{driverId},{});return o;
 });}
 async list(){return (await this.pool.query('SELECT o.*,r.state AS ride_state,r.payment_method,r.payment_status,r.category,r.occurrence_terms FROM ride_occurrences o JOIN rides r ON r.id=o.ride_id ORDER BY o.updated_at DESC LIMIT 100')).rows;}
 async decide(input:{id:string;revision:number;action:string;note:unknown;penalty?:boolean;actor:AdminActor}){
  const note=occurrenceText(input.note);
  if(!['refund','pay_driver','close'].includes(input.action))throw new OccurrenceError('INVALID_DECISION','Selecione uma decisão válida.',400);
  return this.transaction(async c=>{
   const o=(await c.query('SELECT o.*,r.passenger_id,r.payment_method,r.payment_status,r.occurrence_terms FROM ride_occurrences o JOIN rides r ON r.id=o.ride_id WHERE o.id=$1 FOR UPDATE OF r,o',[input.id])).rows[0];
   if(!o)throw new OccurrenceError('CASE_NOT_FOUND','Ocorrência não encontrada.',404);
   if(o.decision){if(o.decision.action===input.action&&o.decision.note===note&&o.decision.penalty===(input.penalty===true))return o;throw new OccurrenceError('CASE_DECIDED','A decisão já foi registrada.');}
   if(o.status==='resolved')throw new OccurrenceError('CASE_RESOLVED','Esta ocorrência já foi encerrada.');
   if(input.action==='pay_driver'&&o.kind!=='dispute')throw new OccurrenceError('DRIVER_NOT_ELIGIBLE','A interrupção mecânica ou devolução integral não remunera o primeiro motorista.');
   if(o.revision!==input.revision)throw new OccurrenceError('CASE_CHANGED','Atualize a ocorrência antes de decidir.');
   if((input.action==='pay_driver'||input.penalty===true)&&!o.passenger_statement)throw new OccurrenceError('BOTH_STATEMENTS_REQUIRED','A decisão exige a versão das duas partes.');
   if(['refund','pay_driver'].includes(input.action)&&o.payment_method!=='pix')throw new OccurrenceError('PHYSICAL_CASH','Dinheiro físico deve ser devolvido diretamente, com confirmação ou contestação.');
   if(input.action==='close'&&o.payment_method==='pix'&&o.payment_status==='paid')throw new OccurrenceError('FINANCIAL_DECISION_REQUIRED','Escolha devolução ou crédito ao motorista para destinar o Pix confirmado.');
   if(input.penalty===true){
    const amount=o.occurrence_terms.bonusCents;
    if(!o.occurrence_terms.bonusEnabled||!Number.isSafeInteger(amount)||amount<=0)throw new OccurrenceError('BONUS_DISABLED','Adicional desativado nas regras desta corrida.');
    const fee=(await c.query('SELECT 1 FROM ride_manual_cancellations WHERE ride_id=$1 AND credited_fee_cents>0',[o.ride_id])).rowCount;
    if(fee)throw new OccurrenceError('ALREADY_COMPENSATED','Há taxa de cancelamento creditada. Não gerar outra compensação pela mesma ocorrência.');
    await c.query('INSERT INTO ride_occurrence_penalties(id,occurrence_id,passenger_id,injured_driver_id,amount_cents) VALUES($1,$2,$3,$4,$5)',[randomUUID(),o.id,o.passenger_id,o.driver_id,amount]);
   }
   const decision={action:input.action,penalty:input.penalty===true,note,at:new Date().toISOString()};
   const status=input.action==='refund'?'refund_pending':input.action==='pay_driver'?'review':'resolved';
   const result=(await c.query('UPDATE ride_occurrences SET decision=$2,status=$3,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[o.id,decision,status])).rows[0];
   if(input.action!=='pay_driver')await c.query("UPDATE rides SET state='CANCELLED_BY_ADMIN',updated_at=now() WHERE id=$1 AND state='INTERRUPTED'",[o.ride_id]);
   if(input.action!=='pay_driver')await c.query("UPDATE driver_supply SET busy=false WHERE driver_id=$1 AND NOT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND state IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','INTERRUPTED'))",[o.driver_id]);
   await c.query('UPDATE driver_support_tickets SET status=$2,response=$3,updated_at=now() WHERE id=$1',[o.ticket_id,status==='resolved'?'resolved':'in_progress',note]);
   await this.audit(c,o.id,'moderation.decision',input.actor,decision);return result;
  });
 }
 async finishDriverDecision(id:string){return this.transaction(async c=>{
  const o=(await c.query("SELECT * FROM ride_occurrences WHERE id=$1 AND decision->>'action'='pay_driver' FOR UPDATE",[id])).rows[0];
  if(!o)throw new OccurrenceError('CASE_UNAVAILABLE','Decisão indisponível.');
  if(!(await c.query("SELECT 1 FROM ledger_transactions WHERE reference_key=$1",['ride-settlement:'+o.ride_id])).rowCount)throw new OccurrenceError('SETTLEMENT_PENDING','Crédito ainda não confirmado.');
  await c.query("UPDATE ride_occurrence_penalties SET status='consumed' WHERE reserved_ride_id=$1 AND status='reserved' AND EXISTS(SELECT 1 FROM ledger_transactions WHERE reference_key='occurrence-bonus:'||$1::text)",[o.ride_id]);
  await c.query("UPDATE rides SET state='CANCELLED_BY_ADMIN',updated_at=now() WHERE id=$1 AND state='INTERRUPTED'",[o.ride_id]);
  await c.query("UPDATE driver_supply SET busy=false WHERE driver_id=$1 AND NOT EXISTS(SELECT 1 FROM rides WHERE driver_id=$1 AND state IN ('DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','INTERRUPTED'))",[o.driver_id]);
  await c.query("UPDATE driver_support_tickets SET status='resolved',updated_at=now() WHERE id=$1",[o.ticket_id]);
  await c.query("UPDATE ride_occurrences SET status='resolved',revision=revision+1,updated_at=now() WHERE id=$1",[id]);return {resolved:true};
 });}
 async quoteBonus(passengerId:string){
  const policy=await this.policy();if(!policy.bonusEnabled)return 0;
  const result=await this.pool.query(`SELECT p.amount_cents FROM ride_occurrence_penalties p LEFT JOIN rides r ON r.id=p.reserved_ride_id
   WHERE p.passenger_id=$1 AND (p.status='pending' OR (p.status='reserved' AND r.state='AWAITING_PAYMENT' AND r.driver_id IS NULL AND r.payment_method IS NULL AND r.payment_status='created' AND COALESCE(r.payment_expires_at,r.driver_hold_expires_at)<now() AND NOT EXISTS(SELECT 1 FROM payments WHERE ride_id=r.id))) ORDER BY p.created_at,p.id LIMIT 1`,[passengerId]);return result.rows[0]?.amount_cents??0;
 }
 async reserveBonus(rideId:string,passengerId:string){return this.transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['occurrence-penalty:'+passengerId]);
  const r=(await c.query('SELECT * FROM rides WHERE id=$1 AND passenger_id=$2 FOR UPDATE',[rideId,passengerId])).rows[0];
  if(!r||!r.occurrence_terms.bonusEnabled||r.occurrence_bonus)return;
  const p=(await c.query(`SELECT p.* FROM ride_occurrence_penalties p LEFT JOIN rides r ON r.id=p.reserved_ride_id
   WHERE p.passenger_id=$1 AND (p.status='pending' OR (p.status='reserved' AND r.state='AWAITING_PAYMENT' AND r.driver_id IS NULL AND r.payment_method IS NULL AND r.payment_status='created' AND COALESCE(r.payment_expires_at,r.driver_hold_expires_at)<now() AND NOT EXISTS(SELECT 1 FROM payments WHERE ride_id=r.id))) ORDER BY p.created_at,p.id LIMIT 1 FOR UPDATE OF p`,[passengerId])).rows[0];
  if(!p)return;
  await c.query("UPDATE ride_occurrence_penalties SET status='reserved',reserved_ride_id=$2,revision=revision+1,updated_at=now() WHERE id=$1",[p.id,r.id]);
  await c.query('UPDATE rides SET occurrence_bonus=$2 WHERE id=$1',[r.id,{penaltyId:p.id,amountCents:p.amount_cents,injuredDriverId:p.injured_driver_id}]);
 });}
 async consumeBonus(rideId:string){
  await this.pool.query(`UPDATE ride_occurrence_penalties p SET status='consumed',revision=revision+1,updated_at=now() FROM rides r WHERE p.reserved_ride_id=r.id AND r.id=$1 AND r.state='COMPLETED' AND p.status='reserved' AND EXISTS(SELECT 1 FROM ledger_transactions t WHERE t.reference_key=CASE WHEN r.payment_method='cash' THEN 'cash-ride-commission:'||r.id::text ELSE 'occurrence-bonus:'||r.id::text END)`,[rideId]);
 }

}
