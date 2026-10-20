// Authorized staging Web rollout. Never restores a database dump or changes provider configuration.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,lstatSync,openSync,closeSync,unlinkSync,readdirSync,createReadStream} from 'node:fs';
import {join,dirname,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validate} from './backup-regions-pricing.mjs';
import {makeModels,identity,assertRuntime,environmentMap} from './regions-activation-contract.mjs';
import {switchRegionsRuntime} from './regions-runtime-switch.mjs';
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function activationInput(args){
 if(args.length!==2||!/^\/opt\/ramo-nessa-regions\/releases\/[a-f0-9]{12}\/activation-[a-f0-9]{16}$/.test(args[0])||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe o plano preparado e seu SHA-256 completo.');
 return {dir:args[0],expectedHash:args[1]};
}
export async function activate(args,{testAfterReset}={}){
 const {dir,expectedHash}=activationInput(args);
 if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
 const privateDir=p=>{const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Pasta privada divergente.');};privateDir(dir);privateDir(dirname(dir));
 const journalPath=join(dir,'activation.private.json');
 if(existsSync(journalPath))throw Error('Já existe registro desta ativação. Não repita; envie o resultado para conferência.');
 const planBytes=readFileSync(join(dir,'plan.private.json'));if(sha256(planBytes)!==expectedHash)throw Error('SHA-256 do plano divergente.');
 const plan=JSON.parse(planBytes),release=dirname(dir);
 if(plan.format!==1||plan.release!==release||plan.servicesChanged!==false||plan.resetApplied!==false||!isDeepStrictEqual(plan.scope,['core','admin-gateway','passenger-web','driver-web','three-region-empty-fare-catalog']))throw Error('Plano de escopo divergente.');
 const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_REGIONS_CI_ORIGIN==='http://127.0.0.1:18080';
 if((process.env.RAMO_REGIONS_CI_ORIGIN||testAfterReset)&&!ci)throw Error('Modo de ensaio recusado fora do runner autorizado.');
 const before=JSON.parse(readFileSync(join(dir,'runtime-before.private.json'))),prepared=JSON.parse(readFileSync(join(release,'prepared.private.json'))),models={},images={};
 if(testAfterReset&&before.core.Config.Labels?.['br.com.ramonessa.regions-ci']!=='true')throw Error('Injeção exige fixture CI identificado.');
 const lock=join(release,'operations.lock');closeSync(openSync(lock,'wx',0o600));
 let journal,phase='preflight',recovering=false,interrupted=false;
 const onInterrupt=()=>{interrupted=true;};for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,onInterrupt);
 const barrier=async()=>{await new Promise(setImmediate);if(interrupted&&!recovering)throw Error('Interrupção solicitada; conferindo retorno seguro.');};
 const record=p=>{phase=p;if(journal){journal.phase=p;journal.updatedAt=new Date().toISOString();writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600});}};
 function docker(argv,extra={}){const r=spawnSync('docker',argv,{encoding:'utf8',maxBuffer:64*1024**2,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH},...extra});if(r.error||r.status!==0){writeFileSync(join(dir,'activation-last.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Etapa Docker não concluída: '+phase+'. Detalhes privados preservados.');}return r.stdout;}
 const json=p=>JSON.parse(readFileSync(p)),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0];
 async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
 async function treeHash(root){const rows=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado em Web.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(root,f),s.size,await fileHash(f)]);else throw Error('Arquivo Web inesperado.');}}await visit(root);return sha256(JSON.stringify(rows));}
 const compose=(role,kind)=>['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,role+'-'+kind+'.compose.private.json')];
 const sql=q=>JSON.parse(docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','regions-rollout-read-only',"BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; "+q+'; COMMIT;']));
 const migrationSQL='SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t';
 const snapshotFile=join(dir,'data/reset-active.plan.json');
 function operation(argv){return docker(['run','--rm','--network','container:'+inspect('core').Id,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',join(dir,'core-env.private'),'--mount','type=bind,src='+join(dir,'data')+',dst=/ops/data,readonly','--mount','type=bind,src='+join(dirname(fileURLToPath(import.meta.url)),'regions-live-catalog-probe.mjs')+',dst=/ops/probe.mjs,readonly',plan.candidate.core,'node',...argv]);}
 const catalog=()=>JSON.parse(operation(['/ops/probe.mjs']));
 const resetCLI=argv=>JSON.parse(operation(['dist/scripts/prepare-regions-catalog.js',...argv]));
 function untouched(){for(const role of ['postgres','maps','site']){const current=inspect(role);if(identity(current)!==identity(before[role])||(current.State.Health&&current.State.Health.Status!=='healthy'))throw Error('Serviço fora do escopo mudou: '+role);}}
 async function filesUnchanged(){
  if(await fileHash(plan.caddy)!==plan.caddyHash||await treeHash(plan.oldWebRoot)!==plan.oldWebHash||await treeHash(plan.webRoot)!==plan.newWebHash||await fileHash(snapshotFile)!==plan.resetPlanHash)throw Error('Arquivos do plano ou de retorno mudaram.');
  for(const f of json(join(dir,'sources.private.json')))if(await fileHash(f.path)!==f.sha256||await fileHash(join(dir,f.file))!==f.sha256)throw Error('Configuração de origem mudou.');
  if(!isDeepStrictEqual(sql(migrationSQL),json(join(dir,'migrations-before.private.json'))))throw Error('Migrations mudaram.');
 }
 function checkInstance(role,kind){assertRuntime(before[role],inspect(role),role,images[role][kind],models[role][kind],kind==='candidate'?plan.webRoot:plan.oldWebRoot);}
 async function up(role,kind){
  if(kind==='rollback')recovering=true;
  await barrier();let current;
  const existing=spawnSync('docker',['inspect',names[role]],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(existing.status===0)current=JSON.parse(existing.stdout)[0];
  else if(kind!=='rollback'||docker(['ps','-a','--format','{{.Names}}']).trim().split('\n').includes(names[role]))throw Error('Serviço não pôde ser identificado para troca.');
  if(current&&! [plan.beforeImages[role],plan.candidate[role]].includes(current.Image))throw Error('Implantação concorrente; retorno não sobrescreverá outro serviço.');
  if(current&&role==='gateway'&&![plan.oldWebRoot,plan.webRoot].includes(current.Mounts.find(m=>m.Destination==='/srv/web')?.Source))throw Error('Gateway concorrente; troca cancelada.');
  if(current&&kind==='candidate'&&identity(current)!==identity(before[role]))throw Error('Runtime mudou imediatamente antes da troca.');
  if(current&&kind==='rollback'){
   // Health can be the reason for returning; still require the planned effective configuration.
   const checked=structuredClone(current);checked.State.Health={Status:'healthy'};
   const image=current.Image===plan.candidate[role]?images[role].candidate:images[role].rollback;
   const model=current.Image===plan.candidate[role]?models[role].candidate:models[role].rollback;
   const web=current.Mounts.find(m=>m.Destination==='/srv/web')?.Source;
   assertRuntime(before[role],checked,role,image,model,role==='gateway'?web:plan.oldWebRoot);
   if(!isDeepStrictEqual(environmentMap(current.Config.Env),environmentMap(before[role].Config.Env)))throw Error('Ambiente alterado por outra implantação; retorno cancelado.');
  }
  record(role+'-'+kind);
  docker([...compose(role,kind),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90',role]);
  await barrier();checkInstance(role,kind);
 }
 const origin=ci?'http://127.0.0.1:18080':'https://app.ramonessa.com.br',siteOrigin=ci?origin:'https://ramonessa.com.br';
 async function expect(path,status,base=origin){
  for(let n=0;n<3;n++){await barrier();try{const r=await fetch(base+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});const bytes=Buffer.from(await r.arrayBuffer());if(r.status===status&&bytes.length<16*1024**2)return bytes;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Verificação HTTP falhou: '+path);
 }
 async function baseline(){for(const p of ['/health','/ready','/administrodo/','/passageiro/','/motorista/'])await expect(p,200);await expect('/v1/admin/finance',401);await expect('/',200,siteOrigin);await expect('/api/health',200,siteOrigin);}
 const oldAdminFiles=['index.html','styles.css','src/app.js','src/api.js','src/pricing-geofence-map.js'];
 const newAdminFiles=[...oldAdminFiles,'pages/regions-pricing.html','src/regions-pricing-admin.js','src/regions-pricing-model.js'];
 async function checkPublic(kind){
  const root=kind==='candidate'?plan.webRoot:plan.oldWebRoot,adminFiles=kind==='candidate'?newAdminFiles:oldAdminFiles;
  const output=docker(['run','--rm','--network','none','--read-only','--entrypoint','sha256sum',images.gateway[kind].Id,...adminFiles.map(p=>'/srv/admin/'+p)]);
  const hashes=Object.fromEntries(output.trim().split('\n').map(line=>{const [hash,file]=line.trim().split(/\s+/);return[file.replace('/srv/admin/',''),hash];}));
  for(const file of adminFiles){const bytes=await expect('/administrodo/'+file,200);if(sha256(bytes)!==hashes[file])throw Error('Arquivo público do ADM divergiu: '+file);}
  for(const [role,path]of [['passenger','/passageiro/'],['driver','/motorista/']])for(const f of ['index.html','main.dart.js','flutter_bootstrap.js','manifest.json','ramo_push_config.js','ramo_web_push.js','ramo_push_worker.js','ramo_entry_gate.js','ramo_entry_gate.css']){
   const bytes=await expect(path+f,200);if(sha256(bytes)!==await fileHash(join(root,role,f)))throw Error('Arquivo Web público divergiu: '+role+'/'+f);
  }
 }
 try{
  console.log('Conferindo plano, backup, serviços e arquivos de retorno antes de qualquer alteração...');
  await switchRegionsRuntime({
   preflight:async()=>{
    if(sha256(readFileSync(join(release,'prepared.private.json')))!==plan.preparedManifestSha256||prepared.revision!==plan.revision||!isDeepStrictEqual(prepared.candidate,plan.candidate))throw Error('Candidata divergiu do plano.');
    if(await fileHash(join(plan.backup,'verified.private.json'))!==plan.backupManifestSha256)throw Error('Manifesto do backup divergiu.');
    for(const f of json(join(plan.backup,'verified.private.json')).files)if(!/^[a-zA-Z0-9.-]+$/.test(f.name)||await fileHash(join(plan.backup,f.name))!==f.sha256)throw Error('Integridade do backup não confirmada.');
    const current=Object.fromEntries(Object.keys(names).map(k=>[k,inspect(k)]));validate(current,{'core-image':plan.beforeImages.core,'gateway-image':plan.beforeImages.gateway});
    for(const k of Object.keys(names))if(identity(current[k])!==identity(before[k]))throw Error('Runtime mudou desde o plano: '+k);
    if(!current.core.Config.Env.includes('NODE_ENV=staging')||readFileSync(join(dir,'core-env.private'),'utf8')!==current.core.Config.Env.join('\n')+'\n')throw Error('Ambiente ativo divergente.');
    for(const role of ['core','gateway']){
     images[role]={candidate:JSON.parse(docker(['image','inspect',plan.candidate[role]]))[0],rollback:JSON.parse(docker(['image','inspect',plan.beforeImages[role]]))[0]};
     const expected=makeModels(json(join(dir,role+'-resolved.private.json')),role,before[role],images[role].rollback,images[role].candidate,plan.webRoot);
     models[role]={};for(const kind of ['candidate','rollback']){models[role][kind]=json(join(dir,role+'-'+kind+'.compose.private.json'));if(!isDeepStrictEqual(models[role][kind],expected[kind]))throw Error('Modelo privado mudou: '+role+' '+kind);}
    }
    await filesUnchanged();const state=catalog();if(state.revision!==plan.resetSourceRevision||state.digest!==plan.resetSourceDigest||state.managed)throw Error('Catálogo mudou desde o plano. Nenhum reset aplicado.');
    await baseline();await checkPublic('rollback');untouched();await filesUnchanged();await barrier();
    for(const role of Object.keys(names))if(identity(inspect(role))!==identity(before[role]))throw Error('Implantação concorrente antes da troca.');
    journal={startedAt:new Date().toISOString(),phase:'starting',planSha256:expectedHash,revision:plan.revision,resetApplied:false,servicesRestarted:false,backup:plan.backup};writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600,flag:'wx'});
   },
   upCore:async()=>{console.log('Atualizando o Core com as configurações atuais preservadas...');await up('core','candidate');journal.servicesRestarted=true;},
   checkCore:async()=>{await expect('/ready',200);const state=catalog();if(state.revision!==plan.resetSourceRevision||state.digest!==plan.resetSourceDigest)throw Error('Catálogo mudou durante atualização do Core.');untouched();},
   upGateway:async()=>{console.log('Atualizando ADM, Passageiro Web e Motorista Web...');await up('gateway','candidate');},
   checkGateway:async()=>{await baseline();await checkPublic('candidate');},
   beforeReset:async()=>{untouched();checkInstance('core','candidate');checkInstance('gateway','candidate');await filesUnchanged();const state=catalog();if(state.revision!==plan.resetSourceRevision||state.digest!==plan.resetSourceDigest||state.managed)throw Error('Catálogo mudou. Reset cancelado.');await barrier();},
   applyReset:async()=>{record('catalog-reset');console.log('Aplicando catálogo inicial: Jericoacoara, Jijoca (sede) e Preá, sem tarifas comerciais...');const result=resetCLI(['--apply-plan','/ops/data/reset-active.plan.json','--plan-sha256',plan.resetPlanHash,'--confirm','three-regions-empty-fares-20261020']);if(result.result!=='CATALOG_PREPARED'||result.versionId!==plan.resetRequestId)throw Error('Resposta do reset exige reconciliação.');journal.resetApplied=true;journal.catalogVersionId=result.versionId;record('catalog-reset-applied');await barrier();},
   verify:async()=>{const state=catalog();if(state.versionId!==plan.resetRequestId||!state.emptyPrepared)throw Error('Catálogo inicial divergiu ou recebeu alteração concorrente.');if(testAfterReset)await testAfterReset();const policy=JSON.parse((await expect('/v1/pricing/policy',200)).toString());if(policy.managementMode!=='managed'||policy.regions?.length!==3||policy.categories?.length!==0||policy.enabledCategories?.length!==0||policy.pricingCatalog?.catalogVersionId!==state.versionId)throw Error('Política pública não corresponde ao catálogo inicial.');await baseline();await checkPublic('candidate');untouched();checkInstance('core','candidate');checkInstance('gateway','candidate');await filesUnchanged();await barrier();},
   restoreCatalogIfUnchanged:async()=>{recovering=true;record('catalog-recovery');const state=catalog();if(!state.managed&&state.digest===plan.resetSourceDigest)return 'unchanged';if(state.versionId!==plan.resetRequestId||state.migrationId!=='three-regions-empty-fares-20261020')return 'conflict';const result=resetCLI(['--restore-plan','/ops/data/reset-active.plan.json','--plan-sha256',plan.resetPlanHash,'--expected-revision',state.revision,'--confirm','RESTORE_PRICING_CATALOG']);if(result.result!=='PREVIOUS_CATALOG_RESTORED_AS_NEW_VERSION')return 'unknown';const restored=catalog();if(restored.managed||restored.digest!==plan.resetSourceDigest)return 'unknown';journal.catalogRestoredAsNewVersion=true;journal.resetApplied=false;record('catalog-recovered');return 'restored';},
   checkRollbackSafety:async()=>{const state=sql("SELECT json_build_object('managed',coalesce((SELECT snapshot ? 'managedOperations' FROM pricing_catalog_versions WHERE status='published' AND effective_from<=now() ORDER BY effective_from DESC,version_number DESC LIMIT 1),false))");return state.managed?'managed':'legacy';},
   rollbackCore:async()=>{console.log('Recuperando imagem anterior do Core...');await up('core','rollback');},
   rollbackGateway:async()=>{console.log('Recuperando ADM e arquivos Web anteriores...');await up('gateway','rollback');},
   verifyRollback:async()=>{await baseline();await checkPublic('rollback');checkInstance('core','rollback');checkInstance('gateway','rollback');untouched();await filesUnchanged();const state=catalog();if(state.managed)throw Error('Catálogo gerenciado não pode usar a versão anterior.');},
  });
  journal.completedAt=new Date().toISOString();record('completed');
  console.log(JSON.stringify({status:'REGIOES_E_PRECOS_ATIVADOS',revision:plan.revision,regions:3,commercialRates:0,categoriesPreserved:true,resetApplied:true,adminUpdated:true,passengerWebUpdated:true,driverWebUpdated:true,nativeAppsUpdated:false,providerConfigurationPreserved:true,realDeviceAcceptancePending:true,adminUrl:origin+'/administrodo/'},null,2));
 }catch(error){
  writeFileSync(join(dir,'activation-error.private.log'),String(error.stack||error),{mode:0o600});
  if(journal){journal.rollbackComplete=error.rollbackComplete??null;journal.candidatePreserved=error.candidatePreserved??false;journal.catalogRecovery=error.catalogRecovery??null;record(error.rollbackComplete===true?'rolled-back':'review-required');}
  console.error(error.message);console.error('Não repita este comando. Envie a saída final para conferência. Nenhum dump foi restaurado no banco ativo.');process.exitCode=1;
 }finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,onInterrupt);unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await activate(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
