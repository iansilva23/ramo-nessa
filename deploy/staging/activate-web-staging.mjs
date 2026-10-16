// Default mode only prepares a private, reviewable plan. --activate changes staging.
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,existsSync,lstatSync,mkdirSync,symlinkSync,unlinkSync,chownSync,chmodSync,openSync,closeSync,fsyncSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { target,base,sha,webCompose,coreDelta,requireIsolated } from './web-activation-contract.mjs';
import { compareMigrationHistory } from './web-readiness-contract.mjs';
import { sameConfiguration } from './web-image-contract.mjs';
import { stagingGoogleMapsConfiguration } from '/opt/ramo-nessa/deploy/staging/google-maps.mjs';
import { stagingOtpConfiguration } from '/opt/ramo-nessa/deploy/staging/otp.mjs';
import { stagingComposeArguments,stagingComposeEnvironment } from '/opt/ramo-nessa/deploy/staging/firebase.mjs';
const repo='/opt/ramo-nessa',root='/var/backups/ramo-nessa-web/5247aabd587e',release='/opt/ramo-nessa-web/releases/5247aabd587e';
const caddy=repo+'/deploy/staging/Caddyfile',compose=repo+'/deploy/staging/compose.yml',web=repo+'/deploy/staging/web-dist';
const activate=process.argv.includes('--activate');
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
const allowed=new Set(['--prepare','--activate']);
if(process.argv.slice(2).some(arg=>!allowed.has(arg))||process.argv.includes('--prepare')&&activate)throw Error('Modo inválido.');
const read=path=>readFileSync(path,'utf8');
const json=path=>JSON.parse(read(path));
const prepared=json(root+'/prepared.json'),images=json(root+'/images-prepared.json');
requireIsolated(json(root+'/isolated-test.json'));
if(prepared.target!==target||images.target!==target)throw Error('Preparação de outra revisão.');
const logPath=root+'/activation-'+Date.now()+'.log',log=openSync(logPath,'wx',0o600);
function run(command,args,options={}){
  const r=spawnSync(command,args,{cwd:repo,encoding:'utf8',maxBuffer:64*1024*1024,timeout:240_000,...options});
  if(r.stdout)writeFileSync(log,r.stdout);if(r.stderr)writeFileSync(log,r.stderr);
  if(r.error||r.status!==0)throw Error('Etapa não concluída: '+command+'. Log privado: '+logPath);
  return r.stdout;
}
const docker=(...args)=>run('docker',args);
const git=(...args)=>run('sudo',['-u','ubuntu','git','-C',repo,...args]);
const inspect=name=>JSON.parse(docker('inspect',name))[0];
const coreName='ramo-nessa-staging-core-1',gatewayName='ramo-nessa-staging-gateway-1';
function replace(path,bytes){const fd=openSync(path,'r+');try{writeFileSync(fd,bytes); /* truncate without replacing bind inode */
  run('truncate',['-s',String(Buffer.byteLength(bytes)),path]);fsyncSync(fd);}finally{closeSync(fd);}}
