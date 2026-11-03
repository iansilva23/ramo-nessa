import {randomUUID,timingSafeEqual} from 'node:crypto';
export const transferEvents=['TRANSFER_CREATED','TRANSFER_PENDING','TRANSFER_IN_BANK_PROCESSING','TRANSFER_BLOCKED','TRANSFER_DONE','TRANSFER_FAILED','TRANSFER_CANCELLED'];
export const webhookUrl='https://app.ramonessa.com.br/__asaas_sandbox/transfers';
export function validateSandboxRegistration(items,token){
 if(!Array.isArray(items))throw Error('Cadastro Sandbox indisponível.');
 const found=items.filter(x=>x.url===webhookUrl);
 if(found.length!==1)throw Error('Precisa existir exatamente um webhook com a URL de testes.');
 const w=found[0];
 if(w.enabled!==true||w.interrupted!==false)throw Error('Webhook desativado ou fila interrompida. Confira o painel Sandbox.');
 if(!Array.isArray(w.events)||transferEvents.some(x=>!w.events.includes(x)))throw Error('Faltam eventos de transferência no webhook.');
 if(w.events.some(x=>!transferEvents.includes(x)))throw Error('Selecione somente os sete eventos de transferência neste webhook.');
 if(w.apiVersion!==3||w.sendType!=='SEQUENTIALLY')throw Error('Configure versão v3 e envio sequencial.');
 if(typeof w.authToken==='string'&&w.authToken.length){const a=Buffer.from(w.authToken),b=Buffer.from(token);if(a.length!==b.length||!timingSafeEqual(a,b))throw Error('Token cadastrado diferente do token do receptor.');}
 return w.id;
}
export function newWebhookExercise(original){
 const id=randomUUID();return{id,rideId:randomUUID(),paymentId:randomUUID(),captureEventId:randomUUID(),driverId:'asaas-webhook-fixture-'+id,createdAt:new Date().toISOString(),originalSessionId:original};
}
export function validateExercise(s,original){
 if(s.originalSessionId!==original||s.id===original||![s.id,s.rideId,s.paymentId,s.captureEventId].every(x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x))||s.driverId!=='asaas-webhook-fixture-'+s.id||!Number.isFinite(Date.parse(s.createdAt)))throw Error('Sessão do segundo teste divergente.');
}
export function webhookEvidence(result,receipts,status,ledgerEntries){
 const incoming=receipts.filter(x=>x.localProbe===false&&x.transferId===result.transferId);
 const done=incoming.some(x=>x.event==='TRANSFER_DONE');
 return{incomingEvents:incoming.length,doneReceived:done,externalWebhookDeliveryVerified:result.transport==='asaas-sandbox-api'&&result.postAttempts===1&&status==='paid'&&ledgerEntries===1&&done};
}
