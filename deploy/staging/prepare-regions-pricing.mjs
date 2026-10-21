import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, statfsSync, readdirSync, chownSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validate, runtimeIdentity } from './backup-regions-pricing.mjs';
import { coreSourceFingerprintProgram } from './inspect-regions-pricing.mjs';
const roles={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function checkMigrations(applied, files) {
  if (!Array.isArray(applied) || applied.length !== Object.keys(files).length || new Set(applied.map(m=>m.filename)).size!==applied.length) throw Error('Conjunto de migrations diferente. Nenhuma migration será aplicada.');
  for (const m of applied) if (files[m.filename] !== m.checksum) throw Error('Checksum de migration diferente: '+m.filename);
}
export function argumentsFor(argv) {
  if(argv.length!==3 || !/^[a-f0-9]{40}$/.test(argv[0]) || !/^\/var\/backups\/ramo-nessa-regions\/[a-zA-Z0-9.-]+$/.test(argv[1]) || !/^[a-f0-9]{64}$/.test(argv[2])) throw Error('Informe revisão completa, diretório do backup e SHA-256 do manifesto.');
  return {revision:argv[0],backup:argv[1],manifestHash:argv[2]};
}
export async function prepare(argv) {
  const {revision,backup,manifestHash}=argumentsFor(argv);
  if(process.getuid?.()!==0)throw Error('Execute com sudo.'); process.umask(0o077);
  const privateDirectory=path=>{const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Diretório privado divergente.');};
  privateDirectory(backup);
  const manifestBytes=readFileSync(join(backup,'verified.private.json'));
  if(hash(manifestBytes)!==manifestHash)throw Error('Manifesto de backup divergente.');
  const manifest=JSON.parse(manifestBytes);
  if(manifest.databaseRestoredInIsolation!==true||manifest.resetApplied!==false||manifest.servicesRestarted!==false)throw Error('Backup não aprovado para preparação.');
  let failureDirectory;
  function run(cmd,args,extra={}) {const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:64*1024**2,stdio:['pipe','pipe','pipe'],...extra});if(r.status!==0||r.error){if(failureDirectory)writeFileSync(join(failureDirectory,'prepare-last.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Etapa '+cmd+' falhou; saída privada omitida.');}return r.stdout;}
  async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
  console.log('Conferindo integridade do backup e identidade dos serviços atuais...');
  for(const f of manifest.files){if(!/^[a-zA-Z0-9.-]+$/.test(f.name))throw Error('Nome de arquivo de backup inválido.');const p=join(backup,f.name),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077)||s.size!==f.bytes||await fileHash(p)!==f.sha256)throw Error('Arquivo do backup não confere: '+f.name);}
  const saved=JSON.parse(readFileSync(join(backup,'runtime.private.json')));
  const inspect=()=>Object.fromEntries(Object.entries(roles).map(([role,name])=>[role,JSON.parse(run('docker',['inspect',name]))[0]]));
  const before=inspect(),expected={'core-image':saved.core.Image,'gateway-image':saved.gateway.Image}; validate(before,expected);
  const stable=runtimeIdentity;
  for(const role of Object.keys(roles))if(before[role].Id!==manifest.runtimeIds[role]||stable(before[role])!==stable(saved[role]))throw Error('Runtime mudou desde o backup: '+role);
  const sql=q=>run('docker',['exec',roles.postgres,'sh','-lc','exec env PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','regions-prepare-read-only',"BEGIN READ ONLY; SET LOCAL statement_timeout='10s'; "+q+'; COMMIT;']);
  const migrationSQL='SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t';
  const applied=JSON.parse(sql(migrationSQL));
  if(JSON.stringify(applied)!==JSON.stringify(JSON.parse(readFileSync(join(backup,'migrations.private.json')))))throw Error('Migrations mudaram desde o backup.');
  const root='/opt/ramo-nessa-regions/releases',release=join(root,revision.slice(0,12));
  mkdirSync(root,{recursive:true,mode:0o700});privateDirectory(root);
  if(existsSync(release))throw Error('Preparação já existe. Não foi sobrescrita; envie o resultado anterior.');
  const disk=statfsSync(root);if(disk.bavail*disk.bsize<3*1024**3)throw Error('Reserve pelo menos 3 GiB livres para imagens e banco isolado.');
  mkdirSync(release,{mode:0o700});
  failureDirectory=release;
  const save=(name,data)=>writeFileSync(join(release,name),data,{mode:0o600,flag:'wx'});
  const git=(...args)=>run('git',['-c','safe.directory=/opt/ramo-nessa','-C','/opt/ramo-nessa',...args]);
  const archive=run('git',['-c','safe.directory=/opt/ramo-nessa','-C','/opt/ramo-nessa','archive',revision,'backend/core','apps/admin'],{encoding:null});
  run('tar',['-x','-C',release],{input:archive});
  const migrationPath=join(release,'backend/core/migrations');
  checkMigrations(applied,Object.fromEntries(readdirSync(migrationPath).filter(n=>n.endsWith('.sql')).map(n=>[n,hash(readFileSync(join(migrationPath,n)))])));
  save('checkout-before.private.json',JSON.stringify({revision:git('rev-parse','HEAD').trim(),status:git('status','--porcelain','--untracked-files=all')}));
  save('runtime-before.private.json',JSON.stringify(before));
  const images={core:'ramo-nessa-core:regions-'+revision.slice(0,12),gateway:'ramo-nessa-admin-gateway:regions-'+revision.slice(0,12)};
  for(const image of Object.values(images))if(spawnSync('docker',['image','inspect',image],{stdio:'ignore'}).status===0)throw Error('Tag candidata já existe.');
  function build(role,path){console.log('Compilando imagem candidata: '+role+'...');const r=spawnSync('docker',['build','--label','org.opencontainers.image.revision='+revision,'-t',images[role],join(release,path)],{encoding:'utf8',maxBuffer:64*1024**2,stdio:['ignore','pipe','pipe']});save(role+'-build.private.log',String(r.stdout??'')+String(r.stderr??''));if(r.status!==0||r.error)throw Error('Build '+role+' falhou. Log privado preservado.');}
  build('core','backend/core');build('gateway','apps/admin');
  const candidate=Object.fromEntries(Object.entries(images).map(([role,image])=>[role,JSON.parse(run('docker',['image','inspect',image]))[0].Id]));
  const source=JSON.parse(run('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',candidate.core,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
  const oldSource=JSON.parse(run('docker',['exec',roles.core,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
  if(source.source.groups.payments.sha256!==oldSource.source.groups.payments.sha256||source.packageLockSha256!==oldSource.packageLockSha256)throw Error('Código financeiro ou lockfile divergiu do Core instalado.');
  save('candidate-fingerprint.json',JSON.stringify(source));
  const env=before.core.Config.Env||[];
  if(env.some(e=>/[\r\n]/.test(e))||(before.gateway.Config.Env||[]).some(e=>/[\r\n]/.test(e)))throw Error('Ambiente multilinha exige tratamento explícito.');
  save('gateway-env.private',(before.gateway.Config.Env||[]).join('\n')+'\n');
  const caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
  const caddyHash=hash(readFileSync(caddy.Source));
  save('caddy-validation.private.log',run('docker',['run','--rm','--network','none','--read-only','--tmpfs','/tmp','--tmpfs','/data','--tmpfs','/config','--entrypoint','caddy','--env-file',join(release,'gateway-env.private'),'--mount','type=bind,src='+caddy.Source+',dst=/etc/caddy/Caddyfile,readonly',candidate.gateway,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']));
  const nonce=randomBytes(10).toString('hex'),drill='ramo-regions-candidate-'+nonce,volume=drill+'-db';
  const password=randomBytes(32).toString('hex'),databaseUrl='postgresql://ramo_restore:'+password+'@127.0.0.1:5432/ramo_regions_restore';
  save('offline-core-env.private',env.filter(e=>!['DATABASE_URL','DB_SSL','RAMO_REGIONS_OFFLINE_PROBE'].some(k=>e.startsWith(k+'='))).concat(['DATABASE_URL='+databaseUrl,'DB_SSL=false','RAMO_REGIONS_OFFLINE_PROBE=true']).join('\n')+'\n');
  const data=join(release,'offline-data');mkdirSync(data,{mode:0o700});chownSync(data,1000,1000);
  const here=dirname(fileURLToPath(import.meta.url));copyFileSync(join(here,'regions-restoration-probe.mjs'),join(release,'probe.mjs'));run('chmod',['644',join(release,'probe.mjs')]);
  let dbCreated=false,containerCreated=false;
  const cleanup=()=>{if(containerCreated){run('docker',['rm','-f',drill]);containerCreated=false;}if(dbCreated){run('docker',['volume','rm',volume]);dbCreated=false;}};
  try {
    if(run('docker',['volume','ls','--format','{{.Name}}']).trim().split('\n').includes(volume)||run('docker',['ps','-a','--format','{{.Names}}']).trim().split('\n').includes(drill))throw Error('Nome descartável já existe.');
    run('docker',['volume','create','--label','br.com.ramonessa.regions-candidate='+nonce,volume]);dbCreated=true;
    run('docker',['run','-d','--pull=never','--name',drill,'--network','none','--label','br.com.ramonessa.regions-candidate='+nonce,'--env','POSTGRES_USER=ramo_restore','--env','POSTGRES_DB=ramo_regions_restore','--env','POSTGRES_PASSWORD='+password,'--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data','--mount','type=bind,src='+backup+',dst=/backup,readonly',before.postgres.Image]);containerCreated=true;
    let ready=false;for(let n=0;n<60;n++){const r=spawnSync('docker',['exec',drill,'sh','-lc','test "$(cat /proc/1/comm)" = "postgres" && psql -U ramo_restore -d ramo_regions_restore -Atqc "SELECT 1"'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(r.status===0&&r.stdout.trim()==='1'){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw Error('PostgreSQL isolado não iniciou.');
    console.log('Restaurando backup e ensaiando reset, repetição e recuperação somente na cópia sem rede...');
    run('docker',['exec',drill,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','ramo_restore','-d','ramo_regions_restore','/backup/database.dump']);
    const result=run('docker',['run','--rm','--network','container:'+drill,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',join(release,'offline-core-env.private'),'--mount','type=bind,src='+data+',dst=/audit/data','--mount','type=bind,src='+join(release,'probe.mjs')+',dst=/audit/probe.mjs,readonly',candidate.core,'node','/audit/probe.mjs']);
    save('offline-reset-result.private.json',result);
    const checked=JSON.parse(result.trim());if(checked.result!=='OFFLINE_RESET_AND_RESTORE_VERIFIED')throw Error('Ensaio do reset incompleto.');
    const after=inspect();validate(after,expected);for(const role of Object.keys(roles))if(stable(before[role])!==stable(after[role]))throw Error('Runtime mudou durante preparação.');
    if(JSON.stringify(JSON.parse(sql(migrationSQL)))!==JSON.stringify(applied)||hash(readFileSync(caddy.Source))!==caddyHash)throw Error('Migrations/Caddy mudaram durante preparação.');
    for(const entry of JSON.parse(readFileSync(join(backup,'compose-paths.private.json'))))if(!readFileSync(entry.path).equals(readFileSync(join(backup,entry.file))))throw Error('Configuração de origem mudou desde o backup.');
    cleanup();
    const record={format:1,revision,backup,backupManifestSha256:manifestHash,createdAt:new Date().toISOString(),images,candidate,sourceSha256:source.source.sha256,financialCodePreserved:true,migrationsUnchanged:true,caddyHash,offlineResetVerified:true,activeDatabaseChanged:false,servicesRestarted:false,resetApplied:false};
    save('prepared.private.json',JSON.stringify(record,null,2));
    console.log(JSON.stringify({status:'CANDIDATA_PREPARADA_E_TESTADA',revision,release,preparedManifestSha256:hash(readFileSync(join(release,'prepared.private.json'))),financialCodePreserved:true,migrationsUnchanged:true,offlineResetVerified:true,servicesRestarted:false,resetApplied:false},null,2));
  } finally {cleanup();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await prepare(process.argv.slice(2));}catch(e){console.error('PREPARAÇÃO INTERROMPIDA: '+e.message+' Nenhum serviço ativo foi substituído e nenhum reset ativo foi aplicado.');process.exitCode=1;}}
