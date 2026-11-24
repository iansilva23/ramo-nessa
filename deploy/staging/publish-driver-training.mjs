// Update the existing site and overlay only the training editor onto the live ADM.
// Core/Postgres, gateway configuration, maps, apps and financial rules are preserved.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const repo='/opt/ramo-nessa',revision=process.argv[2],baseline='f942e8d17d06963a30f389f3ba3fb72c2d2d7287';
if(process.getuid?.()!==0||!/^[a-f0-9]{40}$/.test(revision??''))throw new Error('Execute com sudo e informe o SHA completo.');
const short=revision.slice(0,12),backup='/var/backups/ramo-nessa-training/'+short,release='/opt/ramo-nessa-site/releases/training-'+short;
function run(command,args,options={}){
 const result=spawnSync(command,args,{cwd:repo,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','inherit'],...options});
 if(result.error||result.status!==0)throw new Error('Falha em '+command);return result.stdout;
}
const inspect=name=>JSON.parse(run('docker',['inspect',name]))[0];
const names={site:'ramo-nessa-site-institutional-site-1',gateway:'ramo-nessa-staging-gateway-1',core:'ramo-nessa-staging-core-1',postgres:'ramo-nessa-staging-postgres-1'};
const before=Object.fromEntries(Object.entries(names).map(([k,name])=>[k,inspect(name)]));
for(const service of Object.values(before))if(service.State.Health?.Status!=='healthy')throw new Error('Todos os serviços precisam estar saudáveis.');
if(before.site.Config.Image!=='ramo-nessa-site:refinado'||before.gateway.Config.Image!=='ramo-nessa-admin-gateway:staging')throw new Error('Imagens diferentes do esperado.');
if(before.gateway.Mounts.some(m=>m.Destination==='/srv/admin'||m.Destination.startsWith('/srv/admin/')))throw new Error('ADM com montagem própria. Confira a instalação antes de publicar.');
const activeCaddy=readFileSync(join(repo,'deploy/staging/Caddyfile'),'utf8');
if(!activeCaddy.includes('/site-management/')||!activeCaddy.includes('institutional-site:3000')||!activeCaddy.includes('ramonessa.com.br'))throw new Error('Gerenciamento do site ainda não está instalado nesta configuração.');
const envMap=container=>Object.fromEntries(container.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
if(envMap(before.core).TRUST_PROXY!=='true'||envMap(before.site).PUBLIC_SITE_ORIGIN!=='https://ramonessa.com.br'||envMap(before.site).ADMIN_SITE_ORIGIN!=='https://app.ramonessa.com.br')throw new Error('Confira as origens e a configuração de proxy existentes.');
const file='apps/admin/src/site-admin.js',currentSource=readFileSync(join(repo,file),'utf8');
const expected=run('sudo',['-u','ubuntu','git','-C',repo,'show',baseline+':'+file]);
if(currentSource!==expected||run('docker',['exec',names.gateway,'cat','/srv/admin/src/site-admin.js'])!==expected)throw new Error('O editor do site mudou. Reconcilie as alterações antes de publicar.');
if(existsSync(backup)||existsSync(release))throw new Error('Esta atualização já foi preparada. Confira o backup existente.');
mkdirSync(backup,{recursive:true,mode:0o700});mkdirSync(release,{recursive:true,mode:0o755});
writeFileSync(backup+'/site-admin.before.js',currentSource,{mode:0o600});
const archive=run('sudo',['-u','ubuntu','git','-C',repo,'archive',revision,'apps/institutional-site',file],{encoding:null});run('tar',['-x','-C',release],{input:archive});
const siteCandidate='ramo-nessa-site:training-'+short,gatewayCandidate='ramo-nessa-admin-gateway:training-'+short,gatewayBase='ramo-nessa-admin-gateway:training-base-'+short;
run('docker',['image','tag',before.gateway.Image,gatewayBase]);
const overlay=join(release,'gateway-overlay');mkdirSync(overlay);writeFileSync(join(overlay,'site-admin.js'),readFileSync(join(release,file)));writeFileSync(join(overlay,'Dockerfile'),`FROM ${gatewayBase}\nCOPY site-admin.js /srv/admin/src/site-admin.js\n`);
run('docker',['build','-t',siteCandidate,join(release,'apps/institutional-site')],{stdio:'inherit'});
run('docker',['build','-t',gatewayCandidate,overlay],{stdio:'inherit'});
const {stagingGoogleMapsConfiguration}=await import('/opt/ramo-nessa/deploy/staging/google-maps.mjs');
const {stagingComposeArguments,stagingComposeEnvironment}=await import('/opt/ramo-nessa/deploy/staging/firebase.mjs');
const envFile=repo+'/deploy/staging/.env',maps=await stagingGoogleMapsConfiguration(envFile),args=await stagingComposeArguments(envFile);args.splice(1,0,'--project-name','ramo-nessa-staging');const env=stagingComposeEnvironment(maps);
const gatewayCompose=tail=>run('docker',[...args,...tail],{env,stdio:'inherit'});
const siteCompose=tail=>run('docker',['compose','--project-name','ramo-nessa-site','-f','/opt/ramo-nessa-site/compose.yml',...tail],{stdio:'inherit'});
gatewayCompose(['config','--quiet']);siteCompose(['config','--quiet']);
for(const [key,name]of Object.entries(names))if(inspect(name).Id!==before[key].Id)throw new Error('Um serviço mudou durante a preparação.');
if(readFileSync(join(repo,file),'utf8')!==currentSource||readFileSync(join(repo,'deploy/staging/Caddyfile'),'utf8')!==activeCaddy)throw new Error('Os arquivos locais mudaram durante a preparação.');
const fetchChecked=async(url,status)=>{const response=await fetch(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.status!==status)throw new Error('Falha na verificação de '+url);return response;};
const contentBefore=await(await fetchChecked('https://ramonessa.com.br/api/site-content',200)).json();
run('docker',['exec',names.site,'node','ops/backup.mjs'],{stdio:'inherit'});
for(const [key,tag]of [['site','ramo-nessa-site:rollback-training-'],['gateway','ramo-nessa-admin-gateway:rollback-training-']])run('docker',['image','tag',before[key].Image,tag+short]);
writeFileSync(backup+'/prepared.json',JSON.stringify({revision,release,siteBefore:before.site.Image,gatewayBefore:before.gateway.Image,coreId:before.core.Id,postgresId:before.postgres.Id,siteCandidate,gatewayCandidate},null,2),{mode:0o600});
const up=['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','120'];let siteChanged=false,gatewayChanged=false;
try{
 run('docker',['image','tag',siteCandidate,'ramo-nessa-site:refinado']);siteChanged=true;siteCompose([...up,'institutional-site']);
 run('docker',['image','tag',gatewayCandidate,'ramo-nessa-admin-gateway:staging']);gatewayChanged=true;gatewayCompose([...up,'gateway']);
 writeFileSync(join(repo,file),readFileSync(join(release,file)));
 for(const [url,status]of [['https://ramonessa.com.br/motoristas',200],['https://ramonessa.com.br/api/driver-training',401],['https://ramonessa.com.br/api/driver-training/session',401],['https://app.ramonessa.com.br/site-management/training',401],['https://app.ramonessa.com.br/ready',200]])await fetchChecked(url,status);
 const editor=await(await fetchChecked('https://app.ramonessa.com.br/administrodo/src/site-admin.js',200)).text();if(!editor.includes('training/publish'))throw new Error('Editor das aulas indisponível.');
 const contentAfter=await(await fetchChecked('https://ramonessa.com.br/api/site-content',200)).json();if(JSON.stringify(contentAfter)!==JSON.stringify(contentBefore))throw new Error('O conteúdo do site mudou.');
 if(inspect(names.core).Id!==before.core.Id||inspect(names.postgres).Id!==before.postgres.Id)throw new Error('Core ou Postgres alterado.');
 if(readFileSync(join(repo,'deploy/staging/Caddyfile'),'utf8')!==activeCaddy)throw new Error('Configuração do gateway alterada.');
 writeFileSync(backup+'/activated.json',JSON.stringify({revision,activatedAt:new Date().toISOString()}),{mode:0o600});console.log('CENTRAL PUBLICADA: https://ramonessa.com.br/motoristas');
}catch(error){
 console.error('Falha na ativação. Restaurando as imagens anteriores.');
 try{
  writeFileSync(join(repo,file),currentSource);
  run('docker',['image','tag',before.gateway.Image,'ramo-nessa-admin-gateway:staging']);if(gatewayChanged)gatewayCompose([...up,'gateway']);
  run('docker',['image','tag',before.site.Image,'ramo-nessa-site:refinado']);if(siteChanged)siteCompose([...up,'institutional-site']);
  console.error('Imagens anteriores restauradas. Dados e progresso preservados.');
 }catch{console.error('Restauração incompleta. Confira os backups antes de continuar.');}
 throw error;
}
