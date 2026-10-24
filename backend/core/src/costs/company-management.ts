import type {Pool} from 'pg';
import type {AdminActor} from '../admin/admin-repository.js';
import {InvalidAdminRequestError} from '../admin/admin-validation.js';
import {dateValue,uuidValue,CostConflictError,localDate} from './company-costs.js';
import {validateCancellationReceipt,type CancellationReceipt} from '../rides/manual-cancellation-policy.js';
export type ManagementKind='withdrawal'|'return'|'contribution'|'bank'|'close'|'reopen'|'reversal';
export interface ManagementRecord {id:string;kind:ManagementKind;amountCents:number;occurredOn:string;description:string;referenceId:string|null;attachment:CancellationReceipt|null;actor:AdminActor;createdAt:string}
export function parseManagementRecord(raw:unknown,actor:AdminActor):ManagementRecord {
 const r=raw as Record<string,unknown>;
 if(!r||!['withdrawal','return','contribution','bank','close','reopen','reversal'].includes(String(r.kind)))throw new InvalidAdminRequestError('Escolha uma movimentação válida.');
 if(!Number.isSafeInteger(r.amountCents)||Number(r.amountCents)<0||Number(r.amountCents)>100000000000)throw new InvalidAdminRequestError('Valor inválido.');
 if(['withdrawal','return','contribution'].includes(String(r.kind))&&Number(r.amountCents)===0)throw new InvalidAdminRequestError('Informe um valor maior que zero.');
 if(typeof r.description!=='string'||r.description.trim().length<3||r.description.length>500)throw new InvalidAdminRequestError('Informe uma descrição de 3 a 500 caracteres.');
 const occurredOn=dateValue(r.occurredOn,'Data');if(occurredOn>localDate(new Date()))throw new InvalidAdminRequestError('Registre somente movimentações já realizadas.');
 let attachment:CancellationReceipt|null=null;
 try{if(r.attachment)attachment=validateCancellationReceipt(r.attachment);}catch(e){throw new InvalidAdminRequestError(e instanceof Error?e.message:'Comprovante inválido.');}
 return {id:uuidValue(r.id),kind:r.kind as ManagementKind,amountCents:Number(r.amountCents),occurredOn,description:r.description.trim(),referenceId:r.referenceId?uuidValue(r.referenceId):null,attachment,actor,createdAt:new Date().toISOString()};
}
function map(r:any):ManagementRecord{return {id:r.id,kind:r.kind,amountCents:Number(r.amount_cents),occurredOn:typeof r.occurred_on==='string'?r.occurred_on.slice(0,10):r.occurred_on.toISOString().slice(0,10),description:r.description,referenceId:r.reference_id,attachment:r.attachment,actor:r.actor,createdAt:r.created_at.toISOString()};}
export interface ManagementStore {list():Promise<ManagementRecord[]>;save(record:ManagementRecord):Promise<ManagementRecord>}
export class PostgresManagementStore implements ManagementStore {
 constructor(private pool:Pool){}
 async list(){const r=await this.pool.query('SELECT * FROM company_management_records ORDER BY occurred_on,created_at LIMIT 50001');if(r.rows.length>50000)throw new CostConflictError('Limite de lançamentos excedido. Solicite uma consolidação.');return r.rows.map(map);}
 async save(record:ManagementRecord){
  const c=await this.pool.connect();try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('company-management-writes',0))");
   const records=(await c.query('SELECT * FROM company_management_records ORDER BY created_at')).rows.map(map);
   const existing=records.find(r=>r.id===record.id);
   if(existing){const fields=['kind','amountCents','occurredOn','description','referenceId','attachment'] as const;if(fields.some(k=>JSON.stringify(existing[k])!==JSON.stringify(record[k])))throw new CostConflictError('Identificador já usado por outro lançamento.');await c.query('COMMIT');return existing;}
   validateManagementWrite(records,record);
   const r=await c.query('INSERT INTO company_management_records(id,kind,amount_cents,occurred_on,description,reference_id,attachment,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[record.id,record.kind,record.amountCents,record.occurredOn,record.description,record.referenceId,record.attachment,record.actor]);
   await c.query('COMMIT');return map(r.rows[0]);
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}
export function validateManagementWrite(records:ManagementRecord[],record:ManagementRecord){
 const month=record.occurredOn.slice(0,7),closed=records.filter(r=>['close','reopen'].includes(r.kind)&&r.occurredOn.startsWith(month)).at(-1)?.kind==='close';
 if(closed&&record.kind!=='reopen')throw new CostConflictError('Mês revisado. Reabra o mês com justificativa antes de registrar.');
 if(record.kind==='reopen'&&!closed)throw new CostConflictError('O mês não está fechado.');
 const original=records.find(r=>r.id===record.referenceId);
 const reversed=new Set(records.filter(r=>r.kind==='reversal').map(r=>r.referenceId));
 if(record.kind==='reversal'){
  if(!original||!['withdrawal','return','contribution','bank'].includes(original.kind)||reversed.has(original.id))throw new CostConflictError('Movimentação indisponível para correção.');
  if(records.some(r=>r.kind==='return'&&r.referenceId===original.id&&!reversed.has(r.id)))throw new CostConflictError('Corrija as devoluções vinculadas antes da retirada.');
  if(record.amountCents!==original.amountCents||record.occurredOn!==original.occurredOn)throw new CostConflictError('A correção deve anular exatamente o lançamento original.');
 }
 if(record.kind==='return'){
  if(!original||original.kind!=='withdrawal'||reversed.has(original.id)||record.occurredOn<original.occurredOn)throw new CostConflictError('Selecione uma retirada válida.');
  const returned=records.filter(r=>r.kind==='return'&&r.referenceId===original.id&&!reversed.has(r.id)).reduce((s,r)=>s+r.amountCents,0);
  if(returned+record.amountCents>original.amountCents)throw new CostConflictError('Devolução maior que o valor ainda não devolvido da retirada.');
 }
}
export function managementTotals(records:ManagementRecord[]){
 const reversed=new Set(records.filter(r=>r.kind==='reversal').map(r=>r.referenceId));const active=records.filter(r=>!reversed.has(r.id));
 const sum=(kind:ManagementKind)=>active.filter(r=>r.kind===kind).reduce((s,r)=>s+r.amountCents,0);
 return {withdrawalsCents:sum('withdrawal'),returnsCents:sum('return'),contributionsCents:sum('contribution'),lastBank:active.filter(r=>r.kind==='bank').at(-1)??null};
}
