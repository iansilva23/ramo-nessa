// Runs the built payout code against a fresh, private Sandbox database only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
import {PostgresFinanceRepository} from '/app/dist/src/payments/repositories/postgres-finance-repository.js';
import {PostgresAsaasPayoutStore} from '/app/dist/src/payments/asaas-payout-store.js';
import {AsaasDriverPayoutProvider} from '/app/dist/src/payments/asaas-driver-payout-provider.js';
import {requestDriverPayout} from '/app/dist/src/payments/request-payout.js';
import {processDriverPayout,applyConfirmedDriverPayoutResult} from '/app/dist/src/payments/driver-payout-processing-service.js';
const dir='/audit/data',s=JSON.parse(readFileSync(dir+'/session.json','utf8'));
const url=new URL(process.env.DATABASE_URL??'https://invalid');
assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5432');assert.equal(url.pathname,'/ramo_asaas_sandbox');
const destination='cliente-a00001@pix.bcb.gov.br',amount=500,key=readFileSync('/run/secrets/asaas-sandbox-api-key','utf8').trim();
const webhookToken=readFileSync(dir+'/webhook-token','utf8').trim();
const httpLog=dir+'/http-intents.jsonl',diagnostics=dir+'/diagnostics.jsonl';
const intents=()=>existsSync(httpLog)?readFileSync(httpLog,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const upstream=globalThis.fetch;
async function transport(url,init={}){
 const parsed=new URL(url),method=init.method??'GET';assert.equal(parsed.origin,'https://api-sandbox.asaas.com');
 assert.ok(method==='GET'||(method==='POST'&&parsed.pathname==='/v3/transfers'));
 if(method==='POST'){
  const body=JSON.parse(init.body);assert.equal(body.value,5);assert.equal(body.pixAddressKey,destination);assert.equal(body.pixAddressKeyType,'EMAIL');
  assert.equal(intents().filter(r=>r.method==='POST').length,0,'A sessão já tem intenção de envio. Não será repetido.');
 }
 appendFileSync(httpLog,JSON.stringify({method,path:parsed.pathname,at:new Date().toISOString()})+'\n',{mode:0o600});
 const response=await upstream(url,{...init,redirect:'error'});
 let body={};try{body=await response.clone().json();}catch{}
 const codes=Array.isArray(body.errors)?body.errors.map(e=>e.code).filter(c=>typeof c==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(c)):[];
 appendFileSync(diagnostics,JSON.stringify({method,path:parsed.pathname,http:response.status,status:typeof body.status==='string'?body.status:null,keys:Object.keys(body),codes})+'\n',{mode:0o600});
 return response;
}
const pool=createPostgresPool(url.toString()),finance=new PostgresFinanceRepository(pool),store=new PostgresAsaasPayoutStore(pool);
let report={transport:process.env.GITHUB_ACTIONS==='true'?'ci-fixture':'asaas-sandbox-api',amountCents:amount,externalWebhookDeliveryVerified:false};
try{
 const idempotencyKey='asaas-sandbox:'+s.id;
 let payout=await finance.findDriverPayoutByIdempotencyKey(idempotencyKey);
 if(!payout){
  const response=await transport('https://api-sandbox.asaas.com/v3/finance/balance',{headers:{access_token:key,'user-agent':'RamoNessa-DriverPayouts/1.0'},signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,'Consulta de saldo Sandbox recusada.');const balance=await response.json();assert.ok(typeof balance.balance==='number'&&balance.balance>=5,'Saldo de testes insuficiente.');
  await pool.query(`INSERT INTO rides (id,passenger_id,state,payment_status,origin_zone_id,destination_zone_id,category,price_period,passengers,pricing_rule_id,base_amount_cents,pickup_compensation_cents,total_amount_cents,platform_commission_cents,driver_net_cents,created_at,updated_at) VALUES ($1,'asaas-sandbox-fixture','AWAITING_PAYMENT','pending','prea','jijoca','car','day',1,'asaas-sandbox-fixture',600,0,600,100,500,$2,$2) ON CONFLICT(id) DO NOTHING`,[s.rideId,s.createdAt]);
  await finance.createPayment({id:s.paymentId,rideId:s.rideId,method:'wallet',processor:'internal-wallet',status:'pending',amountCents:600,idempotencyKey:'asaas-sandbox-payment:'+s.id,createdAt:s.createdAt,updatedAt:s.createdAt});
  await finance.capturePayment({paymentId:s.paymentId,processorEventId:s.captureEventId});
  await finance.settleRide({rideId:s.rideId,paymentId:s.paymentId,driverId:s.driverId,totalAmountCents:600,platformCommissionCents:100,driverNetCents:500});
  await finance.upsertDriverPayoutDestination({driverId:s.driverId,pixKeyType:'email',pixKey:destination,createdAt:s.createdAt,updatedAt:s.createdAt});
  payout=(await requestDriverPayout(finance,{driverId:s.driverId,amountCents:amount,requestedAmountCents:amount,feeCents:0,payoutKind:'manual',executionMode:'api',approvedAt:new Date(s.createdAt),idempotencyKey,now:new Date(s.createdAt)})).payout;
 }
 const options={environment:'sandbox',apiKey:key,webhookToken,startAfter:new Date(Date.parse(s.createdAt)-60000).toISOString(),store,financeLookup:id=>finance.findDriverPayoutById(id),fetcher:transport};
 const provider=new AsaasDriverPayoutProvider(options),process=()=>processDriverPayout({finance,provider,payoutId:payout.id});
 const first=await Promise.allSettled([process(),process()]);
 report.firstErrors=first.filter(r=>r.status==='rejected').map(r=>typeof r.reason?.code==='string'?r.reason.code:'SANDBOX_REVIEW_REQUIRED');
 for(let i=0;i<3;i++){
  const current=await finance.findDriverPayoutById(payout.id);if(['paid','failed','cancelled'].includes(current.status))break;
  await new Promise(r=>setTimeout(r,2000));try{await process();}catch{}
 }
 const current=await finance.findDriverPayoutById(payout.id),attempt=await store.get(payout.id);
 report={...report,payoutId:payout.id,status:current.status,transferId:attempt?.transferId??null,postAttempts:intents().filter(r=>r.method==='POST').length};
 assert.equal(report.postAttempts,1);
 if(current.status==='paid'){
  const body={id:'evt-local-sandbox-replay-'+s.id,event:'TRANSFER_DONE',transfer:{id:attempt.transferId}};
  await assert.rejects(provider.receiveWebhook('invalid-token',body));
  const event=await provider.receiveWebhook(webhookToken,body);
  if(!event.duplicate){await applyConfirmedDriverPayoutResult({finance,provider,payoutId:event.payoutId,result:event.result});await provider.completeWebhook(body.id);}
  assert.deepEqual(await provider.receiveWebhook(webhookToken,body),{duplicate:true});await process();
  const ledger=await pool.query('SELECT count(*)::int AS n FROM ledger_transactions WHERE reference_key=$1',['driver-payout-paid:'+payout.id]);
  assert.equal(ledger.rows[0].n,1);assert.equal(await finance.getAccountBalanceCents('driver:'+s.driverId+':payout_pending'),0);
  assert.equal(intents().filter(r=>r.method==='POST').length,1);
  report.localWebhookReplayVerified=true;report.ledgerPaidEntries=1;report.result='passed';
 }else report.result=current.status==='processing'?'pending':'not_approved';
 writeFileSync(dir+'/result.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}catch(error){
 writeFileSync(dir+'/error.private.json',JSON.stringify({code:typeof error.code==='string'?error.code:'SANDBOX_REVIEW_REQUIRED',assertion:error?.name==='AssertionError'?error.message:undefined}),{mode:0o600});
 console.error('SANDBOX_REVIEW_REQUIRED: registros preservados; nenhum reenvio automático.');process.exitCode=1;
}finally{await pool.end();}
