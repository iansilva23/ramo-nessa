// Prepare files only. Never starts Docker, migrates a database or reads live secrets.
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildStagingEnvironment} from '../staging/env.mjs';
export const project='ramo-nessa-occurrence-homologation';
export async function buildPlan(root){
 let compose=await readFile(join(root,'deploy/test/compose.yml'),'utf8');
 const replace=(from,to)=>{if(!compose.includes(from))throw Error('Template mudou; preparação interrompida.');compose=compose.replaceAll(from,to);};
 replace('name: ramo-nessa-test','name: '+project);
 replace('ramo-nessa-core:test','ramo-nessa-core:occurrence-homologation');
 replace('ramo-nessa-admin-gateway:test','ramo-nessa-admin-gateway:occurrence-homologation');
 replace('ramo_test_postgres','occurrence_homologation_postgres');
 replace('context: ../../backend/core','context: '+JSON.stringify(join(root,'backend/core')));
 replace('context: ../../apps/admin','context: '+JSON.stringify(join(root,'apps/admin')));
 replace('"${TEST_HTTP_PORT:-8080}:8080"','"127.0.0.1:18080:8080"');
 const env=Object.fromEntries(buildStagingEnvironment().split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
 env.DOCUMENT_STORAGE_AUTH_TOKEN=randomBytes(32).toString('base64url');
 compose=compose.replace(/\$\{([A-Z_]+)\}/g,(_,key)=>{if(!(key in env))throw Error('Variável inesperada: '+key);return JSON.stringify(env[key]);});
 if(compose.includes('${'))throw Error('Interpolação não resolvida.');
 replace('  TRUST_PROXY: "true"','  TRUST_PROXY: "false"');
 replace('  ALLOW_DEV_IDENTITY: "false"','  ALLOW_DEV_IDENTITY: "false"\n  ALLOW_DEV_PAYMENT_GATEWAY: "false"\n  MERCADO_PAGO_MODE: test\n  MERCADO_PAGO_ACCESS_TOKEN: ""\n  MERCADO_PAGO_ACCESS_TOKEN_TEST: ""\n  MERCADO_PAGO_WEBHOOK_SECRET: ""\n  PUSH_PROVIDER: disabled\n  DRIVER_PAYOUT_PROVIDER_NAME: ""\n  PLACE_PROOF_SECRET: '+JSON.stringify(env.PLACE_PROOF_SECRET));
 for(const [service,limit] of Object.entries({postgres:'256m',migrate:'384m','google-maps-mock':'128m','document-storage':'128m',core:'512m',gateway:'96m'})){
  const heading=new RegExp('^  '+service+':$','m');
  if(!heading.test(compose))throw Error('Serviço esperado ausente.');
  compose=compose.replace(heading,'  '+service+':\n    mem_limit: '+limit);
 }
 return {compose,project,port:18080};
}
export async function prepare(output,root=fileURLToPath(new URL('../../',import.meta.url))){
 const destination=resolve(output);
 if(!/^ramo-homologacao-[a-zA-Z0-9-]+$/.test(destination.split('/').at(-1)))throw Error('Use uma pasta NOVA chamada ramo-homologacao- seguida de um identificador.');
 const plan=await buildPlan(root);
 // No recursive mkdir, overwrite or chmod of any pre-existing directory.
 await mkdir(destination,{mode:0o700});
 await writeFile(join(destination,'compose.yml'),plan.compose,{mode:0o600,flag:'wx'});
 await writeFile(join(destination,'LEIA-ME.txt'),`Preparação somente. Nenhum serviço iniciado.\nProjeto: ${project}\nAcesso futuro: 127.0.0.1:18080 (somente VPS/túnel SSH).\nBanco novo, sem cópia de usuários ou pagamentos. Maps/documentos/OTP de teste; nenhum pagamento real configurado.\nOs controles A/B/C continuam com os defaults das migrações.\nNão usar este ambiente para homologar GPS ou dinheiro real.\nBuilds ainda não foram executados neste servidor. Limites de memória são de execução, não limitam o build.\nNão iniciar ainda: validar configuração, porta livre e plano de build em etapa posterior.\n`,{mode:0o600,flag:'wx'});
 return {directory:destination,project:plan.project,port:plan.port,started:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{if(process.argv.length!==3)throw Error('Informe somente a pasta nova de preparação.');console.log(JSON.stringify(await prepare(process.argv[2]),null,2));}
 catch(error){console.error(error.code==='EEXIST'?'Pasta já existe. Nada foi sobrescrito.':error.message);process.exitCode=1;}
}
