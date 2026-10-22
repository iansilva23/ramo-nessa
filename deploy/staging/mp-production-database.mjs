// Local maintenance only: no provider imports, HTTP requests or deletion.
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,openSync,fsyncSync,closeSync,renameSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {inventoryTables,inventoryDigest,summarizeProductionInventory} from './mp-production-preflight-contract.mjs';

export const cutoverTables=[...inventoryTables,'operational_settings','payment_events','driver_payout_settings','payment_policy_settings','schema_migrations'];
export async function contextInsideTransaction(client){
  const tables={};for(const name of cutoverTables){
    if(!(await client.query('SELECT to_regclass($1)::text AS name',['public.'+name])).rows[0]?.name){
      if(inventoryTables.indexOf(name)>=0&&inventoryTables.indexOf(name)<6||['operational_settings','payment_events','schema_migrations'].includes(name))throw Error('MP_REQUIRED_TABLE_MISSING');
      continue;
    }
    tables[name]=(await client.query(`SELECT to_jsonb(t) AS record FROM ${name} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.record);
  }return tables;
}
export function financialSubset(context){return Object.fromEntries(inventoryTables.filter(k=>Object.hasOwn(context,k)).map(k=>[k,context[k]]));}
export function assertConfirmedTestInventory(tables){
  const expected={payments:{created:{quantity:1,totalCents:737},failed:{quantity:1,totalCents:737},paid:{quantity:1,totalCents:700},refunded:{quantity:3,totalCents:3097}},
    walletTopups:{cancelled:{quantity:1,totalCents:100},paid:{quantity:8,totalCents:16400},refunded:{quantity:2,totalCents:200}},
    driverPayouts:{paid:{quantity:1,totalCents:630}},
    rides:{AWAITING_PAYMENT:{quantity:4,totalCents:0},PAYMENT_FAILED:{quantity:1,totalCents:0},REFUNDED:{quantity:3,totalCents:0},COMPLETED:{quantity:1,totalCents:0}},
    companyPayouts:{},nonzeroLedgerAccounts:{'processor:clearing':{accounts:2,totalCents:-15770},'passenger:wallet':{accounts:1,totalCents:15700},'platform:revenue':{accounts:1,totalCents:70}}};
  if(!isDeepStrictEqual(summarizeProductionInventory(tables),expected)||(tables.company_payouts??[]).length||
     (tables.ride_offers??[]).some(r=>r.status==='OFFERED'||r.status==='ACCEPTED'&&tables.rides.find(t=>t.id===r.ride_id)?.state!=='COMPLETED'))throw Error('MP_CONFIRMED_TEST_INVENTORY_CHANGED');
}
export function archiveTestBalances(entries){
  const balances=new Map();for(const e of entries){
    if(!Number.isSafeInteger(e.amount_cents)||e.amount_cents<=0||!['credit','debit'].includes(e.direction)||!e.account_key)throw Error('MP_INVALID_LEDGER');
    balances.set(e.account_key,(balances.get(e.account_key)??0)+(e.direction==='credit'?e.amount_cents:-e.amount_cents));
  }
  if([...balances.values()].reduce((a,b)=>a+b,0)!==0)throw Error('MP_UNBALANCED_LEDGER');
  return [...balances].sort(([a],[b])=>a.localeCompare(b)).filter(([,v])=>v!==0).flatMap(([account,balance])=>{
    if(!Number.isSafeInteger(balance)||Math.abs(balance)>2147483647||account.startsWith('archive:'))throw Error('MP_UNSUPPORTED_LEDGER');
    return [{account_key:account,direction:balance>0?'debit':'credit',amount_cents:Math.abs(balance)},
      {account_key:'archive:test-mp-20261022:'+account,direction:balance>0?'credit':'debit',amount_cents:Math.abs(balance)}];
  });
}
async function insertLedger(client,ref,kind,entries,at){
  const id=randomUUID();await client.query('INSERT INTO ledger_transactions (id,kind,reference_key,created_at) VALUES ($1,$2,$3,$4)',[id,kind,ref,at]);
  for(const e of entries)await client.query('INSERT INTO ledger_entries (id,transaction_id,account_key,direction,amount_cents,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),id,e.account_key,e.direction,e.amount_cents,at]);
}
function saveDurably(file,data){
  const temporary=file+'.incomplete';const fd=openSync(temporary,'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(data));fsyncSync(fd);}finally{closeSync(fd);}
  if(existsSync(file))throw Error('MP_RECEIPT_EXISTS');renameSync(temporary,file);
  const dirfd=openSync(resolve(file,'..'),'r');try{fsyncSync(dirfd);}finally{closeSync(dirfd);}
}
export async function maintainTestFinance(client,input,receipts){
  if(!/^mp-production-cutover:[a-f0-9]{64}$/.test(input.reference)||!['context','apply','verify','reverse'].includes(input.mode))throw Error('MP_WORKER_ARGUMENTS');
  const readOnly=['context','verify'].includes(input.mode);
  await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await client.query("SET LOCAL lock_timeout = '5s'");await client.query("SET LOCAL statement_timeout = '20s'");
    if(!readOnly){
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[input.reference]);
      for(const name of cutoverTables)if((await client.query('SELECT to_regclass($1)::text AS name',['public.'+name])).rows[0]?.name)await client.query(`LOCK TABLE ${name} IN ACCESS EXCLUSIVE MODE`);
    }
    const current=await contextInsideTransaction(client);
    if(input.mode==='context'){await client.query('ROLLBACK');return current;}
    const receipt=receipts.load('apply');
    if(input.mode==='verify'){
      if(!receipt||inventoryDigest(current)!==inventoryDigest(receipt.after))throw Error('MP_POST_CUTOVER_DATA_CHANGED');
      await client.query('ROLLBACK');return {verified:true};
    }
    if(input.mode==='apply'){
      if(receipt){
        if(inventoryDigest(current)!==inventoryDigest(receipt.after))throw Error('MP_EXISTING_RECEIPT_REQUIRES_REVIEW');
        await client.query('ROLLBACK');return {alreadyApplied:true};
      }
      if(inventoryDigest(current)!==inventoryDigest(input.before))throw Error('MP_DATABASE_CHANGED');
      assertConfirmedTestInventory(financialSubset(current));
      if(!/^APP_USR-[A-Za-z0-9_-]{10,500}$/.test(input.publicKey))throw Error('MP_PUBLIC_KEY_INVALID');
      const operational=current.operational_settings;
      if(operational.length!==1||operational[0].id!==1)throw Error('MP_OPERATIONAL_ROW_INVALID');
      if(current.driver_payout_settings?.some(p=>p.mode!=='manual'||p.automatic_enabled!==false))throw Error('MP_PAYOUT_POLICY_NOT_MANUAL');
      const at=new Date().toISOString(),entries=archiveTestBalances(current.ledger_entries);
      await insertLedger(client,input.reference,'TEST_ENVIRONMENT_ARCHIVED',entries,at);
      for(const p of current.payments.filter(p=>p.status==='created')){
        await client.query("UPDATE payments SET status='cancelled',updated_at=$2 WHERE id=$1 AND status='created'",[p.id,at]);
        await client.query('INSERT INTO payment_events (id,processor,processor_event_id,payment_id,payload,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [randomUUID(),'internal-test-cutover',input.reference+':'+p.id,p.id,JSON.stringify({reason:'owner_confirmed_all_records_are_tests',operator:'vps-root',before:p.status,after:'cancelled'}),at]);
      }
      for(const r of current.rides.filter(r=>['AWAITING_PAYMENT','PAYMENT_FAILED'].includes(r.state)))await client.query("UPDATE rides SET state='CANCELLED_BY_ADMIN',payment_status='cancelled',updated_at=$2 WHERE id=$1",[r.id,at]);
      await client.query('UPDATE operational_settings SET mercado_pago_public_key=$1,updated_at=$2 WHERE id=1',[input.publicKey,at]);
      const after=await contextInsideTransaction(client);
      receipts.save('apply',{reference:input.reference,operator:'vps-root',ownerConfirmation:'all_preexisting_financial_records_are_tests',before:current,after,entries,at});
      await client.query('COMMIT');return {applied:true,walletTestCentsArchived:15700,platformTestCentsArchived:70,ridesClosed:5};
    }
    if(!receipt)throw Error('MP_APPLY_RECEIPT_MISSING');
    const reversal=receipts.load('reverse');
    if(reversal){if(inventoryDigest(current)!==inventoryDigest(reversal.after))throw Error('MP_REVERSED_DATA_CHANGED');await client.query('ROLLBACK');return {alreadyReversed:true};}
    // A receipt is fsynced before COMMIT. If COMMIT failed, the baseline is
    // still intact and no compensating entries should be appended.
    if(inventoryDigest(current)===inventoryDigest(receipt.before)){await client.query('ROLLBACK');return {neverCommitted:true};}
    if(inventoryDigest(current)!==inventoryDigest(receipt.after))throw Error('MP_REVERSAL_REFUSED_CONCURRENT_CHANGE');
    const at=new Date().toISOString();
    await insertLedger(client,input.reference+':reverse','TEST_ENVIRONMENT_ARCHIVE_REVERSED',receipt.entries.map(e=>({...e,direction:e.direction==='credit'?'debit':'credit'})),at);
    for(const p of receipt.before.payments.filter(p=>p.status==='created')){
      await client.query('UPDATE payments SET status=$2,updated_at=$3 WHERE id=$1',[p.id,p.status,p.updated_at]);
      await client.query('INSERT INTO payment_events (id,processor,processor_event_id,payment_id,payload,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),'internal-test-cutover',input.reference+':reverse:'+p.id,p.id,JSON.stringify({reason:'cutover_rollback',operator:'vps-root'}),at]);
    }
    for(const r of receipt.before.rides.filter(r=>['AWAITING_PAYMENT','PAYMENT_FAILED'].includes(r.state)))await client.query('UPDATE rides SET state=$2,payment_status=$3,updated_at=$4 WHERE id=$1',[r.id,r.state,r.payment_status,r.updated_at]);
    const old=receipt.before.operational_settings[0];await client.query('UPDATE operational_settings SET mercado_pago_public_key=$1,updated_at=$2 WHERE id=1',[old.mercado_pago_public_key,old.updated_at]);
    const after=await contextInsideTransaction(client);receipts.save('reverse',{reference:input.reference,before:current,after,at});
    await client.query('COMMIT');return {reversed:true,historyPreserved:true};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let pool,client;
  try{
    const input=JSON.parse(readFileSync(0,'utf8'));
    for(const key of ['DATABASE_URL','DB_SSL','DB_SSL_CA'])if(input.databaseEnv?.[key]!=null)process.env[key]=input.databaseEnv[key];
    const {createPostgresPool}=await import('/app/dist/src/db/postgres.js');pool=createPostgresPool(process.env.DATABASE_URL);client=await pool.connect();
    const file=name=>join('/work',name+'-receipt.private.json');
    const receipts={load:name=>existsSync(file(name))?JSON.parse(readFileSync(file(name),'utf8')):null,save:(name,data)=>saveDurably(file(name),data)};
    const result=await maintainTestFinance(client,input,receipts);console.log(JSON.stringify(result));
  }catch(error){console.error(/^MP_[A-Z0-9_]+$/.test(error.message)?error.message:'MP_DATABASE_WORKER_FAILED');process.exitCode=1;}
  finally{client?.release();await pool?.end();}
}
