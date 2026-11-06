// Applies only 086 and replaces only Core/ADM. Asaas stays disabled, with no Sandbox credentials.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,existsSync,openSync,closeSync,unlinkSync,createReadStream,readdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {runtimeContract,validateRuntime,validateMigrations,activeCaddy,activeWeb} from './asaas-runtime-contract.mjs';
import {activationProject,sha256,environmentMap,assertEnvironmentMatches,servicePlan,changesForAsaas} from './asaas-activation-plan-contract.mjs';
import {validateActivationReadiness,assertSchemaAfter,switchDisabledRuntime} from './asaas-disabled-activation-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
const root='/var/backups/ramo-nessa-asaas/5ffae7968796',dir=join(root,'activation-plan'),lab='/var/lib/ramo-nessa-asaas-sandbox',journalPath=join(dir,'activation.json');
const privateDir=path=>{const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Diretório privado divergente.');};
for(const path of [root,dir,lab])privateDir(path);
const lock=join(lab,'execution.lock');closeSync(openSync(lock,'wx',0o600));
const json=path=>JSON.parse(readFileSync(path,'utf8'));
let journal,stage='preflight',start,prepared,plan,models,expected086,interrupted=false,recovering=false;
const interruption=()=>{interrupted=true;};for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,interruption);
const checkInterrupted=()=>{if(interrupted&&!recovering)throw Error('Interrupção solicitada; conferindo retorno seguro.');};
const barrier=async()=>{await new Promise(setImmediate);checkInterrupted();};
function record(phase){stage=phase;if(journal){journal.phase=phase;journal.updatedAt=new Date().toISOString();writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600});}}
function run(args,options={}){
 const r=spawnSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024,...options});
 if(r.error||r.status!==0){writeFileSync(join(dir,'activation-last.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Etapa Docker não concluída: '+stage+'. Diagnóstico privado preservado.');}return r.stdout;
}
const inspect=name=>JSON.parse(run(['inspect',name]))[0];
const snapshot=()=>Object.fromEntries(Object.entries(runtimeContract).map(([key,value])=>[key,inspect(value.name)]));
const sql=query=>run(['exec',runtimeContract.postgres.name,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','asaas-read-only',query]);
const migrationQuery='BEGIN READ ONLY; SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t; COMMIT;';
const migrations=()=>JSON.parse(sql(migrationQuery));
async function fileHash(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
async function webFingerprint(){
 const files=[];async function visit(path){for(const name of readdirSync(path).sort()){const p=join(path,name),s=lstatSync(p);if(s.isSymbolicLink())throw Error('Bundle Web contém link inesperado.');if(s.isDirectory())await visit(p);else if(s.isFile())files.push([relative(activeWeb,p),s.size,await fileHash(p)]);else throw Error('Bundle Web contém arquivo inesperado.');}}
 await visit(activeWeb);return sha256(JSON.stringify(files));
}
function checkSources(){
 if(sha256(readFileSync(activeCaddy))!==plan.afterCleanupCaddyHash)throw Error('Caddy mudou desde o encerramento.');
 for(const entry of json(join(dir,'source-configurations.private.json')))if(sha256(readFileSync(entry.path))!==entry.sha256)throw Error('Configuração de origem mudou depois do plano.');
 for(const entry of json(join(dir,'bind-files.private.json')))if(entry.path!==activeCaddy&&sha256(readFileSync(entry.path))!==entry.sha256)throw Error('Arquivo de mount mudou depois do plano.');
}
const sameInitial=(a,b)=>isDeepStrictEqual([a.Id,a.Image,a.State.StartedAt,a.Config.Env,a.Mounts],[b.Id,b.Image,b.State.StartedAt,b.Config.Env,b.Mounts]);
function untouched(){for(const key of ['postgres','site']){const c=inspect(runtimeContract[key].name);if(!sameInitial(c,start[key])||c.State.Health?.Status!=='healthy')throw Error('Um serviço fora do escopo mudou: '+key);}}
const mountShape=c=>(c.Mounts??[]).map(m=>[m.Type,m.Name??null,m.Source,m.Destination,m.RW]).sort((a,b)=>String(a[3]).localeCompare(String(b[3])));
function checkInstance(name,kind){
 const c=inspect(runtimeContract[name].name),id=kind==='candidate'?prepared[name+'Candidate']:start[name].Image;
 if(c.Image!==id||c.State.Health?.Status!=='healthy')throw Error('Imagem/saúde inesperada: '+name);
 const image=JSON.parse(run(['image','inspect',id]))[0];assertEnvironmentMatches(models[name][kind].services[name],c,image);
 if(!isDeepStrictEqual(mountShape(c),mountShape(start[name]))||!isDeepStrictEqual(c.HostConfig.PortBindings??{},start[name].HostConfig.PortBindings??{}))throw Error('Mounts ou portas mudaram: '+name);
 if(!isDeepStrictEqual(Object.keys(c.NetworkSettings.Networks).sort(),Object.keys(start[name].NetworkSettings.Networks).sort()))throw Error('Redes mudaram: '+name);
 for(const key of ['ReadonlyRootfs','RestartPolicy','LogConfig','Privileged','Memory','NanoCpus','PidsLimit'])if(!isDeepStrictEqual(c.HostConfig[key]??null,start[name].HostConfig[key]??null))throw Error('Opção de execução mudou: '+key);
 for(const key of ['CapAdd','CapDrop','SecurityOpt'])if(!isDeepStrictEqual([...(c.HostConfig[key]??[])].sort(),[...(start[name].HostConfig[key]??[])].sort()))throw Error('Proteção do container mudou: '+key);
 if(name==='core'&&kind==='candidate'){
  const e=environmentMap(c.Config.Env);if(e.ASAAS_PAYOUTS_ENABLED!=='false'||e.DRIVER_PAYOUT_PROVIDER_NAME!=='asaas')throw Error('Asaas não está explicitamente desativado.');
  for(const key of ['ASAAS_API_KEY','ASAAS_API_KEY_FILE','ASAAS_WEBHOOK_TOKEN','ASAAS_WEBHOOK_TOKEN_FILE'])if(e[key])throw Error('Core recebeu credencial Asaas fora do escopo.');
  if(c.Mounts.some(m=>m.Destination.includes('asaas')))throw Error('Mount Asaas fora do escopo.');
 }
}
const compose=(name,kind)=>['compose','--project-name',activationProject,'-f',join(dir,name+'-'+kind+'.compose.private.json')];
function up(name,kind){
 const model=models[name][kind],expected=kind==='candidate'?prepared[name+'Candidate']:start[name].Image;
 if(JSON.parse(run(['image','inspect',model.services[name].image]))[0].Id!==expected)throw Error('Tag mudou antes da troca: '+name);
 // Never roll back an unrelated concurrent deployment.
 if(kind==='rollback'){
  const existing=spawnSync('docker',['inspect',runtimeContract[name].name],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(existing.status===0){const c=JSON.parse(existing.stdout)[0];if(![start[name].Image,prepared[name+'Candidate']].includes(c.Image))throw Error('Implantação concorrente detectada; retorno interrompido.');}
 }
 record(name+'-'+kind);
 run([...compose(name,kind),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90',name],{env:{PATH:process.env.PATH}});
 checkInstance(name,kind);
}
async function publicResponse(path,{method='GET',body,origin='https://app.ramonessa.com.br'}={}){
 const r=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(10000),...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});return{status:r.status,bytes:Buffer.from(await r.arrayBuffer())};
}
async function expect(path,status,options){for(let n=0;n<12;n++){checkInterrupted();try{const r=await publicResponse(path,options);if(r.status===status)return r;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Verificação pública falhou: '+path);}
async function baseline(){
 for(const path of ['/ready','/administrodo/','/passageiro/','/motorista/'])await expect(path,200);
 await expect('/admin/',404);await expect('/__asaas_sandbox/transfers',404,{method:'POST',body:{}});
 await expect('/api/health',200,{origin:'https://ramonessa.com.br'});await expect('/',200,{origin:'https://ramonessa.com.br'});
}
try{
 if(existsSync(journalPath))throw Error('Já existe registro de ativação. Não repita; envie o resultado para conferência.');
 plan=json(join(dir,'plan.json'));const fresh=json(join(dir,'backup-verified.json')),closed=json(join(lab,'sandbox-closed.json'));
 const checkpoint=resolve(fresh.directory??'');if(!checkpoint.startsWith(resolve(dir)+'/checkpoint-'))throw Error('Checkpoint fora do plano privado.');privateDir(checkpoint);
 const manifest=json(join(checkpoint,'manifest.private.json'));validateActivationReadiness({plan,fresh,closed,manifest});
 start=snapshot();validateRuntime(start);const before=json(join(dir,'runtime-before.private.json'));
 for(const key of Object.keys(start))if(!sameInitial(start[key],before[key])||start[key].Id!==plan.beforeIds[key]||start[key].Id!==fresh.runtimeIds[key])throw Error('Runtime mudou depois do plano/backup: '+key);
 checkSources();
 console.log('Conferindo backup recente, imagens e arquivos de retorno...');
 for(const name of ['database.dump','driver-documents.tar.gz','images-before.tar']){const item=manifest.files?.find(f=>f.name===name);if(!item||item.bytes!==lstatSync(join(checkpoint,name)).size||await fileHash(join(checkpoint,name))!==item.sha256)throw Error('Integridade do backup não confirmada: '+name);}
 prepared=json(join(root,'prepared.json'));if(prepared.revision!==plan.candidateRevision)throw Error('Preparação de imagens divergiu do plano.');models={};
 for(const name of ['core','gateway']){
  if(JSON.parse(run(['image','inspect',prepared[name+'Image']]))[0].Id!==prepared[name+'Candidate'])throw Error('Imagem candidata mudou.');
  const original=json(join(dir,name+'-resolved-before.private.json'));
  assertEnvironmentMatches(original.services[name],start[name],JSON.parse(run(['image','inspect',start[name].Image]))[0]);
  models[name]={};
  for(const kind of ['candidate','rollback']){
   const model=json(join(dir,name+'-'+kind+'.compose.private.json'));
   const expected=servicePlan(original,name,start[name],kind==='candidate'?prepared[name+'Image']:start[name].Config.Image,{disabledAsaas:name==='core'&&kind==='candidate'});
   if(!isDeepStrictEqual(model,expected))throw Error('Plano privado mudou: '+name+' '+kind);
   models[name][kind]=model;
   const parsed=JSON.parse(run([...compose(name,kind),'config','--format','json'],{env:{PATH:process.env.PATH}}));
   if(!isDeepStrictEqual(parsed.services[name].environment,model.services[name].environment))throw Error('Compose alterou ambiente na releitura.');
  }
 }
 changesForAsaas(models.core.rollback.services.core.environment,models.core.candidate.services.core.environment);
 const beforeSchema=json(join(dir,'migrations-before.json'));if(!isDeepStrictEqual(migrations(),beforeSchema))throw Error('Histórico do banco mudou depois do backup.');
 const catalog=JSON.parse(run(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',prepared.coreCandidate,'node','--input-type=module','-e',"import{readdirSync,readFileSync}from'node:fs';import{createHash}from'node:crypto';console.log(JSON.stringify(Object.fromEntries(readdirSync('/app/migrations').filter(n=>n.endsWith('.sql')).map(n=>[n,createHash('sha256').update(readFileSync('/app/migrations/'+n)).digest('hex')]))))"]));
 validateMigrations(beforeSchema,catalog);expected086=catalog['086_asaas_driver_payouts.sql'];
 const gatewayEnv=readFileSync(join(root,'gateway-env.private'),'utf8');if(gatewayEnv!==start.gateway.Config.Env.join('\n')+'\n')throw Error('Ambiente de validação Caddy divergiu.');
 run(['run','--rm','--network','none','--entrypoint','caddy','--env-file',join(root,'gateway-env.private'),'--mount','type=bind,src='+activeCaddy+',dst=/etc/caddy/Caddyfile,readonly',prepared.gatewayCandidate,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);
 await baseline();const webBefore=await webFingerprint();
 const adminAssets=['src/app.js','src/payout-policy.js','pages/finance.html'];
 const assetHashes=Object.fromEntries(adminAssets.map(path=>[path,run(['run','--rm','--network','none','--entrypoint','sha256sum',prepared.gatewayCandidate,'/srv/admin/'+path]).trim().split(/\s/)[0]]));
 const coreEnv=environmentMap(start.core.Config.Env);if(coreEnv.NODE_ENV!=='staging'||coreEnv.DB_SSL!=='false'||!coreEnv.DATABASE_URL)throw Error('Ambiente do banco ativo exige revisão.');
 checkInterrupted();
 journal={phase:'starting',candidateRevision:prepared.revision,startedAt:new Date().toISOString(),migrationApplied:false,asaasEnabled:false,backup:fresh.directory,webBefore,models:{core:prepared.coreCandidate,gateway:prepared.gatewayCandidate},beforeImages:{core:start.core.Image,gateway:start.gateway.Image}};
 writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600,flag:'wx'});
 await switchDisabledRuntime({
  migrate:async()=>{
   checkInterrupted();record('migration086');console.log('Aplicando somente a migration 086; repasses ficarão em modo manual...');
   const log=run(['run','--rm','--name','ramo-asaas-activation-'+randomBytes(8).toString('hex'),'--network','container:'+start.core.Id,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env','NODE_ENV=staging','--env','DATABASE_URL='+coreEnv.DATABASE_URL,'--env','DB_SSL=false',prepared.coreCandidate,'node','dist/scripts/migrate.js']);
   writeFileSync(join(dir,'activation-migration.private.log'),log,{mode:0o600});await barrier();assertSchemaAfter(beforeSchema,migrations(),expected086);journal.migrationApplied=true;record('migration086-applied');
   const policy=JSON.parse(sql('BEGIN READ ONLY; SELECT row_to_json(t) FROM (SELECT mode,automatic_enabled,anticipation_minimum_cents,anticipation_fee_cents FROM driver_payout_settings WHERE id=1) t; COMMIT;'));
   if(policy.mode!=='manual'||policy.automatic_enabled!==false||policy.anticipation_minimum_cents!==8000||policy.anticipation_fee_cents!==1000)throw Error('Política de repasses pós-migration divergiu.');
  },
  upCore:async()=>{checkInterrupted();console.log('Atualizando somente o Core, com Asaas desativado...');up('core','candidate');await barrier();},
  checkCore:async()=>{await expect('/ready',200);const r=await expect('/v1/webhooks/asaas/transfers',503,{method:'POST',body:{}});if(JSON.parse(r.bytes.toString()).error!=='ASAAS_NOT_CONFIGURED')throw Error('Desativação Asaas não confirmada na API.');untouched();},
  upGateway:async()=>{checkInterrupted();console.log('Atualizando somente o gateway/ADM...');up('gateway','candidate');await barrier();},
  checkGateway:async()=>{await baseline();for(const path of adminAssets){const r=await expect('/administrodo/'+path,200);if(sha256(r.bytes)!==assetHashes[path])throw Error('Arquivo do ADM divergiu: '+path);}await expect('/v1/admin/finance',401);},
  verify:async()=>{checkSources();untouched();checkInstance('core','candidate');checkInstance('gateway','candidate');assertSchemaAfter(beforeSchema,migrations(),expected086);if(await webFingerprint()!==webBefore)throw Error('Bundles Web mudaram durante a ativação.');},
  rollbackCore:async()=>{recovering=true;console.log('Restaurando imagem anterior do Core...');up('core','rollback');},
  rollbackGateway:async()=>{recovering=true;console.log('Restaurando imagem anterior do gateway/ADM...');up('gateway','rollback');},
  verifyRollback:async()=>{await baseline();checkInstance('core','rollback');checkInstance('gateway','rollback');untouched();checkSources();if(await webFingerprint()!==webBefore)throw Error('Bundles Web mudaram durante o retorno.');},
 });
 journal.asaasEnabled=false;journal.completedAt=new Date().toISOString();record('completed');
 console.log('CORE E ADM ATUALIZADOS. Migration 086 aplicada; API, ADM, site e Web conferidos.');
 console.log('Asaas DESATIVADO; repasses em modo MANUAL. Mercado Pago e provedores atuais preservados.');
 console.log('Antecipação inicial: mínimo R$80 e taxa R$10. Nenhum repasse foi solicitado por esta ativação.');
 console.log('Financeiro: https://app.ramonessa.com.br/administrodo/financeiro');
 console.log('Clientes motorista e configuração de produção ainda precisam de aceite antes de habilitar envios reais.');
}catch(error){
 if(journal){try{journal.rollbackComplete=error.rollbackComplete??null;journal.rollbackFailures=error.rollbackFailures??[];try{journal.schemaObserved=migrations();journal.migrationApplied=journal.schemaObserved.some(x=>x.filename==='086_asaas_driver_payouts.sql');}catch{journal.schemaUnknown=true;}record(error.rollbackComplete===true?'rolled-back':'review-required');}catch{} }
 console.error(error?.message??'Ativação requer conferência.');
 if(journal?.migrationApplied)console.error('Migration 086 permanece no banco, compatível com o Core anterior. Nenhum banco foi restaurado nem registro financeiro apagado.');
 console.error('Não repita a ativação se houver registro; envie este resultado para conferência.');process.exitCode=1;
}finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,interruption);unlinkSync(lock);}
