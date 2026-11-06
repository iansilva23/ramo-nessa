import {isDeepStrictEqual} from 'node:util';
export const receiverRevision='f96212ec79b53ef4aab3eb31d288a405f5dff0c8';
export const receiverImage='ramo-nessa-core:asaas-receiver-f96212ec79b5';
export const receiverRoot='/var/backups/ramo-nessa-asaas/production-receiver-f96212ec79b5';
export const productionSecrets='/opt/ramo-nessa-private/asaas-production';
export const expectedCore='sha256:ee0f4bc8f1e8f5a9f554ae8ca356938e87a16fca5e880cfa602e5cef5cd1edbb';
export const expectedGateway='sha256:59d92511d7f6bf5c39aa18975a1d74ae0526f60097a52a4524c1ed481051dae1';
export const receiverSecretTargets={
 'api-key':'/run/secrets/ramo-asaas-api-key',
 'webhook-token':'/run/secrets/ramo-asaas-webhook-token',
};
export const receiverEnvironment={
 DRIVER_PAYOUT_PROVIDER_NAME:'asaas',
 ASAAS_PAYOUTS_ENABLED:'false',
 ASAAS_WEBHOOK_ENABLED:'true',
 ASAAS_PAYOUT_MODE:'production',
 // An additional barrier: this receive-only installation has no live payout cutover.
 ASAAS_PAYOUT_START_AFTER:'2099-01-01T00:00:00Z',
 ASAAS_API_KEY_FILE:receiverSecretTargets['api-key'],
 ASAAS_WEBHOOK_TOKEN_FILE:receiverSecretTargets['webhook-token'],
};
export function receiverPlan(before,image,secretDirectory=receiverRoot+'/runtime-secrets') {
 if(Object.keys(before.services??{}).join(',')!=='core')throw Error('Plano deve conter somente Core.');
 const model=structuredClone(before),service=model.services.core,e=service.environment??{};
 if(e.DRIVER_PAYOUT_PROVIDER_NAME!=='asaas'||e.ASAAS_PAYOUTS_ENABLED!=='false'||
    ['ASAAS_WEBHOOK_ENABLED','ASAAS_API_KEY','ASAAS_API_KEY_FILE','ASAAS_WEBHOOK_TOKEN','ASAAS_WEBHOOK_TOKEN_FILE','ASAAS_PAYOUT_MODE','ASAAS_PAYOUT_START_AFTER'].some(k=>e[k])||
    (service.volumes??[]).some(m=>m.target?.includes('asaas')))throw Error('Configuração Asaas prévia exige revisão.');
 if(!/^sha256:[a-f0-9]{64}$/.test(image)||!secretDirectory.startsWith('/')||/[\s$,:]/.test(secretDirectory))throw Error('Imagem ou pasta de segredos inválida.');
 service.image=image;
 service.environment={...e,...receiverEnvironment};
 service.volumes=[...(service.volumes??[]),...Object.entries(receiverSecretTargets).map(([name,target])=>({
  type:'bind',source:secretDirectory+'/'+name,target,read_only:true,bind:{create_host_path:false},
 }))];
 service.pull_policy='never';
 return model;
}
export function assertReceiverDelta(before,after,image,secretDirectory) {
 if(!isDeepStrictEqual(after,receiverPlan(before,image,secretDirectory)))throw Error('Plano de receptor altera opções fora do escopo.');
}
export function assertReceiverRuntime(environment) {
 for(const [key,value]of Object.entries(receiverEnvironment))if(environment[key]!==value)throw Error('Proteção do receptor divergente: '+key);
 if(environment.ASAAS_API_KEY||environment.ASAAS_WEBHOOK_TOKEN)throw Error('Segredo direto fora do escopo.');
}
export const receiverProbeSource=`
import {createAsaasWebhookReceiverFromEnv,createDriverPayoutProviderFromEnv} from '/app/dist/src/payments/driver-payout-provider.js';
try {
 const forbidden=async()=>{throw Error('unexpected store/finance access');};
 const dependencies={store:{durable:true,begin:forbidden,get:forbidden,attach:forbidden,reject:forbidden,beginEvent:forbidden,completeEvent:forbidden},financeLookup:forbidden};
 if(createDriverPayoutProviderFromEnv(process.env,dependencies)!==null)throw Error('sender enabled');
 const receiver=createAsaasWebhookReceiverFromEnv(process.env,dependencies);
 if(!receiver||receiver.environment!=='production')throw Error('receiver missing');
 let blocked=false;
 try{await receiver.createPixPayout({payoutId:'invalid',amountCents:0,pixKeyType:'email',pixKey:''});}
 catch(error){blocked=String(error.message).includes('Envios Asaas bloqueados');}
 if(!blocked)throw Error('submission not blocked');
 let unauthorized=false;
 try{await receiver.receiveWebhook('invalid-token',{});}catch(error){unauthorized=error.status===401;}
 if(!unauthorized)throw Error('authentication missing');
 console.log('RECEIVER_PRIVATE_PROBE_OK');
} catch {
 console.error('RECEIVER_PRIVATE_PROBE_FAILED');process.exitCode=1;
}
`;
