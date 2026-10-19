import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,existsSync,statfsSync,statSync,createReadStream} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeContract,activeCaddy,validateRuntime} from './asaas-runtime-contract.mjs';
import {backupPaths,validateFreshBackup} from './asaas-fresh-backup-contract.mjs';
const candidateRevision='5ffae79687965042765f40f53cd32e57510dfbfe';
const root='/var/backups/ramo-nessa-asaas/'+candidateRevision.slice(0,12),here=dirname(fileURLToPath(import.meta.url));
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
process.umask(0o077);
const mode=process.argv[2]===undefined?'initial':process.argv[2]==='--before-activation'?'before-activation':'invalid';
const paths=backupPaths(root,mode);
if(mode==='before-activation')validateFreshBackup({plan:JSON.parse(readFileSync(join(root,'activation-plan/plan.json'),'utf8')),closed:JSON.parse(readFileSync('/var/lib/ramo-nessa-asaas-sandbox/sandbox-closed.json','utf8')),previous:JSON.parse(readFileSync(join(root,'backup-verified.json'),'utf8')),revision:candidateRevision});
const prepared=JSON.parse(readFileSync(join(root,'prepared.json'),'utf8'));
if(prepared.revision!==candidateRevision||prepared.migrationApplied!==false||prepared.asaasActivated!==false)throw Error('Registro de preparação diferente.');
if(existsSync(paths.verified))throw Error('Já existe backup verificado desta etapa. Envie o resultado, sem refazer.');
function run(cmd,args,options={}){
 const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],...options});
 if(r.error||r.status!==0)throw Error('Etapa não concluída: '+cmd+'. Dados privados não exibidos.');return r.stdout;
}
const inspect=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,JSON.parse(run('docker',['inspect',v.name]))[0]]));
const start=inspect();validateRuntime(start);
const previous=JSON.parse(readFileSync(join(root,'runtime-before.private.json'),'utf8'));
const same=(a,b)=>JSON.stringify([a.Id,a.Image,a.State.StartedAt,a.Config.Env,a.Mounts])===JSON.stringify([b.Id,b.Image,b.State.StartedAt,b.Config.Env,b.Mounts]);
for(const k of Object.keys(start))if(!same(start[k],previous[k]))throw Error('Runtime mudou desde a preparação: '+k);
const configPaths=JSON.parse(readFileSync(join(root,'compose-paths.private.json'),'utf8'));
function checkConfig(){
 if(!readFileSync(activeCaddy).equals(readFileSync(join(root,'Caddyfile.before'))))throw Error('Caddy mudou desde a preparação.');
 for(let i=0;i<configPaths.length;i++)if(!readFileSync(configPaths[i]).equals(readFileSync(join(root,'compose-'+i+'.private'))))throw Error('Compose mudou desde a preparação.');
}
checkConfig();
for(const [tag,id] of [[prepared.coreImage,prepared.coreCandidate],[prepared.gatewayImage,prepared.gatewayCandidate]])if(JSON.parse(run('docker',['image','inspect',tag]))[0].Id!==id)throw Error('Imagem candidata mudou.');
const doc=start.core.Mounts.find(m=>m.Destination==='/var/lib/ramo-nessa');
if(doc?.Type!=='volume'||doc.Name!=='ramo-nessa-staging_driver_documents')throw Error('Volume de documentos diferente.');
const activeSql=query=>run('docker',['exec',runtimeContract.postgres.name,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','asaas-read-only',query]);
const migrationQuery='BEGIN READ ONLY; SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t; COMMIT;';
const expectedMigrations=JSON.stringify(JSON.parse(readFileSync(join(root,'migrations-before.json'),'utf8')));
function checkMigrations(){if(JSON.stringify(JSON.parse(activeSql(migrationQuery)))!==expectedMigrations)throw Error('Histórico do banco ativo mudou.');}
checkMigrations();
const databaseBytes=Number(activeSql('BEGIN READ ONLY; SELECT pg_database_size(current_database()); COMMIT;').trim());
const documentBytes=Number(run('du',['-sb','--',doc.Source]).split(/\s/)[0]);
const imageIds=[...new Set([start.core.Image,start.gateway.Image,start.site.Image])];
const imageBytes=imageIds.reduce((sum,id)=>sum+JSON.parse(run('docker',['image','inspect',id]))[0].Size,0);
const disk=statfsSync(root),needed=Math.max(3*1024**3,imageBytes*1.25+databaseBytes*4+documentBytes*2);
if(!Number.isFinite(needed)||disk.bavail*disk.bsize<needed)throw Error('Espaço insuficiente para backup e restauração isolada.');
const nonce=randomBytes(8).toString('hex'),stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const destination=join(paths.parent,'checkpoint-'+stamp);mkdirSync(destination,{mode:0o700});
const save=(name,data)=>writeFileSync(join(destination,name),data,{mode:0o600,flag:'wx'});
function outputFile(name,cmd,args){const fd=openSync(join(destination,name),'wx',0o600);try{run(cmd,args,{stdio:['ignore',fd,'pipe']});}finally{closeSync(fd);}}
async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
const db='ramo-asaas-drill-'+nonce,dbVolume=db+'-db',docVolume=db+'-docs';
const password=randomBytes(32).toString('base64url'),user='ramo_restore',database='ramo_asaas_restore';
const dbEnv=['--env','PGPASSWORD='+password];
const dbUrl='postgresql://'+user+':'+password+'@127.0.0.1:5432/'+database;
const postgresImage=start.postgres.Image;
let containerCreated=false,dbCreated=false,docsCreated=false;
const owned='br.com.ramonessa.asaas-drill='+nonce;
function volume(name){const check=spawnSync('docker',['volume','inspect',name],{stdio:'ignore'});if(check.status===0)throw Error('Nome descartável já existe.');run('docker',['volume','create','--label',owned,name]);}
function cleanup(){
 if(containerCreated){run('docker',['rm','-f',db]);containerCreated=false;}
 if(docsCreated){run('docker',['volume','rm',docVolume]);docsCreated=false;}
 if(dbCreated){run('docker',['volume','rm',dbVolume]);dbCreated=false;}
}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{try{cleanup();}finally{process.exit(code);}});
function candidate(command,args=[],image=prepared.coreCandidate){return run('docker',['run','--rm','--network','container:'+db,'--read-only','--security-opt','no-new-privileges','--cap-drop','ALL','--env','DATABASE_URL='+dbUrl,'--env','DB_SSL=false','--mount','type=bind,src='+join(destination,'probe.mjs')+',dst=/audit/probe.mjs,readonly',image,command,...args]);}
try{
 console.log('Criando backup recente do banco e documentos...');
 outputFile('database.dump','docker',['exec',runtimeContract.postgres.name,'sh','-lc','exec env PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-acl']);
 outputFile('driver-documents.tar.gz','docker',['run','--rm','--network','none','--read-only','--security-opt','no-new-privileges','--cap-drop','ALL','--user','1000:1000','--mount','type=volume,src='+doc.Name+',dst=/source,readonly',postgresImage,'tar','-C','/source','-czf','-','.']);
 console.log('Preservando imagens atuais para retorno...');
 outputFile('images-before.tar','docker',['image','save',...imageIds]);
 save('images-before.private.json',JSON.stringify(imageIds));
 run('docker',['run','--rm','--network','none','--read-only','--mount','type=bind,src='+destination+',dst=/backup,readonly',postgresImage,'pg_restore','--list','/backup/database.dump']);
 run('docker',['run','--rm','--network','none','--read-only','--mount','type=bind,src='+destination+',dst=/backup,readonly',postgresImage,'tar','-tzf','/backup/driver-documents.tar.gz']);
 volume(dbVolume);dbCreated=true;volume(docVolume);docsCreated=true;
 run('docker',['run','-d','--name',db,'--network','none','--label',owned,'--env','POSTGRES_USER='+user,'--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB='+database,'--mount','type=volume,src='+dbVolume+',dst=/var/lib/postgresql/data','--mount','type=bind,src='+destination+',dst=/backup,readonly',postgresImage]);containerCreated=true;
 let ready=false;
 for(let n=0;n<60;n++){
  // The init process briefly accepts connections; require the final postgres PID 1.
  const r=spawnSync('docker',['exec',...dbEnv,db,'sh','-lc','test "$(cat /proc/1/comm)" = "postgres" && psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "SELECT 1"'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(r.status===0&&r.stdout.trim()==='1'){ready=true;break;}await new Promise(r=>setTimeout(r,1000));
 }
 if(!ready)throw Error('PostgreSQL descartável não iniciou.');
 console.log('Restaurando a cópia em PostgreSQL sem acesso à internet...');
 run('docker',['exec',...dbEnv,db,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U',user,'-d',database,'/backup/database.dump']);
 run('docker',['run','--rm','--network','none','--read-only','--mount','type=bind,src='+destination+',dst=/backup,readonly','--mount','type=volume,src='+docVolume+',dst=/restore',postgresImage,'tar','--no-same-owner','-xzf','/backup/driver-documents.tar.gz','-C','/restore']);
 run('docker',['run','--rm','--network','none','--read-only','--mount','type=volume,src='+docVolume+',dst=/restore,readonly',postgresImage,'tar','-C','/restore','-cf','/dev/null','.']);
 save('probe.mjs',readFileSync(join(here,'asaas-restoration-probe.mjs')));
 // Probe is public code; allow the unprivileged Core user to read only this file.
 run('chmod',['644',join(destination,'probe.mjs')]);
 const before=candidate('node',['/audit/probe.mjs','fingerprint']);
 console.log('Testando migration 086, repetição e leitura pelos dois Cores...');
 save('migration-first.private.log',candidate('node',['dist/scripts/migrate.js']));
 candidate('node',['/audit/probe.mjs','defaults']);candidate('node',['/audit/probe.mjs','set-custom']);
 save('migration-second.private.log',candidate('node',['dist/scripts/migrate.js']));
 candidate('node',['/audit/probe.mjs','custom']);candidate('node',['/audit/probe.mjs','old-reader'],start.core.Image);
 const after=candidate('node',['/audit/probe.mjs','fingerprint']);
 if(before!==after)throw Error('Dados de negócio diferentes após migration na cópia.');
 save('data-fingerprint.private.json',before);
 const end=inspect();validateRuntime(end);for(const k of Object.keys(start))if(!same(start[k],end[k]))throw Error('Runtime mudou durante o teste.');
 checkMigrations();checkConfig();
 const files=[];for(const name of ['database.dump','driver-documents.tar.gz','images-before.tar']){const path=join(destination,name);files.push({name,bytes:statSync(path).size,sha256:await fileHash(path)});}
 save('manifest.private.json',JSON.stringify({candidateRevision,createdAt:new Date().toISOString(),files,restored:true,migrationOnlyOnCopy:true,oldAndNewRepositoryRead:true,businessDataUnchanged:true},null,2));
 cleanup();containerCreated=dbCreated=docsCreated=false;
 writeFileSync(paths.verified,JSON.stringify({candidateRevision,stage:mode,directory:destination,createdAt:new Date().toISOString(),runtimeIds:Object.fromEntries(Object.entries(start).map(([k,v])=>[k,v.Id])),migrationAppliedToActive:false,asaasActivated:false},null,2),{mode:0o600,flag:'wx'});
 console.log(mode==='before-activation'?'BACKUP RECENTE PARA ATIVAÇÃO CONCLUÍDO. Restauração e compatibilidade verificadas na cópia.':'BACKUP E TESTE ISOLADO CONCLUÍDOS. Migration 086 e leitura dos dois Cores aprovadas na cópia.');
 console.log('Banco ativo continua na 085. Nenhum serviço ativo foi reiniciado. Asaas NÃO ativado.');
}catch(error){console.error('Etapa interrompida. Arquivos privados preservados em '+destination);throw error;}
finally{cleanup();}
