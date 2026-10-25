// Scoped update over the exact running images. Never restores old financial data.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,lstatSync,existsSync,openSync,closeSync,unlinkSync,cpSync,chmodSync,statfsSync,renameSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {backup,runtimeIdentity,validate} from './backup-regions-pricing.mjs';
import {servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {assertWebGatewayRuntime} from './asaas-driver-web-switch-contract.mjs';
import {names,assertImageDelta,assertCoreRuntime,switchSearch} from './google-search-update-contract.mjs';
import {coreSourceFingerprintProgram} from './inspect-regions-pricing.mjs';
import {hashFile,hashTree,digest,privateDir} from './google-search-update-io.mjs';
import {assertMapProviders} from './prepare-web-map-update.mjs';
import {activitiesSource,baselineCore,dependencyLock,liveWeb,activitiesWeb,activitiesRoot,activitiesDirectory,migrations,assertActivitiesManifest,assertActivitiesGatewayDelta,inspectedWebFiles,inspectedCaddy} from './activities-web-contract.mjs';
const here=dirname(fileURLToPath(import.meta.url));
function host(directory){
 const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{encoding:'utf8',input,timeout:600000,maxBuffer:64*1024**2,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});if(r.error||r.status!==0){if(directory)writeFileSync(join(directory,'command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('ACTIVITIES_COMMAND_FAILED: '+cmd);}return r.stdout;};
 const docker=args=>run('docker',args),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0],image=id=>JSON.parse(docker(['image','inspect',id]))[0];
 const fingerprint=(id,running=false)=>JSON.parse(docker(running?['exec',id,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']:['run','--rm','--network','none','--entrypoint','node',id,'--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
 const admin=(id,running=false)=>{const cmd="cd /srv/admin && test -z \"$(find . -type l -print)\" && find . -type f -exec sha256sum '{}' +";const s=docker(running?['exec',id,'sh','-c',cmd]:['run','--rm','--network','none','--entrypoint','sh',id,'-c',cmd]);return s.trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})\s+\.\/(.+)$/);if(!m)throw Error('ACTIVITIES_ADMIN_FILE');return [m[2],m[1]];}).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);};
 const db=async()=>{const sql="BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT coalesce((SELECT json_build_object('version',version_number,'snapshot',snapshot) FROM pricing_catalog_versions WHERE status='published' AND effective_from<=now() ORDER BY effective_from DESC,version_number DESC LIMIT 1),'null'::json); COMMIT;";const r=JSON.parse(docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','recovery-catalog-readonly',sql]));return {version:r?.version,sha256:r?digest(JSON.stringify(r.snapshot)):null};};
 const recoveryState=()=>docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','recovery-adoption-readonly',"BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SELECT json_build_object("+['ride_boarding_policy','ride_boarding_codes','ride_boarding_audit','ride_checkout_recovery','driver_document_expiry_notices','driver_documents','driver_support_tickets'].map(t=>"'"+t+"',(SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY to_jsonb(d)::text)::text,'[]')) FROM "+t+" d)").join(',')+"); COMMIT;"]).trim();
 const health=async role=>{for(let i=0;i<90;i++){const c=inspect(role);if(c.State.Running&&c.State.Health?.Status==='healthy')return;await new Promise(r=>setTimeout(r,1000));}throw Error('ACTIVITIES_HEALTH_FAILED: '+role);};
 const compose=(file,role)=>docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',file,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate',role]);
 const inspectOrNull=role=>{try{return inspect(role);}catch{return null;}};
 return {run,docker,inspect,inspectOrNull,image,fingerprint,admin,db,recoveryState,health,compose};
}
function assertFingerprint(f,sha){if(f.source?.sha256!==sha||f.packageLockSha256!==dependencyLock)throw Error('ACTIVITIES_CORE_SOURCE_CHANGED');}
function rootOnly(){if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);mkdirSync(activitiesRoot,{recursive:true,mode:0o700});privateDir(activitiesRoot);}
function lock(){const p=join(activitiesRoot,'operations.lock');closeSync(openSync(p,'wx',0o600));return ()=>unlinkSync(p);}
function fixtureAllowed(options,before){if(Object.keys(options).length&&(process.env.GITHUB_ACTIONS!=='true'||before.core.Config.Labels?.['br.com.ramonessa.recovery-ci']!=='true'||before.gateway.Config.Labels?.['br.com.ramonessa.recovery-ci']!=='true'))throw Error('ACTIVITIES_REHEARSAL_FORBIDDEN');}
const save=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
function gatewayVerify(before,current,model,image,web,healthy=true){const expected=structuredClone(before);expected.Image=image.Id;const c=structuredClone(current);if(!healthy)c.State.Health={Status:'healthy'};assertWebGatewayRuntime(expected,c,model,image,web);for(const key of ['Tmpfs','ShmSize','Dns','ExtraHosts','Ulimits','GroupAdd','Init'])if(!isDeepStrictEqual(before.HostConfig[key]??null,current.HostConfig[key]??null))throw Error('ACTIVITIES_GATEWAY_RUNTIME_OPTION: '+key);for(const key of ['WorkingDir','Healthcheck','StopSignal'])if(!isDeepStrictEqual(before.Config[key]??null,current.Config[key]??null))throw Error('ACTIVITIES_GATEWAY_START_OPTION: '+key);}
function backupReceipt(before){const root='/var/backups/ramo-nessa-regions';const candidates=readdirSync(root).map(n=>join(root,n)).filter(d=>existsSync(join(d,'verified.private.json'))).map(directory=>({directory,manifest:JSON.parse(readFileSync(join(directory,'verified.private.json')))})).filter(r=>r.manifest.databaseRestoredInIsolation===true&&Object.keys(names).every(k=>r.manifest.runtimeIds[k]===before[k].Id));if(!candidates.length)throw Error('ACTIVITIES_BACKUP_NOT_VERIFIED');return candidates.sort((a,b)=>b.manifest.createdAt.localeCompare(a.manifest.createdAt))[0].directory;}
function verifyBackup(directory,before){privateDir(directory);const m=JSON.parse(readFileSync(join(directory,'verified.private.json')));if(!m.databaseRestoredInIsolation||!Object.keys(names).every(k=>m.runtimeIds[k]===before[k].Id))throw Error('ACTIVITIES_BACKUP_CHANGED');for(const f of m.files)if(f.name.includes('/')||hashFile(join(directory,f.name))!==f.sha256)throw Error('ACTIVITIES_BACKUP_CHECKSUM');}
export async function prepareActivities(args,fixture={}){
 if(args.length!==2||!args[0].startsWith('/')||!args[0].endsWith('.zip')||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe o ZIP absoluto e SHA-256 revisado.');
 rootOnly();const unlock=lock();
 try{
  if(existsSync(activitiesWeb))throw Error('ACTIVITIES_PREPARATION_EXISTS');
  if(existsSync(activitiesDirectory)){
   privateDir(activitiesDirectory);
   if(readdirSync(activitiesDirectory).length!==0)throw Error('ACTIVITIES_PREPARATION_EXISTS');
  }
  if(statfsSync(activitiesRoot).bavail*statfsSync(activitiesRoot).bsize<4*1024**3)throw Error('ACTIVITIES_DISK_SPACE');
  if(!existsSync(activitiesDirectory))mkdirSync(activitiesDirectory,{mode:0o700});const h=host(activitiesDirectory),before=Object.fromEntries(Object.keys(names).map(k=>[k,h.inspect(k)]));fixtureAllowed(fixture,before);
  validate(before,{'core-image':fixture.coreImage??before.core.Image,'gateway-image':fixture.gatewayImage??before.gateway.Image});
  if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('ACTIVITIES_RUNTIME_MODE');
  assertFingerprint(h.fingerprint(before.core.Id,true),baselineCore);
  const web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web'),caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
  if(web?.Source!==liveWeb||!caddy?.Source)throw Error('ACTIVITIES_WEB_BASE_CHANGED');
  for(const [path,sha]of Object.entries(fixture.webFiles??inspectedWebFiles))if(hashFile(join(liveWeb,path))!==sha)throw Error('ACTIVITIES_LIVE_WEB_CHANGED');
  if(hashFile(caddy.Source)!==(fixture.caddy??inspectedCaddy))throw Error('ACTIVITIES_LIVE_CADDY_CHANGED');
  const catalog=await h.db();if(!Number.isSafeInteger(catalog.version)||!/^[a-f0-9]{64}$/.test(catalog.sha256??''))throw Error('ACTIVITIES_PRICING_CHANGED');
  h.run('python3',[join(here,'stage-activities.py'),args[0],join(activitiesDirectory,'payload'),args[1]]);
  const payload=join(activitiesDirectory,'payload'),manifest=JSON.parse(readFileSync(join(payload,'activities-manifest.json')));assertActivitiesManifest(manifest);
  if(!isDeepStrictEqual(h.admin(before.gateway.Id,true),manifest.baselineAdmin))throw Error('ACTIVITIES_ADMIN_BASE_CHANGED');
  const oldWebHash=hashTree(liveWeb),caddyHash=hashFile(caddy.Source),configs={},models={},images={};
  for(const role of ['core','gateway']){
   const paths=(before[role].Config.Labels?.['com.docker.compose.project.config_files']??'').split(',');if(paths.length!==1||!paths[0].startsWith('/'))throw Error('ACTIVITIES_COMPOSE_REVIEW_REQUIRED');
   const stat=lstatSync(paths[0]);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0)throw Error('ACTIVITIES_PRIVATE_COMPOSE');
   const raw=JSON.parse(readFileSync(paths[0]));if(raw.name!=='ramo-nessa-staging'||raw.services?.[role]?.env_file)throw Error('ACTIVITIES_COMPOSE_NOT_SELF_CONTAINED');
   const resolved=JSON.parse(h.docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',paths[0],'config','--format','json']));images[role]=h.image(before[role].Image);assertEnvironmentMatches(resolved.services[role],before[role],images[role]);models[role]=servicePlan(resolved,role,before[role],before[role].Image);configs[role]={path:paths[0],sha256:hashFile(paths[0])};
  }
  console.log('Criando backup verificado, com restauração isolada. Serviços ativos preservados...');
  await backup(['--core-image='+before.core.Image,'--gateway-image='+before.gateway.Image]);const backupDirectory=backupReceipt(before);verifyBackup(backupDirectory,before);
  mkdirSync(dirname(activitiesWeb),{recursive:true,mode:0o755});chmodSync(dirname(activitiesWeb),0o755);mkdirSync(activitiesWeb,{mode:0o755});chmodSync(activitiesWeb,0o755);
  cpSync(join(payload,'driver'),join(activitiesWeb,'driver'),{recursive:true});cpSync(join(payload,'passenger'),join(activitiesWeb,'passenger'),{recursive:true});
  function publishModes(p){const stat=lstatSync(p);if(stat.isSymbolicLink())throw Error('ACTIVITIES_WEB_LINK');if(stat.isDirectory()){chmodSync(p,0o755);for(const n of readdirSync(p))publishModes(join(p,n));}else chmodSync(p,0o644);}publishModes(join(activitiesWeb,'passenger'));publishModes(join(activitiesWeb,'driver'));
  assertMapProviders(liveWeb,activitiesWeb);
  const nextImages={};
  for(const role of ['core','gateway']){
   const base='ramo-nessa-activities-'+role+'-base:'+before[role].Image.slice(7);h.docker(['tag',before[role].Image,base]);if(h.image(base).Id!==before[role].Image)throw Error('ACTIVITIES_IMAGE_REFERENCE');
   if(role==='core'&&images.core.Config.User!=='node')throw Error('ACTIVITIES_CORE_USER_CHANGED');
   const folder=role==='core'?'core':'admin',files=manifest.files.filter(f=>f.path.startsWith(folder+'/'));
   const dockerfile='FROM '+base+'\n'+files.map(f=>'COPY --chmod=0644 '+f.path+' /'+(role==='core'?'app/':'srv/admin/')+f.path.slice(folder.length+1)).join('\n')+'\n'+(role==='core'?migrations.map(m=>'COPY --chmod=0644 migration/'+m.filename+' /app/migrations/'+m.filename+'\n').join(''):'');
   const file=join(payload,role+'.Dockerfile');writeFileSync(file,dockerfile,{mode:0o600});const tag='ramo-nessa-activities-'+role+':'+activitiesSource.slice(0,12);
   h.docker(['build','--network','none','--pull=false','-f',file,'-t',tag,payload]);nextImages[role]=h.image(tag);assertImageDelta(images[role],nextImages[role]);
  }
  assertFingerprint(h.fingerprint(nextImages.core.Id),manifest.candidateCore);if(!isDeepStrictEqual(h.admin(nextImages.gateway.Id),manifest.candidateAdmin))throw Error('ACTIVITIES_ADMIN_CANDIDATE');
  const afterCore=structuredClone(models.core);afterCore.services.core.image=nextImages.core.Id;
  const afterGateway=structuredClone(models.gateway);afterGateway.services.gateway.image=nextImages.gateway.Id;afterGateway.services.gateway.volumes.find(m=>m.target==='/srv/web').source=activitiesWeb;assertActivitiesGatewayDelta(models.gateway,afterGateway,nextImages.gateway.Id,activitiesWeb);
  const files={};for(const [name,value]of Object.entries({'runtime-before':before,'images-before':images,'images-after':nextImages,'core-before':models.core,'core-after':afterCore,'gateway-before':models.gateway,'gateway-after':afterGateway})){
   const path=join(activitiesDirectory,name+'.private.json');save(path,value);files[name+'.private.json']=hashFile(path);
   if(name.startsWith('core-')||name.startsWith('gateway-')){const role=name.split('-')[0],resolved=JSON.parse(h.docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',path,'config','--format','json']));if(!isDeepStrictEqual(resolved.services[role].environment,value.services[role].environment))throw Error('ACTIVITIES_ENVIRONMENT_ROUNDTRIP');}
  }
  for(const role of Object.keys(names))if(runtimeIdentity(h.inspect(role))!==runtimeIdentity(before[role]))throw Error('ACTIVITIES_RUNTIME_CHANGED_DURING_PREPARE');
  if(hashTree(liveWeb)!==oldWebHash||hashFile(caddy.Source)!==caddyHash||(await h.db()).sha256!==catalog.sha256)throw Error('ACTIVITIES_BASE_CHANGED_DURING_PREPARE');
  for(const f of Object.values(configs))if(hashFile(f.path)!==f.sha256)throw Error('ACTIVITIES_CONFIG_CHANGED');
  const tools=join(activitiesDirectory,'tools/deploy/staging');mkdirSync(tools,{recursive:true,mode:0o700});cpSync(here,tools,{recursive:true});
  const plan={format:1,source:activitiesSource,archiveSha256:args[1],manifestSha256:hashFile(join(payload,'activities-manifest.json')),files,configs,caddy:{path:caddy.Source,sha256:caddyHash},oldWebHash,newWebHash:hashTree(activitiesWeb),driverHash:hashTree(join(activitiesWeb,'driver')),catalog,backupDirectory};save(join(activitiesDirectory,'prepared.private.json'),plan);
  const result={directory:activitiesDirectory,sha256:hashFile(join(activitiesDirectory,'prepared.private.json'))};console.log(JSON.stringify({status:'ACTIVITIES_WEB_PREPARADO',...result,servicesRestarted:false}));return result;
 }finally{unlock();}
}
export async function activateActivities(args,rehearsal={}){
 if(args.length!==2||args[0]!==activitiesDirectory||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe preparação e SHA-256 revisados.');rootOnly();privateDir(activitiesDirectory);const unlock=lock(),journal=join(activitiesDirectory,'activation.private.json');
 let adoptionBaseline=null;let interrupted=false;const signal=()=>{interrupted=true;},barrier=()=>{if(interrupted)throw Error('ACTIVITIES_INTERRUPTED');};for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,signal);
 const record=data=>writeFileSync(journal,JSON.stringify({...data,...(adoptionBaseline==null?{}:{adoptionFingerprint:digest(adoptionBaseline)}),source:activitiesSource,at:new Date().toISOString()},null,2),{mode:0o600});
 try{
  if(existsSync(journal))throw Error('ACTIVITIES_ACTIVATION_ALREADY_STARTED');
  if(hashFile(join(activitiesDirectory,'prepared.private.json'))!==args[1])throw Error('ACTIVITIES_PLAN_CHANGED');
  const p=JSON.parse(readFileSync(join(activitiesDirectory,'prepared.private.json')));if(p.format!==1||p.source!==activitiesSource)throw Error('ACTIVITIES_PLAN_SOURCE');
  const expected=['core-after','core-before','gateway-after','gateway-before','images-after','images-before','runtime-before'].map(n=>n+'.private.json').sort();if(!isDeepStrictEqual(Object.keys(p.files).sort(),expected))throw Error('ACTIVITIES_PLAN_FILES');
  for(const [name,sha]of Object.entries(p.files))if(hashFile(join(activitiesDirectory,name))!==sha)throw Error('ACTIVITIES_PLAN_FILE_CHANGED');
  const load=n=>JSON.parse(readFileSync(join(activitiesDirectory,n+'.private.json'))),before=load('runtime-before'),images=load('images-before'),next=load('images-after'),cb=load('core-before'),ca=load('core-after'),gb=load('gateway-before'),ga=load('gateway-after'),h=host(activitiesDirectory);fixtureAllowed(rehearsal,before);
  const payload=join(activitiesDirectory,'payload');if(hashFile(join(payload,'activities-manifest.json'))!==p.manifestSha256)throw Error('ACTIVITIES_MANIFEST_CHANGED');const manifest=JSON.parse(readFileSync(join(payload,'activities-manifest.json')));assertActivitiesManifest(manifest);
  for(const f of manifest.files)if(hashFile(join(payload,f.path))!==f.sha256)throw Error('ACTIVITIES_PAYLOAD_CHANGED');
  const expectedCore=structuredClone(cb);expectedCore.services.core.image=next.core.Id;if(!isDeepStrictEqual(expectedCore,ca))throw Error('ACTIVITIES_CORE_OPTIONS_CHANGED');assertActivitiesGatewayDelta(gb,ga,next.gateway.Id,activitiesWeb);
  for(const role of ['core','gateway']){assertImageDelta(images[role],next[role]);if(!isDeepStrictEqual(h.image(next[role].Id).Config,next[role].Config))throw Error('ACTIVITIES_IMAGE_CHANGED');}
  const intact=async()=>{for(const f of [...Object.values(p.configs),p.caddy])if(hashFile(f.path)!==f.sha256)throw Error('ACTIVITIES_ACTIVE_CONFIGURATION_CHANGED');if(hashTree(liveWeb)!==p.oldWebHash||hashTree(activitiesWeb)!==p.newWebHash||hashTree(join(activitiesWeb,'driver'))!==p.driverHash)throw Error('ACTIVITIES_WEB_FILES_CHANGED');for(const role of ['postgres','maps','site'])if(runtimeIdentity(h.inspect(role))!==runtimeIdentity(before[role]))throw Error('ACTIVITIES_UNRELATED_SERVICE_CHANGED');if(!isDeepStrictEqual(await h.db(),p.catalog))throw Error('ACTIVITIES_CATALOG_CHANGED');};
  for(const role of Object.keys(names))if(runtimeIdentity(h.inspect(role))!==runtimeIdentity(before[role]))throw Error('ACTIVITIES_RUNTIME_CHANGED_SINCE_PREPARE');await intact();verifyBackup(p.backupDirectory,before);
  assertFingerprint(h.fingerprint(before.core.Id,true),baselineCore);if(!isDeepStrictEqual(h.admin(before.gateway.Id,true),manifest.baselineAdmin))throw Error('ACTIVITIES_ADMIN_CHANGED');
  const url=process.env.GITHUB_ACTIONS==='true'&&before.gateway.Config.Labels?.['br.com.ramonessa.recovery-ci']==='true'?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
  const published=async candidate=>{
   const root=candidate?activitiesWeb:liveWeb;
   const files=[...['index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js'].map(f=>['/passageiro/'+f,join(root,'passenger',f)]),...['index.html','main.dart.js','ramo_push_config.js'].map(f=>['/motorista/'+f,join(root,'driver',f)]),...(candidate?manifest.adminDelta.map(f=>['/administrodo/'+f,join(payload,'admin',f)]):[])];
   for(const [path,file]of files){const r=await fetch(url+path+'?recovery-review='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});if(r.status!==200||digest(Buffer.from(await r.arrayBuffer()))!==hashFile(file))throw Error('ACTIVITIES_PUBLIC_FILE_MISMATCH: '+path);}
   for(const role of ['passageiro','motorista','administrodo']){
    const r=await fetch(url+'/'+role+'/?recovery-permissions='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const policy='camera=(), microphone=(), geolocation='+ (role==='administrodo'?'()':'(self)');
    if(r.status!==200||r.headers.get('permissions-policy')!==policy)throw Error('ACTIVITIES_GPS_POLICY_CHANGED: '+role);
   }
   for(const path of ['/health','/ready'])if((await fetch(url+path,{signal:AbortSignal.timeout(15000)})).status!==200)throw Error('ACTIVITIES_PUBLIC_HEALTH');
   if(candidate){const r=await fetch(url+'/v1/content/guide',{signal:AbortSignal.timeout(15000)}),d=await r.json();if(r.status!==200||!Array.isArray(d.entities)||d.entities.some(e=>'draft'in e||'published'in e||'archived'in e))throw Error('ACTIVITIES_PUBLIC_API');if((await fetch(url+'/v1/admin/guide',{signal:AbortSignal.timeout(15000)})).status!==401)throw Error('ACTIVITIES_ADMIN_AUTH');}
  };
  await published(false);
  const verify=async candidate=>{assertCoreRuntime(before.core,h.inspect('core'),candidate?ca:cb,candidate?next.core:images.core);assertFingerprint(h.fingerprint(names.core,true),candidate?manifest.candidateCore:baselineCore);gatewayVerify(before.gateway,h.inspect('gateway'),candidate?ga:gb,candidate?next.gateway:images.gateway,candidate?activitiesWeb:liveWeb);if(!isDeepStrictEqual(h.admin(names.gateway,true),candidate?manifest.candidateAdmin:manifest.baselineAdmin))throw Error('ACTIVITIES_ADMIN_BYTES');await intact();await published(candidate);};
  barrier();record({phase:'migrating'});console.log('Preparando Atividades, ajuda vinculada e embarque desativado; registros existentes preservados...');
  const migrationPayload=migrations.map(m=>({...m,sql:readFileSync(join(payload,'migration',m.filename),'utf8')})),program=readFileSync(join(here,'activities-migrations.mjs'),'utf8');
  try{h.run('docker',['exec','-i',names.core,'node','--input-type=module','-e',program],JSON.stringify({migrations:migrationPayload,baselineMigrations:manifest.baselineMigrations}));}catch(e){record({phase:'migration-failed',servicesRestarted:false});throw e;}
  adoptionBaseline=h.recoveryState();record({phase:'switching',additiveMigrationRetained:true});
  try{
   await switchSearch({
    coreUp:async()=>{barrier();await intact();console.log('Atualizando o Core com ambiente e provedores preservados...');h.compose(join(activitiesDirectory,'core-after.private.json'),'core');},
    coreVerify:async()=>{await h.health('core');barrier();assertCoreRuntime(before.core,h.inspect('core'),ca,next.core);assertFingerprint(h.fingerprint(names.core,true),manifest.candidateCore);await intact();if(rehearsal.failAfterCore)throw Error('ACTIVITIES_SYNTHETIC_CORE_FAILURE');},
    gatewayUp:async()=>{barrier();gatewayVerify(before.gateway,h.inspect('gateway'),gb,images.gateway,liveWeb);console.log('Atualizando Passageiro, Motorista Web e ADM...');h.compose(join(activitiesDirectory,'gateway-after.private.json'),'gateway');},
    verify:async()=>{await h.health('gateway');barrier();await verify(true);barrier();if(rehearsal.beforeFailure)await rehearsal.beforeFailure();if(rehearsal.removeGatewayAfterWeb){h.docker(['rm','-f',names.gateway]);throw Error('ACTIVITIES_SYNTHETIC_GATEWAY_MISSING');}if(rehearsal.failAfterWeb)throw Error('ACTIVITIES_SYNTHETIC_WEB_FAILURE');},
    gatewayRollback:async()=>{await intact();const c=h.inspectOrNull('gateway');if(c==null){h.compose(join(activitiesDirectory,'gateway-before.private.json'),'gateway');await h.health('gateway');return;}const newer=c.Mounts.find(m=>m.Destination==='/srv/web')?.Source===activitiesWeb;if(!newer&&c.Image!==images.gateway.Id)throw Error('ACTIVITIES_CONCURRENT_GATEWAY');gatewayVerify(before.gateway,c,newer?ga:gb,newer?next.gateway:images.gateway,newer?activitiesWeb:liveWeb,false);if(newer||c.State.Health?.Status!=='healthy')h.compose(join(activitiesDirectory,'gateway-before.private.json'),'gateway');await h.health('gateway');gatewayVerify(before.gateway,h.inspect('gateway'),gb,images.gateway,liveWeb);},
    coreRollback:async()=>{await intact();if(h.recoveryState()!==adoptionBaseline)throw Error('ACTIVITIES_NEW_STATE_REQUIRES_REVIEW: Core atualizado preservado; nenhum dado restaurado.');const c=h.inspectOrNull('core');if(c==null){h.compose(join(activitiesDirectory,'core-before.private.json'),'core');await h.health('core');return;}const newer=c.Image===next.core.Id;if(!newer&&c.Image!==images.core.Id)throw Error('ACTIVITIES_CONCURRENT_CORE');assertCoreRuntime(before.core,c,newer?ca:cb,newer?next.core:images.core,{healthy:false});if(newer||c.State.Health?.Status!=='healthy')h.compose(join(activitiesDirectory,'core-before.private.json'),'core');await h.health('core');},
    verifyRollback:async()=>verify(false),
   });
  }catch(e){record({phase:e.rollbackComplete?'rolled-back':'requires-review',rollbackComplete:e.rollbackComplete===true,additiveMigrationRetained:true});throw e;}
  record({phase:'completed',passengerWebUpdated:true,adminUpdated:true,coreUpdated:true,driverWebUpdated:true,nativeAppsUpdated:false});console.log(JSON.stringify({status:'ATIVIDADES_WEB_ATUALIZADAS',source:activitiesSource,driverWebUpdated:true,nativeAppsUpdated:false,providerConfigurationPreserved:true,webAcceptancePending:true,boardingEnabled:false,rollback:{directory:activitiesDirectory,sha256:args[1],command:'sudo node '+join(activitiesDirectory,'tools/deploy/staging/activities-web-update.mjs')+' rollback '+activitiesDirectory+' '+args[1]}}));
 }finally{for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.removeListener(name,signal);unlock();}
}
// Code/Web rollback only; never restores a database dump or overwrites new payments.
export async function rollbackActivities(args){
 if(args.length!==2||args[0]!==activitiesDirectory||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe preparação e SHA-256 revisados.');
 rootOnly();privateDir(activitiesDirectory);const unlock=lock();
 try{
  const planPath=join(activitiesDirectory,'prepared.private.json');if(hashFile(planPath)!==args[1])throw Error('ACTIVITIES_PLAN_CHANGED');
  const p=JSON.parse(readFileSync(planPath));if(p.source!==activitiesSource)throw Error('ACTIVITIES_PLAN_SOURCE');
  for(const [name,sha]of Object.entries(p.files))if(hashFile(join(activitiesDirectory,name))!==sha)throw Error('ACTIVITIES_PLAN_FILE_CHANGED');
  const journal=join(activitiesDirectory,'activation.private.json'),receipt=JSON.parse(readFileSync(journal));
  if(!['completed','manual-rollback-started'].includes(receipt.phase)||!/^[a-f0-9]{64}$/.test(receipt.adoptionFingerprint??''))throw Error('ACTIVITIES_ROLLBACK_NOT_READY');
  const h=host(activitiesDirectory),load=n=>JSON.parse(readFileSync(join(activitiesDirectory,n+'.private.json'))),before=load('runtime-before'),images=load('images-before'),next=load('images-after'),cb=load('core-before'),ca=load('core-after'),gb=load('gateway-before'),ga=load('gateway-after');
  for(const f of [...Object.values(p.configs),p.caddy])if(hashFile(f.path)!==f.sha256)throw Error('ACTIVITIES_ACTIVE_CONFIGURATION_CHANGED');
  if(hashTree(liveWeb)!==p.oldWebHash||hashTree(activitiesWeb)!==p.newWebHash)throw Error('ACTIVITIES_WEB_FILES_CHANGED');
  for(const role of ['postgres','maps','site'])if(runtimeIdentity(h.inspect(role))!==runtimeIdentity(before[role]))throw Error('ACTIVITIES_UNRELATED_SERVICE_CHANGED');
  if(!isDeepStrictEqual(await h.db(),p.catalog))throw Error('ACTIVITIES_CATALOG_CHANGED');
  const policy=h.docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "SELECT enabled FROM ride_boarding_policy WHERE singleton"']).trim();
  if(policy!=='f')throw Error('ACTIVITIES_ROLLBACK_BOARDING_POLICY_REQUIRES_REVIEW');
  const currentCore=h.inspect('core'),coreCandidate=currentCore.Image===next.core.Id;
  if(!coreCandidate&&currentCore.Image!==images.core.Id)throw Error('ACTIVITIES_CONCURRENT_CORE');
  assertCoreRuntime(before.core,currentCore,coreCandidate?ca:cb,coreCandidate?next.core:images.core);
  assertFingerprint(h.fingerprint(names.core,true),coreCandidate?JSON.parse(readFileSync(join(activitiesDirectory,'payload/activities-manifest.json'))).candidateCore:baselineCore);
  const current=h.inspect('gateway'),newWeb=current.Mounts.find(m=>m.Destination==='/srv/web')?.Source===activitiesWeb;
  gatewayVerify(before.gateway,current,newWeb?ga:gb,newWeb?next.gateway:images.gateway,newWeb?activitiesWeb:liveWeb);
  const canRevertCore=digest(h.recoveryState())===receipt.adoptionFingerprint;
  writeFileSync(journal,JSON.stringify({...receipt,phase:'manual-rollback-started',at:new Date().toISOString()},null,2),{mode:0o600});
  if(newWeb)h.compose(join(activitiesDirectory,'gateway-before.private.json'),'gateway');await h.health('gateway');
  gatewayVerify(before.gateway,h.inspect('gateway'),gb,images.gateway,liveWeb);
  // Check again after switching the Web; concurrent adoption must keep the compatible Core.
  let coreReverted=!coreCandidate;
  if(coreCandidate&&canRevertCore&&digest(h.recoveryState())===receipt.adoptionFingerprint){h.compose(join(activitiesDirectory,'core-before.private.json'),'core');await h.health('core');coreReverted=true;}
  assertCoreRuntime(before.core,h.inspect('core'),coreReverted?cb:ca,coreReverted?images.core:next.core);
  const url=process.env.GITHUB_ACTIONS==='true'&&before.gateway.Config.Labels?.['br.com.ramonessa.recovery-ci']==='true'?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
  for(const path of ['/health','/ready','/passageiro/','/motorista/','/administrodo/'])if((await fetch(url+path,{signal:AbortSignal.timeout(15000)})).status!==200)throw Error('ACTIVITIES_ROLLBACK_PUBLIC_HEALTH');
  writeFileSync(journal,JSON.stringify({...receipt,phase:'manual-rollback-completed',coreReverted,at:new Date().toISOString()},null,2),{mode:0o600});
  const result={status:'ATIVIDADES_RETORNO_CONCLUIDO',webReverted:true,coreReverted,newRecordsPreserved:true,databaseRestored:false,nativeAppsUpdated:false};
  if(!coreReverted)console.log('Web anterior restaurada. Core compatível preservado porque há registros novos. Nenhum saldo ou pagamento foi restaurado.');
  console.log(JSON.stringify(result));return result;
 }finally{unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const [mode,...args]=process.argv.slice(2);if(mode==='prepare')await prepareActivities(args);else if(mode==='activate')await activateActivities(args);else if(mode==='rollback')await rollbackActivities(args);else if(mode==='install'){const p=await prepareActivities(args);await activateActivities([p.directory,p.sha256]);}else throw Error('Use prepare, activate, install ou rollback.');}catch(e){console.error(e.message);if(e.cause)console.error('Motivo: '+e.cause.message);process.exitCode=1;}}
