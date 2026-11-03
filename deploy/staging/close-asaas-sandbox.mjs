import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeContract,validateRuntime,activeCaddy} from './asaas-runtime-contract.mjs';
import {sha256} from './asaas-activation-plan-contract.mjs';
import {disableSandboxWebhook} from './asaas-sandbox-close-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
const lab='/var/lib/ramo-nessa-asaas-sandbox',planRoot='/var/backups/ramo-nessa-asaas/5ffae7968796/activation-plan',record=join(lab,'sandbox-closed.json');
for(const dir of [lab,planRoot]){const info=lstatSync(dir);if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o077))throw Error('Diretório privado divergente.');}
const lock=join(lab,'execution.lock');closeSync(openSync(lock,'wx',0o600));let locked=true;
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const run=args=>{const r=spawnSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});if(r.status!==0||r.error)throw Error('Não foi possível conferir containers. Nenhuma atualização será iniciada.');return r.stdout;};
const snapshot=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,JSON.parse(run(['inspect',v.name]))[0]]));
try{
 const plan=json(join(planRoot,'plan.json')),acceptance=json(join(lab,'webhook-exercise/acceptance.json'));
 if(plan.asaasEnabled!==false||plan.migrationApplied!==false||plan.servicesChanged!==false||acceptance.externalWebhookDeliveryVerified!==true)throw Error('Plano ou aceite Sandbox divergentes.');
 const start=snapshot();validateRuntime(start);for(const key of Object.keys(start))if(start[key].Id!==plan.beforeIds[key])throw Error('Um serviço mudou depois do plano. Nenhuma configuração será substituída.');
 const currentHash=sha256(readFileSync(activeCaddy));if(![plan.currentCaddyHash,plan.afterCleanupCaddyHash].includes(currentHash))throw Error('Gateway mudou depois do plano. Encerramento automático interrompido.');
 const keyFile='/opt/ramo-nessa-private/asaas-sandbox/api-key',tokenFile=join(lab,'data/webhook-token');
 for(const path of [keyFile,tokenFile]){const x=lstatSync(path);if(!x.isFile()||x.isSymbolicLink()||x.uid!==1000||(x.mode&0o077))throw Error('Credencial de testes divergente.');}
 console.log('Desativando somente o webhook temporário no Asaas Sandbox...');
 const closed=await disableSandboxWebhook({apiKey:readFileSync(keyFile,'utf8').trim(),token:readFileSync(tokenFile,'utf8').trim()});
 writeFileSync(record,JSON.stringify({...closed,phase:'subscription-disabled',at:new Date().toISOString()},null,2),{mode:0o600});
 console.log('Desativação confirmada na API. Retirando rota temporária e receptor...');
 // Hand off to the tested removal controller, which acquires the same lock itself.
 unlinkSync(lock);locked=false;
 const result=spawnSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'prepare-asaas-sandbox-webhook.mjs'),'--remove'],{stdio:'inherit'});
 if(result.status!==0||result.error)throw Error('Webhook desativado; retirada da rota requer conferência. Dados preservados.');
 if(sha256(readFileSync(activeCaddy))!==plan.afterCleanupCaddyHash)throw Error('Configuração final do gateway diverge do plano.');
 const end=snapshot();validateRuntime(end);for(const key of Object.keys(start))if(start[key].Id!==end[key].Id||start[key].State.StartedAt!==end[key].State.StartedAt)throw Error('Um serviço ativo mudou durante o encerramento.');
 writeFileSync(record,JSON.stringify({...closed,phase:'closed',at:new Date().toISOString(),evidencePreserved:true,servicesUnchanged:true},null,2),{mode:0o600});
 console.log('SANDBOX ENCERRADO. Webhook desativado, rota/receptor retirados e configuração anterior conferida.');
 console.log('Sessões, comprovantes, token e volume do banco de testes preservados. Nenhum repasse ou migration executado.');
 console.log('Core, ADM, Web, site e banco ativo não foram atualizados ou reiniciados.');
}catch(error){console.error(error?.message??'Encerramento requer conferência.');process.exitCode=1;}
finally{if(locked)unlinkSync(lock);}
