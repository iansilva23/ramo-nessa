// Update the site and overlay only the training editor onto the active gateway.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const knownEditorDigests = new Set([
  '6f8a10f6449c784610c524d67632c85632a05bff147ca1d302969c67555ea013',
  // Live editor verified on 25/11; exactly the editor on the Android branch.
  'e9eb5d1904f0e5c90867004da96438e0d07d3315935a04c6706769e61675dc8b',
]);
const observedGatewayImage='sha256:b305f39894ae35a548baeadc81cc03236fa150f821d56fdcf2b6e19247f8e991';
export function assertKnownEditor(localDigest,liveDigest) {
  if(localDigest!==liveDigest||!knownEditorDigests.has(localDigest))throw new Error('O editor do site mudou. Reconcilie as alterações antes de publicar.');
}
export function assertGatewayImage(image) {
  if(!['ramo-nessa-admin-gateway:staging',observedGatewayImage].includes(image))throw new Error('Gateway diferente das versões verificadas.');
}
export function assertTrainingEnvironment(coreEnv,siteEnv) {
  // Match the exact nullish defaults used by the site's request/auth handlers.
  // Empty strings and explicit foreign origins must still be rejected.
  if(coreEnv.TRUST_PROXY!=='true')throw new Error('O Core precisa manter TRUST_PROXY=true.');
  if((siteEnv.PUBLIC_SITE_ORIGIN??'https://ramonessa.com.br')!=='https://ramonessa.com.br')throw new Error('A origem pública do site difere do domínio esperado.');
  if((siteEnv.ADMIN_SITE_ORIGIN??'https://app.ramonessa.com.br')!=='https://app.ramonessa.com.br')throw new Error('A origem administrativa do site difere do domínio esperado.');
}
export function prepareGatewayConfig(config,activeImage,candidateImage) {
  if(!config||typeof config!=='object'||!config.services?.gateway||config.services.gateway.image!==activeImage)throw new Error('A configuração Compose não corresponde à imagem ativa do gateway.');
  if(!/^sha256:[a-f0-9]{64}$/.test(candidateImage))throw new Error('A imagem candidata precisa estar fixada pelo ID.');
  const candidate=structuredClone(config);candidate.services.gateway.image=candidateImage;
  return candidate;
}

