import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,openSync,writeSync,ftruncateSync,fsyncSync,closeSync,existsSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { stagingGoogleMapsConfiguration } from '/opt/ramo-nessa/deploy/staging/google-maps.mjs';
import { stagingOtpConfiguration } from '/opt/ramo-nessa/deploy/staging/otp.mjs';
import { stagingComposeArguments,stagingComposeEnvironment } from '/opt/ramo-nessa/deploy/staging/firebase.mjs';
const repo='/opt/ramo-nessa',revision=process.argv[2];
if(process.getuid?.()!==0||!/^[a-f0-9]{40}$/.test(revision??''))throw new Error('Execute com sudo e informe a revisão exata.');
const backup='/var/backups/ramo-nessa-site-admin/'+revision.slice(0,12),report=JSON.parse(readFileSync(backup+'/prepared.json','utf8'));
if(report.revision!==revision||existsSync(backup+'/activated.json'))throw new Error('Preparação diferente ou já ativada.');
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:repo,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','inherit'],...options});if(r.error||r.status!==0)throw new Error('Falha ao executar '+command);return r.stdout;}
const inspect=name=>JSON.parse(run('docker',['inspect',name]))[0];
const checksum=value=>createHash('sha256').update(value).digest('hex');
const activePath=repo+'/deploy/staging/Caddyfile',prior=readFileSync(backup+'/Caddyfile.before','utf8'),candidate=readFileSync(backup+'/Caddyfile.candidate','utf8');
if(checksum(readFileSync(activePath))!==report.activeSha||checksum(prior)!==report.activeSha||checksum(candidate)!==report.candidateSha)throw new Error('Configuração mudou. Nenhuma ativação realizada.');
for(const [name,id]of [['ramo-nessa-staging-core-1',report.coreId],['ramo-nessa-staging-postgres-1',report.postgresId]])if(inspect(name).Id!==id)throw new Error('Serviço alterado desde a preparação.');
if(inspect('ramo-nessa-staging-gateway-1').Image!==report.gatewayBefore||inspect('ramo-nessa-site-institutional-site-1').Image!==report.siteBefore)throw new Error('Imagem ativa mudou.');
for(const f of report.files){const current=existsSync(join(repo,f))?readFileSync(join(repo,f),'utf8'):null;if(current!==report.sourceBefore[f])throw new Error('Arquivo local mudou: '+f);}
const envFile=repo+'/deploy/staging/.env';const maps=await stagingGoogleMapsConfiguration(envFile),otp=await stagingOtpConfiguration(envFile);
const args=await stagingComposeArguments(envFile);args.splice(1,0,'--project-name','ramo-nessa-staging');const env=stagingComposeEnvironment(maps,otp);
const compose=tail=>run('docker',[...args,...tail],{env,stdio:'inherit'});
const siteCompose=tail=>run('docker',['compose','--project-name','ramo-nessa-site','-f','/opt/ramo-nessa-site/compose.yml',...tail],{stdio:'inherit'});
compose(['config','--quiet']);siteCompose(['config','--quiet']);
run('docker',['exec','ramo-nessa-site-institutional-site-1','node','ops/backup.mjs'],{stdio:'inherit'});
run('docker',['image','tag',report.siteBefore,'ramo-nessa-site:rollback-'+revision.slice(0,12)]);
run('docker',['image','tag',report.gatewayBefore,'ramo-nessa-admin-gateway:rollback-site-'+revision.slice(0,12)]);
function writeConfig(value){const fd=openSync(activePath,'r+');try{const bytes=Buffer.from(value);let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset,offset);ftruncateSync(fd,bytes.length);fsyncSync(fd);}finally{closeSync(fd);}}
const up=['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90'];
let siteChanged=false,gatewayChanged=false,sourceChanged=false;
try{
  run('docker',['image','tag',report.siteImage,'ramo-nessa-site:refinado']);siteChanged=true;siteCompose([...up,'institutional-site']);
  sourceChanged=true;for(const f of report.files)writeFileSync(join(repo,f),readFileSync(join(report.release,f)));
  writeConfig(candidate);run('docker',['image','tag',report.gatewayImage,'ramo-nessa-admin-gateway:staging']);gatewayChanged=true;compose([...up,'gateway']);
  const checks=[['https://app.ramonessa.com.br/ready',200],['https://app.ramonessa.com.br/administrodo/',200],['https://app.ramonessa.com.br/administrodo/src/site-admin.js',200],['https://app.ramonessa.com.br/site-management/content',401],['https://app.ramonessa.com.br/admin/',404],['https://ramonessa.com.br/',200],['https://ramonessa.com.br/api/site-content',200]];
  for(const [url,expected]of checks){const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(response.status!==expected)throw new Error('Verificação falhou: '+url);}
  for(const [name,id]of [['ramo-nessa-staging-core-1',report.coreId],['ramo-nessa-staging-postgres-1',report.postgresId]])if(inspect(name).Id!==id)throw new Error('Identidade de serviço alterada.');
  writeFileSync(backup+'/activated.json',JSON.stringify({revision,activatedAt:new Date().toISOString()}),{mode:0o600});
  console.log('ATIVADO: https://app.ramonessa.com.br/administrodo/site-aplicativos');
}catch(error){
  console.error('Ativação falhou. Restaurando site e gateway anteriores...');
  try{
    writeConfig(prior);
    if(sourceChanged)for(const f of report.files){const value=report.sourceBefore[f];if(value===null){if(existsSync(join(repo,f)))unlinkSync(join(repo,f));}else writeFileSync(join(repo,f),value);}
    run('docker',['image','tag',report.gatewayBefore,'ramo-nessa-admin-gateway:staging']);if(gatewayChanged)compose([...up,'gateway']);
    run('docker',['image','tag',report.siteBefore,'ramo-nessa-site:refinado']);if(siteChanged)siteCompose([...up,'institutional-site']);
    console.error('Imagens, arquivos e configuração anteriores restaurados. Os registros foram preservados.');
  }catch{console.error('Recuperação incompleta. Envie o resultado antes de executar outros comandos.');}
  process.exitCode=1;
}
