import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AdminActor, AdminRepository } from '../admin/admin-repository.js';
import { PostgresAdminRepository } from '../admin/repositories/postgres-admin-repository.js';
import { InvalidAdminRequestError } from '../admin/admin-validation.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { LedgerTransaction } from '../payments/ledger.js';
import { CostConflictError, localDate, type CostItem, type CostSource, type CostEvent, type reportPeriod } from './company-costs.js';

export interface CompanyCostRepository {
  source(period: ReturnType<typeof reportPeriod>): Promise<CostSource>;
  save(item: CostItem, actor: AdminActor, expectedUpdatedAt?: string): Promise<CostItem>;
}
const sameData = (a:object,b:object) => JSON.stringify(a,Object.keys(a).sort()) === JSON.stringify(b,Object.keys(b).sort());
function matchScope(a: CostItem,b: CostItem) {
  if(a.kind !== b.kind || a.data.slot !== b.data.slot || a.id === b.id) return false;
  if(a.kind === 'rule') {
    if(a.data.basis !== b.data.basis) return false;
    return a.data.startsOn! <= (b.data.endsOn ?? '9999-12-31') && b.data.startsOn! <= (a.data.endsOn ?? '9999-12-31');
  }
  if(a.data.voided || b.data.voided) return false;
  return !!((a.data.paymentId && a.data.paymentId===b.data.paymentId) ||
    (!a.data.paymentId && !b.data.paymentId && a.data.rideId && a.data.rideId===b.data.rideId) ||
    (a.data.ruleId && a.data.ruleId===b.data.ruleId && a.data.occurredOn!.slice(0,7)===b.data.occurredOn!.slice(0,7)));
}
function assertWrite(items: CostItem[],item: CostItem,expected?: string) {
  const old=items.find(i=>i.id===item.id);
  if(expected != null && (!old || old.updatedAt !== expected)) throw new CostConflictError('O custo foi alterado por outra pessoa. Atualize e tente novamente.');
  if(expected == null && old) {
    if(old.kind===item.kind && sameData(old.data,item.data)) return old;
    throw new CostConflictError('Identificador já utilizado.');
  }
  if(old && old.kind !== item.kind) throw new InvalidAdminRequestError('Não é possível mudar o tipo de registro.');
  if(old?.kind==='rule') {
    // Terminar vigência é permitido; valores/âncora não mudam retroativamente.
    const before={...old.data,endsOn:null},after={...item.data,endsOn:null};
    if(!sameData(before,after)) throw new InvalidAdminRequestError('Encerre a regra antiga e crie uma nova para preservar o histórico.');
  }
  if(items.some(i=>matchScope(i,item))) throw new CostConflictError('Já existe um custo ou regra para esse tipo e operação/período. Edite o registro existente.');
  if(item.data.ruleId) {
    const rule=items.find(i=>i.kind==='rule' && i.id===item.data.ruleId);
    if(!rule || rule.data.basis!=='monthly' || rule.data.slot !== item.data.slot) throw new InvalidAdminRequestError('Regra mensal vinculada inválida.');
  }
  return old ? {...item,createdAt:old.createdAt,updatedAt:new Date(Math.max(Date.now(),Date.parse(old.updatedAt)+1)).toISOString()}:item;
}
function mapItem(row: Record<string,any>): CostItem {
  return {id:row.id,kind:row.kind,data:row.data,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};
}
function audit(item:CostItem,actor:AdminActor,old?:CostItem) {
  return {id:randomUUID(),actor,action:old?'costs.updated':'costs.created',targetType:'company_cost',targetId:item.id,
    metadata:{kind:item.kind,before:old?.data ?? null,after:item.data},createdAt:item.updatedAt};
}
export class PostgresCompanyCostRepository implements CompanyCostRepository {
  constructor(private readonly pool: Pool) {}
  async source(period: ReturnType<typeof reportPeriod>): Promise<CostSource> {
    const c=await this.pool.connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const items=await c.query('SELECT * FROM company_cost_items ORDER BY created_at DESC');
      const events=await c.query(`SELECT t.id,t.kind,t.created_at,t.ride_id,t.payment_id,
        COALESCE(SUM(CASE WHEN e.account_key='platform:revenue' AND t.kind IN ('RIDE_SETTLED','CASH_RIDE_COMMISSION_ACCRUED') THEN CASE WHEN e.direction='credit' THEN e.amount_cents ELSE -e.amount_cents END ELSE 0 END),0)::text AS commission,
        COALESCE(SUM(CASE WHEN e.account_key='platform:revenue' AND t.kind NOT IN ('RIDE_SETTLED','CASH_RIDE_COMMISSION_ACCRUED') AND t.company_payout_id IS NULL THEN CASE WHEN e.direction='credit' THEN e.amount_cents ELSE -e.amount_cents END ELSE 0 END),0)::text AS other_revenue,
        COALESCE(SUM(CASE WHEN e.account_key='platform:payment_fee_recovery' THEN CASE WHEN e.direction='credit' THEN e.amount_cents ELSE -e.amount_cents END ELSE 0 END),0)::text AS fee_recovery,
        COALESCE(SUM(CASE WHEN e.account_key='platform:promotion_expense' THEN CASE WHEN e.direction='debit' THEN e.amount_cents ELSE -e.amount_cents END ELSE 0 END),0)::text AS promotion,
        COALESCE(SUM(CASE WHEN e.account_key='platform:external_adjustment_review' THEN CASE WHEN e.direction='debit' THEN e.amount_cents ELSE -e.amount_cents END ELSE 0 END),0)::text AS adjustment
        FROM ledger_transactions t LEFT JOIN ledger_entries e ON e.transaction_id=t.id
        WHERE t.created_at >= $1 AND t.created_at < $2 GROUP BY t.id ORDER BY t.created_at DESC LIMIT 50001`,[period.start,period.end]);
      const payments=await c.query(`SELECT DISTINCT ON(p.id) p.id,p.ride_id,p.method,p.amount_cents,t.created_at
        FROM payments p JOIN ledger_transactions t ON t.payment_id=p.id AND t.kind='PAYMENT_CAPTURED'
        WHERE t.created_at >= $1 AND t.created_at < $2 ORDER BY p.id,t.created_at LIMIT 50001`,[period.start,period.end]);
      if(events.rows.length>50000 || payments.rows.length>50000) throw new InvalidAdminRequestError('Muitas operações nesse intervalo. Escolha um período menor.');
      await c.query('COMMIT');
      return {items:items.rows.map(mapItem),events:events.rows.map(r=>({id:r.id,kind:r.kind,at:new Date(r.created_at).toISOString(),
        ...(r.ride_id?{rideId:r.ride_id}:{}),...(r.payment_id?{paymentId:r.payment_id}:{}),commissionCents:Number(r.commission),
        otherRevenueCents:Number(r.other_revenue),feeRecoveryCents:Number(r.fee_recovery),promotionCents:Number(r.promotion),adjustmentCents:Number(r.adjustment)})),
        payments:payments.rows.map(r=>({id:r.id,rideId:r.ride_id,method:r.method,at:new Date(r.created_at).toISOString(),amountCents:r.amount_cents}))};
    } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
  }
  async save(item:CostItem,actor:AdminActor,expected?:string) {
    const c=await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('company-cost-writes',0))");
      const items=(await c.query('SELECT * FROM company_cost_items ORDER BY created_at DESC')).rows.map(mapItem);
      const existing=items.find(i=>i.id===item.id);
      if(item.data.paymentId) {
        const p=(await c.query('SELECT ride_id FROM payments WHERE id=$1',[item.data.paymentId])).rows[0];
        if(!p) throw new InvalidAdminRequestError('Pagamento vinculado não encontrado.');
        if(item.data.rideId && item.data.rideId!==p.ride_id) throw new InvalidAdminRequestError('Pagamento não pertence à corrida informada.');
        item.data.rideId=p.ride_id;
      } else if(item.data.rideId && !(await c.query('SELECT id FROM rides WHERE id=$1',[item.data.rideId])).rows.length) {
        throw new InvalidAdminRequestError('Corrida vinculada não encontrada.');
      }
      const next=assertWrite(items,item,expected);
      if(expected==null && existing) {await c.query('COMMIT');return existing;}
      await c.query(`INSERT INTO company_cost_items(id,kind,data,created_at,updated_at) VALUES($1,$2,$3::jsonb,$4,$5)
        ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at`,[next.id,next.kind,JSON.stringify(next.data),next.createdAt,next.updatedAt]);
      await new PostgresAdminRepository({query:c.query.bind(c)} as unknown as Pool).appendAudit(audit(next,actor,existing));
      await c.query('COMMIT');return next;
    } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
  }
}
export function costEvent(t:LedgerTransaction):CostEvent {
  const balance=(key:string)=>t.entries.filter(e=>e.accountKey===key).reduce((s,e)=>s+(e.direction==='credit'?e.amountCents:-e.amountCents),0);
  const settlement=['RIDE_SETTLED','CASH_RIDE_COMMISSION_ACCRUED'].includes(t.kind);
  return {id:t.id,kind:t.kind,at:t.createdAt,...(t.rideId?{rideId:t.rideId}:{}),...(t.paymentId?{paymentId:t.paymentId}:{}),
    commissionCents:settlement?balance('platform:revenue'):0,otherRevenueCents:!settlement&&!t.companyPayoutId?balance('platform:revenue'):0,
    feeRecoveryCents:balance('platform:payment_fee_recovery'),promotionCents:-balance('platform:promotion_expense'),adjustmentCents:-balance('platform:external_adjustment_review')};
}
export class InMemoryCompanyCostRepository implements CompanyCostRepository {
  readonly items:CostItem[]=[];
  constructor(private readonly finance:FinanceRepository,private readonly admin:AdminRepository) {}
  async source(period:ReturnType<typeof reportPeriod>):Promise<CostSource> {
    const tx=await this.finance.listLedgerTransactionsForAccounts(['platform:revenue','platform:payment_fee_recovery','platform:promotion_expense','platform:external_adjustment_review'],50001);
    const payments=await this.finance.listRecentPayments(50001);
    const captured=await this.finance.listLedgerTransactionsForAccounts(payments.map(p=>`ride:${p.rideId}:escrow`),50001);
    return {items:structuredClone(this.items),events:tx.filter(t=>localDate(t.createdAt)>=period.from&&localDate(t.createdAt)<=period.to).map(costEvent),
      payments:payments.flatMap(p=>{const t=captured.find(t=>t.kind==='PAYMENT_CAPTURED'&&t.paymentId===p.id);return t?[{id:p.id,rideId:p.rideId,method:p.method,amountCents:p.amountCents,at:t.createdAt}]:[];})};
  }
  async save(item:CostItem,actor:AdminActor,expected?:string) {
    const old=this.items.find(i=>i.id===item.id),next=assertWrite(this.items,item,expected);
    if(expected==null&&old)return structuredClone(old);
    await this.admin.appendAudit(audit(next,actor,old));
    const i=this.items.findIndex(i=>i.id===item.id);if(i<0)this.items.push(structuredClone(next));else this.items[i]=structuredClone(next);
    return structuredClone(next);
  }
}
