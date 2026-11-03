// Prepare a reviewable live configuration plan. Never starts/stops services or applies reset.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,mkdirSync,existsSync,openSync,closeSync,unlinkSync,chownSync,readdirSync,createReadStream} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {validate} from './backup-regions-pricing.mjs';
import {checkMigrations} from './prepare-regions-pricing.mjs';
import {makeModels,identity} from './regions-activation-contract.mjs';
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
const digest=b=>createHash('sha256').update(b).digest('hex');
export function activationArguments(args){
  if(args.length!==3||!/^\/opt\/ramo-nessa-regions\/releases\/[a-f0-9]{12}$/.test(args[0])||!/^[a-f0-9]{64}$/.test(args[1])||!args[2].startsWith('/'))throw Error('Informe diretório preparado, SHA-256 e ZIP Web absoluto.');
  return {release:args[0],preparedHash:args[1],archive:args[2]};
}
export async function prepareActivation(args){
  const {release,preparedHash,archive}=activationArguments(args);
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
  const privateDir=p=>{const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Diretório privado divergente.');};privateDir(release);
  const bytes=readFileSync(join(release,'prepared.private.json'));if(digest(bytes)!==preparedHash)throw Error('Manifesto preparado divergente.');
  const prepared=JSON.parse(bytes);
  if(prepared.format!==1||prepared.offlineResetVerified!==true||prepared.financialCodePreserved!==true||prepared.migrationsUnchanged!==true||prepared.resetApplied!==false||prepared.servicesRestarted!==false||prepared.revision.slice(0,12)!==release.split('/').at(-1))throw Error('Candidata não aprovada.');
  const lock=join(release,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  let destination;
  function run(cmd,argv,extra={}){const r=spawnSync(cmd,argv,{encoding:'utf8',maxBuffer:64*1024**2,stdio:['pipe','pipe','pipe'],...extra});if(r.error||r.status!==0){if(destination)writeFileSync(join(destination,'failure.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Preparação interrompida em '+cmd+'. Detalhes privados preservados.');}return r.stdout;}
  const json=p=>JSON.parse(readFileSync(p));
  async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
  async function treeHash(root){const rows=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado no Web.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(root,f),s.size,await fileHash(f)]);else throw Error('Arquivo Web inesperado.');}}await visit(root);return digest(JSON.stringify(rows));}
  try{
    const before=Object.fromEntries(Object.entries(names).map(([k,n])=>[k,JSON.parse(run('docker',['inspect',n]))[0]]));
    const saved=json(join(release,'runtime-before.private.json'));
    validate(before,{'core-image':saved.core.Image,'gateway-image':saved.gateway.Image});
    for(const k of Object.keys(names))if(identity(saved[k])!==identity(before[k]))throw Error('Runtime mudou desde o ensaio: '+k);
    if((before.core.Config.Env||[]).find(e=>e.startsWith('NODE_ENV='))!=='NODE_ENV=staging')throw Error('Esta atualização é exclusiva de homologação.');
    const backup=prepared.backup;privateDir(backup);
    if(await fileHash(join(backup,'verified.private.json'))!==prepared.backupManifestSha256)throw Error('Backup de referência divergente.');
    const backupManifest=json(join(backup,'verified.private.json'));
    for(const f of backupManifest.files){if(!/^[a-zA-Z0-9.-]+$/.test(f.name)||await fileHash(join(backup,f.name))!==f.sha256)throw Error('Integridade do backup não confirmada.');}
    const backupConfigs=json(join(backup,'compose-paths.private.json'));
    for(const entry of backupConfigs)if(!readFileSync(entry.path).equals(readFileSync(join(backup,entry.file))))throw Error('Arquivo Compose mudou desde o backup.');
    const sql=q=>JSON.parse(run('docker',['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','regions-activation-readonly',"BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; "+q+'; COMMIT;']));
    const migrationsSQL='SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t';
    const migrations=sql(migrationsSQL),migrationRoot=join(release,'backend/core/migrations');
    checkMigrations(migrations,Object.fromEntries(readdirSync(migrationRoot).filter(n=>n.endsWith('.sql')).map(n=>[n,digest(readFileSync(join(migrationRoot,n)))])));
    if(JSON.stringify(migrations)!==JSON.stringify(json(join(backup,'migrations.private.json'))))throw Error('Histórico de migrations mudou.');
    const nonce=randomBytes(8).toString('hex');destination=join(release,'activation-'+nonce);mkdirSync(destination,{mode:0o700});
    const save=(name,value)=>writeFileSync(join(destination,name),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
    save('runtime-before.private.json',before);save('migrations-before.private.json',migrations);
    const webRelease='/opt/ramo-nessa-web/releases/regions-'+prepared.revision.slice(0,12)+'-'+nonce;mkdirSync(webRelease,{recursive:true,mode:0o700});
    const webRoot=join(webRelease,'bundles');
    const here=dirname(fileURLToPath(import.meta.url));
    console.log('Conferindo e preparando Passageiro e Motorista Web fora dos arquivos ativos...');
    const staged=JSON.parse(run('python3',[join(here,'stage-regions-web.py'),'--archive',archive,'--output',webRoot]));save('web-staged.json',staged);
    // Ensure the configured bundles still correspond to the app sources of the prepared images.
    run('git',['-c','safe.directory=/opt/ramo-nessa','-C','/opt/ramo-nessa','diff','--exit-code',staged.sourceCommit,prepared.revision,'--','apps/passenger','apps/driver','packages']);
    const caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile'),oldWeb=before.gateway.Mounts.find(m=>m.Destination==='/srv/web');
    const caddyHash=await fileHash(caddy.Source);if(caddyHash!==prepared.caddyHash)throw Error('Caddy mudou desde o ensaio.');
    save('Caddyfile.before',readFileSync(caddy.Source));
    const configs=new Map(),models={};
    for(const role of ['core','gateway']){
      console.log('Conferindo configuração real, ambiente e retorno: '+role+'...');
      const labels=before[role].Config.Labels||{},files=(labels['com.docker.compose.project.config_files']||'').split(',').filter(Boolean);
      if(labels['com.docker.compose.project']!=='ramo-nessa-staging'||!files.length)throw Error('Origem Compose não identificada: '+role);
      for(const f of files){if(!f.startsWith('/')||!lstatSync(f).isFile()||lstatSync(f).isSymbolicLink())throw Error('Origem Compose inválida.');configs.set(f,readFileSync(f));}
      const base=files.find(f=>f.endsWith('/deploy/staging/compose.yml'));
      let envFile=labels['com.docker.compose.project.environment_file']||(base?join(dirname(base),'.env'):'/dev/null');
      let environment={PATH:process.env.PATH};
      if(base){
        const helper=dirname(base),paths=['firebase.mjs','google-maps.mjs','otp.mjs'].map(n=>join(helper,n));
        for(const f of paths)configs.set(f,readFileSync(f));
        const maps=await import(pathToFileURL(paths[1])),otp=await import(pathToFileURL(paths[2])),firebase=await import(pathToFileURL(paths[0]));
        environment=firebase.stagingComposeEnvironment(await maps.stagingGoogleMapsConfiguration(envFile),await otp.stagingOtpConfiguration(envFile));
      }
      if(envFile!=='/dev/null')configs.set(envFile,readFileSync(envFile));
      const resolved=JSON.parse(run('docker',['compose','--project-name','ramo-nessa-staging','--env-file',envFile,...files.flatMap(f=>['-f',f]),'config','--format','json'],{env:environment,cwd:dirname(files[0])}));
      const oldImage=JSON.parse(run('docker',['image','inspect',before[role].Image]))[0],newImage=JSON.parse(run('docker',['image','inspect',prepared.candidate[role]]))[0];
      if(newImage.Id!==prepared.candidate[role])throw Error('Imagem candidata divergente.');
      models[role]=makeModels(resolved,role,before[role],oldImage,newImage,webRoot);
      save(role+'-resolved.private.json',resolved);
      for(const kind of ['candidate','rollback']){
        const file=role+'-'+kind+'.compose.private.json';save(file,models[role][kind]);
        const reread=JSON.parse(run('docker',['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(destination,file),'config','--format','json'],{env:{PATH:process.env.PATH}}));
        if(JSON.stringify(reread.services[role].environment)!==JSON.stringify(models[role][kind].services[role].environment)){
          const a=reread.services[role].environment,b=models[role][kind].services[role].environment;
          if(Object.keys(a).length!==Object.keys(b).length||Object.keys(a).some(k=>a[k]!==b[k]))throw Error('Compose alterou ambiente na releitura.');
        }
      }
    }
    const records=[];for(const [path,bytes] of configs){const file='source-'+records.length+'.private';save(file,bytes);records.push({path,file,sha256:digest(bytes)});if(!readFileSync(path).equals(bytes))throw Error('Configuração mudou durante a preparação.');}save('sources.private.json',records);
    // An active reset plan is read-only and separate from the completed offline rehearsal.
    const data=join(destination,'data');mkdirSync(data,{mode:0o700});chownSync(data,1000,1000);
    if(before.core.Config.Env.some(e=>/[\r\n]/.test(e)))throw Error('Ambiente multilinha exige tratamento explícito.');
    save('core-env.private',before.core.Config.Env.join('\n')+'\n');
    const output=run('docker',['run','--rm','--network','container:'+before.core.Id,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',join(destination,'core-env.private'),'--mount','type=bind,src='+data+',dst=/ops/data',prepared.candidate.core,'node','dist/scripts/prepare-regions-catalog.js','--plan','/ops/data/reset-active.plan.json']);save('reset-plan-result.private.json',output);
    const activePlan=json(join(data,'reset-active.plan.json')),rehearsal=json(join(release,'offline-data/plan.json'));
    if(activePlan.plan.sourceRevision!==rehearsal.plan.sourceRevision||activePlan.plan.sourceDigest!==rehearsal.plan.sourceDigest)throw Error('Catálogo ativo mudou desde o ensaio. Nenhum reset será aplicado.');
    const resetPlanHash=await fileHash(join(data,'reset-active.plan.json'));
    const oldWebHash=await treeHash(oldWeb.Source),newWebHash=await treeHash(webRoot);
    for(const role of Object.keys(names)){const current=JSON.parse(run('docker',['inspect',names[role]]))[0];if(identity(current)!==identity(before[role]))throw Error('Runtime mudou durante preparação: '+role);}
    if(JSON.stringify(sql(migrationsSQL))!==JSON.stringify(migrations)||await fileHash(caddy.Source)!==caddyHash)throw Error('Migrations ou Caddy mudaram.');
    for(const entry of records)if(await fileHash(entry.path)!==entry.sha256)throw Error('Configuração mudou durante preparação.');
    const plan={format:1,preparedAt:new Date().toISOString(),release,preparedManifestSha256:preparedHash,revision:prepared.revision,backup,backupManifestSha256:prepared.backupManifestSha256,scope:['core','admin-gateway','passenger-web','driver-web','three-region-empty-fare-catalog'],candidate:prepared.candidate,beforeImages:{core:before.core.Image,gateway:before.gateway.Image},webRoot,oldWebRoot:oldWeb.Source,caddy:caddy.Source,caddyHash,oldWebHash,newWebHash,resetPlanHash,resetSourceRevision:activePlan.plan.sourceRevision,resetSourceDigest:activePlan.plan.sourceDigest,resetRequestId:activePlan.plan.requestId,servicesChanged:false,resetApplied:false};
    save('plan.private.json',plan);
    console.log(JSON.stringify({status:'PLANO_DE_ATIVACAO_PREPARADO',directory:destination,planSha256:await fileHash(join(destination,'plan.private.json')),webFilesVerified:staged.files,servicesRestarted:false,resetApplied:false},null,2));
  }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await prepareActivation(process.argv.slice(2));}catch(e){console.error(e.message+' Nenhum serviço ativo foi reiniciado e nenhum reset foi aplicado.');process.exitCode=1;}}
