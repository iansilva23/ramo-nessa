// Updates static Web bundles only. Never starts Core, migrations, database or website.
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,readlinkSync,symlinkSync,renameSync,openSync,closeSync,chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sameConfiguration } from './web-image-contract.mjs';
import { assertGatewayOnly,assertPreviousRefresh } from './web-refresh-contract.mjs';
import { stagingGoogleMapsConfiguration } from '/opt/ramo-nessa/deploy/staging/google-maps.mjs';
import { stagingOtpConfiguration } from '/opt/ramo-nessa/deploy/staging/otp.mjs';
import { stagingComposeArguments,stagingComposeEnvironment } from '/opt/ramo-nessa/deploy/staging/firebase.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),meta=JSON.parse(readFileSync(here+'/web-refresh-release.json','utf8'));
const base='5247aabd587efa610c9b4cc36d74cbc348048b41',previousWeb='01e783f3f71d28af933aae8f060d21334e093c9a',previousRoot='/var/backups/ramo-nessa-web/refresh-01e783f3f71d',repo='/opt/ramo-nessa',oldRoot='/var/backups/ramo-nessa-web/5247aabd587e';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
if(!/^[a-f0-9]{40}$/.test(meta.target)||!/^[a-f0-9]{64}$/.test(meta.archiveSha256)||!/^[a-f0-9]{64}$/.test(meta.manifestSha256))throw Error('Metadados de release inválidos.');
const activate=process.argv.includes('--activate');
if(process.argv.slice(2).some(a=>!['--prepare','--activate'].includes(a))||activate&&process.argv.includes('--prepare'))throw Error('Modo inválido.');
const short=meta.target.slice(0,12),release='/opt/ramo-nessa-web/releases/'+short,root='/var/backups/ramo-nessa-web/refresh-'+short;
const archive='/home/ubuntu/RamoNessa-Web-'+short+'.zip',web=repo+'/deploy/staging/web-dist';
const caddy=repo+'/deploy/staging/Caddyfile';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),json=p=>JSON.parse(readFileSync(p,'utf8'));
if(!existsSync(root)){if(activate)throw Error('Prepare o plano primeiro.');mkdirSync(root,{mode:0o700});}chmodSync(root,0o700);
const logPath=root+'/refresh-'+Date.now()+'.log',log=openSync(logPath,'wx',0o600);
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:repo,encoding:'utf8',timeout:180_000,maxBuffer:64*1024*1024,...options});if(r.stdout)writeFileSync(log,r.stdout);if(r.stderr)writeFileSync(log,r.stderr);if(r.error||r.status!==0)throw Error('Etapa não concluída: '+command+'. Log privado: '+logPath);return r.stdout;}
const docker=(...args)=>run('docker',args),inspect=name=>JSON.parse(docker('inspect',name))[0];
const git=(...args)=>run('sudo',['-u','ubuntu','git','-C',repo,...args]);
function privateJson(path,value){writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);}
function pointWeb(destination){const temporary=web+'.refresh-'+process.pid;symlinkSync(destination,temporary);renameSync(temporary,web);}

