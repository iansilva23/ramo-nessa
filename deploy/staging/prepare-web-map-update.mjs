// Prepare the reviewed two-role Web package. Never switches a mount, runs
// compose up, restarts services, executes SQL, or modifies active files.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,readdirSync,openSync,closeSync,unlinkSync,existsSync,createReadStream,statfsSync} from 'node:fs';
import {join,relative,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validate,runtimeIdentity} from './backup-regions-pricing.mjs';
import {servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {gatewayWebPlan,assertGatewayWebDelta,publicPushConfig,browserMapsKey} from './asaas-driver-web-contract.mjs';

export const mapWebSource='0f5305ddef3398112ca1e7d10a00fd05fa8548e8';
const originalWebSource='0ad3ba73cfe2a1265344de09c75309b95daac8dd';
const baselinePlan='/opt/ramo-nessa-regions/map-web-updates/0ad3ba73cfe2/prepared.private.json';
const baselineDigest='74b6fed1673311134dfe6af7d3b48ad6578037f300c27a415534c02012375b94';
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
const digest=b=>createHash('sha256').update(b).digest('hex');
export function mapPreparationArguments(args){
  if(args.length!==2||!args[0].startsWith('/')||!args[0].endsWith('.zip')||!(/^[a-f0-9]{64}$/).test(args[1]))throw Error('Informe ZIP absoluto e SHA-256 do pacote revisado.');
  return {archive:args[0],archiveSha256:args[1]};
}
export function assertWebMapLockDelta(before,after){
  const marker='  google_maps_flutter_web:\n',start=before.indexOf(marker);
  if(start<0)throw Error('Lock sem o plugin Web esperado.');
  const next=before.slice(start+1).search(/^  [A-Za-z0-9_]+:/m);
  const end=next<0?before.length:start+1+next,block=before.slice(start,end);
  const oldHash='ec802303734d907dea71adfe8037233966837acb10c5282ebdbc65fe33787750';
  const newHash='de408355e21b0da7da17962b86c338d320d9bc1c5eb94e72a2d021955bda5aaa';
  if(!block.includes('sha256: '+oldHash)||!block.includes('version: "0.6.4"'))throw Error('Versão Web de origem divergente.');
  const expected=before.slice(0,start)+block.replace(oldHash,newHash).replace('version: "0.6.4"','version: "0.6.4+2"')+before.slice(end);
  // Pub may normalize the final newline; every dependency entry stays exact.
  if(expected.trimEnd()!==after.trimEnd())throw Error('O lock altera dependências além do patch Web revisado.');
}
export function assertWebRouteLockUnchanged(before,after){
  if(before!==after)throw Error('A correção de regiões não pode alterar dependências.');
}
export function assertMapProviders(oldRoot,newRoot){
  for(const role of ['passenger','driver']){
    if(browserMapsKey(readFileSync(join(oldRoot,role,'index.html'),'utf8'))!==browserMapsKey(readFileSync(join(newRoot,role,'index.html'),'utf8'))||
        !isDeepStrictEqual(publicPushConfig(readFileSync(join(oldRoot,role,'ramo_push_config.js'),'utf8')),publicPushConfig(readFileSync(join(newRoot,role,'ramo_push_config.js'),'utf8'))))throw Error('Configuração pública de Maps/Firebase diverge do aplicativo atual. Nenhuma publicação será feita.');
  }
}
export async function prepareMapWeb(args, rehearsal={}){
  const request=mapPreparationArguments(args);
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');
  process.umask(0o077);
  const repo='/opt/ramo-nessa',root='/opt/ramo-nessa-regions/map-web-updates';
  mkdirSync(root,{recursive:true,mode:0o700});
  const privateDir=p=>{const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Pasta operacional privada divergente.');};privateDir(root);
  const lock=join(root,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  let dir;
  function run(command,argv){const r=spawnSync(command,argv,{encoding:'utf8',maxBuffer:64*1024**2,timeout:180000,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});if(r.error||r.status!==0){if(dir)writeFileSync(join(dir,'last-command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Preparação interrompida em '+command+'. Serviços ativos preservados.');}return r.stdout;}
  const docker=args=>run('docker',args),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0];
  const git=args=>run('git',['-c','safe.directory='+repo,'-C',repo,...args]);
  async function hashFile(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
  async function hashTree(root){const rows=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado nos pacotes.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(root,f),s.size,await hashFile(f)]);else throw Error('Arquivo inesperado nos pacotes.');}}await visit(root);return digest(JSON.stringify(rows));}
  const save=(n,v)=>writeFileSync(join(dir,n),typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v,null,2),{mode:0o600,flag:'wx'});
  try{
    console.log('Conferindo a versão Web atual e preservando Core, ADM, catálogo e provedores...');
    const before=Object.fromEntries(Object.keys(names).map(role=>[role,inspect(role)]));
    validate(before,{'core-image':before.core.Image,'gateway-image':before.gateway.Image});
    if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('Preparação exclusiva de homologação.');
    if(Object.keys(rehearsal).length&&(process.env.GITHUB_ACTIONS!=='true'||before.gateway.Config.Labels?.['br.com.ramonessa.regions-ci']!=='true'))throw Error('Referência de ensaio permitida somente no fixture isolado do CI.');
    const baseBytes=readFileSync(rehearsal.baselinePlan??baselinePlan);if(digest(baseBytes)!==(rehearsal.baselineDigest??baselineDigest))throw Error('Referência da última ativação Web não confirmada.');
    const base=JSON.parse(baseBytes),web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web'),caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
    if(web.Source!==(base.bundleRoot??base.webRoot)||await hashTree(web.Source)!==base.newWebHash)throw Error('Os aplicativos Web mudaram desde a última ativação auditada. Nada será sobrescrito.');
    const allowed=['apps/passenger/lib/src/features/home/presentation/passenger_home_screen.dart','apps/passenger/lib/src/features/pricing/data/pricing_policy_service.dart'];
    const delta=git(['diff','--name-only',originalWebSource,mapWebSource,'--','apps/passenger/lib','apps/driver/lib',':(glob)packages/**/lib/**','apps/passenger/pubspec.yaml','apps/passenger/pubspec.lock','apps/driver/pubspec.yaml','apps/driver/pubspec.lock','apps/passenger/android','apps/passenger/ios','apps/driver/android','apps/driver/ios']).trim().split('\n').filter(Boolean);
    if(delta.some(p=>!allowed.includes(p)))throw Error('Fontes dos aplicativos mudaram fora da revisão dos mapas.');
    for(const role of ['passenger','driver']){
      const path='apps/'+role+'/pubspec.lock';
      assertWebRouteLockUnchanged(git(['show',originalWebSource+':'+path]),git(['show',mapWebSource+':'+path]));
    }
    const archiveStat=lstatSync(request.archive);if(!archiveStat.isFile()||archiveStat.isSymbolicLink()||archiveStat.size>128*1024**2||await hashFile(request.archive)!==request.archiveSha256)throw Error('Pacote diferente do checksum revisado.');
    const paths=(before.gateway.Config.Labels?.['com.docker.compose.project.config_files']||'').split(',').filter(Boolean);
    if(paths.length!==1||!paths[0].startsWith('/'))throw Error('Origem Compose exige revisão.');
    const configStat=lstatSync(paths[0]);if(!configStat.isFile()||configStat.isSymbolicLink()||configStat.uid!==0)throw Error('Modelo Compose precisa ser arquivo regular de root.');
    const sourceBytes=readFileSync(paths[0]),raw=JSON.parse(sourceBytes);
    if(raw.name!=='ramo-nessa-staging'||!raw.services?.gateway||raw.services.gateway.env_file)throw Error('Modelo Gateway não é autocontido.');
    const resolved=JSON.parse(docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',paths[0],'config','--format','json']));
    const image=JSON.parse(docker(['image','inspect',before.gateway.Image]))[0];assertEnvironmentMatches(resolved.services.gateway,before.gateway,image);
    dir=join(root,mapWebSource.slice(0,12));if(existsSync(dir))throw Error('Já existe uma preparação. Não repita; confira o resultado anterior.');
    if(statfsSync(root).bavail*statfsSync(root).bsize<1024**3)throw Error('Espaço insuficiente para preparar os pacotes.');
    mkdirSync(dir,{mode:0o700});
    const release='/opt/ramo-nessa-web/releases/maps-'+mapWebSource.slice(0,12);if(existsSync(release))throw Error('A candidata já existe. Não será sobrescrita.');
    mkdirSync(release,{recursive:true,mode:0o755});
    const bundleRoot=join(release,'bundles'),here=dirname(fileURLToPath(import.meta.url));
    const staged=JSON.parse(run('python3',[join(here,'stage-regions-web.py'),'--archive',request.archive,'--output',bundleRoot,'--source',mapWebSource,'--sha256',request.archiveSha256]));
    assertMapProviders(web.Source,bundleRoot);
    const rollback=servicePlan(resolved,'gateway',before.gateway,before.gateway.Image),candidate=gatewayWebPlan(rollback,bundleRoot);assertGatewayWebDelta(rollback,candidate,bundleRoot);
    save('runtime-before.private.json',before);save('source.compose.private.json',sourceBytes);save('gateway-image.private.json',image);
    for(const [name,model]of Object.entries({candidate,rollback})){
      save(name+'.compose.private.json',model);
      const parsed=JSON.parse(docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,name+'.compose.private.json'),'config','--format','json']));
      if(!isDeepStrictEqual(parsed.services.gateway.environment,model.services.gateway.environment))throw Error('Compose alterou o ambiente na releitura.');
    }
    const plan={format:1,sourceCommit:mapWebSource,...request,preparedAt:new Date().toISOString(),bundleRoot,newWebHash:await hashTree(bundleRoot),oldBundleRoot:web.Source,oldWebHash:base.newWebHash,sourceConfig:paths[0],sourceConfigHash:digest(sourceBytes),planFiles:Object.fromEntries(['runtime-before.private.json','gateway-image.private.json','candidate.compose.private.json','rollback.compose.private.json'].map(n=>[n,digest(readFileSync(join(dir,n)))])),caddy:caddy.Source,caddyHash:await hashFile(caddy.Source),gatewayImage:before.gateway.Image,servicesRestarted:false,resetApplied:false,scope:['passenger-web','driver-web']};
    for(const role of Object.keys(names))if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('Serviço mudou durante a preparação: '+role);
    if(await hashTree(web.Source)!==base.newWebHash||!readFileSync(paths[0]).equals(sourceBytes))throw Error('Arquivos ativos mudaram durante a preparação.');
    save('prepared.private.json',plan);
    console.log(JSON.stringify({status:'MAPAS_WEB_PREPARADOS_SEM_ATIVACAO',directory:dir,planSha256:digest(readFileSync(join(dir,'prepared.private.json'))),sourceCommit:mapWebSource,files:staged.files,servicesRestarted:false,resetApplied:false,coreUpdated:false,adminUpdated:false,nativeAppsUpdated:false,providerConfigurationPreserved:true},null,2));
  }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await prepareMapWeb(process.argv.slice(2));}catch(error){console.error(error.message+' Nenhum pacote ativo foi substituído.');process.exitCode=1;}}