async function main() {
  const repo='/opt/ramo-nessa',revision=process.argv[2];
  if(process.getuid?.()!==0||!/^[a-f0-9]{40}$/.test(revision??''))throw new Error('Execute com sudo e informe o SHA completo.');
  const short=revision.slice(0,12),backup='/var/backups/ramo-nessa-training/'+short,release='/opt/ramo-nessa-site/releases/training-'+short;
  function run(command,args,options={}) {
    const result=spawnSync(command,args,{cwd:repo,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','inherit'],...options});
    if(result.error||result.status!==0)throw new Error('Falha em '+command);return result.stdout;
  }
  const inspect=name=>JSON.parse(run('docker',['inspect',name]))[0];
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const names={site:'ramo-nessa-site-institutional-site-1',gateway:'ramo-nessa-staging-gateway-1',core:'ramo-nessa-staging-core-1',postgres:'ramo-nessa-staging-postgres-1'};
  const before=Object.fromEntries(Object.entries(names).map(([k,name])=>[k,inspect(name)]));
  for(const service of Object.values(before))if(service.State.Health?.Status!=='healthy')throw new Error('Todos os serviços precisam estar saudáveis.');
  if(before.site.Config.Image!=='ramo-nessa-site:refinado')throw new Error('Imagem do site diferente do esperado.');
  assertGatewayImage(before.gateway.Config.Image);
  if(before.gateway.Mounts.some(m=>m.Destination==='/srv/admin'||m.Destination.startsWith('/srv/admin/')))throw new Error('ADM com montagem própria. Confira a instalação antes de publicar.');
  const labels=before.gateway.Config.Labels??{},project=labels['com.docker.compose.project'];
  const composeFile=labels['com.docker.compose.project.config_files'],projectDir=labels['com.docker.compose.project.working_dir'];
  if(project!=='ramo-nessa-staging'||typeof composeFile!=='string'||composeFile.includes(',')||!composeFile.startsWith('/opt/')||!existsSync(composeFile)||typeof projectDir!=='string'||!projectDir.startsWith('/opt/')||!existsSync(projectDir))throw new Error('Não foi possível identificar o Compose ativo do gateway.');
  // Copy the actual JSON release snapshot, preserving literal interpolation escapes.
  // Normalization is used only for validation; never reserialize resolved secrets
  // into a new Compose input. Never print either JSON: it may contain credentials.
  const gatewayComposeArgs=['compose','--project-name',project,'--project-directory',projectDir,'-f'];
  const activeComposeBytes=readFileSync(composeFile);
  let activeGatewayConfig;
  try { activeGatewayConfig=JSON.parse(activeComposeBytes.toString('utf8')); } catch { throw new Error('O Compose ativo precisa ser um snapshot JSON verificado.'); }
  prepareGatewayConfig(activeGatewayConfig,before.gateway.Config.Image,before.gateway.Image);
  const resolvedGatewayConfig=JSON.parse(run('docker',[...gatewayComposeArgs,composeFile,'config','--format','json']));
  const expectedBinds=(resolvedGatewayConfig.services?.gateway?.volumes??[]).filter(v=>v.type==='bind');
  const liveBinds=before.gateway.Mounts.filter(v=>v.Type==='bind');
  if(expectedBinds.length!==liveBinds.length||expectedBinds.some(v=>!liveBinds.some(m=>m.Destination===v.target&&m.Source===v.source&&m.RW===!v.read_only)))throw new Error('As montagens do Compose não correspondem ao gateway ativo.');
  const activeCaddy=readFileSync(join(repo,'deploy/staging/Caddyfile'),'utf8');
  if(!activeCaddy.includes('/site-management/')||!activeCaddy.includes('institutional-site:3000')||!activeCaddy.includes('ramonessa.com.br'))throw new Error('Gerenciamento do site ainda não está instalado nesta configuração.');
  const envMap=container=>Object.fromEntries(container.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
  const liveGatewayEnv=envMap(before.gateway);
  if(Object.entries(resolvedGatewayConfig.services.gateway.environment??{}).some(([key,value])=>value!==null&&String(value)!==liveGatewayEnv[key]))throw new Error('O ambiente do Compose não corresponde ao gateway ativo.');
  assertTrainingEnvironment(envMap(before.core),envMap(before.site));
  const file='apps/admin/src/site-admin.js',currentSource=readFileSync(join(repo,file),'utf8');
  assertKnownEditor(digest(currentSource),digest(run('docker',['exec',names.gateway,'cat','/srv/admin/src/site-admin.js'])));
  if(existsSync(backup)||existsSync(release))throw new Error('Esta atualização já foi preparada. Confira o backup existente.');
  const siteCompose=tail=>run('docker',['compose','--project-name','ramo-nessa-site','-f','/opt/ramo-nessa-site/compose.yml',...tail],{stdio:'inherit'});
  siteCompose(['config','--quiet']);
  mkdirSync(backup,{recursive:true,mode:0o700});mkdirSync(release,{recursive:true,mode:0o755});
  writeFileSync(backup+'/site-admin.before.js',currentSource,{mode:0o600});
  const priorComposePath=backup+'/gateway.before.json',candidateComposePath=backup+'/gateway.candidate.json';
  writeFileSync(priorComposePath,JSON.stringify(activeGatewayConfig,null,2),{mode:0o600});
  const archive=run('sudo',['-u','ubuntu','git','-C',repo,'archive',revision,'apps/institutional-site',file],{encoding:null});run('tar',['-x','-C',release],{input:archive});
  const siteCandidate='ramo-nessa-site:training-'+short,gatewayCandidate='ramo-nessa-admin-gateway:training-'+short,gatewayBase='ramo-nessa-admin-gateway:training-base-'+short;
  run('docker',['image','tag',before.gateway.Image,gatewayBase]);
  const overlay=join(release,'gateway-overlay');mkdirSync(overlay);writeFileSync(join(overlay,'site-admin.js'),readFileSync(join(release,file)));writeFileSync(join(overlay,'Dockerfile'),`FROM ${gatewayBase}\nCOPY site-admin.js /srv/admin/src/site-admin.js\n`);
  run('docker',['build','-t',siteCandidate,join(release,'apps/institutional-site')],{stdio:'inherit'});
  run('docker',['build','-t',gatewayCandidate,overlay],{stdio:'inherit'});
  const candidateId=JSON.parse(run('docker',['image','inspect',gatewayCandidate]))[0].Id;
  const candidateConfig=prepareGatewayConfig(activeGatewayConfig,before.gateway.Config.Image,candidateId);
  writeFileSync(candidateComposePath,JSON.stringify(candidateConfig,null,2),{mode:0o600});
  const gatewayCompose=(manifest,tail)=>run('docker',[...gatewayComposeArgs,manifest,...tail],{stdio:'inherit'});
  gatewayCompose(candidateComposePath,['config','--quiet']);
  for(const [key,name]of Object.entries(names))if(inspect(name).Id!==before[key].Id)throw new Error('Um serviço mudou durante a preparação.');
  if(readFileSync(join(repo,file),'utf8')!==currentSource||readFileSync(join(repo,'deploy/staging/Caddyfile'),'utf8')!==activeCaddy||!readFileSync(composeFile).equals(activeComposeBytes))throw new Error('Os arquivos locais mudaram durante a preparação.');
  const fetchChecked=async(url,status)=>{const response=await fetch(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.status!==status)throw new Error('Falha na verificação de '+url);return response;};
  const contentBefore=await(await fetchChecked('https://ramonessa.com.br/api/site-content',200)).json();
  run('docker',['exec',names.site,'node','ops/backup.mjs'],{stdio:'inherit'});
  for(const [key,tag]of [['site','ramo-nessa-site:rollback-training-'],['gateway','ramo-nessa-admin-gateway:rollback-training-']])run('docker',['image','tag',before[key].Image,tag+short]);
  writeFileSync(backup+'/prepared.json',JSON.stringify({revision,release,siteBefore:before.site.Image,gatewayBefore:before.gateway.Image,composeFile,projectDir,priorComposePath,candidateComposePath,coreId:before.core.Id,postgresId:before.postgres.Id,siteCandidate,gatewayCandidate},null,2),{mode:0o600});
  const up=['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','120'];let siteChanged=false,gatewayChanged=false;
  try{
    run('docker',['image','tag',siteCandidate,'ramo-nessa-site:refinado']);siteChanged=true;siteCompose([...up,'institutional-site']);
    gatewayChanged=true;gatewayCompose(candidateComposePath,[...up,'gateway']);
    writeFileSync(join(repo,file),readFileSync(join(release,file)));
    for(const [url,status]of [['https://ramonessa.com.br/motoristas',200],['https://ramonessa.com.br/api/driver-training',401],['https://ramonessa.com.br/api/driver-training/session',401],['https://app.ramonessa.com.br/site-management/training',401],['https://app.ramonessa.com.br/ready',200]])await fetchChecked(url,status);
    const editor=await(await fetchChecked('https://app.ramonessa.com.br/administrodo/src/site-admin.js',200)).text();if(!editor.includes('training/publish'))throw new Error('Editor das aulas indisponível.');
    const contentAfter=await(await fetchChecked('https://ramonessa.com.br/api/site-content',200)).json();if(JSON.stringify(contentAfter)!==JSON.stringify(contentBefore))throw new Error('O conteúdo do site mudou.');
    if(inspect(names.core).Id!==before.core.Id||inspect(names.postgres).Id!==before.postgres.Id)throw new Error('Core ou Postgres alterado.');
    if(inspect(names.gateway).Image!==candidateId)throw new Error('O gateway não está usando a imagem preparada.');
    if(readFileSync(join(repo,'deploy/staging/Caddyfile'),'utf8')!==activeCaddy||!readFileSync(composeFile).equals(activeComposeBytes))throw new Error('Configuração original alterada.');
    writeFileSync(backup+'/activated.json',JSON.stringify({revision,activatedAt:new Date().toISOString()}),{mode:0o600});console.log('CENTRAL PUBLICADA: https://ramonessa.com.br/motoristas');
  }catch(error){
    console.error('Falha na ativação. Restaurando as imagens anteriores.');
    try{
      writeFileSync(join(repo,file),currentSource);
      if(gatewayChanged)gatewayCompose(priorComposePath,[...up,'gateway']);
      run('docker',['image','tag',before.site.Image,'ramo-nessa-site:refinado']);if(siteChanged)siteCompose([...up,'institutional-site']);
      console.error('Imagens e configuração anteriores restauradas. Dados e progresso preservados.');
    }catch{console.error('Restauração incompleta. Confira os backups antes de continuar.');}
    throw error;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
