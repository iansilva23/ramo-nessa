import {validateSandboxRegistration,webhookUrl} from './asaas-webhook-exercise-contract.mjs';
// The only allowed write is enabled=false on this owned Sandbox subscription.
export async function disableSandboxWebhook({apiKey,token,fetcher=fetch}){
 const request=async(path,method='GET')=>{
  const response=await fetcher('https://api-sandbox.asaas.com/v3/webhooks'+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{access_token:apiKey,'user-agent':'RamoNessa-DriverPayouts/1.0',...(method==='PUT'?{'content-type':'application/json'}:{})},...(method==='PUT'?{body:JSON.stringify({enabled:false})}:{})});
  if(!response.ok)throw Error('Consulta/alteração do webhook Sandbox recusada. HTTP '+response.status+'. Receptor preservado.');
  try{return await response.json();}catch{throw Error('Resposta Sandbox não pôde ser conferida. Receptor preservado.');}
 };
 const list=async()=>{const r=await request('?limit=100&offset=0');if(r.hasMore||!Array.isArray(r.data))throw Error('Lista Sandbox incompleta. Receptor preservado.');return r.data;};
 const select=items=>{const matches=items.filter(x=>x.url===webhookUrl);if(matches.length!==1)throw Error('Cadastro de testes não é único. Nenhum outro webhook será alterado.');const w=matches[0];if(typeof w.enabled!=='boolean'||typeof w.id!=='string'||!/^[-_a-zA-Z0-9]{1,100}$/.test(w.id))throw Error('Identificação do webhook de testes inválida.');validateSandboxRegistration([{...w,enabled:true}],token);return w;};
 const before=select(await list());let updateUncertain=false;
 if(before.enabled){try{await request('/'+encodeURIComponent(before.id),'PUT');}catch{updateUncertain=true;}}
 // Read after write, including a timeout/lost-response case. Never remove the receiver on uncertainty.
 const after=select(await list());
 if(after.id!==before.id||after.enabled!==false)throw Error('Desativação do webhook não confirmada. Receptor e rota continuam disponíveis.');
 for(const key of ['url','apiVersion','sendType','interrupted'])if(after[key]!==before[key])throw Error('Cadastro mudou fora do escopo. Confira antes de retirar a rota.');
 if(JSON.stringify([...after.events].sort())!==JSON.stringify([...before.events].sort()))throw Error('Eventos cadastrados mudaram; receptor preservado.');
 return{webhookId:after.id,url:after.url,enabled:false,alreadyDisabled:!before.enabled,updateResponseUncertain:updateUncertain,verifiedAt:new Date().toISOString()};
}