let switched=false,plan,args,env;
try{
  if(existsSync(root+'/started.json')||existsSync(root+'/completed.json'))throw Error('Atualização já registrada. Não repetir.');
  const previous=json(oldRoot+'/activation-completed.json'),material=json(oldRoot+'/prepared.json'),images=json(oldRoot+'/images-prepared.json');
  if(previous.target!==base||previous.httpsChecks!==true)throw Error('Ativação anterior não confirmada.');
  git('diff','--quiet',base,meta.target,'--','backend/core','deploy/staging/Caddyfile','deploy/staging/compose.yml');
  if(sha(readFileSync(archive))!==meta.archiveSha256)throw Error('ZIP diferente do pacote aprovado.');
  if(!lstatSync(web).isSymbolicLink())throw Error('Destino Web deve ser link simbólico.');
  const previousRefresh=json(previousRoot+'/prepared.json'),previousCompleted=json(previousRoot+'/completed.json');
  assertPreviousRefresh(previousWeb,previousRefresh,previousCompleted,readlinkSync(web),readFileSync(caddy,'utf8'));
  const names=['ramo-nessa-staging-core-1','ramo-nessa-staging-gateway-1','ramo-nessa-staging-postgres-1','ramo-nessa-site-institutional-site-1'];
  const containers=names.map(name=>{const c=inspect(name);if(c.State.Health?.Status!=='healthy')throw Error('Serviço não está saudável: '+name);return{name,id:c.Id,image:c.Image};});
  const core=containers[0],gateway=inspect(names[1]);
  if(docker('image','inspect','--format','{{.Id}}',core.image).trim()!==images.coreId)throw Error('Core mudou desde a ativação.');
  if(gateway.Image!==previous.gatewayImage)throw Error('Gateway mudou desde a ativação.');
  const mount=gateway.Mounts.find(item=>item.Destination==='/srv/web');
  if(!mount||mount.RW||mount.Type!=='bind'||mount.Source!==readlinkSync(web))throw Error('Mount Web anterior diferente do esperado.');
  const caddyPrevious=readFileSync(caddy,'utf8');
  const caddyNext=caddyPrevious; // GPS policy already fixed by the previous refresh; preserve byte-for-byte.
  const runtimeFiles=material.runtimeFiles.map(item=>({path:item.source,sha256:sha(readFileSync(item.source))}));
  const config=release+'/firebase.public.json';
  const originalConfig=git('show',base+':config/web/firebase.public.json');
  if(!activate){
    if(existsSync(release)||existsSync(root+'/prepared.json'))throw Error('Preparação já existe. Não repetir.');
    mkdirSync(release,{recursive:true,mode:0o755});writeFileSync(config,originalConfig,{mode:0o644});
    run('python3',[here+'/stage-web-refresh.py',archive,release+'/bundles',config]);
  }else{
    if(readFileSync(config,'utf8')!==originalConfig)throw Error('Configuração pública mudou.');
    run('python3',[here+'/stage-web-refresh.py','--check',release+'/bundles',config]);
  }
  const candidateCaddy=release+'/Caddyfile.candidate';writeFileSync(candidateCaddy,caddyNext,{mode:0o644});
  const gatewayEnv=Object.fromEntries(gateway.Config.Env.map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
  docker('run','--rm','--network','none','--entrypoint','caddy','--env','APP_DOMAIN='+gatewayEnv.APP_DOMAIN,'--env','ACME_EMAIL='+gatewayEnv.ACME_EMAIL,'--mount','type=bind,src='+candidateCaddy+',dst=/etc/caddy/Caddyfile,readonly',gateway.Image,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile');
  run(process.execPath,['/opt/ramo-nessa-web/releases/5247aabd587e/source/scripts/web/verify_web_homologation.mjs','--passenger='+release+'/bundles/passenger','--driver='+release+'/bundles/driver','--firebase-project=ramo-nessa']);
  const envFile=repo+'/deploy/staging/.env';env=stagingComposeEnvironment(await stagingGoogleMapsConfiguration(envFile),await stagingOtpConfiguration(envFile));args=await stagingComposeArguments(envFile);args.splice(1,0,'--project-name','ramo-nessa-staging');
  const baseline=JSON.parse(run('docker',[...args,'config','--format','json'],{env}));
  const override=release+'/compose.web.json';
  privateJson(override,{services:{gateway:{image:gateway.Image,volumes:[release+'/bundles:/srv/web:ro']}}});
  const preview=JSON.parse(run('docker',[...args,'-f',override,'config','--format','json'],{env}));
  assertGatewayOnly(baseline,preview,release+'/bundles');
  const rollback=root+'/compose.rollback.json';privateJson(rollback,{services:{gateway:{image:gateway.Image,volumes:[mount.Source+':/srv/web:ro']}}});
  plan={target:meta.target,archiveSha256:meta.archiveSha256,containers,runtimeFiles,oldBundles:mount.Source,newBundles:release+'/bundles',override,rollback,caddyPrevious,caddyNext};
  if(!activate){privateJson(root+'/prepared.json',plan);console.log('ATUALIZAÇÃO WEB PREPARADA. Dois pacotes com faixa opcional de instalação.');console.log('Core, banco, site e ADM preservados. Nenhum serviço foi alterado.');}
  else{
    if(!sameConfiguration(json(root+'/prepared.json'),plan))throw Error('Plano mudou desde a preparação.');
    privateJson(root+'/started.json',{target:meta.target,startedAt:new Date().toISOString()});
    console.log('Atualizando somente os dois pacotes web no gateway...');switched=true;pointWeb(plan.newBundles);
    run('docker',[...args,'-f',override,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','90','gateway'],{env});
    for(const role of ['passenger','driver']){
      const path=role==='passenger'?'passageiro':'motorista';
      for(const name of ['index.html','main.dart.js','ramo_web_push.js']){
        const response=await fetch('https://app.ramonessa.com.br/'+path+'/'+(name==='index.html'?'':name),{signal:AbortSignal.timeout(20_000),cache:'no-store'});
        if(response.status!==200||!/geolocation=\(self\)/.test(response.headers.get('permissions-policy')??'')||sha(Buffer.from(await response.arrayBuffer()))!==sha(readFileSync(release+'/bundles/'+role+'/'+name)))throw Error('Arquivo ou política de GPS diferente do aprovado: '+path+'/'+name);
      }
    }
    for(const url of ['https://app.ramonessa.com.br/ready','https://app.ramonessa.com.br/administrodo/','https://ramonessa.com.br/api/health']){const r=await fetch(url,{signal:AbortSignal.timeout(15_000)});await r.arrayBuffer();if(r.status!==200||url.includes('/administrodo/')&&!/geolocation=\(\)/.test(r.headers.get('permissions-policy')??''))throw Error('Verificação HTTPS/ADM falhou.');}
    for(const item of containers.filter(c=>c.name!==names[1]))if(inspect(item.name).Id!==item.id)throw Error('Serviço fora do gateway mudou.');
    for(const item of runtimeFiles)if(sha(readFileSync(item.path))!==(item.path===caddy?sha(caddyNext):item.sha256))throw Error('Configuração fora do escopo mudou.');
    privateJson(root+'/completed.json',{target:meta.target,completedAt:new Date().toISOString(),gatewayImage:inspect(names[1]).Image,coreUnchanged:true,databaseUnchangedByUpdater:true,publicBundleHashesMatched:true,realDeviceAcceptance:false});
    console.log('APPS WEB ATUALIZADOS. Arquivos públicos conferidos por hash. Core, banco, site e ADM preservados.');
    console.log('Feche as abas antigas e reabra os apps para conferir a faixa de instalação.');
  }
}catch(error){console.error(error.message);if(switched&&plan){try{pointWeb(plan.oldBundles);run('docker',[...args,'-f',plan.rollback,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','90','gateway'],{env});console.error('Pacotes anteriores restaurados. Não repetir a atualização; envie o resultado.');}catch{console.error('Retorno incompleto. Não repetir comandos. Log privado: '+logPath);}}process.exitCode=1;}
finally{closeSync(log);}
