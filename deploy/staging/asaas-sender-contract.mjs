import {isDeepStrictEqual} from 'node:util';
export function senderPlan(before, cutover) {
  const plan=structuredClone(before), service=plan.services?.core, env=service?.environment;
  if(!env || env.DRIVER_PAYOUT_PROVIDER_NAME!=='asaas' || env.ASAAS_PAYOUT_MODE!=='production' || env.ASAAS_WEBHOOK_ENABLED!=='true' || env.ASAAS_PAYOUTS_ENABLED!=='false')throw Error('Receptor de produção não está no estado auditado.');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cutover)||!Number.isFinite(Date.parse(cutover)))throw Error('Data de início inválida.');
  env.ASAAS_PAYOUTS_ENABLED='true';env.ASAAS_PAYOUT_START_AFTER=cutover;
  return plan;
}
export function assertSenderDelta(before,after,cutover){if(!isDeepStrictEqual(after,senderPlan(before,cutover)))throw Error('Alteração fora dos dois controles de envio.');}
// Only the existing, uniquely owned production webhook may be updated, and
// only its authentication token. No transfer, charge, payout or refund endpoint.
export async function synchronizeWebhook({apiKey,token,fetcher=fetch}) {
 const target='https://app.ramonessa.com.br/v1/webhooks/asaas/transfers';
 const events=['TRANSFER_CREATED','TRANSFER_PENDING','TRANSFER_IN_BANK_PROCESSING','TRANSFER_BLOCKED','TRANSFER_DONE','TRANSFER_FAILED','TRANSFER_CANCELLED'];
 const request=async(path,method='GET',body)=>{
  const r=await fetcher('https://api.asaas.com/v3/webhooks'+path,{method,headers:{access_token:apiKey,'user-agent':'RamoNessa-DriverPayouts/1.0',...(body?{'content-type':'application/json'}:{})},redirect:'error',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw Error('ASAAS_WEBHOOK_HTTP_'+r.status);
  return await r.json();
 };
 const select=page=>{
  if(page.hasMore!==false||!Array.isArray(page.data))throw Error('Lista de webhooks incompleta.');
  const found=page.data.filter(w=>w.url===target);if(found.length!==1)throw Error('Webhook de produção não é único.');
  const w=found[0];if(!/^[-_a-zA-Z0-9]{1,100}$/.test(w.id)||w.enabled!==true||w.interrupted!==false||w.apiVersion!==3||w.sendType!=='SEQUENTIALLY'||!Array.isArray(w.events)||events.some(e=>!w.events.includes(e)))throw Error('Cadastro de webhook fora do esperado.');
  return w;
 };
 const before=select(await request('?limit=100&offset=0'));
 await request('/'+encodeURIComponent(before.id),'PUT',{authToken:token});
 const after=select(await request('?limit=100&offset=0'));
 for(const key of ['id','name','email','url','enabled','interrupted','apiVersion','sendType'])if(after[key]!==before[key])throw Error('Cadastro do webhook mudou fora do escopo.');
 if(JSON.stringify([...after.events].sort())!==JSON.stringify([...before.events].sort()))throw Error('Eventos do webhook mudaram.');
 return {webhookId:after.id,tokenSynchronized:true};
}
export const providerProbe=`
import {createDriverPayoutProviderFromEnv,createAsaasWebhookReceiverFromEnv} from '/app/dist/src/payments/driver-payout-provider.js';
const forbidden=async()=>{throw Error('Unexpected financial access');};
const deps={store:{durable:true},financeLookup:forbidden};
const provider=createDriverPayoutProviderFromEnv(process.env,deps),receiver=createAsaasWebhookReceiverFromEnv(process.env,deps);
if(!provider||provider.environment!=='production'||!receiver)throw Error('Sender or receiver missing');
const base={id:'11111111-1111-4111-8111-111111111111',amountCents:100,pixKeyType:'email',pixKey:'probe@example.invalid',executionMode:'api',payoutKind:'scheduled',createdAt:new Date(Date.parse(process.env.ASAAS_PAYOUT_START_AFTER)+1).toISOString()};
provider.submissionReference(base);
for(const change of [{executionMode:'manual'},{payoutKind:'anticipation'},{createdAt:'2000-01-01T00:00:00Z'}]){let blocked=false;try{provider.submissionReference({...base,...change});}catch{blocked=true;}if(!blocked)throw Error('Old/manual/anticipation reservation was not blocked');}
console.log('ASAAS_SENDER_PROBE_OK');
`;
