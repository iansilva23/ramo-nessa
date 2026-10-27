// Driver-only mount switch over the currently running Gateway image/configuration.
// Existing Web bundles remain immutable. No Core, database, migration or provider write.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,openSync,closeSync,unlinkSync,cpSync,chmodSync,statfsSync,readdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {gatewayWebPlan,assertGatewayWebDelta,publicPushConfig,browserMapsKey} from './asaas-driver-web-contract.mjs';
import {assertWebGatewayRuntime,switchDriverWeb} from './asaas-driver-web-switch-contract.mjs';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {hashFile,hashTree,privateDir} from './google-search-update-io.mjs';
export const rideWebSource='28ff82ae8b922108f9208889b2f5bf3cdc215a6a';
export const rideWebNames={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',site:'ramo-nessa-site-institutional-site-1'};
export function installArguments(args){
 if(args.length!==2||!args[0].startsWith('/')||!args[0].endsWith('.zip')||!(/^[a-f0-9]{64}$/).test(args[1]))throw Error('Informe ZIP absoluto e SHA-256 do pacote.');
 return {archive:args[0],sha256:args[1]};
}
export function assertProviders(before,after){
 if(browserMapsKey(readFileSync(join(before,'index.html'),'utf8'))!==browserMapsKey(readFileSync(join(after,'index.html'),'utf8'))||!isDeepStrictEqual(publicPushConfig(readFileSync(join(before,'ramo_push_config.js'),'utf8')),publicPushConfig(readFileSync(join(after,'ramo_push_config.js'),'utf8'))))throw Error('Maps/Firebase diferem da versão ativa. Nada será publicado.');
}
export async function installDriverRideWeb(args,fixture={}){
 const request=installArguments(args);
 if(process.getuid?.()!==0)throw Error('Execute com sudo.');
 if(Object.keys(fixture).length&&process.env.GITHUB_ACTIONS!=='true')throw Error('Fixture restrito ao CI.');
 process.umask(0o077);
 const root=fixture.root??'/opt/ramo-nessa-driver-camera';
 mkdirSync(root,{recursive:true,mode:0o700});privateDir(root);
 const lock=join(root,'operations.lock');closeSync(openSync(lock,'wx',0o600));
 const dir=join(root,rideWebSource.slice(0,12)),release=fixture.release??'/opt/ramo-nessa-web/releases/driver-camera-'+rideWebSource.slice(0,12),names=fixture.names??rideWebNames;
 let phase='preflight',switched=false,interrupted=false;
 const signal=()=>{interrupted=true;};
 for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,signal);
 const barrier=()=>{if(interrupted)throw Error('Interrupção solicitada.');};
 const save=(n,v)=>writeFileSync(join(dir,n),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
 function run(cmd,argv){const r=spawnSync(cmd,argv,{encoding:'utf8',timeout:180000,maxBuffer:64*1024**2,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});if(r.error||r.status!==0){if(existsSync(dir))writeFileSync(join(dir,'command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Falha em '+cmd+' durante '+phase+'. Diagnóstico privado preservado.');}return r.stdout;}
 const docker=a=>run('docker',a),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0];
 try{
  if(existsSync(dir)||existsSync(release))throw Error('A instalação já foi preparada. Não repita; envie o resultado.');
  if(statfsSync(root).bavail*statfsSync(root).bsize<1024**3)throw Error('Espaço livre insuficiente.');
  const archiveStat=lstatSync(request.archive);
  if(!archiveStat.isFile()||archiveStat.isSymbolicLink()||archiveStat.size>128*1024**2||hashFile(request.archive)!==request.sha256)throw Error('Pacote difere do SHA-256 aprovado.');
  const before=Object.fromEntries(Object.keys(names).map(k=>[k,inspect(k)]));
  if(Object.keys(fixture).length&&before.gateway.Config.Labels?.['br.com.ramonessa.driver-ride-ci']!=='true')throw Error('Fixture não marcado.');
  for(const [role,c]of Object.entries(before))if(!c.State.Running||c.State.Health?.Status!=='healthy')throw Error('Serviço não saudável: '+role);
  if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('Runtime de homologação não confirmado.');
  const web=before.gateway.Mounts.filter(m=>m.Destination==='/srv/web'),caddies=before.gateway.Mounts.filter(m=>m.Destination==='/etc/caddy/Caddyfile');
  if(web.length!==1||web[0].Type!=='bind'||web[0].RW!==false||caddies.length!==1||caddies[0].Type!=='bind'||caddies[0].RW!==false)throw Error('Mounts Web/Caddy não confirmados.');
  const oldRoot=web[0].Source,caddy=caddies[0].Source,configPaths=(before.gateway.Config.Labels?.['com.docker.compose.project.config_files']??'').split(',').filter(Boolean);
  if(configPaths.length!==1||!configPaths[0].startsWith('/'))throw Error('Compose ativo exige conferência.');
  const config=configPaths[0],configStat=lstatSync(config);
  if(!configStat.isFile()||configStat.isSymbolicLink()||configStat.uid!==0)throw Error('Compose precisa ser arquivo regular de root.');
  const raw=JSON.parse(readFileSync(config,'utf8'));
  if(raw.name!=='ramo-nessa-staging'||raw.services?.gateway?.env_file)throw Error('Compose ativo não é autocontido.');
  const configHash=hashFile(config),caddyHash=hashFile(caddy),oldHash=hashTree(oldRoot),passengerHash=hashTree(join(oldRoot,'passenger'));
  const image=JSON.parse(docker(['image','inspect',before.gateway.Image]))[0];
  const resolved=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',config,'config','--format','json']));
  assertEnvironmentMatches(resolved.services.gateway,before.gateway,image);
  mkdirSync(dir,{mode:0o700});save('runtime-before.private.json',before);save('gateway-image.private.json',image);
  mkdirSync(release,{recursive:true,mode:0o755});chmodSync(release,0o755);
  const bundleRoot=join(release,'bundles');mkdirSync(bundleRoot,{mode:0o755});chmodSync(bundleRoot,0o755);
  const here=dirname(fileURLToPath(import.meta.url));
  console.log('Conferindo o pacote e copiando o Passageiro atual sem alterar seus arquivos...');
  const staged=JSON.parse(run('python3',[join(here,'stage-driver-camera.py'),'--archive',request.archive,'--sha256',request.sha256,'--output',join(bundleRoot,'driver')]));
  run(process.execPath,[join(here,'../../scripts/web/verify_web_bundle.mjs'),'--role=driver','--dist='+join(bundleRoot,'driver')]);
  assertProviders(join(oldRoot,'driver'),join(bundleRoot,'driver'));
  cpSync(join(oldRoot,'passenger'),join(bundleRoot,'passenger'),{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true});
  if(hashTree(join(bundleRoot,'passenger'))!==passengerHash)throw Error('Passageiro copiado diverge da versão ativa.');
  save('release.driver.private.json',staged.manifest);
  const rollback=servicePlan(resolved,'gateway',before.gateway,before.gateway.Image),candidate=gatewayWebPlan(rollback,bundleRoot);
  assertGatewayWebDelta(rollback,candidate,bundleRoot);
  for(const [kind,model]of Object.entries({rollback,candidate})){
   save(kind+'.compose.private.json',model);
   const parsed=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,kind+'.compose.private.json'),'config','--format','json']));
   if(!isDeepStrictEqual(parsed.services.gateway.environment,model.services.gateway.environment))throw Error('Ambiente mudou na releitura Compose.');
  }
  const newHash=hashTree(bundleRoot),planHashes=Object.fromEntries(['candidate.compose.private.json','rollback.compose.private.json','runtime-before.private.json','gateway-image.private.json'].map(n=>[n,hashFile(join(dir,n))]));
  save('prepared.private.json',{source:rideWebSource,oldRoot,bundleRoot,oldHash,newHash,caddy,caddyHash,config,configHash,planHashes,archiveSha256:request.sha256,passengerHash,createdAt:new Date().toISOString()});
  const intact=()=>{
   barrier();
   if(hashFile(config)!==configHash||hashFile(caddy)!==caddyHash||hashTree(oldRoot)!==oldHash||hashTree(bundleRoot)!==newHash)throw Error('Configuração ou bundles mudaram durante a operação.');
   for(const [n,h]of Object.entries(planHashes))if(hashFile(join(dir,n))!==h)throw Error('Plano de recuperação alterado.');
   for(const k of Object.keys(names).filter(k=>k!=='gateway'))if(runtimeIdentity(inspect(k))!==runtimeIdentity(before[k]))throw Error('Serviço fora do escopo mudou: '+k);
  };
  const origin=fixture.origin??'https://app.ramonessa.com.br',requestHttp=fixture.request??fetch;
  async function checkFile(root,role,file){
   const prefix=role==='driver'?'motorista':'passageiro';
   const r=await requestHttp(origin+'/'+prefix+'/'+(file==='index.html'?'':file)+'?ride-review='+Date.now(),{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(30000)});
   const bytes=Buffer.from(await r.arrayBuffer());
   const {createHash}=await import('node:crypto');
   if(r.status!==200||createHash('sha256').update(bytes).digest('hex')!==hashFile(join(root,role,file)))throw Error('Arquivo público divergente: '+role+'/'+file);
  }
  const publicFiles=async(root)=>{
   for(const role of ['driver','passenger'])for(const f of ['index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js'])await checkFile(root,role,f);
   for(const path of ['/ready','/administrodo/']){const r=await requestHttp(origin+path,{redirect:'manual',signal:AbortSignal.timeout(30000)});await r.arrayBuffer();if(r.status!==200)throw Error('Rota indisponível: '+path);}
  };
  const verifyRuntime=(model,root,healthy=true)=>{const current=inspect('gateway');if(!healthy)current.State.Health={Status:'healthy'};assertWebGatewayRuntime(before.gateway,current,model,image,root);for(const k of ['Tmpfs','ShmSize','Dns','ExtraHosts','Ulimits','GroupAdd','Init'])if(!isDeepStrictEqual(current.HostConfig[k]??null,before.gateway.HostConfig[k]??null))throw Error('Opção Gateway divergente: '+k);for(const k of ['WorkingDir','Healthcheck','StopSignal'])if(!isDeepStrictEqual(current.Config[k]??null,before.gateway.Config[k]??null))throw Error('Inicialização Gateway divergente: '+k);};
  const health=async()=>{for(let n=0;n<90;n++){const c=inspect('gateway');if(c.State.Running&&c.State.Health?.Status==='healthy')return;await new Promise(r=>setTimeout(r,1000));}throw Error('Gateway não ficou saudável.');};
  const up=kind=>{phase='gateway-'+kind;docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,kind+'.compose.private.json'),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','gateway']);};
  intact();verifyRuntime(rollback,oldRoot);await publicFiles(oldRoot);intact();
  if(runtimeIdentity(inspect('gateway'))!==runtimeIdentity(before.gateway))throw Error('Gateway mudou antes da troca.');
  save('activation.private.json',{phase:'switching',at:new Date().toISOString(),source:rideWebSource});
  try{
   await switchDriverWeb({
    up:async()=>{console.log('Atualizando somente o Motorista Web...');switched=true;if(fixture.failWithMissingGateway){docker(['rm','-f',names.gateway]);throw Error('Falha sintética de recriação sem container.');}up('candidate');},
    check:health,
    verify:async()=>{verifyRuntime(candidate,bundleRoot);intact();await publicFiles(bundleRoot);intact();if(fixture.failAfterSwitch)throw Error('Falha sintética de verificação.');},
    rollback:async()=>{interrupted=false;intact();const probe=spawnSync('docker',['inspect',names.gateway],{encoding:'utf8',timeout:30000});if(probe.status===0){const current=JSON.parse(probe.stdout)[0],mounted=current.Mounts.find(m=>m.Destination==='/srv/web')?.Source;if(![oldRoot,bundleRoot].includes(mounted))throw Error('Gateway de outra operação; retorno recusado.');verifyRuntime(mounted===bundleRoot?candidate:rollback,mounted,false);}else if(probe.error||!/No such (object|container)/i.test(probe.stderr??'')){throw Error('Não foi possível confirmar se o Gateway está ausente. Retorno requer conferência.');}up('rollback');await health();},
    verifyRollback:async()=>{verifyRuntime(rollback,oldRoot);intact();await publicFiles(oldRoot);},
   });
  }catch(e){writeFileSync(join(dir,'result.private.json'),JSON.stringify({phase:e.rollbackComplete?'rolled-back':'requires-review',rollbackComplete:e.rollbackComplete===true,error:e.message}),{mode:0o600});throw e;}
  phase='completed';save('result.private.json',{phase,source:rideWebSource,driverWebUpdated:true,passengerPreserved:true,coreUpdated:false,adminUpdated:false,nativeAppsUpdated:false,oldRoot,bundleRoot});
  console.log('MOTORISTA WEB ATUALIZADO. Passageiro, ADM, Core, banco e provedores preservados.');
  console.log('Abra novamente https://app.ramonessa.com.br/motorista/ para conferir o mapa e os controles. Android/iOS não foram publicados.');
  return {phase,bundleRoot,oldRoot};
 }catch(e){if(existsSync(dir))writeFileSync(join(dir,'error.private.log'),String(e.stack??e),{mode:0o600});if(!switched)console.error('Nenhum serviço ativo foi alterado.');throw e;}
 finally{for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.off(s,signal);unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await installDriverRideWeb(process.argv.slice(2));}catch(e){console.error(e.message);console.error('Envie este resultado antes de repetir a instalação.');process.exitCode=1;}}