function privateJson(path,data){writeFileSync(path,JSON.stringify(data,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);}
function liveHistory(){return JSON.parse(docker('exec','-i',coreName,'node','--input-type=module','-e',
  "import {createRequire} from 'node:module';const {Pool}=createRequire('/app/package.json')('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});try{console.log(JSON.stringify((await p.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows));}finally{await p.end();}"));}
function candidateHistory(){return new Map(git('ls-tree','-r','--name-only',target,'--','backend/core/migrations').trim().split('\n').filter(p=>p.endsWith('.sql')).map(path=>[path.split('/').at(-1),sha(Buffer.from(git('show',target+':'+path)))]));}
// Preserve exact SQL bytes: git output is not trimmed by run().
function verifyPending(){const result=compareMigrationHistory(liveHistory(),candidateHistory());if(result.applied!==86||result.pending.length!==1||result.pending[0].filename!=='085_web_push_preferences.sql')throw Error('Estado de migrations mudou.');}
let touched=false,coreRecreated=false,exposed=false,plan;
try {
  if(existsSync(root+'/activation-completed.json')||existsSync(root+'/activation-started.json'))throw Error('Já existe uma ativação registrada; não repetir.');
  if(git('rev-parse','HEAD').trim()!==base||git('status','--porcelain','--','backend/core','deploy/staging/compose.yml').trim())throw Error('Fonte do Core/Compose mudou.');
  if(existsSync(web)||(()=>{try{return lstatSync(web).isSymbolicLink();}catch{return false;}})())throw Error('web-dist já existe.');
  for(const item of prepared.runtimeFiles)if(sha(readFileSync(item.source))!==item.sha256||sha(readFileSync(item.backup))!==item.sha256)throw Error('Configuração ou backup mudou.');
  for(const item of images.containers){const c=inspect(item.name);if(c.Id!==item.id||c.Image!==item.image||c.State.Health?.Status!=='healthy')throw Error('Serviço mudou ou não está saudável: '+item.name);}
  if(docker('image','inspect','--format','{{.Id}}',images.coreImage).trim()!==images.coreId)throw Error('Imagem candidata mudou.');
  if(sha(readFileSync(caddy))!==images.activeSha256||sha(readFileSync(release+'/Caddyfile.candidate'))!==images.candidateSha256)throw Error('Caddy mudou.');
  // Re-extract and verify the original approved artifact privately, then compare staged trees.
  const verification=root+'/activation-artifact-'+Date.now();
  run('python3',[fileURLToPath(new URL('./stage-configured-web.py',import.meta.url)),'/home/ubuntu/RamoNessa-Web-5247aabd587e.zip',verification+'/bundles',release+'/source/config/web/firebase.public.json']);
  run('diff',['-qr',verification+'/bundles',release+'/bundles']);
  verifyPending();
  const delta=coreDelta(git('diff','--name-status',base,target,'--','backend/core'));
  const files=delta.map(entry=>{
    const next=Buffer.from(git('show',target+':'+entry.path)),path=repo+'/'+entry.path;
    if(sha(next)!==sha(readFileSync(release+'/source/'+entry.path)))throw Error('Fonte preparada diverge do candidato.');
    const exists=existsSync(path);
    if(entry.status==='A'&&exists||entry.status==='M'&&!exists)throw Error('Arquivo do Core inesperado.');
    const info=exists?lstatSync(path):null;
    if(info&&(!info.isFile()||info.isSymbolicLink()))throw Error('Arquivo do Core não é regular.');
    return {path:entry.path,next:next.toString('base64'),previous:exists?readFileSync(path).toString('base64'):null,mode:info?info.mode&0o777:0o644,uid:info?.uid??1000,gid:info?.gid??1000};
  });
  const envFile=repo+'/deploy/staging/.env';
  const env=stagingComposeEnvironment(await stagingGoogleMapsConfiguration(envFile),await stagingOtpConfiguration(envFile));
  const args=await stagingComposeArguments(envFile);args.splice(1,0,'--project-name','ramo-nessa-staging');
  const config=JSON.parse(run('docker',[...args,'config','--format','json'],{env}));
  const composeNext=webCompose(read(compose));
  // Pin both image references independently of mutable staging tags. This override lives outside temporary scripts.
  const override=root+'/compose.activation.json';
  privateJson(override,{services:{core:{image:images.coreId},gateway:{image:images.gatewayImage,volumes:[release+'/bundles:/srv/web:ro']}}});
  const preview=JSON.parse(run('docker',[...args,'-f',override,'config','--format','json'],{env}));
  for(const [a,b]of [[config.services.core.environment,preview.services.core.environment],[config.services.core.volumes,preview.services.core.volumes],[config.services.gateway.environment,preview.services.gateway.environment],[config.services.postgres,preview.services.postgres]])if(!sameConfiguration(a,b))throw Error('Preview alteraria ambiente ou armazenamento.');
  const gateway=inspect(gatewayName),vars=Object.fromEntries(gateway.Config.Env.map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
  docker('run','--rm','--network','none','--entrypoint','caddy','--env','APP_DOMAIN='+vars.APP_DOMAIN,'--env','ACME_EMAIL='+vars.ACME_EMAIL,'--mount','type=bind,src='+release+'/Caddyfile.candidate,dst=/etc/caddy/Caddyfile,readonly',images.gatewayImage,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile');
  const oldTag=docker('image','inspect','--format','{{.Id}}','ramo-nessa-core:staging').trim();
  const oldImageId=docker('image','inspect','--format','{{.Id}}',prepared.images[coreName].image).trim();
  if(oldTag!==oldImageId)throw Error('Tag staging diferente da imagem ativa preservada.');
  if(docker('image','inspect','--format','{{.Id}}','ramo-nessa-admin-gateway:staging').trim()!==docker('image','inspect','--format','{{.Id}}',images.gatewayImage).trim())throw Error('Tag do gateway mudou.');
  for(const file of ['backup.mjs','verify-backup.mjs'])if(sha(readFileSync(repo+'/deploy/staging/'+file))!==sha(Buffer.from(git('show',target+':deploy/staging/'+file))))throw Error('Helper de backup mudou.');
  plan={target,preparedAt:new Date().toISOString(),files,composePrevious:read(compose),composeNext,caddyPrevious:read(caddy),caddyNext:read(release+'/Caddyfile.candidate'),oldImage:prepared.images[coreName].image,oldImageId,coreId:images.coreId,override,containers:images.containers};
  if(!activate){privateJson(root+'/activation-plan.json',plan);console.log('PLANO DE ATIVAÇÃO PREPARADO. Nenhum serviço ou migration foi alterado.');console.log('Escopo: migration 085, Core, duas PWAs e gateway. Site/ADM, provedores e pagamentos preservados.');console.log('Ativação ainda NÃO executada.');}
  else {
    const approved=json(root+'/activation-plan.json');
    for(const key of ['target','files','composePrevious','composeNext','caddyPrevious','caddyNext','oldImage','oldImageId','coreId','override','containers'])if(!sameConfiguration(approved[key],plan[key]))throw Error('Plano mudou desde a preparação; interrompido.');
    console.log('Criando backup recente antes da atualização...');
    run(process.execPath,[repo+'/deploy/staging/backup.mjs','--output-dir='+root+'/before-activation']);
    // backup.mjs already verifies dump/documents and atomically finalizes the snapshot.
    verifyPending();privateJson(root+'/activation-started.json',{target,startedAt:new Date().toISOString()});
    console.log('Aplicando somente a migration 085...');
    const core=inspect(coreName),values=Object.fromEntries(core.Config.Env.map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
    const migrationEnv=[];for(const key of ['DATABASE_URL','DB_SSL','DB_SSL_CA','DB_POOL_MAX'])if(values[key]!=null)migrationEnv.push('--env',key+'='+values[key]);
    const migrationOutput=docker('run','--rm','--network','container:'+coreName,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',...migrationEnv,images.coreId,'dist/scripts/migrate.js');
    if(migrationOutput.split('\n').filter(line=>line.startsWith('applied ')).join('\n')!=='applied 085_web_push_preferences.sql')throw Error('Resultado do runner diferente do esperado.');
    const after=compareMigrationHistory(liveHistory(),candidateHistory());if(after.applied!==87||after.pending.length)throw Error('Histórico após migration inesperado.');
    touched=true;
    for(const entry of files){const path=repo+'/'+entry.path;mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.from(entry.next,'base64'));chmodSync(path,entry.mode);chownSync(path,entry.uid,entry.gid);}
    symlinkSync(release+'/bundles',web);
    replace(compose,composeNext);docker('image','tag',images.coreId,'ramo-nessa-core:staging');
    console.log('Atualizando somente o Core...');coreRecreated=true;
    run('docker',[...args,'-f',override,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','90','core'],{env});
    // Once public Web routes are exposed, failures restore routes only and keep the new Core.
    replace(caddy,plan.caddyNext);exposed=true;
    console.log('Ativando os dois apps web no gateway...');
    run('docker',[...args,'-f',override,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','90','gateway'],{env});
    const urls=['https://app.ramonessa.com.br/ready','https://app.ramonessa.com.br/administrodo/','https://app.ramonessa.com.br/passageiro/','https://app.ramonessa.com.br/motorista/','https://ramonessa.com.br/api/health'];
    for(const url of urls){let ok=false;for(let i=0;i<8;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(10_000)});await response.arrayBuffer();if(response.status===200){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!ok)throw Error('Verificação HTTPS falhou: '+url);}
    for(const entry of images.containers.filter(c=>![coreName,gatewayName].includes(c.name)))if(inspect(entry.name).Id!==entry.id)throw Error('Serviço fora do escopo mudou.');
    const newCore=inspect(coreName);if(docker('image','inspect','--format','{{.Id}}',newCore.Image).trim()!==images.coreId)throw Error('Imagem inesperada após ativação.');
    const liveEnv=Object.fromEntries(newCore.Config.Env.map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
    for(const key of Object.keys(config.services.core.environment))if(values[key]!==liveEnv[key])throw Error('Ambiente gerenciado do Core mudou.');
    privateJson(root+'/activation-completed.json',{target,completedAt:new Date().toISOString(),coreImage:newCore.Image,gatewayImage:inspect(gatewayName).Image,migration:'085_web_push_preferences.sql',httpsChecks:true,providerHomologation:false});
    console.log('WEB ATIVADA. API, ADM, site e duas rotas Web responderam HTTP 200.');
    console.log('Passageiro: https://app.ramonessa.com.br/passageiro/');console.log('Motorista: https://app.ramonessa.com.br/motorista/');
    console.log('Login, Maps, permissões e notificações em aparelhos reais ainda precisam de aceite.');
  }
}catch(error){
  console.error(error.message);
  if(touched&&plan){
    try{
      replace(caddy,plan.caddyPrevious);
      const envFile=repo+'/deploy/staging/.env';const env=stagingComposeEnvironment(await stagingGoogleMapsConfiguration(envFile),await stagingOtpConfiguration(envFile));const args=await stagingComposeArguments(envFile);args.splice(1,0,'--project-name','ramo-nessa-staging');
      if(!exposed){
        for(const entry of plan.files){const path=repo+'/'+entry.path;if(entry.previous===null){if(existsSync(path))unlinkSync(path);}else{writeFileSync(path,Buffer.from(entry.previous,'base64'));chmodSync(path,entry.mode);chownSync(path,entry.uid,entry.gid);}}
        replace(compose,plan.composePrevious);if(existsSync(web))unlinkSync(web);docker('image','tag',plan.oldImage,'ramo-nessa-core:staging');
        const rollback=root+'/compose.rollback.json';privateJson(rollback,{services:{core:{image:plan.oldImage}}});
        if(coreRecreated)run('docker',[...args,'-f',rollback,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','90','core'],{env});
        console.error('Core/configuração anteriores restaurados. Migration 085 mantida; banco não restaurado.');
      }else{
        docker('restart',gatewayName);console.error('Rotas anteriores restauradas. Core novo mantido para preservar preferências de notificações. Não repetir a ativação; envie o resultado.');
      }
    }catch{console.error('Retorno automático incompleto. Não repetir comandos. Log privado: '+logPath);}
  }
  process.exitCode=1;
}finally{closeSync(log);}
