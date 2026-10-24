// Scoped update over the exact running images. Never restores old financial data.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,lstatSync,existsSync,openSync,closeSync,unlinkSync,cpSync,chmodSync,statfsSync,renameSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {backup,runtimeIdentity as runtimeCompany,validate} from './backup-regions-pricing.mjs';
import {servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {assertWebGatewayRuntime} from './asaas-driver-web-switch-contract.mjs';
import {names,assertImageDelta,assertCoreRuntime,switchSearch} from './google-search-update-contract.mjs';
import {coreSourceFingerprintProgram} from './inspect-regions-pricing.mjs';
import {hashFile,hashTree,digest,privateDir} from './google-search-update-io.mjs';
import {assertMapProviders} from './prepare-web-map-update.mjs';
import {companySource,baselineCore,dependencyLock,liveWeb,companyWeb,companyRoot,companyDirectory,migrations,assertCompanyManifest,assertCompanyGatewayDelta,inspectedCaddy} from './company-web-contract.mjs';
const here=dirname(fileURLToPath(import.meta.url));
function host(directory){
 const run=(cmd,args,input)=>{const r=spawnSync(cmd,args,{encoding:'utf8',input,timeout:600000,maxBuffer:64*1024**2,env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});if(r.error||r.status!==0){if(directory)writeFileSync(join(directory,'command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('COMPANY_COMMAND_FAILED: '+cmd);}return r.stdout;};
 const docker=args=>run('docker',args),inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0],image=id=>JSON.parse(docker(['image','inspect',id]))[0];
 const fingerprint=(id,running=false)=>JSON.parse(docker(running?['exec',id,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']:['run','--rm','--network','none','--entrypoint','node',id,'--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
 const admin=(id,running=false)=>{const cmd="cd /srv/admin && test -z \"$(find . -type l -print)\" && find . -type f -exec sha256sum '{}' +";const s=docker(running?['exec',id,'sh','-c',cmd]:['run','--rm','--network','none','--entrypoint','sh',id,'-c',cmd]);return s.trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})\s+\.\/(.+)$/);if(!m)throw Error('COMPANY_ADMIN_FILE');return [m[2],m[1]];}).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);};
 const db=async()=>{const sql="BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; SELECT coalesce((SELECT json_build_object('version',version_number,'snapshot',snapshot) FROM pricing_catalog_versions WHERE status='published' AND effective_from<=now() ORDER BY effective_from DESC,version_number DESC LIMIT 1),'null'::json); COMMIT;";const r=JSON.parse(docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','company-catalog-readonly',sql]));return {version:r?.version,sha256:r?digest(JSON.stringify(r.snapshot)):null};};
 const manualCases=()=>{
  const read=sql=>docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','company-cases-readonly',"BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; "+sql+"; COMMIT;"]).trim();
  if(read("SELECT to_regclass('public.company_management_records')::text")!=='company_management_records')return 0;
  const count=Number(read('SELECT count(*) FROM company_management_records'));
  if(!Number.isSafeInteger(count)||count<0)throw Error('COMPANY_FINANCIAL_COUNT');return count;
 };
 const costState=()=>docker(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','company-costs-readonly',"SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'[]')) FROM company_cost_items c"]).trim();
 const health=async role=>{for(let i=0;i<90;i++){const c=inspect(role);if(c.State.Running&&c.State.Health?.Status==='healthy')return;await new Promise(r=>setTimeout(r,1000));}throw Error('COMPANY_HEALTH_FAILED: '+role);};
 const compose=(file,role)=>docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',file,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate',role]);
 const inspectOrNull=role=>{try{return inspect(role);}catch{return null;}};
 return {run,docker,inspect,inspectOrNull,image,fingerprint,admin,db,manualCases,costState,health,compose};
}

function assertFingerprint(f,sha){if(f.source?.sha256!==sha||f.packageLockSha256!==dependencyLock)throw Error('COMPANY_CORE_SOURCE_CHANGED');}
function rootOnly(){if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);mkdirSync(companyRoot,{recursive:true,mode:0o700});privateDir(companyRoot);}
function lock(){const p=join(companyRoot,'operations.lock');closeSync(openSync(p,'wx',0o600));return ()=>unlinkSync(p);}
function fixtureAllowed(options,before){if(Object.keys(options).length&&(process.env.GITHUB_ACTIONS!=='true'||before.core.Config.Labels?.['br.com.ramonessa.company-ci']!=='true'||before.gateway.Config.Labels?.['br.com.ramonessa.company-ci']!=='true'))throw Error('COMPANY_REHEARSAL_FORBIDDEN');}
const save=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
function gatewayVerify(before,current,model,image,web,healthy=true){const expected=structuredClone(before);expected.Image=image.Id;const c=structuredClone(current);if(!healthy)c.State.Health={Status:'healthy'};assertWebGatewayRuntime(expected,c,model,image,web);for(const key of ['Tmpfs','ShmSize','Dns','ExtraHosts','Ulimits','GroupAdd','Init'])if(!isDeepStrictEqual(before.HostConfig[key]??null,current.HostConfig[key]??null))throw Error('COMPANY_GATEWAY_RUNTIME_OPTION: '+key);for(const key of ['WorkingDir','Healthcheck','StopSignal'])if(!isDeepStrictEqual(before.Config[key]??null,current.Config[key]??null))throw Error('COMPANY_GATEWAY_START_OPTION: '+key);}
function backupReceipt(before){const root='/var/backups/ramo-nessa-regions';const candidates=readdirSync(root).map(n=>join(root,n)).filter(d=>existsSync(join(d,'verified.private.json'))).map(directory=>({directory,manifest:JSON.parse(readFileSync(join(directory,'verified.private.json')))})).filter(r=>r.manifest.databaseRestoredInIsolation===true&&Object.keys(names).every(k=>r.manifest.runtimeIds[k]===before[k].Id));if(!candidates.length)throw Error('COMPANY_BACKUP_NOT_VERIFIED');return candidates.sort((a,b)=>b.manifest.createdAt.localeCompare(a.manifest.createdAt))[0].directory;}
function verifyBackup(directory,before){privateDir(directory);const m=JSON.parse(readFileSync(join(directory,'verified.private.json')));if(!m.databaseRestoredInIsolation||!Object.keys(names).every(k=>m.runtimeIds[k]===before[k].Id))throw Error('COMPANY_BACKUP_CHANGED');for(const f of m.files)if(f.name.includes('/')||hashFile(join(directory,f.name))!==f.sha256)throw Error('COMPANY_BACKUP_CHECKSUM');}
export async function prepareCompany(args,fixture={}){
 if(args.length!==2||!args[0].startsWith('/')||!args[0].endsWith('.zip')||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe o ZIP absoluto e SHA-256 revisado.');
 rootOnly();const unlock=lock();
 try{
  if(existsSync(companyDirectory))throw Error('COMPANY_PREPARATION_EXISTS');
  if(statfsSync(companyRoot).bavail*statfsSync(companyRoot).bsize<4*1024**3)throw Error('COMPANY_DISK_SPACE');
  mkdirSync(companyDirectory,{mode:0o700});const h=host(companyDirectory),before=Object.fromEntries(Object.keys(names).map(k=>[k,h.inspect(k)]));fixtureAllowed(fixture,before);
  validate(before,{'core-image':fixture.coreImage??before.core.Image,'gateway-image':fixture.gatewayImage??before.gateway.Image});
  if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('COMPANY_RUNTIME_MODE');
  assertFingerprint(h.fingerprint(before.core.Id,true),baselineCore);
  const web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web'),caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
  if(web?.Source!==liveWeb||!caddy?.Source)throw Error('COMPANY_WEB_BASE_CHANGED');
  if(hashFile(caddy.Source)!==(fixture.caddy??inspectedCaddy))throw Error('COMPANY_LIVE_CADDY_CHANGED');
  const catalog=await h.db();if(!Number.isSafeInteger(catalog.version)||!/^[a-f0-9]{64}$/.test(catalog.sha256??''))throw Error('COMPANY_PRICING_CHANGED');
  h.run('python3',[join(here,'stage-company.py'),args[0],join(companyDirectory,'payload'),args[1]]);
  const payload=join(companyDirectory,'payload'),manifest=JSON.parse(readFileSync(join(payload,'company-manifest.json')));assertCompanyManifest(manifest);
  if(!isDeepStrictEqual(h.admin(before.gateway.Id,true),manifest.baselineAdmin))throw Error('COMPANY_ADMIN_BASE_CHANGED');
  const oldWebHash=hashTree(liveWeb),caddyHash=hashFile(caddy.Source),configs={},models={},images={};
  for(const role of ['core','gateway']){
   const paths=(before[role].Config.Labels?.['com.docker.compose.project.config_files']??'').split(',');if(paths.length!==1||!paths[0].startsWith('/'))throw Error('COMPANY_COMPOSE_REVIEW_REQUIRED');
   const stat=lstatSync(paths[0]);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0)throw Error('COMPANY_PRIVATE_COMPOSE');
   const raw=JSON.parse(readFileSync(paths[0]));if(raw.name!=='ramo-nessa-staging'||raw.services?.[role]?.env_file)throw Error('COMPANY_COMPOSE_NOT_SELF_CONTAINED');
   const resolved=JSON.parse(h.docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',paths[0],'config','--format','json']));images[role]=h.image(before[role].Image);assertEnvironmentMatches(resolved.services[role],before[role],images[role]);models[role]=servicePlan(resolved,role,before[role],before[role].Image);configs[role]={path:paths[0],sha256:hashFile(paths[0])};
  }
  console.log('Criando backup verificado, com restauração isolada. Serviços ativos preservados...');
  await backup(['--core-image='+before.core.Image,'--gateway-image='+before.gateway.Image]);const backupDirectory=backupReceipt(before);verifyBackup(backupDirectory,before);
  const nextImages={gateway:images.gateway};
  for(const role of ['core','gateway']){
   const base='ramo-nessa-company-'+role+'-base:'+before[role].Image.slice(7);h.docker(['tag',before[role].Image,base]);if(h.image(base).Id!==before[role].Image)throw Error('COMPANY_IMAGE_REFERENCE');
   if(role==='core'&&images.core.Config.User!=='node')throw Error('COMPANY_CORE_USER_CHANGED');
   const folder=role==='core'?'core':'admin',files=manifest.files.filter(f=>f.path.startsWith(folder+'/'));
   for(const f of files){chmodSync(join(payload,f.path),0o644);let p=dirname(join(payload,f.path));while(p!==payload){chmodSync(p,0o755);p=dirname(p);}}
   const dockerfile='FROM '+base+'\n'+files.map(f=>'COPY '+(role==='core'?'--chown=node:node ':'')+'--chmod=0644 '+f.path+' /'+(role==='core'?'app/':'srv/admin/')+f.path.slice(folder.length+1)).join('\n')+'\n'+(role==='core'?migrations.map(m=>'COPY --chown=node:node --chmod=0644 migration/'+m+' /app/migrations/'+m+'\n').join(''):'');
   const file=join(payload,role+'.Dockerfile');writeFileSync(file,dockerfile,{mode:0o600});const tag='ramo-nessa-company-'+role+':'+companySource.slice(0,12);
   h.docker(['build','--network','none','--pull=false','-f',file,'-t',tag,payload]);nextImages[role]=h.image(tag);assertImageDelta(images[role],nextImages[role]);
  }
  assertFingerprint(h.fingerprint(nextImages.core.Id),manifest.candidateCore);if(!isDeepStrictEqual(h.admin(nextImages.gateway.Id),manifest.candidateAdmin))throw Error('COMPANY_ADMIN_CANDIDATE');
  const afterCore=structuredClone(models.core);afterCore.services.core.image=nextImages.core.Id;
  const afterGateway=structuredClone(models.gateway);afterGateway.services.gateway.image=nextImages.gateway.Id;afterGateway.services.gateway.volumes.find(m=>m.target==='/srv/web').source=companyWeb;assertCompanyGatewayDelta(models.gateway,afterGateway,nextImages.gateway.Id,companyWeb);
  const files={};for(const [name,value]of Object.entries({'runtime-before':before,'images-before':images,'images-after':nextImages,'core-before':models.core,'core-after':afterCore,'gateway-before':models.gateway,'gateway-after':afterGateway})){
   const path=join(companyDirectory,name+'.private.json');save(path,value);files[name+'.private.json']=hashFile(path);
   if(name.startsWith('core-')||name.startsWith('gateway-')){const role=name.split('-')[0],resolved=JSON.parse(h.docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',path,'config','--format','json']));if(!isDeepStrictEqual(resolved.services[role].environment,value.services[role].environment))throw Error('COMPANY_ENVIRONMENT_ROUNDTRIP');}
  }
  for(const role of Object.keys(names))if(runtimeCompany(h.inspect(role))!==runtimeCompany(before[role]))throw Error('COMPANY_RUNTIME_CHANGED_DURING_PREPARE');
  if(hashTree(liveWeb)!==oldWebHash||hashFile(caddy.Source)!==caddyHash||(await h.db()).sha256!==catalog.sha256)throw Error('COMPANY_BASE_CHANGED_DURING_PREPARE');
  for(const f of Object.values(configs))if(hashFile(f.path)!==f.sha256)throw Error('COMPANY_CONFIG_CHANGED');
  const plan={format:1,source:companySource,costState:h.costState(),baselineManualCases:h.manualCases(),archiveSha256:args[1],manifestSha256:hashFile(join(payload,'company-manifest.json')),files,configs,caddy:{path:caddy.Source,sha256:caddyHash},oldWebHash,newWebHash:hashTree(companyWeb),driverHash:hashTree(join(companyWeb,'driver')),catalog,backupDirectory};save(join(companyDirectory,'prepared.private.json'),plan);
  const result={directory:companyDirectory,sha256:hashFile(join(companyDirectory,'prepared.private.json'))};console.log(JSON.stringify({status:'COMPANY_WEB_PREPARADO',...result,servicesRestarted:false}));return result;
 }finally{unlock();}
}
export async function activateCompany(args,rehearsal={}){
 if(args.length!==2||args[0]!==companyDirectory||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe preparação e SHA-256 revisados.');rootOnly();privateDir(companyDirectory);const unlock=lock(),journal=join(companyDirectory,'activation.private.json');
 let interrupted=false;const signal=()=>{interrupted=true;},barrier=()=>{if(interrupted)throw Error('COMPANY_INTERRUPTED');};for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,signal);
 const record=data=>writeFileSync(journal,JSON.stringify({...data,source:companySource,at:new Date().toISOString()},null,2),{mode:0o600});
 try{
  if(existsSync(journal))throw Error('COMPANY_ACTIVATION_ALREADY_STARTED');
  if(hashFile(join(companyDirectory,'prepared.private.json'))!==args[1])throw Error('COMPANY_PLAN_CHANGED');
  const p=JSON.parse(readFileSync(join(companyDirectory,'prepared.private.json')));if(p.format!==1||p.source!==companySource)throw Error('COMPANY_PLAN_SOURCE');
  const expected=['core-after','core-before','gateway-after','gateway-before','images-after','images-before','runtime-before'].map(n=>n+'.private.json').sort();if(!isDeepStrictEqual(Object.keys(p.files).sort(),expected))throw Error('COMPANY_PLAN_FILES');
  for(const [name,sha]of Object.entries(p.files))if(hashFile(join(companyDirectory,name))!==sha)throw Error('COMPANY_PLAN_FILE_CHANGED');
  const load=n=>JSON.parse(readFileSync(join(companyDirectory,n+'.private.json'))),before=load('runtime-before'),images=load('images-before'),next=load('images-after'),cb=load('core-before'),ca=load('core-after'),gb=load('gateway-before'),ga=load('gateway-after'),h=host(companyDirectory);fixtureAllowed(rehearsal,before);
  const payload=join(companyDirectory,'payload');if(hashFile(join(payload,'company-manifest.json'))!==p.manifestSha256)throw Error('COMPANY_MANIFEST_CHANGED');const manifest=JSON.parse(readFileSync(join(payload,'company-manifest.json')));assertCompanyManifest(manifest);
  for(const f of manifest.files)if(hashFile(join(payload,f.path))!==f.sha256)throw Error('COMPANY_PAYLOAD_CHANGED');
  const expectedCore=structuredClone(cb);expectedCore.services.core.image=next.core.Id;if(!isDeepStrictEqual(expectedCore,ca))throw Error('COMPANY_CORE_OPTIONS_CHANGED');assertCompanyGatewayDelta(gb,ga,next.gateway.Id,companyWeb);
  for(const role of ['core','gateway']){assertImageDelta(images[role],next[role]);if(!isDeepStrictEqual(h.image(next[role].Id).Config,next[role].Config))throw Error('COMPANY_IMAGE_CHANGED');}
  const intact=async()=>{for(const f of [...Object.values(p.configs),p.caddy])if(hashFile(f.path)!==f.sha256)throw Error('COMPANY_ACTIVE_CONFIGURATION_CHANGED');if(hashTree(liveWeb)!==p.oldWebHash||hashTree(companyWeb)!==p.newWebHash||hashTree(join(companyWeb,'driver'))!==p.driverHash)throw Error('COMPANY_WEB_FILES_CHANGED');for(const role of ['postgres','maps','site'])if(runtimeCompany(h.inspect(role))!==runtimeCompany(before[role]))throw Error('COMPANY_UNRELATED_SERVICE_CHANGED');if(!isDeepStrictEqual(await h.db(),p.catalog))throw Error('COMPANY_CATALOG_CHANGED');};
  for(const role of Object.keys(names))if(runtimeCompany(h.inspect(role))!==runtimeCompany(before[role]))throw Error('COMPANY_RUNTIME_CHANGED_SINCE_PREPARE');await intact();verifyBackup(p.backupDirectory,before);
  assertFingerprint(h.fingerprint(before.core.Id,true),baselineCore);if(!isDeepStrictEqual(h.admin(before.gateway.Id,true),manifest.baselineAdmin))throw Error('COMPANY_ADMIN_CHANGED');
  const url=process.env.GITHUB_ACTIONS==='true'&&before.gateway.Config.Labels?.['br.com.ramonessa.company-ci']==='true'?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
  const published=async candidate=>{
   const root=candidate?companyWeb:liveWeb;
   const files=[...['index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js'].map(f=>['/passageiro/'+f,join(root,'passenger',f)]),...['index.html','main.dart.js','ramo_push_config.js'].map(f=>['/motorista/'+f,join(root,'driver',f)]),...(candidate?manifest.adminDelta.map(f=>['/administrodo/'+f,join(payload,'admin',f)]):[])];
   for(const [path,file]of files){const r=await fetch(url+path+'?company-review='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});if(r.status!==200||digest(Buffer.from(await r.arrayBuffer()))!==hashFile(file))throw Error('COMPANY_PUBLIC_FILE_MISMATCH: '+path);}
   for(const role of ['passageiro','motorista','administrodo']){
    const r=await fetch(url+'/'+role+'/?company-permissions='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const policy='camera=(), microphone=(), geolocation='+ (role==='administrodo'?'()':'(self)');
    if(r.status!==200||r.headers.get('permissions-policy')!==policy)throw Error('COMPANY_GPS_POLICY_CHANGED: '+role);
   }
   for(const path of ['/health','/ready'])if((await fetch(url+path,{signal:AbortSignal.timeout(15000)})).status!==200)throw Error('COMPANY_PUBLIC_HEALTH');
   if(candidate){const r=await fetch(url+'/v1/content/guide',{signal:AbortSignal.timeout(15000)}),d=await r.json();if(r.status!==200||!Array.isArray(d.entities)||d.entities.some(e=>'draft'in e||'published'in e||'archived'in e))throw Error('COMPANY_PUBLIC_API');if((await fetch(url+'/v1/admin/guide',{signal:AbortSignal.timeout(15000)})).status!==401)throw Error('COMPANY_ADMIN_AUTH');}
  };
  await published(false);
  const verify=async candidate=>{assertCoreRuntime(before.core,h.inspect('core'),candidate?ca:cb,candidate?next.core:images.core);assertFingerprint(h.fingerprint(names.core,true),candidate?manifest.candidateCore:baselineCore);gatewayVerify(before.gateway,h.inspect('gateway'),candidate?ga:gb,candidate?next.gateway:images.gateway,candidate?companyWeb:liveWeb);if(!isDeepStrictEqual(h.admin(names.gateway,true),candidate?manifest.candidateAdmin:manifest.baselineAdmin))throw Error('COMPANY_ADMIN_BYTES');await intact();await published(candidate);};
  barrier();record({phase:'migcompany'});console.log('Adicionando os registros de gestão financeira, preservando os dados existentes...');
  const program=readFileSync(join(here,'company-migration.mjs'),'utf8');
  const updates=migrations.map(filename=>({filename,sql:readFileSync(join(payload,'migration',filename),'utf8'),checksum:hashFile(join(payload,'migration',filename))}));
  try{h.run('docker',['exec','-i',names.core,'node','--input-type=module','-e',program],JSON.stringify({migrations:updates,baselineMigrations:manifest.baselineMigrations}));}catch(e){record({phase:'migration-failed',servicesRestarted:false});throw e;}
  record({phase:'switching',additiveMigrationRetained:true});
  try{
   await switchSearch({
    coreUp:async()=>{barrier();await intact();console.log('Atualizando o Core com ambiente e provedores preservados...');h.compose(join(companyDirectory,'core-after.private.json'),'core');},
    coreVerify:async()=>{await h.health('core');barrier();assertCoreRuntime(before.core,h.inspect('core'),ca,next.core);assertFingerprint(h.fingerprint(names.core,true),manifest.candidateCore);await intact();if(rehearsal.failAfterCore)throw Error('COMPANY_SYNTHETIC_CORE_FAILURE');},
    gatewayUp:async()=>{barrier();gatewayVerify(before.gateway,h.inspect('gateway'),gb,images.gateway,liveWeb);console.log('Atualizando somente o ADM com a Gestão financeira...');h.compose(join(companyDirectory,'gateway-after.private.json'),'gateway');},
    verify:async()=>{await h.health('gateway');barrier();await verify(true);barrier();if(rehearsal.beforeFailure)await rehearsal.beforeFailure();if(rehearsal.removeGatewayAfterWeb){h.docker(['rm','-f',names.gateway]);throw Error('COMPANY_SYNTHETIC_GATEWAY_MISSING');}if(rehearsal.failAfterWeb)throw Error('COMPANY_SYNTHETIC_WEB_FAILURE');},
    gatewayRollback:async()=>{await intact();const c=h.inspectOrNull('gateway');if(c==null){h.compose(join(companyDirectory,'gateway-before.private.json'),'gateway');await h.health('gateway');return;}const newer=c.Image===next.gateway.Id;if(!newer&&c.Image!==images.gateway.Id)throw Error('COMPANY_CONCURRENT_GATEWAY');gatewayVerify(before.gateway,c,newer?ga:gb,newer?next.gateway:images.gateway,newer?companyWeb:liveWeb,false);if(newer||c.State.Health?.Status!=='healthy')h.compose(join(companyDirectory,'gateway-before.private.json'),'gateway');await h.health('gateway');gatewayVerify(before.gateway,h.inspect('gateway'),gb,images.gateway,liveWeb);},
    coreRollback:async()=>{await intact();if(h.manualCases()>(p.baselineManualCases??0)||h.costState()!==p.costState)throw Error('COMPANY_NEW_FINANCIAL_RECORDS: Core atual preservado para conferência; nenhum saldo foi restaurado.');const c=h.inspectOrNull('core');if(c==null){h.compose(join(companyDirectory,'core-before.private.json'),'core');await h.health('core');return;}const newer=c.Image===next.core.Id;if(!newer&&c.Image!==images.core.Id)throw Error('COMPANY_CONCURRENT_CORE');assertCoreRuntime(before.core,c,newer?ca:cb,newer?next.core:images.core,{healthy:false});if(newer||c.State.Health?.Status!=='healthy')h.compose(join(companyDirectory,'core-before.private.json'),'core');await h.health('core');},
    verifyRollback:async()=>verify(false),
   });
  }catch(e){record({phase:e.rollbackComplete?'rolled-back':'requires-review',rollbackComplete:e.rollbackComplete===true,additiveMigrationRetained:true});throw e;}
  record({phase:'completed',passengerWebUpdated:false,adminUpdated:true,coreUpdated:true,driverWebUpdated:false,nativeAppsUpdated:false});console.log(JSON.stringify({status:'GESTAO_FINANCEIRA_WEB_ATUALIZADA',source:companySource,passengerWebUpdated:false,adminUpdated:true,driverWebUpdated:false,nativeAppsUpdated:false,providerConfigurationPreserved:true,realDeviceAcceptancePending:true}));
 }finally{for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.removeListener(name,signal);unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const [mode,...args]=process.argv.slice(2);if(mode==='prepare')await prepareCompany(args);else if(mode==='activate')await activateCompany(args);else if(mode==='install'){const p=await prepareCompany(args);await activateCompany([p.directory,p.sha256]);}else throw Error('Use prepare, activate ou install.');}catch(e){console.error(e.message);if(e.cause)console.error('Motivo: '+e.cause.message);process.exitCode=1;}}
