import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync,chownSync,openSync,closeSync,unlinkSync,lstatSync,statfsSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeContract,validateRuntime,ensureSandboxDataDirectory} from './asaas-runtime-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
const candidateRevision='5ffae79687965042765f40f53cd32e57510dfbfe',backup='/var/backups/ramo-nessa-asaas/'+candidateRevision.slice(0,12);
const prepared=JSON.parse(readFileSync(join(backup,'prepared.json'),'utf8'));
const verified=JSON.parse(readFileSync(join(backup,'backup-verified.json'),'utf8'));
if(prepared.revision!==candidateRevision||verified.candidateRevision!==candidateRevision)throw Error('Preparação/backup diferentes.');
function run(args,options={}){const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],...options});if(r.error||r.status!==0)throw Error('Etapa Docker não concluída. Sessão privada preservada.');return r.stdout;}
function tryInspect(kind,name){const r=spawnSync('docker',[kind,'inspect',name],{encoding:'utf8',stdio:['ignore','pipe','pipe']});return r.status===0?JSON.parse(r.stdout)[0]:null;}
const inspect=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,JSON.parse(run(['inspect',v.name]))[0]]));
const start=inspect();validateRuntime(start);
if(JSON.parse(run(['image','inspect',prepared.coreImage]))[0].Id!==prepared.coreCandidate)throw Error('Imagem candidata mudou.');
const keyFile='/opt/ramo-nessa-private/asaas-sandbox/api-key',keyInfo=lstatSync(keyFile);
if(!keyInfo.isFile()||keyInfo.isSymbolicLink()||(keyInfo.mode&0o077)!==0||keyInfo.uid!==1000)throw Error('Arquivo da chave de testes precisa ser privado e pertencer ao UID 1000.');
const root='/var/lib/ramo-nessa-asaas-sandbox';mkdirSync(root,{recursive:true,mode:0o700});
if(lstatSync(root).isSymbolicLink()||lstatSync(root).uid!==0||(lstatSync(root).mode&0o077)!==0)throw Error('Diretório da sessão precisa ser privado.');
const lock=join(root,'execution.lock'),lockfd=openSync(lock,'wx',0o600);closeSync(lockfd);
let dbStarted=false,db;
try{
 const metadata=join(root,'session.private.json');
 let s;
 if(existsSync(metadata))s=JSON.parse(readFileSync(metadata,'utf8'));
 else {
  const disk=statfsSync(root);if(disk.bavail*disk.bsize<1024**3)throw Error('Reserve pelo menos 1 GiB livre.');
  s={revision:candidateRevision,id:randomUUID(),rideId:randomUUID(),paymentId:randomUUID(),captureEventId:randomUUID(),createdAt:new Date().toISOString(),password:randomBytes(32).toString('base64url')};s.driverId='asaas-sandbox-'+s.id;
  writeFileSync(metadata,JSON.stringify(s,null,2),{mode:0o600,flag:'wx'});
 }
 if(s.revision!==candidateRevision||!/^[a-f0-9-]{36}$/.test(s.id)||!/^[-_A-Za-z0-9]{40,60}$/.test(s.password))throw Error('Registro da sessão diferente do esperado.');
 const suffix=s.id.replaceAll('-',''),prefix='ramo-asaas-sandbox-'+suffix;
 db=prefix+'-db';const network=prefix+'-net',volume=prefix+'-data',label='br.com.ramonessa.asaas-sandbox';
 if(tryInspect('container',prefix+'-receiver')?.State.Running)throw Error('Receptor público Sandbox ativo. Use a conferência do webhook; não pare seu banco.');
 for(const [kind,name] of [['network',network],['volume',volume]]){
  const existing=tryInspect(kind,name);
  if(existing){if(existing.Labels?.[label]!==s.id)throw Error('Recurso de teste sem identificação esperada.');}
  else run([kind,'create','--label',label+'='+s.id,...(kind==='network'?['--driver','bridge']:[]),name]);
 }
 const data=join(root,'data');ensureSandboxDataDirectory(data);
 const save=(name,value)=>{const path=join(data,name);writeFileSync(path,value,{mode:0o600});chownSync(path,1000,1000);};
 const publicState={id:s.id,rideId:s.rideId,paymentId:s.paymentId,captureEventId:s.captureEventId,driverId:s.driverId,createdAt:s.createdAt};
 const stateFile=join(data,'session.json');if(existsSync(stateFile)){if(JSON.stringify(JSON.parse(readFileSync(stateFile,'utf8')))!==JSON.stringify(publicState))throw Error('Dados da sessão divergentes.');}else save('session.json',JSON.stringify(publicState));
 if(!existsSync(join(data,'webhook-token')))save('webhook-token',randomBytes(48).toString('base64url'));
 const worker=join(root,'worker.mjs');writeFileSync(worker,readFileSync(join(dirname(fileURLToPath(import.meta.url)),'asaas-sandbox-worker.mjs')),{mode:0o644});chmodSync(worker,0o644);
 const user='ramo_sandbox',database='ramo_asaas_sandbox';
 let pg=tryInspect('container',db);
 if(pg){
  if(pg.Config.Labels?.[label]!==s.id||pg.Image!==start.postgres.Image||pg.HostConfig.NetworkMode!==network||Object.keys(pg.HostConfig.PortBindings??{}).length!==0||!pg.Mounts.some(m=>m.Name===volume&&m.Destination==='/var/lib/postgresql/data'))throw Error('PostgreSQL da sessão divergiu.');
  if(!pg.State.Running)run(['start',db]);
 }else run(['run','-d','--name',db,'--network',network,'--label',label+'='+s.id,'--env','POSTGRES_USER='+user,'--env','POSTGRES_PASSWORD='+s.password,'--env','POSTGRES_DB='+database,'--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',start.postgres.Image]);
 dbStarted=true;let ready=false;
 for(let i=0;i<60;i++){
  const r=spawnSync('docker',['exec',db,'sh','-lc','test "$(cat /proc/1/comm)" = "postgres" && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "SELECT 1"'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(r.status===0&&r.stdout.trim()==='1'){ready=true;break;}await new Promise(r=>setTimeout(r,1000));
 }
 if(!ready)throw Error('Banco privado não iniciou.');
 const dbUrl='postgresql://'+user+':'+s.password+'@127.0.0.1:5432/'+database;
 const base=['run','--rm','--network','container:'+db,'--read-only','--security-opt','no-new-privileges','--cap-drop','ALL','--env','DATABASE_URL='+dbUrl,'--env','DB_SSL=false'];
 console.log('Preparando banco vazio de testes, separado do banco ativo...');
 run([...base,prepared.coreCandidate,'node','dist/scripts/migrate.js']);
 console.log('Testando um repasse fictício de R$5 no Sandbox; a sessão será reutilizada em novas execuções...');
 const r=spawnSync('docker',[...base,'--name',prefix+'-worker','--mount','type=bind,src='+data+',dst=/audit/data','--mount','type=bind,src='+worker+',dst=/audit/worker.mjs,readonly','--mount','type=bind,src='+keyFile+',dst=/run/secrets/asaas-sandbox-api-key,readonly',prepared.coreCandidate,'node','/audit/worker.mjs'],{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
 const log=join(root,'worker-last.private.log');writeFileSync(log,String(r.stdout??'')+String(r.stderr??''),{mode:0o600});
 if(r.error||r.status!==0)throw Error('Teste requer conferência. Registros privados preservados; não há novo envio automático.');
 const result=JSON.parse(readFileSync(join(data,'result.json'),'utf8'));if(result.transport!=='asaas-sandbox-api')throw Error('Resultado não pertence à API Sandbox.');
 const end=inspect();validateRuntime(end);for(const k of Object.keys(start))if(start[k].Id!==end[k].Id||start[k].State.StartedAt!==end[k].State.StartedAt)throw Error('Um serviço ativo mudou durante o teste.');
 console.log('Resultado do repasse de teste: '+result.status+'. Tentativas de envio nesta sessão: '+result.postAttempts+'.');
 if(result.transferId)console.log('ID no Asaas Sandbox: '+result.transferId);
 if(result.result==='passed')console.log('ENVIO E CONCILIAÇÃO SANDBOX APROVADOS. Baixa única no ledger e replay local autenticado verificados.');
 else console.log('Teste ainda não aprovado. Sessão preservada para consulta, sem criar outro repasse.');
 console.log('Entrega externa de webhook ainda pendente. Core/ADM/banco ativos preservados; Asaas não ativado no app.');
}finally{
 try{if(dbStarted)run(['stop','--time','10',db]);}finally{unlinkSync(lock);}
}
