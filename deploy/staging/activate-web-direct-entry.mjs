// Explicit Web-only activation. The immutable Gateway image, ADM, Core, database,
// provider configuration and Caddy are retained. Old bundles stay available.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,readdirSync,openSync,closeSync,unlinkSync,existsSync,createReadStream} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {assertMapProviders} from './prepare-web-map-update.mjs';
import {directSource as mapWebSource,assertDirectWebDelta} from './prepare-web-direct-entry.mjs';
import {assertGatewayWebDelta} from './asaas-driver-web-contract.mjs';
import {assertWebGatewayRuntime,switchDriverWeb} from './asaas-driver-web-switch-contract.mjs';
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
const digest=b=>createHash('sha256').update(b).digest('hex');
export function directActivationArguments(args){
  if(args.length!==2||args[0]!=='/opt/ramo-nessa-regions/direct-entry-updates/'+mapWebSource.slice(0,12)||!(/^[a-f0-9]{64}$/).test(args[1]))throw Error('Informe a preparação revisada e seu SHA-256.');
  return {dir:args[0],sha256:args[1]};
}
export function assertDirectPlan(p){
  if(p.format!==1||p.sourceCommit!==mapWebSource||p.gatewayImage?.match(/^sha256:[a-f0-9]{64}$/)===null||!p.gatewayImage||!isDeepStrictEqual(p.scope,['passenger-web','driver-web'])||p.resetApplied!==false||p.servicesRestarted!==false||p.bundleRoot!=='/opt/ramo-nessa-web/releases/direct-'+mapWebSource.slice(0,12)+'/bundles'||!p.oldBundleRoot?.startsWith('/opt/ramo-nessa-web/releases/')||!p.caddy?.startsWith('/')||!p.sourceConfig?.startsWith('/'))throw Error('Plano Web inválido.');
  for(const k of ['newWebHash','oldWebHash','caddyHash','sourceConfigHash'])if(!/^[a-f0-9]{64}$/.test(p[k]??''))throw Error('Integridade do plano incompleta.');
  const expected=['runtime-before.private.json','gateway-image.private.json','candidate.compose.private.json','rollback.compose.private.json'].sort();
  if(!isDeepStrictEqual(Object.keys(p.planFiles??{}).sort(),expected)||Object.values(p.planFiles).some(v=>!/^[a-f0-9]{64}$/.test(v)))throw Error('Arquivos do plano sem integridade.');
}
export async function activateDirectWeb(args, rehearsal={}){
  const {dir,sha256}=directActivationArguments(args);
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
  const privateDir=p=>{const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Preparação privada divergente.');};privateDir(dir);privateDir(join(dir,'..'));
  const lock=join(dir,'..','operations.lock');closeSync(openSync(lock,'wx',0o600));
  const journal=join(dir,'activation.private.json');
  const writeJournal=v=>writeFileSync(journal,JSON.stringify({...v,at:new Date().toISOString()},null,2),{mode:0o600});
  function run(command,argv){const r=spawnSync(command,argv,{encoding:'utf8',timeout:180000,maxBuffer:64*1024**2,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});if(r.error||r.status!==0){writeFileSync(join(dir,'activation-command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Comando de ativação interrompido: '+command);}return r.stdout;}
  const docker=args=>run('docker',args),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0];
  async function hashFile(p){const s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink())throw Error('Arquivo regular obrigatório.');const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
  async function hashTree(root){const rows=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado no Web.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(root,f),s.size,await hashFile(f)]);else throw Error('Arquivo Web inesperado.');}}await visit(root);return digest(JSON.stringify(rows));}
  try{
    if(existsSync(journal))throw Error('Esta ativação já foi iniciada. Confira o registro antes de repetir.');
    if(await hashFile(join(dir,'prepared.private.json'))!==sha256)throw Error('SHA-256 da preparação divergente.');
    const p=JSON.parse(readFileSync(join(dir,'prepared.private.json')));assertDirectPlan(p);
    for(const [name,hash]of Object.entries(p.planFiles))if(await hashFile(join(dir,name))!==hash)throw Error('Arquivo do plano alterado: '+name);
    const before=JSON.parse(readFileSync(join(dir,'runtime-before.private.json'))),image=JSON.parse(readFileSync(join(dir,'gateway-image.private.json'))),candidate=JSON.parse(readFileSync(join(dir,'candidate.compose.private.json'))),rollback=JSON.parse(readFileSync(join(dir,'rollback.compose.private.json')));
    if(Object.keys(rehearsal).length&&(process.env.GITHUB_ACTIONS!=='true'||before.gateway.Config.Labels?.['br.com.ramonessa.regions-ci']!=='true'))throw Error('Falha de ensaio restrita ao fixture isolado do CI.');
    if(!before.core.Config.Env.includes('NODE_ENV=staging')||before.gateway.Image!==p.gatewayImage||image.Id!==p.gatewayImage)throw Error('Identidade de homologação divergente.');
    assertGatewayWebDelta(rollback,candidate,p.bundleRoot);
    assertWebGatewayRuntime(before.gateway,before.gateway,rollback,image,p.oldBundleRoot);
    for(const role of Object.keys(names))if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('Serviço mudou desde a preparação: '+role);
    const intact=async()=>{
      if(await hashFile(p.caddy)!==p.caddyHash||await hashFile(p.sourceConfig)!==p.sourceConfigHash||await hashTree(p.oldBundleRoot)!==p.oldWebHash||await hashTree(p.bundleRoot)!==p.newWebHash)throw Error('Arquivos mudaram desde a preparação.');
      for(const role of Object.keys(names).filter(r=>r!=='gateway'))if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('Serviço fora do escopo mudou: '+role);
    };
    await intact();assertMapProviders(p.oldBundleRoot,p.bundleRoot);assertDirectWebDelta(p.oldBundleRoot,p.bundleRoot);
    const compose=kind=>docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,kind+'.compose.private.json'),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','gateway']);
    const health=async()=>{for(let n=0;n<60;n++){if(inspect('gateway').State.Health?.Status==='healthy')return;await new Promise(r=>setTimeout(r,1000));}throw Error('Gateway não ficou saudável.');};
    const published=async(root)=>{
      const origin=before.gateway.Config.Labels?.['br.com.ramonessa.regions-ci']==='true'&&process.env.GITHUB_ACTIONS==='true'?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
      for(const [role,path]of [['passenger','passageiro'],['driver','motorista']])for(const name of ['index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js']){
        const response=await fetch(origin+'/'+path+'/'+name+'?direct-entry-review='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});
        if(!response.ok||digest(Buffer.from(await response.arrayBuffer()))!==await hashFile(join(root,role,name)))throw Error('Arquivo publicado divergente: '+role+'/'+name);
      }
    };
    const verify=async(model,root)=>{assertWebGatewayRuntime(before.gateway,inspect('gateway'),model,image,root);await intact();await published(root);};
    console.log('Atualizando somente a entrada dos aplicativos Web, com Core e ADM preservados...');
    writeJournal({phase:'switching',sourceCommit:mapWebSource});
    try{
      await switchDriverWeb({up:async()=>{compose('candidate');},check:health,verify:async()=>{await verify(candidate,p.bundleRoot);if(rehearsal.failAfterSwitch)throw Error('Falha sintética após troca verificada.');},rollback:async()=>{await intact();const current=inspect('gateway'),mounted=current.Mounts.find(m=>m.Destination==='/srv/web')?.Source;if(![p.bundleRoot,p.oldBundleRoot].includes(mounted))throw Error('Gateway alterado por outra operação; retorno automático recusado.');const guarded=structuredClone(current);guarded.State.Health={Status:'healthy'};assertWebGatewayRuntime(before.gateway,guarded,mounted===p.bundleRoot?candidate:rollback,image,mounted);compose('rollback');await health();},verifyRollback:async()=>verify(rollback,p.oldBundleRoot)});
    }catch(error){writeJournal({phase:error.rollbackComplete?'rolled-back':'requires-review',rollbackComplete:error.rollbackComplete===true,sourceCommit:mapWebSource});throw error;}
    writeJournal({phase:'completed',sourceCommit:mapWebSource,oldBundleRoot:p.oldBundleRoot,newBundleRoot:p.bundleRoot});
    console.log(JSON.stringify({status:'ENTRADA_DIRETA_ATUALIZADA',sourceCommit:mapWebSource,passengerWebUpdated:true,driverWebUpdated:true,coreUpdated:false,adminUpdated:false,resetApplied:false,nativeAppsUpdated:false,providerConfigurationPreserved:true,realDeviceAcceptancePending:true},null,2));
  }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await activateDirectWeb(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}

