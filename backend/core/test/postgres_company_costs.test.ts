import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresCompanyCostRepository } from '../src/costs/company-cost-repository.js';
import { calculateCostReport, createCostItem, reportPeriod } from '../src/costs/company-costs.js';

const databaseUrl=process.env.DATABASE_URL?.trim();
test('PostgreSQL: relatório, idempotência JSONB, concorrência e auditoria atômica sem alterar pagamentos',{skip:!databaseUrl},async()=>{
  const schema=`costs_${randomUUID().replaceAll('-','')}`,owner=randomUUID(),ride=randomUUID(),payment=randomUUID();
  const root=createPostgresPool(databaseUrl!);
  const url=new URL(databaseUrl!);url.searchParams.set('options',`-c search_path=${schema},public`);
  const pool=createPostgresPool(url.toString()),repo=new PostgresCompanyCostRepository(pool);
  const actor={kind:'user' as const,id:owner,name:'Owner costs test'};
  const report=async()=>calculateCostReport(await repo.source(reportPeriod('2026-10-01','2026-10-31')),reportPeriod('2026-10-01','2026-10-31'));
  const expense=(amount=120)=>createCostItem('expense',{name:'Pix conferido',category:'Pagamentos',slot:'processing_fee',amountCents:amount,certainty:'confirmed',occurredOn:'2026-10-06',paymentId:payment},randomUUID());
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE admin_audit_log (LIKE public.admin_audit_log INCLUDING ALL);
      CREATE TABLE company_cost_items (LIKE public.company_cost_items INCLUDING ALL);
      CREATE TABLE rides (id uuid PRIMARY KEY);
      CREATE TABLE payments (id uuid PRIMARY KEY,ride_id uuid,method text,amount_cents integer);
      CREATE TABLE ledger_transactions (id uuid PRIMARY KEY,kind text,created_at timestamptz,ride_id uuid,payment_id uuid,company_payout_id uuid);
      CREATE TABLE ledger_entries (transaction_id uuid,account_key text,direction text,amount_cents integer);`);
    await pool.query('INSERT INTO rides VALUES($1)',[ride]);
    await pool.query("INSERT INTO payments VALUES($1,$2,'pix',5000)",[payment,ride]);
    for(const [kind,account,direction,amount,payout] of [
      ['PAYMENT_CAPTURED','ride:escrow','credit',5000,null],
      ['RIDE_SETTLED','platform:revenue','credit',500,null],
      ['COMPANY_PAYOUT_PAID','platform:revenue','debit',500,randomUUID()],
    ] as const){
      const id=randomUUID();
      await pool.query("INSERT INTO ledger_transactions VALUES($1,$2,'2026-10-06T15:00:00Z',$3,$4,$5)",[id,kind,ride,payment,payout]);
      await pool.query('INSERT INTO ledger_entries VALUES($1,$2,$3,$4)',[id,account,direction,amount]);
    }
    const rule=createCostItem('rule',{name:'Pix',category:'Pagamentos',slot:'processing_fee',amountCents:99,rateBps:0,certainty:'estimated',basis:'pix_payment',startsOn:'2026-10-01'},randomUUID());
    const saved=await repo.save(rule,actor);
    assert.equal((await report()).summary.projectedNetCents,401);
    assert.equal((await repo.save(structuredClone(rule),actor)).id,rule.id);
    const attempts=await Promise.allSettled([repo.save(expense(),actor),repo.save(expense(),actor)]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
    const actual=(attempts.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<ReturnType<typeof expense>>).value;
    assert.equal(actual.data.rideId,ride);
    assert.equal((await report()).summary.projectedNetCents,380);
    assert.equal((await repo.save(expenseWithId(actual),actor)).id,actual.id);
    await assert.rejects(repo.save({...actual,data:{...actual.data,amountCents:121}},actor,'2000-01-01T00:00:00.000Z'));
    // JSONB reorders object keys; ending a rule must still compare normalized data.
    await repo.save({...saved,data:{...saved.data,endsOn:'2026-10-31'}},actor,saved.updatedAt);
    assert.equal(Number((await pool.query('SELECT count(*) AS n FROM admin_audit_log')).rows[0].n),3);
    await pool.query("ALTER TABLE admin_audit_log ADD CONSTRAINT fail_new_cost CHECK(action <> 'costs.created') NOT VALID");
    const other=createCostItem('expense',{name:'Servidor',category:'Infraestrutura',slot:'server',amountCents:5000,certainty:'confirmed',occurredOn:'2026-10-06'},randomUUID());
    await assert.rejects(repo.save(other,actor));
    assert.equal((await pool.query('SELECT id FROM company_cost_items WHERE id=$1',[other.id])).rows.length,0);
    assert.equal(Number((await pool.query('SELECT amount_cents FROM payments WHERE id=$1',[payment])).rows[0].amount_cents),5000);
    assert.equal(Number((await pool.query('SELECT count(*) AS n FROM ledger_transactions')).rows[0].n),3);
  } finally {await pool.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
});
function expenseWithId(item:ReturnType<typeof createCostItem>){const copy=structuredClone(item);copy.data.rideId=null;return copy;}
