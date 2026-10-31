// Publishes the staged driver through a gateway-only Web bind replacement.
// No migration, financial write, Core update, subscription or Asaas request.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,existsSync,openSync,closeSync,unlinkSync,readdirSync,createReadStream} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {activationProject,sha256,environmentMap,assertEnvironmentMatches,servicePlan} from './asaas-activation-plan-contract.mjs';
import {driverWebSource,driverWebPrivate as root,driverWebRelease,driverWebBefore,driverGatewayImage,assertGatewayWebDelta} from './asaas-driver-web-contract.mjs';
import {assertWebGatewayRuntime,switchDriverWeb} from './asaas-driver-web-switch-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
process.umask(0o077);
function privateDir(p){const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Pasta privada divergente.');}
privateDir(root);privateDir('/var/lib/ramo-nessa-asaas-sandbox');
const lock='/var/lib/ramo-nessa-asaas-sandbox/execution.lock';closeSync(openSync(lock,'wx',0o600));
const journalPath=join(root,'activation.json'),json=p=>JSON.parse(readFileSync(p,'utf8'));
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',site:'ramo-nessa-site-institutional-site-1',postgres:'ramo-nessa-staging-postgres-1'};
let before,prepared,models,image,journal,phase='preflight',interrupted=false,recovering=false,dataBefore;
const interrupt=()=>{interrupted=true;};for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,interrupt);
async function barrier(){await new Promise(setImmediate);if(interrupted&&!recovering)throw Error('Interrupção solicitada.');}
function record(next){phase=next;if(journal){journal.phase=next;journal.updatedAt=new Date().toISOString();writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600});}}
function docker(args){
 const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH}});
 if(r.error||r.status!==0){writeFileSync(join(root,'activation-last.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Etapa Docker não concluída: '+phase+'. Diagnóstico privado preservado.');}return r.stdout;
}
const inspect=n=>JSON.parse(docker(['inspect',n]))[0];
const identity=c=>[c.Id,c.Image,c.State.StartedAt,c.Config.Env,c.Mounts,c.HostConfig.PortBindings,Object.keys(c.NetworkSettings.Networks).sort()];
async function fileHash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
async function treeHash(path){const rows=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado nos bundles.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(path,f),s.size,await fileHash(f)]);else throw Error('Arquivo inesperado nos bundles.');}}await visit(path);return sha256(JSON.stringify(rows));}
function untouched(){
 for(const k of ['core','site','postgres']){const c=inspect(names[k]);if(!isDeepStrictEqual(identity(c),identity(before[k]))||c.State.Health?.Status!=='healthy')throw Error('Serviço fora do escopo mudou: '+k);}
 const env=environmentMap(inspect(names.core).Config.Env);
 if(env.ASAAS_PAYOUTS_ENABLED!=='false'||env.ASAAS_WEBHOOK_ENABLED!=='true')throw Error('Estado Asaas divergente.');
}
async function checkFiles(){
 if(await fileHash(prepared.source)!==prepared.sourceHash||await fileHash(prepared.caddy)!==prepared.caddyHash||await treeHash(prepared.oldBundleRoot)!==prepared.oldWebHash||await treeHash(prepared.bundleRoot)!==prepared.newWebHash)throw Error('Configuração ou bundles mudaram desde a preparação.');
 if(await treeHash(join(prepared.bundleRoot,'passenger'))!==prepared.passengerHash||await treeHash(join(prepared.bundleRoot,'driver'))!==prepared.driverHash)throw Error('Pacotes divergentes.');
 for(const f of prepared.bindFiles)if(await fileHash(f.path)!==f.sha256)throw Error('Arquivo montado mudou desde a preparação.');
}
function readData(){
 const query="BEGIN READ ONLY; SELECT json_build_object('migrations',(SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t),'policy',(SELECT row_to_json(t) FROM (SELECT mode,automatic_enabled,anticipation_minimum_cents,anticipation_fee_cents FROM driver_payout_settings WHERE id=1) t)); COMMIT;";
 return JSON.parse(docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','web-read-only',query]));
}
function checkData(){if(!isDeepStrictEqual(readData(),dataBefore))throw Error('Política ou migrations mudaram durante a publicação. Nenhum valor será sobrescrito.');}
const compose=kind=>['compose','--project-name',activationProject,'-f',join(root,'gateway-'+kind+'.compose.private.json')];
function checkGateway(kind){assertWebGatewayRuntime(before.gateway,inspect(names.gateway),models[kind],image,kind==='candidate'?prepared.bundleRoot:prepared.oldBundleRoot);}
function up(kind){
 if(kind==='rollback'){
  recovering=true;
  const r=spawnSync('docker',['inspect',names.gateway],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(r.status===0){const c=JSON.parse(r.stdout)[0],web=c.Mounts.find(m=>m.Destination==='/srv/web');if(c.Image!==prepared.gatewayImage||![prepared.oldBundleRoot,prepared.bundleRoot].includes(web?.Source))throw Error('Implantação concorrente; retorno não sobrescreverá outro gateway.');}
 }
 record('gateway-'+kind);
 docker([...compose(kind),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90','gateway']);
 checkGateway(kind);
}
async function response(path,{origin='https://app.ramonessa.com.br',method='GET',body}={}){
 const r=await fetch(origin+path,{method,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(30000),...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
 return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};
}
async function expect(path,status,options){for(let i=0;i<6;i++){await barrier();try{const r=await response(path,options);if(r.status===status)return r;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Verificação HTTP falhou: '+path);}
async function baseline(){
 for(const p of ['/ready','/administrodo/','/passageiro/','/motorista/'])await expect(p,200);
 await expect('/admin/',404);await expect('/v1/admin/finance',401);
 await expect('/',200,{origin:'https://ramonessa.com.br'});await expect('/api/health',200,{origin:'https://ramonessa.com.br'});
 await expect('/v1/webhooks/asaas/transfers',401,{method:'POST',body:{}});
}
async function checkPublic(bundleRoot){
 const groups={driver:['index.html','main.dart.js','flutter_bootstrap.js','manifest.json','ramo_push_config.js','ramo_web_push.js','ramo_push_worker.js','ramo_entry_gate.js','ramo_entry_gate.css'],passenger:['index.html','main.dart.js','ramo_push_config.js']};
 for(const [role,files]of Object.entries(groups))for(const file of files){const path=(role==='driver'?'/motorista/':'/passageiro/')+(file==='index.html'?'':file);const result=await expect(path,200);if(sha256(result.bytes)!==await fileHash(join(bundleRoot,role,file)))throw Error('Arquivo público diferente do preparado: '+role+'/'+file);}
}
try{
 if(existsSync(journalPath))throw Error('Já existe registro de publicação. Não repita; envie o resultado.');
 prepared=json(join(root,'prepared.json'));
 if(prepared.phase!=='prepared'||prepared.sourceCommit!==driverWebSource||prepared.servicesChanged!==false||prepared.asaasPayoutsEnabled!==false||prepared.gatewayImage!==driverGatewayImage||prepared.oldBundleRoot!==driverWebBefore||prepared.bundleRoot!==driverWebRelease+'/bundles')throw Error('Preparação privada divergente.');
 const age=Date.now()-Date.parse(prepared.preparedAt);if(!Number.isFinite(age)||age<0||age>3600000)throw Error('Preparação tem mais de uma hora; atualização do plano necessária. Nenhum serviço alterado.');
 before=json(join(root,'runtime-before.private.json'));
 for(const k of Object.keys(names)){const c=inspect(names[k]);if(!isDeepStrictEqual(identity(c),identity(before[k]))||c.State.Health?.Status!=='healthy')throw Error('Runtime mudou desde a preparação: '+k);}
 models={candidate:json(join(root,'gateway-candidate.compose.private.json')),rollback:json(join(root,'gateway-rollback.compose.private.json'))};
 assertGatewayWebDelta(models.rollback,models.candidate,prepared.bundleRoot);
 image=JSON.parse(docker(['image','inspect',prepared.gatewayImage]))[0];
 const original=JSON.parse(docker(['compose','--project-name',activationProject,'-f',prepared.source,'config','--format','json']));
 if(!isDeepStrictEqual(models.rollback,servicePlan(original,'gateway',before.gateway,prepared.gatewayImage)))throw Error('Plano de retorno divergiu da configuração ativa.');
 assertEnvironmentMatches(models.rollback.services.gateway,before.gateway,image);
 for(const kind of ['candidate','rollback']){const parsed=JSON.parse(docker([...compose(kind),'config','--format','json']));if(!isDeepStrictEqual(parsed.services.gateway.environment,models[kind].services.gateway.environment))throw Error('Compose alterou ambiente privado na releitura.');}
 untouched();await checkFiles();dataBefore=readData();
 if(dataBefore.policy?.mode!=='manual'||dataBefore.policy?.automatic_enabled!==false)throw Error('Repasses não estão em modo manual; conferência necessária.');
 await baseline();await checkPublic(prepared.oldBundleRoot);await barrier();untouched();await checkFiles();checkData();
 if(!isDeepStrictEqual(identity(inspect(names.gateway)),identity(before.gateway)))throw Error('Gateway mudou antes da troca.');
 journal={phase:'starting',startedAt:new Date().toISOString(),sourceCommit:driverWebSource,oldBundleRoot:prepared.oldBundleRoot,bundleRoot:prepared.bundleRoot,gatewayImage:prepared.gatewayImage,asaasPayoutsEnabled:false,coreChanged:false,migrationApplied:false};
 writeFileSync(journalPath,JSON.stringify(journal,null,2),{mode:0o600,flag:'wx'});
 await switchDriverWeb({
  up:async()=>{console.log('Publicando somente os arquivos Web do motorista no gateway...');up('candidate');await barrier();},
  check:async()=>{await baseline();await checkPublic(prepared.bundleRoot);},
  verify:async()=>{checkGateway('candidate');untouched();await checkFiles();checkData();await barrier();},
  rollback:async()=>{console.log('Restaurando somente o mount Web anterior do gateway...');up('rollback');},
  verifyRollback:async()=>{await baseline();await checkPublic(prepared.oldBundleRoot);checkGateway('rollback');untouched();await checkFiles();checkData();},
 });
 journal.completedAt=new Date().toISOString();record('completed');
 console.log('WEB MOTORISTA PUBLICADA. Arquivos HTTPS conferidos por hash; passageiro preservado byte a byte.');
 console.log('Core, banco, migrations, política, site, ADM e provedores preservados. Envios Asaas continuam BLOQUEADOS.');
 console.log('Feche a aba antiga e abra https://app.ramonessa.com.br/motorista/ no Safari para conferir a Carteira.');
 console.log('Aceite funcional no aparelho ainda pendente. Nenhum repasse foi solicitado.');
}catch(error){
 if(journal){journal.rollbackComplete=error.rollbackComplete??null;journal.rollbackFailures=error.rollbackFailures??[];record(error.rollbackComplete===true?'rolled-back':'review-required');}
 writeFileSync(join(root,'activation-error.private.log'),String(error.stack??error),{mode:0o600});
 console.error(error.message??'Publicação requer conferência.');console.error('Nenhum banco foi restaurado ou repasse solicitado. Não repita; envie o resultado.');process.exitCode=1;
}finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,interrupt);unlinkSync(lock);}
