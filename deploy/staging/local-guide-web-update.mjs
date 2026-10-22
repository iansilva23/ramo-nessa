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
import {guideSource,baselineCore,dependencyLock,liveCore,liveGateway,liveWeb,guideWeb,guideRoot,guideDirectory,liveCatalog,migration,assertGuideManifest,assertGuideGatewayDelta} from './local-guide-web-contract.mjs';
const here=dirname(fileURLToPath(import.meta.url));
function host(directory){
 const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{encoding:'utf8',input,timeout:600000,maxBuffer:64*1024**2,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});if(r.error||r.status!==0){if(directory)writeFileSync(join(directory,'command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('GUIDE_COMMAND_FAILED: '+cmd);}return r.stdout;};
 const docker=args=>run('docker',args),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0],image=id=>JSON.parse(docker(['image','inspect',id]))[0];
 const fingerprint=(id,running=false)=>JSON.parse(docker(running?['exec',id,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']:['run','--rm','--network','none','--entrypoint','node',id,'--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
 const admin=(id,running=false)=>{const cmd="cd /srv/admin && test -z \"$(find . -type l -print)\" && find . -type f -exec sha256sum '{}' +";const s=docker(running?['exec',id,'sh','-c',cmd]:['run','--rm','--network','none','--entrypoint','sh',id,'-c',cmd]);return s.trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})\s+\.\/(.+)$/);if(!m)throw Error('GUIDE_ADMIN_FILE');return [m[2],m[1]];}).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);};
 const db=async()=>{const sql="BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT coalesce((SELECT json_build_object('version',version_number,'snapshot',snapshot) FROM pricing_catalog_versions WHERE status='published' AND effective_from<=now() ORDER BY effective_from DESC,version_number DESC LIMIT 1),'null'::json); COMMIT;";const r=JSON.parse(docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','guide-catalog-readonly',sql]));return {version:r?.version,sha256:r?digest(JSON.stringify(r.snapshot)):null};};
 const health=async role=>{for(let i=0;i<90;i++){const c=inspect(role);if(c.State.Running&&c.State.Health?.Status==='healthy')return;await new Promise(r=>setTimeout(r,1000));}throw Error('GUIDE_HEALTH_FAILED: '+role);};
 const compose=(file,role)=>docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',file,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate',role]);
 return {run,docker,inspect,image,fingerprint,admin,db,health,compose};
}
function assertFingerprint(f,sha){if(f.source?.sha256!==sha||f.packageLockSha256!==dependencyLock)throw Error('GUIDE_CORE_SOURCE_CHANGED');}
function rootOnly(){if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);mkdirSync(guideRoot,{recursive:true,mode:0o700});privateDir(guideRoot);}
function lock(){const p=join(guideRoot,'operations.lock');closeSync(openSync(p,'wx',0o600));return ()=>unlinkSync(p);}
function fixtureAllowed(options,before){if(Object.keys(options).length&&(process.env.GITHUB_ACTIONS!=='true'||before.core.Config.Labels?.['br.com.ramonessa.guide-ci']!=='true'||before.gateway.Config.Labels?.['br.com.ramonessa.guide-ci']!=='true'))throw Error('GUIDE_REHEARSAL_FORBIDDEN');}
const save=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
function gatewayVerify(before,current,model,image,web,healthy=true){const expected=structuredClone(before);expected.Image=image.Id;const c=structuredClone(current);if(!healthy)c.State.Health={Status:'healthy'};assertWebGatewayRuntime(expected,c,model,image,web);for(const key of ['Tmpfs','ShmSize','Dns','ExtraHosts','Ulimits','GroupAdd','Init'])if(!isDeepStrictEqual(before.HostConfig[key]??null,current.HostConfig[key]??null))throw Error('GUIDE_GATEWAY_RUNTIME_OPTION: '+key);for(const key of ['WorkingDir','Healthcheck','StopSignal'])if(!isDeepStrictEqual(before.Config[key]??null,current.Config[key]??null))throw Error('GUIDE_GATEWAY_START_OPTION: '+key);}
function backupReceipt(before){const root='/var/backups/ramo-nessa-regions';const candidates=readdirSync(root).map(n=>join(root,n)).filter(d=>existsSync(join(d,'verified.private.json'))).map(directory=>({directory,manifest:JSON.parse(readFileSync(join(directory,'verified.private.json')))})).filter(r=>r.manifest.databaseRestoredInIsolation===true&&Object.keys(names).every(k=>r.manifest.runtimeIds[k]===before[k].Id));if(!candidates.length)throw Error('GUIDE_BACKUP_NOT_VERIFIED');return candidates.sort((a,b)=>b.manifest.createdAt.localeCompare(a.manifest.createdAt))[0].directory;}
function verifyBackup(directory,before){privateDir(directory);const m=JSON.parse(readFileSync(join(directory,'verified.private.json')));if(!m.databaseRestoredInIsolation||!Object.keys(names).every(k=>m.runtimeIds[k]===before[k].Id))throw Error('GUIDE_BACKUP_CHANGED');for(const f of m.files)if(f.name.includes('/')||hashFile(join(directory,f.name))!==f.sha256)throw Error('GUIDE_BACKUP_CHECKSUM');}
export async function prepareGuide(args,fixture={}){
 if(args.length!==2||!args[0].startsWith('/')||!args[0].endsWith('.zip')||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe o ZIP absoluto e SHA-256 revisado.');
 rootOnly();const unlock=lock();
 try{
  if(existsSync(guideDirectory)||existsSync(guideWeb))throw Error('GUIDE_PREPARATION_EXISTS');
  if(statfsSync(guideRoot).bavail*statfsSync(guideRoot).bsize<4*1024**3)throw Error('GUIDE_DISK_SPACE');
  mkdirSync(guideDirectory,{mode:0o700});const h=host(guideDirectory),before=Object.fromEntries(Object.keys(names).map(k=>[k,h.inspect(k)]));fixtureAllowed(fixture,before);
  validate(before,{'core-image':fixture.coreImage??liveCore,'gateway-image':fixture.gatewayImage??liveGateway});
  if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('GUIDE_RUNTIME_MODE');
  assertFingerprint(h.fingerprint(before.core.Id,true),baselineCore);
  const web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web'),caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
  if(web?.Source!==liveWeb||!caddy?.Source)throw Error('GUIDE_WEB_BASE_CHANGED');
  const catalog=await h.db();if(catalog.sha256!==(fixture.catalog??liveCatalog)||catalog.version!==81)throw Error('GUIDE_PRICING_CHANGED');
  h.run('python3',[join(here,'stage-local-guide.py'),args[0],join(guideDirectory,'payload'),args[1]]);
  const payload=join(guideDirectory,'payload'),manifest=JSON.parse(readFileSync(join(payload,'guide-manifest.json')));assertGuideManifest(manifest);
  if(!isDeepStrictEqual(h.admin(before.gateway.Id,true),manifest.baselineAdmin))throw Error('GUIDE_ADMIN_BASE_CHANGED');
  const oldWebHash=hashTree(liveWeb),caddyHash=hashFile(caddy.Source),configs={},models={},images={};
  for(const role of ['core','gateway']){
   const paths=(before[role].Config.Labels?.['com.docker.compose.project.config_files']??'').split(',');if(paths.length!==1||!paths[0].startsWith('/'))throw Error('GUIDE_COMPOSE_REVIEW_REQUIRED');
   const stat=lstatSync(paths[0]);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0)throw Error('GUIDE_PRIVATE_COMPOSE');
   const raw=JSON.parse(readFileSync(paths[0]));if(raw.name!=='ramo-nessa-staging'||raw.services?.[role]?.env_file)throw Error('GUIDE_COMPOSE_NOT_SELF_CONTAINED');
   const resolved=JSON.parse(h.docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',paths[0],'config','--format','json']));images[role]=h.image(before[role].Image);assertEnvironmentMatches(resolved.services[role],before[role],images[role]);models[role]=servicePlan(resolved,role,before[role],before[role].Image);configs[role]={path:paths[0],sha256:hashFile(paths[0])};
  }
  console.log('Criando backup verificado, com restauração isolada. Serviços ativos preservados...');
  await backup(['--core-image='+before.core.Image,'--gateway-image='+before.gateway.Image]);const backupDirectory=backupReceipt(before);verifyBackup(backupDirectory,before);
  mkdirSync(dirname(guideWeb),{recursive:true,mode:0o755});chmodSync(dirname(guideWeb),0o755);mkdirSync(guideWeb,{mode:0o755});chmodSync(guideWeb,0o755);
  cpSync(join(liveWeb,'driver'),join(guideWeb,'driver'),{recursive:true});cpSync(join(payload,'passenger'),join(guideWeb,'passenger'),{recursive:true});
  function publishModes(p){const stat=lstatSync(p);if(stat.isSymbolicLink())throw Error('GUIDE_WEB_LINK');if(stat.isDirectory()){chmodSync(p,0o755);for(const n of readdirSync(p))publishModes(join(p,n));}else chmodSync(p,0o644);}publishModes(join(guideWeb,'passenger'));publishModes(join(guideWeb,'driver'));
  assertMapProviders(liveWeb,guideWeb);if(hashTree(join(liveWeb,'driver'))!==hashTree(join(guideWeb,'driver')))throw Error('GUIDE_DRIVER_CHANGED');
  const nextImages={};
  for(const role of ['core','gateway']){
   const base='ramo-nessa-guide-'+role+'-base:'+before[role].Image.slice(7);h.docker(['tag',before[role].Image,base]);if(h.image(base).Id!==before[role].Image)throw Error('GUIDE_IMAGE_REFERENCE');
   if(role==='core'&&images.core.Config.User!=='node')throw Error('GUIDE_CORE_USER_CHANGED');
   const folder=role==='core'?'core':'admin',files=manifest.files.filter(f=>f.path.startsWith(folder+'/'));
   const dockerfile='FROM '+base+'\n'+files.map(f=>'COPY --chmod=0644 '+f.path+' /'+(role==='core'?'app/':'srv/admin/')+f.path.slice(folder.length+1)).join('\n')+'\n'+(role==='core'?'COPY --chmod=0644 migration/'+migration+' /app/migrations/'+migration+'\nUSER 0\nRUN chmod '+(fixture.restrictGuideDirectory?'0700':'0755')+' /app/dist/src/guide\nUSER node\n':'');
   const file=join(payload,role+'.Dockerfile');writeFileSync(file,dockerfile,{mode:0o600});const tag='ramo-nessa-guide-'+role+':'+guideSource.slice(0,12);
   h.docker(['build','--network','none','--pull=false','-f',file,'-t',tag,payload]);nextImages[role]=h.image(tag);assertImageDelta(images[role],nextImages[role]);
  }
  assertFingerprint(h.fingerprint(nextImages.core.Id),manifest.candidateCore);if(!isDeepStrictEqual(h.admin(nextImages.gateway.Id),manifest.candidateAdmin))throw Error('GUIDE_ADMIN_CANDIDATE');
  const afterCore=structuredClone(models.core);afterCore.services.core.image=nextImages.core.Id;
  const afterGateway=structuredClone(models.gateway);afterGateway.services.gateway.image=nextImages.gateway.Id;afterGateway.services.gateway.volumes.find(m=>m.target==='/srv/web').source=guideWeb;assertGuideGatewayDelta(models.gateway,afterGateway,nextImages.gateway.Id,guideWeb);
  const files={};for(const [name,value]of Object.entries({'runtime-before':before,'images-before':images,'images-after':nextImages,'core-before':models.core,'core-after':afterCore,'gateway-before':models.gateway,'gateway-after':afterGateway})){
   const path=join(guideDirectory,name+'.private.json');save(path,value);files[name+'.private.json']=hashFile(path);
   if(name.startsWith('core-')||name.startsWith('gateway-')){const role=name.split('-')[0],resolved=JSON.parse(h.docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',path,'config','--format','json']));if(!isDeepStrictEqual(resolved.services[role].environment,value.services[role].environment))throw Error('GUIDE_ENVIRONMENT_ROUNDTRIP');}
  }
  for(const role of Object.keys(names))if(runtimeIdentity(h.inspect(role))!==runtimeIdentity(before[role]))throw Error('GUIDE_RUNTIME_CHANGED_DURING_PREPARE');
  if(hashTree(liveWeb)!==oldWebHash||hashFile(caddy.Source)!==caddyHash||(await h.db()).sha256!==catalog.sha256)throw Error('GUIDE_BASE_CHANGED_DURING_PREPARE');
  for(const f of Object.values(configs))if(hashFile(f.path)!==f.sha256)throw Error('GUIDE_CONFIG_CHANGED');
  const plan={format:1,source:guideSource,archiveSha256:args[1],manifestSha256:hashFile(join(payload,'guide-manifest.json')),files,configs,caddy:{path:caddy.Source,sha256:caddyHash},oldWebHash,newWebHash:hashTree(guideWeb),driverHash:hashTree(join(liveWeb,'driver')),catalog,backupDirectory};save(join(guideDirectory,'prepared.private.json'),plan);
  const result={directory:guideDirectory,sha256:hashFile(join(guideDirectory,'prepared.private.json'))};console.log(JSON.stringify({status:'GUIA_WEB_PREPARADO',...result,servicesRestarted:false}));return result;
 }finally{unlock();}
}
export async function recoverGuide(args,fixture={}){
 if(args.length!==2||!args[0].startsWith('/')||!args[0].endsWith('.zip')||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe o ZIP absoluto e SHA-256 revisado.');
 rootOnly();const unlock=lock();
 try{
  privateDir(guideDirectory);
  if(existsSync(join(guideDirectory,'prepared.private.json'))||existsSync(join(guideDirectory,'activation.private.json')))throw Error('GUIDE_RECOVERY_ALREADY_PREPARED_OR_ACTIVATED');
  if(hashFile(args[0])!==args[1])throw Error('GUIDE_ARCHIVE_CHANGED');
  const log=readFileSync(join(guideDirectory,'command.private.log'),'utf8');
  if(!log.includes("EACCES: permission denied, open '/app/dist/src/guide/guide-routes.js'"))throw Error('GUIDE_RECOVERY_UNEXPECTED_FAILURE');
  const h=host(),before=Object.fromEntries(Object.keys(names).map(k=>[k,h.inspect(k)]));
  fixtureAllowed(fixture,before);validate(before,{'core-image':fixture.coreImage??liveCore,'gateway-image':fixture.gatewayImage??liveGateway});
  if(before.gateway.Mounts.find(m=>m.Destination==='/srv/web')?.Source!==liveWeb)throw Error('GUIDE_RECOVERY_WEB_CHANGED');
  assertFingerprint(h.fingerprint(before.core.Id,true),baselineCore);
  if(!isDeepStrictEqual(await h.db(),{version:81,sha256:fixture.catalog??liveCatalog}))throw Error('GUIDE_RECOVERY_CATALOG_CHANGED');
  const webParent=dirname(guideWeb),stat=lstatSync(webParent);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0)throw Error('GUIDE_RECOVERY_WEB_DIRECTORY');
  const suffix='.incomplete-'+Date.now()+'-'+randomBytes(6).toString('hex');
  renameSync(webParent,webParent+suffix);renameSync(guideDirectory,guideDirectory+suffix);
  console.log('Preparação incompleta preservada para auditoria. Serviços ativos inalterados.');
 }finally{unlock();}
 const p=await prepareGuide(args,fixture);await activateGuide([p.directory,p.sha256]);
}
export async function activateGuide(args,rehearsal={}){
 if(args.length!==2||args[0]!==guideDirectory||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe preparação e SHA-256 revisados.');rootOnly();privateDir(guideDirectory);const unlock=lock(),journal=join(guideDirectory,'activation.private.json');
 let interrupted=false;const signal=()=>{interrupted=true;},barrier=()=>{if(interrupted)throw Error('GUIDE_INTERRUPTED');};for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,signal);
 const record=data=>writeFileSync(journal,JSON.stringify({...data,source:guideSource,at:new Date().toISOString()},null,2),{mode:0o600});
 try{
  if(existsSync(journal))throw Error('GUIDE_ACTIVATION_ALREADY_STARTED');
  if(hashFile(join(guideDirectory,'prepared.private.json'))!==args[1])throw Error('GUIDE_PLAN_CHANGED');
  const p=JSON.parse(readFileSync(join(guideDirectory,'prepared.private.json')));if(p.format!==1||p.source!==guideSource)throw Error('GUIDE_PLAN_SOURCE');
  const expected=['core-after','core-before','gateway-after','gateway-before','images-after','images-before','runtime-before'].map(n=>n+'.private.json').sort();if(!isDeepStrictEqual(Object.keys(p.files).sort(),expected))throw Error('GUIDE_PLAN_FILES');
  for(const [name,sha]of Object.entries(p.files))if(hashFile(join(guideDirectory,name))!==sha)throw Error('GUIDE_PLAN_FILE_CHANGED');
  const load=n=>JSON.parse(readFileSync(join(guideDirectory,n+'.private.json'))),before=load('runtime-before'),images=load('images-before'),next=load('images-after'),cb=load('core-before'),ca=load('core-after'),gb=load('gateway-before'),ga=load('gateway-after'),h=host(guideDirectory);fixtureAllowed(rehearsal,before);
  const payload=join(guideDirectory,'payload');if(hashFile(join(payload,'guide-manifest.json'))!==p.manifestSha256)throw Error('GUIDE_MANIFEST_CHANGED');const manifest=JSON.parse(readFileSync(join(payload,'guide-manifest.json')));assertGuideManifest(manifest);
  for(const f of manifest.files)if(hashFile(join(payload,f.path))!==f.sha256)throw Error('GUIDE_PAYLOAD_CHANGED');
  const expectedCore=structuredClone(cb);expectedCore.services.core.image=next.core.Id;if(!isDeepStrictEqual(expectedCore,ca))throw Error('GUIDE_CORE_OPTIONS_CHANGED');assertGuideGatewayDelta(gb,ga,next.gateway.Id,guideWeb);
  for(const role of ['core','gateway']){assertImageDelta(images[role],next[role]);if(!isDeepStrictEqual(h.image(next[role].Id).Config,next[role].Config))throw Error('GUIDE_IMAGE_CHANGED');}
  const intact=async()=>{for(const f of [...Object.values(p.configs),p.caddy])if(hashFile(f.path)!==f.sha256)throw Error('GUIDE_ACTIVE_CONFIGURATION_CHANGED');if(hashTree(liveWeb)!==p.oldWebHash||hashTree(guideWeb)!==p.newWebHash||hashTree(join(guideWeb,'driver'))!==p.driverHash)throw Error('GUIDE_WEB_FILES_CHANGED');for(const role of ['postgres','maps','site'])if(runtimeIdentity(h.inspect(role))!==runtimeIdentity(before[role]))throw Error('GUIDE_UNRELATED_SERVICE_CHANGED');if(!isDeepStrictEqual(await h.db(),p.catalog))throw Error('GUIDE_CATALOG_CHANGED');};
  for(const role of Object.keys(names))if(runtimeIdentity(h.inspect(role))!==runtimeIdentity(before[role]))throw Error('GUIDE_RUNTIME_CHANGED_SINCE_PREPARE');await intact();verifyBackup(p.backupDirectory,before);
  assertFingerprint(h.fingerprint(before.core.Id,true),baselineCore);if(!isDeepStrictEqual(h.admin(before.gateway.Id,true),manifest.baselineAdmin))throw Error('GUIDE_ADMIN_CHANGED');
  const url=process.env.GITHUB_ACTIONS==='true'&&before.gateway.Config.Labels?.['br.com.ramonessa.guide-ci']==='true'?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
  const published=async candidate=>{
   const root=candidate?guideWeb:liveWeb;
   const files=[...['index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js'].map(f=>['/passageiro/'+f,join(root,'passenger',f)]),...['index.html','main.dart.js','ramo_push_config.js'].map(f=>['/motorista/'+f,join(root,'driver',f)]),...(candidate?manifest.adminDelta.map(f=>['/administrodo/'+f,join(payload,'admin',f)]):[])];
   for(const [path,file]of files){const r=await fetch(url+path+'?guide-review='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});if(r.status!==200||digest(Buffer.from(await r.arrayBuffer()))!==hashFile(file))throw Error('GUIDE_PUBLIC_FILE_MISMATCH: '+path);}
   for(const path of ['/health','/ready'])if((await fetch(url+path,{signal:AbortSignal.timeout(15000)})).status!==200)throw Error('GUIDE_PUBLIC_HEALTH');
   if(candidate){const r=await fetch(url+'/v1/content/guide',{signal:AbortSignal.timeout(15000)}),d=await r.json();if(r.status!==200||!Array.isArray(d.entities)||d.entities.some(e=>'draft'in e||'published'in e||'archived'in e))throw Error('GUIDE_PUBLIC_API');if((await fetch(url+'/v1/admin/guide',{signal:AbortSignal.timeout(15000)})).status!==401)throw Error('GUIDE_ADMIN_AUTH');}
  };
  const verify=async candidate=>{assertCoreRuntime(before.core,h.inspect('core'),candidate?ca:cb,candidate?next.core:images.core);assertFingerprint(h.fingerprint(names.core,true),candidate?manifest.candidateCore:baselineCore);gatewayVerify(before.gateway,h.inspect('gateway'),candidate?ga:gb,candidate?next.gateway:images.gateway,candidate?guideWeb:liveWeb);if(!isDeepStrictEqual(h.admin(names.gateway,true),candidate?manifest.candidateAdmin:manifest.baselineAdmin))throw Error('GUIDE_ADMIN_BYTES');await intact();await published(candidate);};
  barrier();record({phase:'migrating'});console.log('Aplicando somente a migration aditiva do Guia; passeios e finanças preservados...');
  const sql=readFileSync(join(payload,'migration',migration),'utf8'),program=readFileSync(join(here,'local-guide-migration.mjs'),'utf8');
  try{h.run('docker',['exec','-i',names.core,'node','--input-type=module','-e',program],JSON.stringify({sql,checksum:hashFile(join(payload,'migration',migration)),baselineMigrations:manifest.baselineMigrations}));}catch(e){record({phase:'migration-failed',servicesRestarted:false});throw e;}
  record({phase:'switching',additiveMigrationRetained:true});
  try{
   await switchSearch({
    coreUp:async()=>{barrier();await intact();console.log('Atualizando o Core com ambiente e provedores preservados...');h.compose(join(guideDirectory,'core-after.private.json'),'core');},
    coreVerify:async()=>{await h.health('core');barrier();assertCoreRuntime(before.core,h.inspect('core'),ca,next.core);assertFingerprint(h.fingerprint(names.core,true),manifest.candidateCore);await intact();if(rehearsal.failAfterCore)throw Error('GUIDE_SYNTHETIC_CORE_FAILURE');},
    gatewayUp:async()=>{barrier();gatewayVerify(before.gateway,h.inspect('gateway'),gb,images.gateway,liveWeb);console.log('Atualizando Guia Local Web e ADM. Motorista e nativos preservados...');h.compose(join(guideDirectory,'gateway-after.private.json'),'gateway');},
    verify:async()=>{await h.health('gateway');barrier();await verify(true);barrier();if(rehearsal.failAfterWeb)throw Error('GUIDE_SYNTHETIC_WEB_FAILURE');},
    gatewayRollback:async()=>{await intact();const c=h.inspect('gateway'),newer=c.Image===next.gateway.Id;if(!newer&&c.Image!==images.gateway.Id)throw Error('GUIDE_CONCURRENT_GATEWAY');gatewayVerify(before.gateway,c,newer?ga:gb,newer?next.gateway:images.gateway,newer?guideWeb:liveWeb,false);if(newer||c.State.Health?.Status!=='healthy')h.compose(join(guideDirectory,'gateway-before.private.json'),'gateway');await h.health('gateway');gatewayVerify(before.gateway,h.inspect('gateway'),gb,images.gateway,liveWeb);},
    coreRollback:async()=>{await intact();const c=h.inspect('core'),newer=c.Image===next.core.Id;if(!newer&&c.Image!==images.core.Id)throw Error('GUIDE_CONCURRENT_CORE');assertCoreRuntime(before.core,c,newer?ca:cb,newer?next.core:images.core,{healthy:false});if(newer||c.State.Health?.Status!=='healthy')h.compose(join(guideDirectory,'core-before.private.json'),'core');await h.health('core');},
    verifyRollback:async()=>verify(false),
   });
  }catch(e){record({phase:e.rollbackComplete?'rolled-back':'requires-review',rollbackComplete:e.rollbackComplete===true,additiveMigrationRetained:true});throw e;}
  record({phase:'completed',passengerWebUpdated:true,adminUpdated:true,coreUpdated:true,driverWebUpdated:false,nativeAppsUpdated:false});console.log(JSON.stringify({status:'GUIA_LOCAL_WEB_ATUALIZADO',source:guideSource,driverWebUpdated:false,nativeAppsUpdated:false,providerConfigurationPreserved:true,realDeviceAcceptancePending:true}));
 }finally{for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.removeListener(name,signal);unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const [mode,...args]=process.argv.slice(2);if(mode==='prepare')await prepareGuide(args);else if(mode==='activate')await activateGuide(args);else if(mode==='recover-install')await recoverGuide(args);else if(mode==='install'){const p=await prepareGuide(args);await activateGuide([p.directory,p.sha256]);}else throw Error('Use prepare, activate ou install.');}catch(e){console.error(e.message);if(e.cause)console.error('Motivo: '+e.cause.message);process.exitCode=1;}}
