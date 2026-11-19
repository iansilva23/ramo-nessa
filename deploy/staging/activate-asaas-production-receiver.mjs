// Enables only authenticated webhook receipt; never enables the payout sender.
// No migrations, policy writes, Asaas subscriptions or transfer requests are performed.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,existsSync,mkdirSync,openSync,closeSync,unlinkSync,constants,readdirSync,createReadStream} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {activationProject,sha256,environmentMap,assertEnvironmentMatches,servicePlan} from './asaas-activation-plan-contract.mjs';
import {receiverRoot as root,receiverRevision,receiverEnvironment,assertReceiverDelta,assertReceiverRuntime,receiverProbeSource} from './asaas-production-receiver-contract.mjs';
import {switchReceiverCore} from './asaas-receiver-switch-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
process.umask(0o077);
function privateDir(path){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Diretório privado divergente.');}
privateDir(root);privateDir(join(root,'runtime-secrets'));privateDir('/opt/ramo-nessa-private/asaas-production');privateDir('/var/lib/ramo-nessa-asaas-sandbox');
const lock='/var/lib/ramo-nessa-asaas-sandbox/execution.lock';closeSync(openSync(lock,'wx',0o600));
const journalPath=join(root,'activation.json'),json=p=>JSON.parse(readFileSync(p,'utf8'));
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',site:'ramo-nessa-site-institutional-site-1',postgres:'ramo-nessa-staging-postgres-1'};
let phase='preflight',journal,prepared,before,models,interrupted=false,recovering=false;
const interrupt=()=>{interrupted=true;};for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,interrupt);
const barrier=async()=>{await new Promise(setImmediate);if(interrupted&&!recovering)throw Error('Interrupção solicitada; retornando ao Core anterior.');};
function record(next){phase=next;if(journal){journal.phase=next;journal.updatedAt=new Date().toISOString();writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600});}}
function run(args,options={}){
 const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH},...options});
 if(r.error||r.status!==0){writeFileSync(join(root,'activation-last.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Etapa Docker não concluída: '+phase+'. Diagnóstico privado preservado.');}
 return r.stdout;
}
const inspect=name=>JSON.parse(run(['inspect',name]))[0];
const snapshot=()=>Object.fromEntries(Object.entries(names).map(([k,n])=>[k,inspect(n)]));
const identity=c=>[c.Id,c.Image,c.State.StartedAt,c.Config.Env,c.Mounts,c.HostConfig.PortBindings,Object.keys(c.NetworkSettings.Networks).sort()];
const mountShape=c=>(c.Mounts??[]).map(m=>[m.Type,m.Name??null,m.Source,m.Destination,m.RW]).sort((a,b)=>String(a[3]).localeCompare(String(b[3])));
const sql=query=>run(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','receiver-read-only',query]);
const migrationQuery='BEGIN READ ONLY; SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t; COMMIT;';
const policyQuery="BEGIN READ ONLY; SELECT row_to_json(t) FROM (SELECT mode,automatic_enabled,anticipation_minimum_cents,anticipation_fee_cents FROM driver_payout_settings WHERE id=1) t; COMMIT;";
async function fileHash(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
async function treeHash(path){const rows=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado nos bundles.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(path,f),s.size,await fileHash(f)]);else throw Error('Arquivo inesperado nos bundles.');}}await visit(path);return sha256(JSON.stringify(rows));}
function untouched(){for(const key of ['gateway','site','postgres']){const c=inspect(names[key]);if(!isDeepStrictEqual(identity(c),identity(before[key]))||c.State.Health?.Status!=='healthy')throw Error('Serviço fora do escopo mudou: '+key);}}
async function checkFiles(){
 if(await fileHash(prepared.source)!==prepared.sourceHash||await fileHash(prepared.caddy)!==prepared.caddyHash||await treeHash(prepared.web)!==prepared.webHash)throw Error('Configuração/Caddy/Web mudou desde a preparação.');
 for(const entry of prepared.bindFiles)if(await fileHash(entry.path)!==entry.sha256)throw Error('Arquivo montado mudou desde a preparação.');
 for(const entry of prepared.secrets){
  const info=lstatSync(entry.path),original=lstatSync(entry.original);
  if(!info.isFile()||info.isSymbolicLink()||info.uid!==prepared.uid.uid||info.gid!==prepared.uid.gid||(info.mode&0o777)!==0o600||
     !original.isFile()||original.isSymbolicLink()||original.uid!==0||(original.mode&0o777)!==0o600||
     await fileHash(entry.path)!==entry.sha256||await fileHash(entry.original)!==entry.sha256)throw Error('Credenciais ou permissões mudaram desde a preparação.');
 }
}
function checkData(){
 if(!isDeepStrictEqual(JSON.parse(sql(migrationQuery)),json(join(root,'migrations-before.json'))))throw Error('Histórico de migrations mudou; não será alterado.');
 const policy=JSON.parse(sql(policyQuery));
 if(policy.mode!=='manual'||policy.automatic_enabled!==false||!isDeepStrictEqual(policy,json(join(root,'policy-before.private.json'))))throw Error('Política mudou; nenhum valor será sobrescrito.');
 if(Number(sql("BEGIN READ ONLY; SELECT count(*) FROM asaas_driver_transfer_attempts WHERE environment='production'; COMMIT;").trim())!==0)throw Error('Há tentativa de envio de produção; conferência específica necessária.');
}
function checkCore(kind){
 const c=inspect(names.core),imageId=kind==='receiver'?prepared.candidateImage:prepared.beforeImage;
 if(c.Image!==imageId||c.State.Health?.Status!=='healthy')throw Error('Imagem ou saúde do Core divergiu.');
 const image=JSON.parse(run(['image','inspect',imageId]))[0];
 assertEnvironmentMatches(models[kind].services.core,c,image);
 const expected=structuredClone(before.core);
 if(kind==='receiver')for(const entry of prepared.secrets)expected.Mounts.push({Type:'bind',Source:entry.path,Destination:entry.target,RW:false});
 if(!isDeepStrictEqual(mountShape(c),mountShape(expected)))throw Error('Mounts do Core divergiram.');
 if(!isDeepStrictEqual(Object.keys(c.NetworkSettings.Networks).sort(),Object.keys(before.core.NetworkSettings.Networks).sort()))throw Error('Redes do Core divergiram.');
 for(const key of ['PortBindings','ReadonlyRootfs','RestartPolicy','LogConfig','Privileged','Memory','NanoCpus','PidsLimit'])if(!isDeepStrictEqual(c.HostConfig[key]??null,before.core.HostConfig[key]??null))throw Error('Opção de execução divergente: '+key);
 for(const key of ['CapAdd','CapDrop','SecurityOpt'])if(!isDeepStrictEqual([...(c.HostConfig[key]??[])].sort(),[...(before.core.HostConfig[key]??[])].sort()))throw Error('Proteção do Core divergiu: '+key);
 for(const key of ['User','Cmd','Entrypoint'])if(!isDeepStrictEqual(c.Config[key]??null,before.core.Config[key]??null))throw Error('Inicialização do Core divergiu: '+key);
 if(kind==='receiver')assertReceiverRuntime(environmentMap(c.Config.Env));
}
const compose=kind=>['compose','--project-name',activationProject,'-f',join(root,'core-'+kind+'.compose.private.json')];
function up(kind){
 if(kind==='rollback'){
  recovering=true;const r=spawnSync('docker',['inspect',names.core],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(r.status===0&&![prepared.beforeImage,prepared.candidateImage].includes(JSON.parse(r.stdout)[0].Image))throw Error('Implantação concorrente; retorno não sobrescreverá outra imagem.');
 }
 record('core-'+kind);
 run([...compose(kind),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90','core']);
 checkCore(kind);
}
async function response(path,{method='GET',headers={},body,origin='https://app.ramonessa.com.br'}={}){
 const r=await fetch(origin+path,{method,headers,redirect:'manual',signal:AbortSignal.timeout(10000),...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,body:await r.text()};
}
async function expect(path,status,options){for(let i=0;i<12;i++){if(interrupted&&!recovering)throw Error('Interrupção solicitada.');try{const r=await response(path,options);if(r.status===status)return r;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw Error('Verificação HTTP falhou: '+path);}
async function baseline(){
 for(const path of ['/ready','/administrodo/','/passageiro/','/motorista/'])await expect(path,200);
 await expect('/v1/admin/finance',401);await expect('/admin/',404);
 await expect('/api/health',200,{origin:'https://ramonessa.com.br'});await expect('/',200,{origin:'https://ramonessa.com.br'});
}
try {
 if(existsSync(journalPath))throw Error('Já existe registro desta troca. Não repita; envie o resultado.');
 prepared=json(join(root,'prepared.json'));
 if(prepared.phase!=='prepared'||prepared.revision!==receiverRevision||prepared.servicesChanged!==false||prepared.asaasPayoutsEnabled!==false)throw Error('Preparação privada divergente.');
 const age=Date.now()-Date.parse(prepared.preparedAt);
 if(!Number.isFinite(age)||age<0||age>3600000)throw Error('Preparação tem mais de uma hora. Nenhum serviço alterado; atualização do plano necessária.');
 before=json(join(root,'runtime-before.private.json'));
 const current=snapshot();
 for(const key of Object.keys(names))if(!isDeepStrictEqual(identity(before[key]),identity(current[key]))||current[key].State.Health?.Status!=='healthy')throw Error('Runtime mudou desde a preparação: '+key);
 models={receiver:json(join(root,'core-receiver.compose.private.json')),rollback:json(join(root,'core-rollback.compose.private.json'))};
 assertReceiverDelta(models.rollback,models.receiver,prepared.candidateImage);
 const original=JSON.parse(run(['compose','--project-name',activationProject,'-f',prepared.source,'config','--format','json']));
 const expectedRollback=servicePlan(original,'core',before.core,prepared.beforeImage);
 if(!isDeepStrictEqual(models.rollback,expectedRollback))throw Error('Plano de retorno divergiu da configuração ativa.');
 assertEnvironmentMatches(models.rollback.services.core,before.core,JSON.parse(run(['image','inspect',prepared.beforeImage]))[0]);
 for(const kind of ['receiver','rollback']){
  const id=kind==='receiver'?prepared.candidateImage:prepared.beforeImage;
  if(JSON.parse(run(['image','inspect',models[kind].services.core.image]))[0].Id!==id)throw Error('Imagem privada não está disponível.');
  const parsed=JSON.parse(run([...compose(kind),'config','--format','json']));
  if(!isDeepStrictEqual(parsed.services.core.environment,models[kind].services.core.environment))throw Error('Compose alterou ambiente na releitura.');
 }
 await checkFiles();checkData();await baseline();
 await expect('/v1/webhooks/asaas/transfers',503,{method:'POST',headers:{'content-type':'application/json'},body:{}});
 const probe=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges'];
 for(const [key,value]of Object.entries(receiverEnvironment))probe.push('--env',key+'='+value);
 for(const entry of prepared.secrets)probe.push('--mount','type=bind,src='+entry.path+',dst='+entry.target+',readonly');
 probe.push(prepared.candidateImage,'node','--input-type=module','-e',receiverProbeSource);
 if(run(probe).trim()!=='RECEIVER_PRIVATE_PROBE_OK')throw Error('Bloqueio privado de envio não confirmado.');
 console.log('Criando backup recente do banco; nenhuma migration será executada...');
 const backup=join(root,'activation-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(4).toString('hex'));
 mkdirSync(backup,{mode:0o700});const dump=join(backup,'database.dump'),fd=openSync(dump,'wx',0o600);
 try{run(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],{encoding:null,stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
 if(lstatSync(dump).size<100)throw Error('Backup do banco inválido.');
 run(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','0:0','--mount','type=bind,src='+dump+',dst=/backup/database.dump,readonly','--entrypoint','pg_restore',before.postgres.Image,'--list','/backup/database.dump']);
 const checksum=await fileHash(dump);
 writeFileSync(join(backup,'manifest.private.json'),JSON.stringify({createdAt:new Date().toISOString(),file:'database.dump',sha256:checksum,bytes:lstatSync(dump).size,archiveListingValidated:true,restorationPerformed:false,sourceContainer:before.postgres.Id},null,2),{mode:0o600,flag:'wx'});
 await barrier();untouched();await checkFiles();checkData();
 if(!isDeepStrictEqual(identity(inspect(names.core)),identity(before.core)))throw Error('Core mudou antes da troca.');
 journal={phase:'starting',startedAt:new Date().toISOString(),revision:receiverRevision,beforeImage:prepared.beforeImage,candidateImage:prepared.candidateImage,backup,asaasPayoutsEnabled:false,webhookEnabled:false,migrationApplied:false};
 writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600,flag:'wx'});
 await switchReceiverCore({
  up:async()=>{console.log('Atualizando somente o Core para receber notificações, com envios bloqueados...');up('receiver');await barrier();},
  check:async()=>{
   await baseline();
   const denied=await expect('/v1/webhooks/asaas/transfers',401,{method:'POST',headers:{'content-type':'application/json'},body:{}});
   if(JSON.parse(denied.body).error!=='INVALID_ASAAS_WEBHOOK')throw Error('Autenticação do webhook não confirmada.');
   const token=readFileSync(prepared.secrets.find(x=>x.target===receiverEnvironment.ASAAS_WEBHOOK_TOKEN_FILE).path,'utf8').trim();
   const invalid=await expect('/v1/webhooks/asaas/transfers',400,{method:'POST',headers:{'content-type':'application/json','asaas-access-token':token},body:{}});
   if(JSON.parse(invalid.body).error!=='INVALID_ASAAS_WEBHOOK')throw Error('Validação autenticada do corpo não confirmada.');
  },
  verify:async()=>{checkCore('receiver');untouched();await checkFiles();checkData();},
  rollback:async()=>{console.log('Retornando somente o Core à imagem anterior...');up('rollback');await barrier();},
  verifyRollback:async()=>{await baseline();checkCore('rollback');untouched();await checkFiles();checkData();await expect('/v1/webhooks/asaas/transfers',503,{method:'POST',headers:{'content-type':'application/json'},body:{}});},
 });
 journal.webhookEnabled=true;journal.completedAt=new Date().toISOString();record('completed');
 console.log('RECEPTOR DE PRODUÇÃO INSTALADO. Rota HTTPS e autenticação conferidas.');
 console.log('Envios Asaas BLOQUEADOS; repasses continuam MANUAIS. Nenhum repasse foi criado.');
 console.log('Somente o Core foi substituído. ADM, gateway, Web, site, migrations e política preservados.');
 console.log('Webhook ainda precisa ser cadastrado no painel de produção do Asaas.');
 console.log('URL: https://app.ramonessa.com.br/v1/webhooks/asaas/transfers');
}catch(error){
 if(journal){journal.rollbackComplete=error.rollbackComplete??null;journal.rollbackFailures=error.rollbackFailures??[];record(error.rollbackComplete===true?'rolled-back':'review-required');}
 writeFileSync(join(root,'activation-error.private.log'),String(error.stack??error),{mode:0o600});
 console.error(error.message??'Troca requer conferência.');console.error('Nenhum banco foi restaurado automaticamente. Não repita se houver registro de ativação.');process.exitCode=1;
}finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,interrupt);unlinkSync(lock);}
