import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthSubjectType } from '../auth/auth-session-repository.js';
import type { DeletablePrivateDocumentStorage } from '../drivers/driver-document-private-storage.js';

type Card = { scope: string; customer: string; card: string };
type Cleanup = { documents: string[]; cards: Card[] };
type Job = { id: string; subject_type: AuthSubjectType; subject_id: string; status: 'processing'|'deleted'; cleanup: Cleanup };
export class AccountDeletionError extends Error {
 constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const lockKey = (role: string,id: string) => `self-delete:${role}:${id}`;
export class SelfAccountDeletion {
 constructor(private readonly pool: Pool) {}
 async overview(role: AuthSubjectType,id: string, client: PoolClient|Pool = this.pool) {
  const accounts = await client.query<{account_key:string; balance:string}>(`SELECT account_key,sum(CASE direction WHEN 'credit' THEN amount_cents ELSE -amount_cents END)::text balance FROM ledger_entries WHERE left(account_key,length($1))=$1 GROUP BY account_key`,[`${role}:${id}:`]);
  const balanceCents = Number(accounts.rows.find(r=>r.account_key===`${role}:${id}:${role==='driver'?'payable':'wallet'}`)?.balance??0);
  if(!Number.isSafeInteger(balanceCents)) throw new AccountDeletionError(503,'BALANCE_UNAVAILABLE','Não foi possível confirmar seu saldo.');
  const balance = accounts.rows.some(r=>BigInt(r.balance)!==0n);
  const rides = await client.query(`SELECT 1 FROM rides WHERE (passenger_id=$1 AND $2='passenger' OR (driver_id=$1 OR reserved_driver_id=$1) AND $2='driver') AND state NOT IN ('COMPLETED','CANCELLED_BY_PASSENGER','CANCELLED_BY_DRIVER','CANCELLED_BY_ADMIN','REFUNDED') LIMIT 1`,[id,role]);
  const pending = await client.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM payments p JOIN rides r ON r.id=p.ride_id WHERE (r.passenger_id=$1 AND $2='passenger' OR r.driver_id=$1 AND $2='driver') AND p.status IN ('created','pending','authorized')) OR EXISTS(SELECT 1 FROM wallet_topups WHERE passenger_id=$1 AND $2='passenger' AND status IN ('created','pending','authorized')) OR EXISTS(SELECT 1 FROM driver_payouts WHERE driver_id=$1 AND $2='driver' AND status IN ('requested','processing')) OR EXISTS(SELECT 1 FROM ride_manual_cancellations WHERE (passenger_id=$1 AND $2='passenger' OR driver_id=$1 AND $2='driver') AND status<>'refunded') OR EXISTS(SELECT 1 FROM ride_occurrences o JOIN rides r ON r.id=o.ride_id WHERE (r.passenger_id=$1 AND $2='passenger' OR (r.driver_id=$1 OR o.driver_id=$1) AND $2='driver') AND o.status<>'resolved')`,[id,role]);
  const reason = rides.rowCount ? 'Conclua ou resolva a corrida em andamento antes de excluir a conta.' : balance ? `Há saldo ou ajuste financeiro pendente. Saldo disponível: ${(balanceCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. Fale com o suporte para receber ou regularizar antes de excluir. Seu saldo será preservado.` : pending.rowCount ? 'Há pagamento, saque ou devolução em processamento. Aguarde a conclusão antes de excluir.' : null;
  const request = await client.query<{id:string;status:string;requested_at:Date}>(
   'SELECT id,status,requested_at FROM self_account_deletion_requests WHERE subject_type=$1 AND subject_id=$2',[role,id]);
  const pendingRequest=request.rows[0];
  return {available:true,eligible:reason===null,balanceCents,reason,
   ...(pendingRequest ? {requestId:pendingRequest.id,requestStatus:pendingRequest.status,requestedAt:pendingRequest.requested_at} : {})};
 }
 /** Prevent deletion from racing the private upload + metadata transaction. */
 async withOpenAccount<T>(role: AuthSubjectType,id: string, action:()=>Promise<T>):Promise<T> {
  const c=await this.pool.connect();
  try {
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");
   await c.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',[lockKey(role,id)]);
   const found=await c.query(`SELECT 1 FROM auth_identities WHERE subject_type=$1 AND subject_id=$2 AND status='active' AND NOT EXISTS(SELECT 1 FROM self_account_deletions WHERE subject_type=$1 AND subject_id=$2)`,[role,id]);
   if (!found.rowCount) throw new AccountDeletionError(409,'ACCOUNT_CLOSED','Conta indisponível para esta operação.');
   const result=await action();await c.query('COMMIT');return result;
  } catch(error) {await c.query('ROLLBACK');throw error;} finally {c.release();}
 }
 async start(role: AuthSubjectType,id: string, confirmed: unknown, storageAvailable: boolean, cardScope?: string, request?:{id:string;receiptHash:string}) {
  if(confirmed!==true) throw new AccountDeletionError(422,'DELETE_CONFIRMATION_REQUIRED','Confirme a exclusão da sua conta.');
  const c=await this.pool.connect();
  try {
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='8s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lockKey(role,id)]);
   if(request){
    const existing=await c.query<{id:string;status:'processing'|'deleted'}>('SELECT id,status FROM self_account_deletions WHERE id=$1 AND subject_type=$2 AND subject_id=$3',[request.id,role,id]);
    if(existing.rows[0]){await c.query('COMMIT');return {id:existing.rows[0].id,status:existing.rows[0].status,sessions:[] as string[]};}
   }
   // A short DB-only lock serializes financial initiation with the final check.
   await c.query('LOCK TABLE rides,payments,ledger_entries,wallet_topups,driver_payouts,ride_manual_cancellations,ride_occurrences,driver_documents,passenger_saved_cards,passenger_payment_customers IN SHARE ROW EXCLUSIVE MODE');
   const identity=await c.query(`SELECT id FROM auth_identities WHERE subject_type=$1 AND subject_id=$2 AND status='active' FOR UPDATE`,[role,id]);
   if(!identity.rowCount) throw new AccountDeletionError(409,'ACCOUNT_UNAVAILABLE','Conta indisponível.');
   const state=await this.overview(role,id,c);
   if(!state.eligible) throw new AccountDeletionError(409,'ACCOUNT_HAS_PENDING_ITEMS',state.reason!);
   const documents=role==='driver'?(await c.query<{storage_key:string}>('SELECT DISTINCT storage_key FROM driver_documents WHERE driver_id=$1',[id])).rows.map(r=>r.storage_key):[];
   if(documents.length && !storageAvailable) throw new AccountDeletionError(503,'DELETE_STORAGE_UNAVAILABLE','A exclusão dos documentos está indisponível. Tente novamente mais tarde.');
   const cards=role==='passenger'?(await c.query<Card>('SELECT s.gateway_scope scope,c.customer_id customer,s.card_id card FROM passenger_saved_cards s JOIN passenger_payment_customers c USING(passenger_id,gateway_scope) WHERE s.passenger_id=$1',[id])).rows:[];
   if(cards.some(card=>card.scope!==cardScope)) throw new AccountDeletionError(503,'DELETE_CARD_CLEANUP_UNAVAILABLE','A remoção dos cartões salvos está indisponível. Tente novamente mais tarde.');
   if(documents.length){
    const shared=await c.query('SELECT 1 FROM driver_documents WHERE storage_key=ANY($1::text[]) AND driver_id<>$2 LIMIT 1',[documents,id]);
    if(shared.rowCount)throw new AccountDeletionError(503,'DELETE_SHARED_DOCUMENT','Um documento precisa de revisão antes da exclusão. Nenhum arquivo foi removido.');
   }
   const receipt=randomBytes(32).toString('hex'),jobId=request?.id??randomUUID();
   await c.query("SELECT set_config('ramo.account_deletion_worker','true',true)");
   await c.query(`INSERT INTO self_account_deletions(id,subject_type,subject_id,receipt_hash,status,cleanup)VALUES($1,$2,$3,$4,'processing',$5)`,[jobId,role,id,request?.receiptHash??digest(receipt),JSON.stringify({documents,cards})]);
   await c.query("UPDATE auth_identities SET status='suspended',updated_at=now() WHERE subject_type=$1 AND subject_id=$2",[role,id]);
   if(role==='driver') await c.query("UPDATE driver_supply SET online=false,updated_at=now() WHERE driver_id=$1",[id]);
   const sessions=await c.query<{id:string}>('DELETE FROM auth_sessions WHERE subject_type=$1 AND subject_id=$2 RETURNING id',[role,id]);
   await c.query(`INSERT INTO data_subject_requests(id,subject_type,subject_id,request_type,status,note,created_at,updated_at)VALUES($1,$2,$3,'deletion','in_progress','Exclusão iniciada pelo titular.',now(),now()) ON CONFLICT(id) DO UPDATE SET status='in_progress',updated_at=now()`,[jobId,role,id]);
   await c.query('COMMIT');return {id:jobId,receipt,status:'processing' as const,sessions:sessions.rows.map(r=>r.id)};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 /** Register a durable request even when money/operations still need settlement.
  * Does not debit, waive, transfer funds, revoke access or mark the account closed.
  */
 async request(role:AuthSubjectType,id:string,confirmed:unknown){
  if(confirmed!==true)throw new AccountDeletionError(422,'DELETE_CONFIRMATION_REQUIRED','Confirme a solicitação de exclusão.');
  const c=await this.pool.connect();
  try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='8s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lockKey(role,id)]);
   const identity=await c.query("SELECT id FROM auth_identities WHERE subject_type=$1 AND subject_id=$2 AND status='active' FOR UPDATE",[role,id]);
   if(!identity.rowCount)throw new AccountDeletionError(409,'ACCOUNT_UNAVAILABLE','Conta indisponível.');
   const existing=await c.query<{id:string;status:string}>('SELECT id,status FROM self_account_deletion_requests WHERE subject_type=$1 AND subject_id=$2',[role,id]);
   if(existing.rows[0]){await c.query('COMMIT');return {...existing.rows[0],sessions:[] as string[]};}
   const state=await this.overview(role,id,c),jobId=randomUUID(),receipt=randomBytes(32).toString('hex');
   await c.query("INSERT INTO self_account_deletion_requests(id,subject_type,subject_id,receipt_hash,status,reason)VALUES($1,$2,$3,$4,'waiting',$5)",[jobId,role,id,digest(receipt),state.reason]);
   await c.query("INSERT INTO data_subject_requests(id,subject_type,subject_id,request_type,status,note,created_at,updated_at)VALUES($1,$2,$3,'deletion','open','Exclusão solicitada no aplicativo; valores e pendências preservados.',now(),now())",[jobId,role,id]);
   await c.query('COMMIT');
   return {id:jobId,receipt,status:'waiting',sessions:[] as string[]};
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 async receiptStatus(receipt: unknown) {
  if(typeof receipt!=='string'||!/^[a-f0-9]{64}$/.test(receipt))throw new AccountDeletionError(404,'DELETE_RECEIPT_NOT_FOUND','Protocolo não encontrado.');
  const r=await this.pool.query<{id:string;status:string}>(`SELECT id,status FROM self_account_deletions WHERE receipt_hash=$1 UNION ALL SELECT id,status FROM self_account_deletion_requests WHERE receipt_hash=$1 AND NOT EXISTS(SELECT 1 FROM self_account_deletions WHERE receipt_hash=$1)`,[digest(receipt)]);
  if(!r.rowCount)throw new AccountDeletionError(404,'DELETE_RECEIPT_NOT_FOUND','Protocolo não encontrado.');
  return r.rows[0]!;
 }
 async processPending(storage:DeletablePrivateDocumentStorage|null,removeCard:(card:Card)=>Promise<void>,limit=5,cardScope?:string,onSessionsRevoked?:(sessions:string[])=>void) {
  const requests=await this.pool.query<{id:string;subject_type:AuthSubjectType;subject_id:string;receipt_hash:string}>("SELECT id,subject_type,subject_id,receipt_hash FROM self_account_deletion_requests WHERE status='waiting' ORDER BY updated_at,id LIMIT $1",[limit]);
  for(const request of requests.rows){
   try{
    const started=await this.start(request.subject_type,request.subject_id,true,Boolean(storage),cardScope,{id:request.id,receiptHash:request.receipt_hash});
    onSessionsRevoked?.(started.sessions);
    await this.pool.query('UPDATE self_account_deletion_requests SET status=$2,reason=NULL,checked_at=now(),updated_at=now() WHERE id=$1',[request.id,started.status]);
   }catch(error){
    const reason=error instanceof AccountDeletionError?error.message:'Não foi possível processar agora; a solicitação permanece registrada.';
    await this.pool.query("UPDATE self_account_deletion_requests SET reason=$2,checked_at=now(),updated_at=now() WHERE id=$1",[request.id,reason]);
   }
  }
  const jobs=await this.pool.query<Job>("SELECT * FROM self_account_deletions WHERE status='processing' ORDER BY updated_at LIMIT $1",[limit]);
  for(const job of jobs.rows){
   const c=await this.pool.connect();let locked=false;
   try{
    locked=(await c.query<{locked:boolean}>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) locked',[job.id])).rows[0]!.locked;
    if(!locked)continue;
    const current=(await c.query<Job>("SELECT * FROM self_account_deletions WHERE id=$1 AND status='processing'",[job.id])).rows[0];if(!current)continue;
    for(const key of current.cleanup.documents){if(!storage)throw Error('PRIVATE_STORAGE_UNAVAILABLE');await storage.delete(key);}
    for(const card of current.cleanup.cards)await removeCard(card);
    await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='8s'");await c.query("SELECT set_config('ramo.account_deletion_worker','true',true)");
    const id=job.subject_id,role=job.subject_type;
    // Retain financial, ride and support evidence; remove current access and optional profile data.
    if(role==='passenger'){
     await c.query('DELETE FROM passenger_saved_places WHERE passenger_id=$1',[id]);
     await c.query('DELETE FROM passenger_promotion_preferences WHERE passenger_id=$1',[id]);
     await c.query('DELETE FROM passenger_payment_customers WHERE passenger_id=$1',[id]);
    }else{
     await c.query('DELETE FROM driver_documents WHERE driver_id=$1',[id]);
     await c.query('DELETE FROM driver_cpf_bindings WHERE driver_id=$1',[id]);
     await c.query('DELETE FROM driver_payout_destinations WHERE driver_id=$1',[id]);
     await c.query('DELETE FROM driver_vehicles WHERE driver_id=$1',[id]);
     await c.query("UPDATE driver_profiles SET full_name='Conta excluída',preferred_name=NULL,photo_bytes=NULL,photo_mime_type=NULL,photo_updated_at=NULL,status='suspended',updated_at=now() WHERE driver_id=$1",[id]);
     await c.query("UPDATE driver_supply SET online=false,vehicle_id='deleted',latitude=0,longitude=0,location_updated_at=now(),updated_at=now() WHERE driver_id=$1",[id]);
    }
    await c.query('DELETE FROM auth_sessions WHERE subject_type=$1 AND subject_id=$2',[role,id]);
    await c.query('DELETE FROM auth_identities WHERE subject_type=$1 AND subject_id=$2',[role,id]);
    await c.query("UPDATE data_subject_requests SET status='completed',response='Conta excluída. Registros necessários de corridas, financeiro e atendimento foram preservados.',responded_by_name='Processamento automático',responded_at=now(),updated_at=now() WHERE id=$1",[job.id]);
    await c.query("UPDATE self_account_deletion_requests SET status='deleted',reason=NULL,updated_at=now() WHERE id=$1",[job.id]);
    await c.query("UPDATE self_account_deletions SET status='deleted',cleanup='{}',last_error_code=NULL,attempts=attempts+1,completed_at=now(),updated_at=now() WHERE id=$1",[job.id]);
    await c.query('COMMIT');
   }catch(error){
    await c.query('ROLLBACK');
    const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:'CLEANUP_UNAVAILABLE';
    await c.query('UPDATE self_account_deletions SET attempts=attempts+1,last_error_code=$2,updated_at=now() WHERE id=$1',[job.id,code]);
   }finally{try{if(locked)await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[job.id]);}finally{c.release();}}
  }
 }
}
