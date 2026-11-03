// Prepare only: no migration, container mutation, webhook edit or gateway reload.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runtimeContract,validateRuntime,activeCaddy,activeWeb} from './asaas-runtime-contract.mjs';
import {activationProject,sha256,assertEnvironmentMatches,servicePlan,changesForAsaas} from './asaas-activation-plan-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
const backup='/var/backups/ramo-nessa-asaas/5ffae7968796',lab='/var/lib/ramo-nessa-asaas-sandbox',destination=join(backup,'activation-plan');
const privateDir=path=>{const x=lstatSync(path);if(!x.isDirectory()||x.isSymbolicLink()||x.uid!==0||(x.mode&0o077))throw Error('Diretório privado divergente.');};
privateDir(backup);privateDir(lab);
const lock=join(lab,'execution.lock');closeSync(openSync(lock,'wx',0o600));
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024,...options});if(r.error||r.status!==0){if(existsSync(destination))writeFileSync(join(destination,'failure.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Preparação não concluída: '+command+'. Diagnóstico privado preservado; não houve ativação.');}return r.stdout;}
const inspect=name=>JSON.parse(run('docker',['inspect',name]))[0];
const snapshot=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,inspect(v.name)]));
let created=false;
try{
 if(existsSync(destination))throw Error('Já existe um plano. Não será sobrescrito; envie o resultado.');
 const start=snapshot();validateRuntime(start);
 const prepared=json(join(backup,'prepared.json')),verified=json(join(backup,'backup-verified.json'));
 if(prepared.revision!=='5ffae79687965042765f40f53cd32e57510dfbfe'||verified.candidateRevision!==prepared.revision||!existsSync(join(verified.directory,'manifest.private.json')))throw Error('Preparação/backup não correspondem à candidata.');
 const acceptance=json(join(lab,'webhook-exercise/acceptance.json'));
 if(acceptance.externalWebhookDeliveryVerified!==true||acceptance.status!=='paid'||acceptance.postAttempts!==1||acceptance.ledgerPaidEntries!==1||!acceptance.doneReceived)throw Error('Aceite Sandbox ainda não foi concluído.');
 const temporary=json(join(lab,'public-webhook/state.private.json')),activeBytes=readFileSync(activeCaddy),cleanBytes=readFileSync(join(lab,'public-webhook/Caddyfile.before'));
 if(temporary.phase!=='ready'||temporary.candidateHash!==sha256(activeBytes)||temporary.beforeHash!==sha256(cleanBytes)||!cleanBytes.equals(readFileSync(join(backup,'Caddyfile.before'))))throw Error('Gateway mudou depois do teste; preserve as alterações e envie o resultado.');
 const image={};for(const name of ['core','gateway']){image[name]=JSON.parse(run('docker',['image','inspect',prepared[name+'Image']]))[0];if(image[name].Id!==prepared[name+'Candidate'])throw Error('Imagem candidata mudou: '+name);}
 const query='BEGIN READ ONLY; SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t; COMMIT;';
 const migrations=JSON.parse(run('docker',['exec',runtimeContract.postgres.name,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','asaas-read-only',query]));
 if(JSON.stringify(migrations)!==JSON.stringify(json(join(backup,'migrations-before.json'))))throw Error('Histórico de migrations mudou desde a preparação.');
 mkdirSync(destination,{mode:0o700});created=true;privateDir(destination);
 const save=(name,value)=>writeFileSync(join(destination,name),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
 save('runtime-before.private.json',start);save('Caddyfile.current',activeBytes);save('Caddyfile.after-lab-cleanup',cleanBytes);save('migrations-before.json',migrations);
 const originalPaths=json(join(backup,'compose-paths.private.json'));
 const files=new Map(),models={},bindFingerprints=[];
 for(const c of Object.values(start))for(const m of c.Mounts??[])if(m.Type==='bind'){const info=lstatSync(m.Source);if(info.isSymbolicLink())throw Error('Mount bind por link exige revisão.');if(info.isFile())bindFingerprints.push({path:m.Source,sha256:sha256(readFileSync(m.Source))});}
 for(const name of ['core','gateway']){
  console.log('Resolvendo configuração real do '+name+' e comparando ambiente, redes e mounts...');
  const labels=start[name].Config.Labels??{},composeFiles=(labels['com.docker.compose.project.config_files']??'').split(',').filter(Boolean);
  if(labels['com.docker.compose.project']!==activationProject||!composeFiles.length||composeFiles.some(p=>!p.startsWith('/')))throw Error('Origem Compose do serviço divergente.');
  for(const path of composeFiles){const index=originalPaths.indexOf(path);if(index<0||!readFileSync(path).equals(readFileSync(join(backup,'compose-'+index+'.private'))))throw Error('Arquivo Compose mudou desde a preparação. Preserve a alteração e envie o resultado.');}
  const baseFile=composeFiles.find(p=>p.endsWith('/deploy/staging/compose.yml'));if(!baseFile)throw Error('Compose principal não identificado.');
  const helper=dirname(baseFile),envFile=labels['com.docker.compose.project.environment_file']||join(helper,'.env');
  for(const path of [...composeFiles,envFile,...['firebase.mjs','google-maps.mjs','otp.mjs'].map(n=>join(helper,n))]){const x=lstatSync(path);if(!x.isFile()||x.isSymbolicLink())throw Error('Configuração não é arquivo regular.');const bytes=readFileSync(path);if(files.has(path)&&!files.get(path).equals(bytes))throw Error('Arquivo mudou durante a resolução.');files.set(path,bytes);}
  const mapsModule=await import(pathToFileURL(join(helper,'google-maps.mjs'))),otpModule=await import(pathToFileURL(join(helper,'otp.mjs'))),firebaseModule=await import(pathToFileURL(join(helper,'firebase.mjs')));
  const maps=await mapsModule.stagingGoogleMapsConfiguration(envFile),otp=await otpModule.stagingOtpConfiguration(envFile),env=firebaseModule.stagingComposeEnvironment(maps,otp);
  const args=['compose','--project-name',activationProject,'--env-file',envFile,...composeFiles.flatMap(p=>['-f',p]),'config','--format','json'];
  const resolved=JSON.parse(run('docker',args,{env,cwd:dirname(baseFile)}));
  const oldImage=JSON.parse(run('docker',['image','inspect',start[name].Image]))[0];assertEnvironmentMatches(resolved.services[name],start[name],oldImage);
  const candidate=servicePlan(resolved,name,start[name],prepared[name+'Image'],{disabledAsaas:name==='core'});
  const rollback=servicePlan(resolved,name,start[name],start[name].Config.Image);
  if(JSON.parse(run('docker',['image','inspect',start[name].Config.Image]))[0].Id!==start[name].Image)throw Error('Tag ativa diverge da imagem em execução.');
  if(name==='core')changesForAsaas(resolved.services.core.environment,candidate.services.core.environment);
  save(name+'-resolved-before.private.json',resolved);
  for(const [suffix,model] of [['candidate',candidate],['rollback',rollback]]){
   const file=join(destination,name+'-'+suffix+'.compose.private.json');save(name+'-'+suffix+'.compose.private.json',model);
   const roundTrip=JSON.parse(run('docker',['compose','--project-name',activationProject,'-f',file,'config','--format','json'],{env:{PATH:process.env.PATH},cwd:destination}));
   const expected=model.services[name].environment,actual=roundTrip.services[name].environment;
   for(const key of new Set([...Object.keys(expected),...Object.keys(actual)]))if(expected[key]!==actual[key])throw Error('Releitura Compose alterou ambiente: '+key);
  }
  models[name]={composeFiles,envFile,candidateImage:prepared[name+'Candidate'],beforeImage:start[name].Image};
 }
 const configRecords=[];let index=0;for(const [path,bytes] of files){const copy='source-'+index+++'.private';save(copy,bytes);configRecords.push({path,copy,sha256:sha256(bytes)});}
 save('source-configurations.private.json',configRecords);save('bind-files.private.json',bindFingerprints);
 for(const [path,bytes] of files)if(!readFileSync(path).equals(bytes))throw Error('Configuração mudou durante a preparação.');
 for(const entry of bindFingerprints)if(sha256(readFileSync(entry.path))!==entry.sha256)throw Error('Arquivo de mount mudou durante a preparação.');
 const end=snapshot();validateRuntime(end);for(const k of Object.keys(start))if(JSON.stringify([start[k].Id,start[k].State.StartedAt,start[k].Config.Env,start[k].Mounts])!==JSON.stringify([end[k].Id,end[k].State.StartedAt,end[k].Config.Env,end[k].Mounts]))throw Error('Runtime mudou durante a preparação.');
 if(!readFileSync(activeCaddy).equals(activeBytes))throw Error('Caddy mudou durante a preparação.');
 save('plan.json',{candidateRevision:prepared.revision,preparedAt:new Date().toISOString(),scope:['migration086','core','admin-gateway'],models,activeWeb,activeCaddy,currentCaddyHash:sha256(activeBytes),afterCleanupCaddyHash:sha256(cleanBytes),beforeIds:Object.fromEntries(Object.entries(start).map(([k,v])=>[k,v.Id])),sandboxAccepted:true,operatorReportedHttp200:true,cleanupRequired:true,freshBackupRequired:true,driverClientUpdateRequired:true,migrationApplied:false,servicesChanged:false,asaasEnabled:false});
 console.log('PLANO PREPARADO. Core/ADM candidatos e retorno validados com as configurações reais.');
 console.log('Escopo futuro: migration 086, Core e ADM. Web, preços atuais, site, PostgreSQL e provedores preservados.');
 console.log('Asaas ficará DESATIVADO; nenhum segredo Sandbox será montado no Core ativo.');
 console.log('A migration 086 colocará os repasses em modo manual e acrescentará os controles de antecipação.');
 console.log('Antes da ativação: encerrar o webhook temporário e criar backup recente. Nenhuma migration ou reinício executado agora.');
}catch(error){console.error(error?.message??'Verificação necessária.');if(created)console.error('Plano incompleto preservado para diagnóstico. Não apague nem repita sem conferir.');process.exitCode=1;}
finally{unlinkSync(lock);}
