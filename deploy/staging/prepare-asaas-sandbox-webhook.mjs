// Host-only: expose one temporary authenticated receiver against the existing lab DB.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,openSync,closeSync,unlinkSync,chmodSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {runtimeContract,validateRuntime,activeCaddy} from './asaas-runtime-contract.mjs';
import {sandboxCaddyCandidate,guardedWrite} from './asaas-sandbox-webhook-contract.mjs';
import {sandboxWebhookPath} from './asaas-sandbox-webhook-http.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
const mode=process.argv[2]??'--prepare';if(!['--prepare','--remove'].includes(mode))throw Error('Modo inválido.');
const root='/var/lib/ramo-nessa-asaas-sandbox',work=join(root,'public-webhook'),statePath=join(work,'state.private.json');
const privateDirectory=path=>{const x=lstatSync(path);if(!x.isDirectory()||x.isSymbolicLink()||x.uid!==0||(x.mode&0o077))throw Error('Diretório privado diferente do esperado.');};
privateDirectory(root);
const lock=join(root,'execution.lock');closeSync(openSync(lock,'wx',0o600));
const logPath=join(root,'webhook-last.private.log');
function run(args,options={}){
 const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe'],...options});
 if(r.error||r.status!==0){writeFileSync(logPath,String(r.stderr??'')+String(r.stdout??''),{mode:0o600});throw Error('Etapa Docker não concluída. Diagnóstico privado preservado.');}return r.stdout;
}
const inspect=name=>JSON.parse(run(['inspect',name]))[0];
const snapshot=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,inspect(v.name)]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const gateway=runtimeContract.gateway.name,origin='https://app.ramonessa.com.br';
let touched=false,created=false,dbStarted=false,session,db,receiver,journal,start;
function ownContainer(name){const c=inspect(name);if(c.Config.Labels?.['br.com.ramonessa.asaas-sandbox']!==session.id)throw Error('Container sem identificação de teste.');return c;}
function unchanged(){const end=snapshot();validateRuntime(end);for(const k of Object.keys(start))if(start[k].Id!==end[k].Id||start[k].State.StartedAt!==end[k].State.StartedAt)throw Error('Um serviço ativo mudou; verifique o resultado.');}
async function status(path,method='GET',body,token){const response=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(10000),headers:{...(body?{'content-type':'application/json'}:{}),...(token?{'asaas-access-token':token}:{})},body:body?JSON.stringify(body):undefined});const code=response.status;await response.body?.cancel();return code;}
async function waitStatus(path,expected,method='GET',body,token){for(let i=0;i<12;i++){try{if(await status(path,method,body,token)===expected)return;}catch{}await pause(500);}throw Error('Resposta pública diferente da esperada; nada será marcado como aprovado.');}
async function baseline(){for(const path of ['/ready','/administrodo/','/passageiro/','/motorista/'])await waitStatus(path,200);const r=await fetch('https://ramonessa.com.br/api/health',{signal:AbortSignal.timeout(10000),redirect:'error'});if(r.status!==200)throw Error('Site não respondeu como esperado.');await r.body?.cancel();}
function reload(){run(['kill','--signal=USR1',gateway]);}
function saveState(){writeFileSync(statePath,JSON.stringify(journal,null,2),{mode:0o600});}
try{
 start=snapshot();validateRuntime(start);
 const cmd=start.gateway.Config.Cmd;
 if(JSON.stringify(cmd)!==JSON.stringify(['caddy','run','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])||run(['exec',gateway,'cat','/proc/1/comm']).trim()!=='caddy')throw Error('Inicialização do Caddy diferente da inspecionada.');
 session=JSON.parse(readFileSync(join(root,'session.private.json'),'utf8'));
 if(session.revision!=='5ffae79687965042765f40f53cd32e57510dfbfe'||!/^[a-f0-9-]{36}$/.test(session.id)||!/^[-_A-Za-z0-9]{40,60}$/.test(session.password))throw Error('Sessão de testes diferente.');
 const prefix='ramo-asaas-sandbox-'+session.id.replaceAll('-','');db=prefix+'-db';receiver=prefix+'-receiver';
 const pg=ownContainer(db),network=prefix+'-net',volume=prefix+'-data';
 if(pg.Image!==start.postgres.Image||pg.HostConfig.NetworkMode!==network||Object.keys(pg.HostConfig.PortBindings??{}).length||Object.keys(pg.NetworkSettings.Networks).some(n=>n!==network)||!pg.Mounts.some(m=>m.Name===volume&&m.Destination==='/var/lib/postgresql/data'))throw Error('Banco privado diferente do esperado.');
 if(mode==='--remove'){
  privateDirectory(work);journal=JSON.parse(readFileSync(statePath,'utf8'));
  if(journal.sessionId!==session.id||journal.receiver!==receiver||journal.activeCaddy!==activeCaddy)throw Error('Registro de retorno diferente.');
  const before=readFileSync(join(work,'Caddyfile.before')),candidate=readFileSync(join(work,'Caddyfile.candidate')),current=readFileSync(activeCaddy);
  if(hash(before)!==journal.beforeHash||hash(candidate)!==journal.candidateHash)throw Error('Backup do gateway diferente.');
  // Do not revert someone else's subsequent configuration changes.
  if(current.equals(candidate)){guardedWrite(activeCaddy,candidate,before);reload();}
  else if(!current.equals(before))throw Error('Configuração mudou depois do teste. Retorno automático interrompido.');
  await baseline();await waitStatus(sandboxWebhookPath,404,'POST',{});unchanged();
  if(journal.receiverCreated){const present=spawnSync('docker',['inspect',receiver],{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(present.status===0){ownContainer(receiver);run(['rm','-f',receiver]);}}
  if(journal.dbStarted&&ownContainer(db).State.Running)run(['stop','--time','10',db]);
  journal.phase='removed';journal.removedAt=new Date().toISOString();saveState();
  console.log('ROTA DE TESTES REMOVIDA. Configuração anterior restaurada; dados e comprovantes preservados.');
 }else{
  if(existsSync(work))throw Error('Já existe uma etapa de webhook. Não repita a preparação; envie o resultado.');
  const backup='/var/backups/ramo-nessa-asaas/5ffae7968796';
  const prepared=JSON.parse(readFileSync(join(backup,'prepared.json'),'utf8'));
  const verified=JSON.parse(readFileSync(join(backup,'backup-verified.json'),'utf8'));
  if(prepared.revision!==session.revision||verified.candidateRevision!==session.revision||JSON.parse(run(['image','inspect',prepared.coreImage]))[0].Id!==prepared.coreCandidate)throw Error('Imagem ou backup diferentes.');
  const current=readFileSync(activeCaddy);
  if(!current.equals(readFileSync(join(backup,'Caddyfile.before'))))throw Error('Gateway mudou depois da preparação. Nenhum arquivo foi substituído.');
  const networks=Object.keys(start.gateway.NetworkSettings.Networks);
  if(!networks.includes('ramo-nessa-staging_default'))throw Error('Rede do gateway diferente.');
  const keyFile='/opt/ramo-nessa-private/asaas-sandbox/api-key',data=join(root,'data');
  for(const path of [keyFile,join(data,'webhook-token')]){const x=lstatSync(path);if(!x.isFile()||x.isSymbolicLink()||x.uid!==1000||(x.mode&0o077))throw Error('Chave ou token sem as permissões esperadas.');}
  const token=readFileSync(join(data,'webhook-token'),'utf8').trim();if(token.length<32||token.length>255)throw Error('Token diferente do esperado.');
  const result=JSON.parse(readFileSync(join(data,'result.json'),'utf8'));
  if(result.transport!=='asaas-sandbox-api'||result.result!=='passed'||result.status!=='paid'||result.postAttempts!==1||!/^[a-f0-9-]{36}$/.test(result.transferId)||!/^[a-f0-9-]{36}$/.test(result.payoutId))throw Error('Primeiro repasse ainda não foi aprovado.');
  await baseline();
  mkdirSync(work,{mode:0o700});privateDirectory(work);
  const candidate=Buffer.from(sandboxCaddyCandidate(current.toString('utf8'),receiver));
  writeFileSync(join(work,'Caddyfile.before'),current,{mode:0o600,flag:'wx'});writeFileSync(join(work,'Caddyfile.candidate'),candidate,{mode:0o600,flag:'wx'});
  journal={sessionId:session.id,receiver,activeCaddy,beforeHash:hash(current),candidateHash:hash(candidate),phase:'preparing',receiverCreated:false,dbStarted:false,externalWebhookDeliveryVerified:false};saveState();
  run(['exec','-i',gateway,'caddy','validate','--config','-','--adapter','caddyfile'],{input:candidate});
  const source=dirname(fileURLToPath(import.meta.url));
  for(const file of ['asaas-sandbox-webhook-http.mjs','asaas-sandbox-webhook-receiver.mjs']){writeFileSync(join(work,file),readFileSync(join(source,file)),{mode:0o644,flag:'wx'});chmodSync(join(work,file),0o644);}
  if(!pg.State.Running){run(['start',db]);dbStarted=true;journal.dbStarted=true;saveState();}
  let ready=false;for(let i=0;i<30;i++){try{if(run(['exec',db,'psql','-U','ramo_sandbox','-d','ramo_asaas_sandbox','-Atq','-c','SELECT 1']).trim()==='1'){ready=true;break;}}catch{}await pause(1000);}if(!ready)throw Error('Banco de testes não ficou pronto.');
  const dbUrl='postgresql://ramo_sandbox:'+session.password+'@'+db+':5432/ramo_asaas_sandbox';
  run(['create','--name',receiver,'--network',network,'--label','br.com.ramonessa.asaas-sandbox='+session.id,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--pids-limit','64','--env','DATABASE_URL='+dbUrl,'--env','DB_SSL=false',
   '--mount','type=bind,src='+data+',dst=/audit/data',
   ...['asaas-sandbox-webhook-http.mjs','asaas-sandbox-webhook-receiver.mjs'].flatMap(file=>['--mount','type=bind,src='+join(work,file)+',dst=/audit/'+file+',readonly']),
   '--mount','type=bind,src='+keyFile+',dst=/run/secrets/asaas-sandbox-api-key,readonly',prepared.coreCandidate,'node','/audit/asaas-sandbox-webhook-receiver.mjs']);
  created=true;journal.receiverCreated=true;saveState();
  run(['network','connect','ramo-nessa-staging_default',receiver]);run(['start',receiver]);
  let receiverReady=false;for(let i=0;i<15;i++){try{run(['exec',receiver,'node','--input-type=module','-e',"const r=await fetch('http://127.0.0.1:8080/healthz');if(r.status!==200)process.exit(1)"]);receiverReady=true;break;}catch{}await pause(1000);}if(!receiverReady)throw Error('Receptor não iniciou.');
  // Hash guard, inode-preserving write, graceful reload; never recreate gateway.
  touched=true;guardedWrite(activeCaddy,current,candidate);reload();
  await waitStatus(sandboxWebhookPath,401,'POST',{});await waitStatus(sandboxWebhookPath,405);
  const probe={id:'evt-local-public-'+randomUUID(),event:'TRANSFER_DONE',transfer:{id:result.transferId}};
  await waitStatus(sandboxWebhookPath,200,'POST',probe,token);await waitStatus(sandboxWebhookPath,200,'POST',probe,token);
  const count=run(['exec',db,'psql','-U','ramo_sandbox','-d','ramo_asaas_sandbox','-Atq','-c',"SELECT count(*) FROM ledger_transactions WHERE reference_key='driver-payout-paid:"+result.payoutId+"'"]).trim();
  if(count!=='1')throw Error('Baixa única não confirmada.');
  await baseline();unchanged();
  journal.phase='ready';journal.readyAt=new Date().toISOString();journal.authenticatedPublicProbeVerified=true;journal.ledgerPaidEntries=1;saveState();
  console.log('RECEPTOR SANDBOX PREPARADO. Rota HTTPS, token e baixa única conferidos com o repasse já concluído.');
  console.log('Nenhum novo repasse foi criado. Serviços atuais não foram reiniciados. Banco ativo e Mercado Pago preservados.');
  console.log('Ainda falta cadastrar este webhook no painel Sandbox e confirmar um evento enviado pelo Asaas.');
  console.log('URL do teste: '+origin+sandboxWebhookPath);
 }
}catch(error){
 if(mode==='--prepare'&&journal){
  let restored=true;
  try{if(touched){const before=readFileSync(join(work,'Caddyfile.before')),candidate=readFileSync(join(work,'Caddyfile.candidate')),current=readFileSync(activeCaddy);if(current.equals(candidate)){guardedWrite(activeCaddy,candidate,before);reload();}else if(!current.equals(before))throw Error('Mudança concorrente.');await baseline();}}catch{restored=false;}
  if(restored){try{if(created){ownContainer(receiver);run(['rm','-f',receiver]);}if(dbStarted&&ownContainer(db).State.Running)run(['stop','--time','10',db]);}catch{restored=false;}}
  journal.phase=restored?'failed-restored':'review-required';try{saveState();}catch{}
  console.error(restored?'Etapa não concluída. Configuração anterior preservada/restaurada; registros mantidos.':'Retorno exige conferência. Não repita a ativação nem apague os registros.');
 }
 console.error(error?.message??'Verificação necessária.');process.exitCode=1;
}finally{unlinkSync(lock);}
