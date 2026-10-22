import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {escapeCompose} from './asaas-activation-plan-contract.mjs';
export const productionPreparation='/opt/ramo-nessa-private/mp-production-20261022';
export const confirmedCore='sha256:8020dd70b5aeb81ddd857f28293c475cc50f6d4708588a8963d7d20223b462be';
export const confirmedGateway='sha256:72c5f3b8fb7152673823fa968bf0d79e623805b2449d5faab3d78b7c8afd8cd6';
export async function verifyProductionAccount(token,transport=fetch){
  let response;
  try{response=await transport('https://api.mercadopago.com/users/me',{
    method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)
  });}catch{throw Error('MP_CONNECTION_FAILED');}
  if(!response.ok)throw Error('MP_ACCOUNT_HTTP_'+response.status);
  let data;try{data=await response.json();}catch{throw Error('MP_ACCOUNT_INVALID_RESPONSE');}
  if(!Number.isSafeInteger(data?.id)||data.id<=0||data.site_id!=='MLB'||!Array.isArray(data.tags))throw Error('MP_ACCOUNT_INVALID_RESPONSE');
  if(data.tags.includes('test_user')||/@testuser\.com$/i.test(data.email??''))throw Error('MP_TEST_ACCOUNT_REJECTED');
  // Read-only authentication check. It does not prove Public Key pairing,
  // external webhook delivery, Orders permissions or successful settlement.
  return {accountId:String(data.id),siteId:data.site_id,productionAccount:true};
}
export function productionCorePlan(before,credentials){
  if(Object.keys(before.services??{}).join(',')!=='core')throw Error('MP_PLAN_SCOPE');
  const e=before.services.core.environment;
  if(e?.MERCADO_PAGO_MODE!=='test'||e.MERCADO_PAGO_ACCESS_TOKEN||e.ASAAS_PAYOUTS_ENABLED!=='false')throw Error('MP_BASELINE_CHANGED');
  const after=structuredClone(before),next=after.services.core.environment;
  next.MERCADO_PAGO_MODE='production';next.MERCADO_PAGO_PIX_TEST_APPROVAL='false';
  next.MERCADO_PAGO_ACCESS_TOKEN=escapeCompose(credentials.accessToken);
  next.MERCADO_PAGO_WEBHOOK_SECRET=escapeCompose(credentials.webhookSecret);
  delete next.MERCADO_PAGO_ACCESS_TOKEN_TEST;
  return after;
}
export function assertProductionCoreDelta(before,after,credentials){
  if(!isDeepStrictEqual(after,productionCorePlan(before,credentials)))throw Error('MP_PLAN_OUT_OF_SCOPE');
}
export const inventoryTables=['payments','wallet_topups','driver_payouts','rides','ledger_transactions','ledger_entries',
  'ride_offers','company_profit_payouts','company_payouts','payment_external_adjustments','promotions','promotion_redemptions'];
export async function readProductionInventory(client){
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
    await client.query("SET LOCAL statement_timeout = '15s'");
    const tables={};
    for(const name of inventoryTables){
      const found=(await client.query('SELECT to_regclass($1)::text AS name',['public.'+name])).rows[0]?.name;
      if(!found){if(inventoryTables.indexOf(name)<6)throw Error('MP_REQUIRED_TABLE_MISSING');continue;}
      tables[name]=(await client.query(`SELECT to_jsonb(t) AS record FROM ${name} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.record);
    }
    await client.query('ROLLBACK');return tables;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
export function summarizeProductionInventory(tables){
  const byStatus=(name,key='status')=>{
    const groups={};for(const row of tables[name]??[]){const s=String(row[key]);const g=groups[s]??={quantity:0,totalCents:0};g.quantity++;g.totalCents+=Number(row.amount_cents??0);}
    return groups;
  };
  const balances={};for(const e of tables.ledger_entries??[]){
    if(!Number.isSafeInteger(e.amount_cents)||e.amount_cents<=0||!['credit','debit'].includes(e.direction))throw Error('MP_INVALID_LEDGER');
    balances[e.account_key]=(balances[e.account_key]??0)+(e.direction==='credit'?e.amount_cents:-e.amount_cents);
  }
  const groups={};
  for(const [key,cents]of Object.entries(balances)){
    if(!Number.isSafeInteger(cents))throw Error('MP_INVALID_LEDGER');
    if(cents===0)continue;
    const kind=/^passenger:.*:wallet$/.test(key)?'passenger:wallet':/^driver:.*:(payable|payout_pending|commission_debt)$/.test(key)?'driver:'+key.split(':').at(-1):key.startsWith('ride:')?'ride:escrow':key.startsWith('platform:')?'platform:'+key.split(':').at(-1):key.startsWith('processor:')?'processor:clearing':'other';
    const g=groups[kind]??={accounts:0,totalCents:0};g.accounts++;g.totalCents+=cents;
  }
  return {payments:byStatus('payments'),walletTopups:byStatus('wallet_topups'),driverPayouts:byStatus('driver_payouts'),
    rides:byStatus('rides','state'),companyPayouts:byStatus('company_profit_payouts'),nonzeroLedgerAccounts:groups};
}
export const inventoryDigest=tables=>createHash('sha256').update(JSON.stringify(tables)).digest('hex');
