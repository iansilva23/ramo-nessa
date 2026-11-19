// Scoped passenger directory fix. No migrations, account rewrites or app rollout.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,openSync,closeSync,unlinkSync,statfsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {backup,validate,runtimeIdentity} from './backup-regions-pricing.mjs';
import {makeModels,assertRuntime} from './regions-activation-contract.mjs';
import {assertCoreRuntime,assertImageDelta,names} from './google-search-update-contract.mjs';
import {coreSourceFingerprintProgram} from './inspect-regions-pricing.mjs';
import {hashFile,hashTree,digest,privateDir} from './google-search-update-io.mjs';
import {parseAdminHashes} from './update-admin-organization.mjs';

export const source='ec4bc00d6ffd8d3d5708fdd97a49f3d2e18ddb25';
export const baseCore='8af62ee4b103d1433510605b0dd4ea66b2d8cb83';
export const baseAdmin='c4adb9fd2c6a2b0bfc50de831a7a05ad55acf0da';
export const oldCoreHash='4bf28bfb9028347dcb5a6be7799b5c56a648726e8c133db1940507c6a5da590e';
export const newCoreHash='13ad9d9c249888b2c58304bb71093b85a9562c00126b884b4572c69098dd9575';
export const lockHash='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const coreFiles=['auth/repositories/in-memory-auth-otp-repository.js','auth/repositories/postgres-auth-otp-repository.js','server.js'];
export const adminFiles=['admin-workspace.css','pages/passengers.html','src/app.js','src/passenger-directory.js'];
export function checkArguments(args){if(args.length!==1||args[0]!==source)throw Error('Informe somente a revisão completa da correção aprovada.');}
export function checkDelta(old,next,allowed){
 for(const [p,h]of Object.entries(old))if(!Object.hasOwn(next,p)||(next[p]!==h&&!allowed.includes(p)))throw Error('Alteração fora do escopo: '+p);
 for(const p of Object.keys(next))if(!Object.hasOwn(old,p)&&!allowed.includes(p))throw Error('Arquivo novo fora do escopo: '+p);
 for(const p of allowed)if(!Object.hasOwn(next,p))throw Error('Pacote incompleto: '+p);
}
export async function updatePassengerName(args,{testAfterCore,testAfterSwitch}={}){
 checkArguments(args);if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
 const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_ADMIN_CI_ORIGIN==='http://127.0.0.1:18080';
 if((process.env.RAMO_ADMIN_CI_ORIGIN||testAfterCore||testAfterSwitch)&&!ci)throw Error('Ensaio permitido somente no runner isolado.');
 const repo='/opt/ramo-nessa',root='/opt/ramo-nessa-passenger-name/updates';mkdirSync(root,{recursive:true,mode:0o700});privateDir(root);
 const lock=join(root,'operations.lock');closeSync(openSync(lock,'wx',0o600));
 let dir,phase='preflight',attempted=false,recovering=false,interrupted=false,before,models={},images={},webRoot,webHash,caddyPath,caddyHash,policyHash;
 const configs=new Map(),signal=()=>{interrupted=true;};for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,signal);
 const barrier=async()=>{await new Promise(setImmediate);if(interrupted&&!recovering)throw Error('Interrupção solicitada.');};
 const record=value=>{phase=value;if(dir)writeFileSync(join(dir,'journal.private.json'),JSON.stringify({phase,source,at:new Date().toISOString(),scope:['core-passenger-directory','static-admin'],resetApplied:false},null,2),{mode:0o600});};
 function run(command,args,extra={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:64*1024**2,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe'],...extra});if(r.error||r.status!==0){if(dir)writeFileSync(join(dir,'last-command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Etapa não concluída: '+phase+' ('+command+'). Detalhes privados preservados.');}return r.stdout;}
 const docker=args=>run('docker',args),git=args=>run('git',['-c','safe.directory='+repo,'-C',repo,...args]);
 const inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0],image=id=>JSON.parse(docker(['image','inspect',id]))[0];
 const save=(name,value)=>writeFileSync(join(dir,name),typeof value==='string'?value:JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
 const fingerprint=(id,running=false)=>JSON.parse(docker(running?['exec',id,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']:['run','--rm','--network','none','--read-only','--entrypoint','node',id,'--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
 function checkFingerprint(f,hash){if(f.source?.sha256!==hash||f.packageLockSha256!==lockHash)throw Error('O Core difere da versão auditada. Nenhum trabalho será sobrescrito.');}
 const inventory='cd /srv/admin && test -z "$(find . -type l -print)" && find . -type f -exec sha256sum {} \\;';
 const adminHashes=(id,running=false)=>parseAdminHashes(docker(running?['exec',id,'sh','-c',inventory]:['run','--rm','--network','none','--read-only','--entrypoint','sh',id,'-c',inventory]));
 function sourceHashes(rev){return Object.fromEntries(git(['ls-tree','-r','--name-only',rev,'--','apps/admin']).trim().split('\n').filter(p=>/^apps\/admin\/(?:index\.html|styles\.css|guide\.css|admin-workspace\.css|favicon\.svg|src\/|pages\/)/.test(p)).map(p=>[p.slice(11),digest(git(['show',rev+':'+p]))]));}
 const origin=ci?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
 async function http(path,status=200,base=origin){for(let n=0;n<5;n++){await barrier();try{const r=await fetch(base+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});const b=Buffer.from(await r.arrayBuffer());if(r.status===status&&b.length<64*1024**2)return b;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Verificação HTTP não concluída: '+path);}
 async function publicAdmin(hashes){const rows=Object.entries(hashes);for(let n=0;n<rows.length;n+=6)await Promise.all(rows.slice(n,n+6).map(async([p,h])=>{if(digest(await http('/administrodo/'+p))!==h)throw Error('Arquivo público do ADM divergente: '+p);}));}
 async function publicWeb(){for(const [role,path]of [['passenger','/passageiro/'],['driver','/motorista/']])for(const p of ['index.html','main.dart.js','flutter_bootstrap.js'])if(digest(await http(path+p))!==hashFile(join(webRoot,role,p)))throw Error('Aplicativo Web divergente.');}
 async function health(){for(const p of ['/health','/ready','/administrodo/','/passageiro/','/motorista/'])await http(p);await http('/v1/admin/passengers?query=nome',401);await http('/v1/admin/finance',401);await http('/',200,ci?origin:'https://ramonessa.com.br');await http('/api/health',200,ci?origin:'https://ramonessa.com.br');}
 function untouched(){for(const r of ['postgres','maps','site']){const current=inspect(r);if(runtimeIdentity(current)!==runtimeIdentity(before[r])||(current.State.Health&&current.State.Health.Status!=='healthy'))throw Error('Serviço fora do escopo mudou: '+r);}}
 async function filesUnchanged({checkPolicy=true}={}){for(const [path,bytes]of configs)if(!readFileSync(path).equals(bytes))throw Error('Compose ativo mudou.');if(hashTree(webRoot)!==webHash||hashFile(caddyPath)!==caddyHash)throw Error('Aplicativos ou Caddy mudaram.');if(checkPolicy&&digest(await http('/v1/pricing/policy'))!==policyHash)throw Error('Política de preços mudou; exige conferência.');}
 const compose=(role,kind)=>['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,role+'-'+kind+'.private.json')];
 function runtime(role,kind,healthy=true,current=inspect(role)){const checked=structuredClone(current);if(!healthy)checked.State.Health={Status:'healthy'};if(role==='core')assertCoreRuntime(before.core,checked,models.core[kind],images.core[kind]);else assertRuntime(before.gateway,checked,'gateway',images.gateway[kind],models.gateway[kind],webRoot);}
 async function up(role,kind){docker([...compose(role,kind),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90',role]);runtime(role,kind);}
 async function restore(role){
  const probe=spawnSync('docker',['inspect',names[role]],{encoding:'utf8'});
  if(probe.status===0){const current=JSON.parse(probe.stdout)[0],kind=current.Image===images[role].candidate.Id?'candidate':current.Image===images[role].rollback.Id?'rollback':null;if(!kind)throw Error('Implantação concorrente; retorno recusou outra imagem.');runtime(role,kind,false,current);if(current.Id===before[role].Id&&current.State.Health?.Status==='healthy')return;}
  else if(docker(['ps','-a','--format','{{.Names}}']).trim().split('\n').includes(names[role]))throw Error('Contêiner de retorno não pôde ser identificado.');
  await up(role,'rollback');
 }
 try{
  console.log('Conferindo a versão atual do Core e do ADM...');
  before=Object.fromEntries(Object.keys(names).map(r=>[r,inspect(r)]));validate(before,{'core-image':before.core.Image,'gateway-image':before.gateway.Image});
  if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('Ambiente diferente do revisado.');
  if(ci&&before.core.Config.Labels?.['br.com.ramonessa.regions-ci']!=='true')throw Error('Fixture isolado ausente.');
  if(before.gateway.Mounts.some(m=>m.Destination==='/srv/admin'||m.Destination.startsWith('/srv/admin/')))throw Error('ADM montado externamente exige revisão.');
  webRoot=before.gateway.Mounts.find(m=>m.Destination==='/srv/web').Source;caddyPath=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile').Source;
  webHash=hashTree(webRoot);caddyHash=hashFile(caddyPath);await health();await publicWeb();
  const policy=await http('/v1/pricing/policy');if(JSON.parse(policy).managementMode!=='managed')throw Error('Catálogo gerenciado precisa estar ativo.');policyHash=digest(policy);
  const oldAdmin=sourceHashes(baseAdmin),nextAdmin=sourceHashes(source);checkDelta(oldAdmin,nextAdmin,adminFiles);
  const currentAdmin=adminHashes(before.gateway.Id,true),currentCore=fingerprint(before.core.Id,true);
  if(currentCore.source.sha256===newCoreHash&&isDeepStrictEqual(currentAdmin,nextAdmin)){checkFingerprint(currentCore,newCoreHash);await publicAdmin(nextAdmin);console.log(JSON.stringify({status:'PASSAGEIROS_NOME_JA_ATUALIZADO',servicesRestarted:false}));return;}
  checkFingerprint(currentCore,oldCoreHash);if(!isDeepStrictEqual(currentAdmin,oldAdmin))throw Error('O ADM difere da versão auditada. Nenhum trabalho será sobrescrito.');await publicAdmin(oldAdmin);
  const nonce=randomBytes(8).toString('hex');dir=join(root,new Date().toISOString().replace(/[:.]/g,'-')+'-'+nonce);mkdirSync(dir,{mode:0o700});record('preparing');
  save('runtime-before.private.json',before);
  for(const role of ['core','gateway']){
   const paths=(before[role].Config.Labels?.['com.docker.compose.project.config_files']??'').split(',');if(paths.length!==1||!paths[0].startsWith('/'))throw Error('Origem Compose exige conferência.');
   const stat=lstatSync(paths[0]);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0)throw Error('Compose deve ser arquivo regular de root.');
   const bytes=readFileSync(paths[0]),raw=JSON.parse(bytes);if(raw.name!=='ramo-nessa-staging'||!raw.services?.[role]||raw.services[role].env_file)throw Error('Compose precisa ser autocontido.');configs.set(paths[0],bytes);save(role+'-source.private.json',bytes.toString());
   const resolved=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',paths[0],'config','--format','json']));
   images[role]={rollback:image(before[role].Image)};models[role]={resolved};
  }
  const needed=Math.max(3*1024**3,(images.core.rollback.Size+images.gateway.rollback.Size)*4);if(statfsSync(root).bavail*statfsSync(root).bsize<needed)throw Error('Espaço insuficiente para compilar e guardar o retorno.');
  const fd=openSync(join(dir,'source.tar'),'wx',0o600);try{run('git',['-c','safe.directory='+repo,'-C',repo,'archive',source,'backend/core','apps/admin'],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}run('tar',['-xf',join(dir,'source.tar'),'-C',dir]);
  const builder='ramo-passenger-name-builder:'+nonce;
  console.log('Compilando a correção com dependências fixadas; configurações ativas não são usadas na compilação...');
  docker(['build','--target','build','--tag',builder,join(dir,'backend/core')]);checkFingerprint(fingerprint(image(builder).Id),newCoreHash);
  for(const role of ['core','gateway']){
   const base='ramo-passenger-name-'+role+'-base:'+nonce,tag='ramo-passenger-name-'+role+':'+nonce;docker(['tag',before[role].Image,base]);
   const instructions=role==='core'?coreFiles.flatMap(p=>[p,p+'.map']).map(p=>'COPY --from='+builder+' --chmod=0644 /app/dist/src/'+p+' /app/dist/src/'+p):adminFiles.map(p=>'COPY --chmod=0644 '+p+' /srv/admin/'+p);
   const dockerfile=join(dir,role+'.Dockerfile');save(role+'.Dockerfile','FROM '+base+'\n'+instructions.join('\n')+'\n');
   docker(['build','--network','none','--pull=false','--file',dockerfile,'--tag',tag,join(dir,role==='core'?'backend/core':'apps/admin')]);
   images[role].candidate=image(tag);assertImageDelta(images[role].rollback,images[role].candidate);
   models[role]=makeModels(models[role].resolved,role,before[role],images[role].rollback,images[role].candidate,webRoot);
   for(const kind of ['candidate','rollback']){save(role+'-'+kind+'.private.json',models[role][kind]);const round=JSON.parse(docker([...compose(role,kind),'config','--format','json']));if(!isDeepStrictEqual(round.services[role].environment,models[role][kind].services[role].environment))throw Error('Ambiente mudou na releitura do Compose.');}
  }
  checkFingerprint(fingerprint(images.core.candidate.Id),newCoreHash);if(!isDeepStrictEqual(adminHashes(images.gateway.candidate.Id),nextAdmin))throw Error('Arquivos da candidata ADM divergentes.');
  save('images.private.json',images);save('manifest.private.json',{source,oldCoreHash,newCoreHash,oldAdmin,nextAdmin,webHash,caddyHash});
  console.log('Criando backup verificado de banco, documentos, imagens e configurações...');record('backup');
  await backup(['--core-image='+before.core.Image,'--gateway-image='+before.gateway.Image]);
  untouched();await filesUnchanged();for(const role of ['core','gateway'])if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('Serviço mudou durante a preparação.');await barrier();
  attempted=true;record('switching-core');console.log('Atualizando a busca de passageiros no servidor...');await up('core','candidate');await barrier();if(testAfterCore)await testAfterCore();
  record('switching-admin');console.log('Atualizando somente a exibição de passageiros no ADM...');await up('gateway','candidate');await barrier();
  await health();await publicAdmin(nextAdmin);await publicWeb();untouched();await filesUnchanged();if(testAfterSwitch)await testAfterSwitch();await barrier();record('completed');
  console.log(JSON.stringify({status:'PASSAGEIROS_NOME_ATUALIZADO',source,passengerNamesPrimary:true,nameSearch:true,accountIdsPreserved:true,nativeAppsUpdated:false,passengerWebUpdated:false,driverWebUpdated:false,resetApplied:false,migrationsApplied:false,providerConfigurationPreserved:true,realDeviceAcceptancePending:true},null,2));
 }catch(error){
  if(dir)writeFileSync(join(dir,'error.private.log'),error.stack??String(error),{mode:0o600});
  if(attempted){recovering=true;record('recovering');try{untouched();await filesUnchanged({checkPolicy:false});await restore('gateway');await restore('core');await health();await publicAdmin(sourceHashes(baseAdmin));await publicWeb();untouched();await filesUnchanged();record('rolled-back');}catch(recovery){if(dir)writeFileSync(join(dir,'recovery.private.log'),recovery.stack??String(recovery),{mode:0o600});record('review-required');throw Error('Retorno exige conferência. Não repita o comando; registros privados preservados.');}throw Error('Atualização interrompida; versão anterior restaurada e conferida.');}
  throw error;
 }finally{for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.off(s,signal);unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await updatePassengerName(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
