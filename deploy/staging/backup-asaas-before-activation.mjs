import {spawn} from 'node:child_process';
import {readFileSync,lstatSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './asaas-activation-plan-contract.mjs';
import {validateFreshBackup} from './asaas-fresh-backup-contract.mjs';
import {activeCaddy} from './asaas-runtime-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
const root='/var/backups/ramo-nessa-asaas/5ffae7968796',lab='/var/lib/ramo-nessa-asaas-sandbox';
for(const path of [root,join(root,'activation-plan'),lab]){const x=lstatSync(path);if(!x.isDirectory()||x.isSymbolicLink()||x.uid!==0||(x.mode&0o077))throw Error('Diretório privado divergente.');}
const lock=join(lab,'execution.lock');closeSync(openSync(lock,'wx',0o600));
try{
 const json=path=>JSON.parse(readFileSync(path,'utf8'));
 const plan=json(join(root,'activation-plan/plan.json')),closed=json(join(lab,'sandbox-closed.json')),previous=json(join(root,'backup-verified.json'));
 validateFreshBackup({plan,closed,previous,revision:'5ffae79687965042765f40f53cd32e57510dfbfe'});
 if(sha256(readFileSync(activeCaddy))!==plan.afterCleanupCaddyHash)throw Error('Gateway mudou após o encerramento do Sandbox. Preserve as alterações e envie o resultado.');
 const records=json(join(root,'activation-plan/source-configurations.private.json'));
 for(const entry of records)if(sha256(readFileSync(entry.path))!==entry.sha256)throw Error('Configuração de origem mudou depois do plano.');
 const before=sha256(readFileSync(join(root,'backup-verified.json')));
 const child=spawn(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'backup-asaas-pricing.mjs'),'--before-activation'],{stdio:'inherit'});
 const handlers=new Map(['SIGINT','SIGTERM','SIGHUP'].map(signal=>[signal,()=>child.kill(signal==='SIGHUP'?'SIGTERM':signal)]));
 for(const [signal,handler] of handlers)process.on(signal,handler);
 let result;try{result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});}finally{for(const [signal,handler] of handlers)process.off(signal,handler);}
 if(result.code!==0)throw Error('Backup recente não concluído. Nada foi ativado; registros preservados.');
 if(sha256(readFileSync(join(root,'backup-verified.json')))!==before)throw Error('Registro do backup original mudou.');
 const fresh=json(join(root,'activation-plan/backup-verified.json'));
 if(fresh.stage!=='before-activation'||fresh.candidateRevision!==plan.candidateRevision||fresh.migrationAppliedToActive!==false||fresh.asaasActivated!==false)throw Error('Registro do backup recente divergente.');
 console.log('Backup anterior preservado. Plano de retorno e backup recente disponíveis; Core/ADM ainda não atualizados.');
}catch(error){console.error(error?.message??'Conferência necessária.');process.exitCode=1;}
finally{unlinkSync(lock);}
