// Authorized live ADM-only design update. The existing project is named staging.
// No database, catalog, Core, provider, feature flag or app rollout.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,readdirSync,openSync,closeSync,unlinkSync,existsSync,createReadStream,statfsSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validate,runtimeIdentity} from './backup-regions-pricing.mjs';
import {makeModels,assertRuntime} from './regions-activation-contract.mjs';

export const adminSourceRevision='d3e8c5e7c471221b3477aff40b69a46a9b50e5df';
export const adminBaseRevision='3c5fa5e5ab635fac7654895d5a4bd6909cd6360a';
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
const changedFiles=new Set(['admin-workspace.css','src/admin-components.js','src/admin-workspace.js','src/app.js','src/boarding-admin.js','src/manual-refunds-admin.js','src/ride-occurrences-admin.js']);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function checkAdminDelta(oldFiles,newFiles){
  for(const [file,hash]of Object.entries(oldFiles))if(newFiles[file]!==hash&&(!changedFiles.has(file)||!Object.hasOwn(newFiles,file)))throw Error('Alteração do ADM fora do escopo: '+file);
  for(const file of Object.keys(newFiles))if(!Object.hasOwn(oldFiles,file)&&!changedFiles.has(file))throw Error('Arquivo novo fora do escopo: '+file);
  for(const file of [...changedFiles,'src/admin-workspace-bootstrap.js','guide.css','manual-refunds.css','company-dashboard.css'])if(!Object.hasOwn(newFiles,file))throw Error('Pacote do ADM incompleto: '+file);
}
export function parseAdminHashes(output){
  const result={};
  for(const line of output.trim().split('\n')){
    const match=/^([a-f0-9]{64})\s+\.\/([a-zA-Z0-9_./-]+)$/.exec(line);
    if(!match||match[2].split('/').includes('..')||Object.hasOwn(result,match[2]))throw Error('Inventário de arquivos inválido.');
    result[match[2]]=match[1];
  }
  return result;
}
export function checkAdminArguments(args){
  if(args.length!==1||args[0]!==adminSourceRevision)throw Error('Informe a revisão completa da design do ADM aprovada.');
}
export async function updateAdmin(args,{testAfterSwitch}={}){
  checkAdminArguments(args);
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');
  process.umask(0o077);
  const ci=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_ADMIN_CI_ORIGIN==='http://127.0.0.1:18080';
  if((process.env.RAMO_ADMIN_CI_ORIGIN||testAfterSwitch)&&!ci)throw Error('Ensaio recusado fora do runner autorizado.');
  const repo='/opt/ramo-nessa',root='/opt/ramo-nessa-admin-design/updates';
  mkdirSync(root,{recursive:true,mode:0o700});
  const privateRoot=lstatSync(root);if(!privateRoot.isDirectory()||privateRoot.isSymbolicLink()||privateRoot.uid!==0||(privateRoot.mode&0o077))throw Error('Pasta operacional precisa ser privada e pertencer ao root.');
  const lock=join(root,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  let dir,phase='preflight',attempted=false,interrupted=false,recovering=false,journal,before,models,images,webRoot,webHash,caddyPath,caddyHash,flagsBefore;
  const sources=new Map(),onSignal=()=>{interrupted=true;};
  for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,onSignal);
  function record(next){phase=next;if(journal){journal.phase=next;journal.updatedAt=new Date().toISOString();writeFileSync(join(dir,'journal.private.json'),JSON.stringify(journal,null,2),{mode:0o600});}}
  function run(command,argv,extra={}){
    const r=spawnSync(command,argv,{encoding:'utf8',maxBuffer:64*1024**2,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH},...extra});
    if(r.error||r.status!==0){if(dir)writeFileSync(join(dir,'last-command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Etapa não concluída: '+phase+'. Detalhes privados preservados.');}
    return r.stdout;
  }
  const docker=argv=>run('docker',argv),git=argv=>run('git',['-c','safe.directory='+repo,'-C',repo,...argv]);
  const inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0];
  const image=id=>JSON.parse(docker(['image','inspect',id]))[0];
  const featureFlags=()=>JSON.parse(docker(['exec',names.core,'node','--input-type=module','-e',`
    import {createPostgresPool} from './dist/src/db/postgres.js';
    const pool=createPostgresPool(process.env.DATABASE_URL),client=await pool.connect();
    try {await client.query('BEGIN READ ONLY');
      const a=(await client.query('SELECT enabled FROM ride_boarding_policy')).rows[0];
      const b=(await client.query('SELECT enabled,bonus_enabled FROM ride_occurrence_policy')).rows[0];
      if(!a||!b)throw Error('Policy not found');
      console.log(JSON.stringify({boardingEnabled:a.enabled,occurrencesEnabled:b.enabled,bonusEnabled:b.bonus_enabled}));
      await client.query('ROLLBACK');
    } finally {client.release();await pool.end();}
  `]).trim());
  const save=(file,value)=>writeFileSync(join(dir,file),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
  const barrier=async()=>{await new Promise(setImmediate);if(interrupted&&!recovering)throw Error('Interrupção solicitada.');};
  async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
  async function treeHash(path){const rows=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado nos arquivos.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(path,f),s.size,await fileHash(f)]);else throw Error('Tipo de arquivo inesperado.');}}await visit(path);return digest(JSON.stringify(rows));}
  const inventoryCommand='cd /srv/admin && test -z "$(find . -type l -print)" && find . -type f -exec sha256sum {} \\;';
  const installedHashes=()=>parseAdminHashes(docker(['exec',names.gateway,'sh','-c',inventoryCommand]));
  const imageHashes=id=>parseAdminHashes(docker(['run','--rm','--network','none','--read-only','--entrypoint','sh',id,'-c',inventoryCommand]));
  function sourceHashes(revision){
    const paths=git(['ls-tree','-r','--name-only',revision,'--','apps/admin']).trim().split('\n')
      .filter(p=>/^apps\/admin\/(?:index\.html|styles\.css|guide\.css|admin-workspace\.css|manual-refunds\.css|company-dashboard\.css|favicon\.svg|src\/|pages\/)/.test(p));
    const result={};
    for(const path of paths){if(!/^[a-zA-Z0-9_./-]+$/.test(path))throw Error('Caminho de fonte inválido.');result[path.slice('apps/admin/'.length)]=digest(git(['show',revision+':'+path]));}
    return result;
  }
  const origin=ci?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
  const siteOrigin=ci?origin:'https://ramonessa.com.br';
  async function http(path,status=200,base=origin){
    for(let i=0;i<3;i++){await barrier();try{const r=await fetch(base+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(10000)});const bytes=Buffer.from(await r.arrayBuffer());if(r.status===status&&bytes.length<64*1024**2)return bytes;}catch{}await new Promise(r=>setTimeout(r,400));}
    throw Error('Verificação HTTP não concluída: '+path);
  }
  async function baseline(){for(const path of ['/health','/ready','/administrodo/','/passageiro/','/motorista/'])await http(path);await http('/v1/admin/finance',401);await http('/',200,siteOrigin);await http('/api/health',200,siteOrigin);}
  async function publicAdmin(hashes){const entries=Object.entries(hashes);for(let i=0;i<entries.length;i+=6)await Promise.all(entries.slice(i,i+6).map(async([file,hash])=>{if(digest(await http('/administrodo/'+file))!==hash)throw Error('Arquivo público do ADM divergente: '+file);}));}
  async function publicWeb(){for(const [role,path]of [['passenger','/passageiro/'],['driver','/motorista/']])for(const file of ['index.html','main.dart.js','flutter_bootstrap.js'])if(digest(await http(path+file))!==await fileHash(join(webRoot,role,file)))throw Error('Aplicativo Web divergente.');}
  function untouched(){for(const role of ['core','postgres','maps','site']){const current=inspect(role);if(runtimeIdentity(current)!==runtimeIdentity(before[role])||(current.State.Health&&current.State.Health.Status!=='healthy'))throw Error('Serviço fora do escopo mudou: '+role);}}
  async function filesUnchanged(){for(const [path,bytes]of sources)if(!readFileSync(path).equals(bytes))throw Error('Configuração de origem mudou.');if(await fileHash(caddyPath)!==caddyHash||await treeHash(webRoot)!==webHash)throw Error('Caddy ou aplicativos Web mudaram.');}
  const compose=kind=>['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,kind+'.compose.private.json')];
  function checkRuntime(kind){assertRuntime(before.gateway,inspect('gateway'),'gateway',images[kind],models[kind],webRoot);}
  async function rollback(oldHashes){
    recovering=true;record('recovering');untouched();await filesUnchanged();
    const r=spawnSync('docker',['inspect',names.gateway],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
    if(r.status===0){
      const current=JSON.parse(r.stdout)[0],kind=current.Image===images.candidate.Id?'candidate':current.Image===images.rollback.Id?'rollback':null;
      if(!kind)throw Error('Implantação concorrente: retorno não sobrescreverá outra imagem.');
      const checked=structuredClone(current);checked.State.Health={Status:'healthy'};
      assertRuntime(before.gateway,checked,'gateway',images[kind],models[kind],webRoot);
      if(current.Id===before.gateway.Id){await baseline();await publicAdmin(oldHashes);return;}
    }else if(docker(['ps','-a','--format','{{.Names}}']).trim().split('\n').includes(names.gateway))throw Error('Gateway não pôde ser identificado para retorno.');
    docker([...compose('rollback'),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90','gateway']);
    checkRuntime('rollback');await baseline();await publicAdmin(oldHashes);await publicWeb();untouched();await filesUnchanged();
  }
  try{
    console.log('Conferindo o ADM instalado e preservando a operação atual...');
    before=Object.fromEntries(Object.keys(names).map(role=>[role,inspect(role)]));
    validate(before,{'core-image':before.core.Image,'gateway-image':before.gateway.Image});
    if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('O projeto de execução mudou. Nada será alterado.');
    if(ci&&before.core.Config.Labels?.['br.com.ramonessa.regions-ci']!=='true')throw Error('Fixture CI não identificado.');
    if(before.gateway.Mounts.some(m=>m.Destination==='/srv/admin'||m.Destination.startsWith('/srv/admin/')))throw Error('ADM montado externamente exige revisão.');
    flagsBefore=featureFlags();
    const oldHashes=sourceHashes(adminBaseRevision),newHashes=sourceHashes(adminSourceRevision);checkAdminDelta(oldHashes,newHashes);
    const current=installedHashes();
    webRoot=before.gateway.Mounts.find(m=>m.Destination==='/srv/web').Source;
    caddyPath=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile').Source;
    webHash=await treeHash(webRoot);caddyHash=await fileHash(caddyPath);
    await baseline();
    const policy=JSON.parse((await http('/v1/pricing/policy')).toString());if(policy.managementMode!=='managed')throw Error('O catálogo gerenciado ainda não está ativo; não será preparado por esta atualização.');
    if(isDeepStrictEqual(current,newHashes)){await publicAdmin(newHashes);await publicWeb();console.log(JSON.stringify({status:'ADM_JA_ATUALIZADO',revision:adminSourceRevision,servicesRestarted:false,resetApplied:false},null,2));return;}
    if(!isDeepStrictEqual(current,oldHashes))throw Error('O ADM instalado difere da versão auditada. Nenhum trabalho será sobrescrito.');
    await publicAdmin(oldHashes);await publicWeb();
    const files=(before.gateway.Config.Labels?.['com.docker.compose.project.config_files']||'').split(',').filter(Boolean);
    if(files.length!==1||!files[0].startsWith('/')||before.gateway.Config.Labels['com.docker.compose.project']!=='ramo-nessa-staging')throw Error('Origem Compose do Gateway exige conferência.');
    const stat=lstatSync(files[0]);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0)throw Error('Modelo Compose precisa ser arquivo regular de root.');
    sources.set(files[0],readFileSync(files[0]));
    // The preceding rollout writes a self-contained JSON model: no env files,
    // runtime credential discovery or interpolation of new provider settings.
    const raw=JSON.parse(sources.get(files[0]));
    if(raw.name!=='ramo-nessa-staging'||!raw.services?.gateway||raw.services.gateway.env_file)throw Error('Modelo Gateway não é autocontido.');
    const resolved=JSON.parse(docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',files[0],'config','--format','json']));
    const nonce=randomBytes(8).toString('hex');dir=join(root,new Date().toISOString().replace(/[:.]/g,'-')+'-'+nonce);mkdirSync(dir,{mode:0o700});
    save('runtime-before.private.json',before);save('source.compose.private.json',sources.get(files[0]));save('resolved.private.json',resolved);
    journal={revision:adminSourceRevision,startedAt:new Date().toISOString(),phase,scope:['admin-gateway'],resetApplied:false,coreUpdated:false,passengerWebUpdated:false,driverWebUpdated:false};save('journal.private.json',journal);
    images={rollback:image(before.gateway.Image)};
    if(statfsSync(root).bavail*statfsSync(root).bsize<Math.max(512*1024**2,images.rollback.Size*3))throw Error('Espaço insuficiente para imagem de retorno e candidata.');
    record('preparing');
    const archive=join(dir,'admin-source.tar');const fd=openSync(archive,'wx',0o600);try{run('git',['-c','safe.directory='+repo,'-C',repo,'archive',adminSourceRevision,'apps/admin'],{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}
    run('tar',['-xf',archive,'-C',dir]);
    const baseTag='ramo-nessa-admin-base:'+nonce,candidateTag='ramo-nessa-admin-design:'+nonce;
    docker(['image','tag',before.gateway.Image,baseTag]);
    save('Dockerfile.admin-update','FROM '+baseTag+'\nCOPY index.html styles.css guide.css admin-workspace.css manual-refunds.css company-dashboard.css favicon.svg /srv/admin/\nCOPY src /srv/admin/src\nCOPY pages /srv/admin/pages\nLABEL br.com.ramonessa.admin-revision="'+adminSourceRevision+'"\n');
    console.log('Preparando o novo design sobre a imagem atual do ADM...');
    docker(['build','--pull=false','--file',join(dir,'Dockerfile.admin-update'),'--tag',candidateTag,join(dir,'apps/admin')]);
    images.candidate=image(candidateTag);
    if(!isDeepStrictEqual(imageHashes(images.candidate.Id),newHashes))throw Error('Arquivos da imagem candidata divergiram das fontes aprovadas.');
    models=makeModels(resolved,'gateway',before.gateway,images.rollback,images.candidate,webRoot);
    for(const kind of ['candidate','rollback']){
      save(kind+'.compose.private.json',models[kind]);
      const round=JSON.parse(docker([...compose(kind),'config','--format','json']));
      if(!isDeepStrictEqual(round.services.gateway.environment,models[kind].services.gateway.environment))throw Error('Ambiente alterado na releitura do modelo.');
    }
    record('return-image');docker(['image','save','--output',join(dir,'gateway-before.tar'),images.rollback.Id]);
    run('tar',['-tf',join(dir,'gateway-before.tar')]);journal.returnImageSha256=await fileHash(join(dir,'gateway-before.tar'));
    save('manifest.private.json',{revision:adminSourceRevision,oldImage:images.rollback.Id,newImage:images.candidate.Id,oldHashes,newHashes,webHash,caddyHash,returnImageSha256:journal.returnImageSha256});
    untouched();await filesUnchanged();await barrier();
    if(runtimeIdentity(inspect('gateway'))!==runtimeIdentity(before.gateway)||!isDeepStrictEqual(installedHashes(),oldHashes))throw Error('Gateway mudou durante a preparação.');
    record('switching');attempted=true;
    console.log('Atualizando somente o ADM e conferindo os arquivos publicados...');
    docker([...compose('candidate'),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90','gateway']);
    await barrier();checkRuntime('candidate');await baseline();await publicAdmin(newHashes);await publicWeb();untouched();await filesUnchanged();
    if(testAfterSwitch)await testAfterSwitch();
    if(!isDeepStrictEqual(featureFlags(),flagsBefore))throw Error('As configurações dos recursos mudaram durante a atualização.');
    await barrier();record('completed');
    console.log(JSON.stringify({status:'ADM_DESIGN_ATUALIZADO',revision:adminSourceRevision,adminUpdated:true,designUpdated:true,resetApplied:false,coreUpdated:false,passengerWebUpdated:false,driverWebUpdated:false,nativeAppsUpdated:false,providerConfigurationPreserved:true,realDeviceAcceptancePending:true,...flagsBefore,adminUrl:origin+'/administrodo/'},null,2));
  }catch(error){
    if(dir)writeFileSync(join(dir,'error.private.log'),error.stack??String(error),{mode:0o600});
    if(attempted){try{await rollback(sourceHashes(adminBaseRevision));journal.rollbackComplete=true;record('rolled-back');throw Object.assign(Error('Atualização interrompida; ADM anterior recuperado e conferido.'),{reported:true});}catch(recovery){if(recovery.reported)throw recovery;journal.rollbackComplete=false;record('review-required');throw Error('Atualização exige conferência. Não repita o comando; registros privados preservados.');}}
    throw error;
  }finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,onSignal);unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await updateAdmin(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
