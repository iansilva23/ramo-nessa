import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,chmodSync,lstatSync,openSync,closeSync,readdirSync } from 'node:fs';
import { join,basename,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './web-readiness-contract.mjs';
import { completedBackupDirectory,privateRuntimeSources,safeUntrackedPaths } from './web-backup-contract.mjs';
const repo='/opt/ramo-nessa',target='5247aabd587efa610c9b4cc36d74cbc348048b41';
const directory='/var/backups/ramo-nessa-web/'+target.slice(0,12);
if(process.getuid?.()!==0)throw new Error('Execute com sudo.');
function run(command,args,options={}){
 const result=spawnSync(command,args,{cwd:repo,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe'],...options});
 if(result.error||result.status!==0)throw new Error('Etapa não concluída: '+command+'. Consulte o log privado se disponível.');
 return result.stdout;
}
const git=(...args)=>run('sudo',['-u','ubuntu','git','-C',repo,...args]);
const auditFile=fileURLToPath(new URL('./inspect-web-readiness.mjs',import.meta.url));
function audit(){const output=run(process.execPath,[auditFile]);const end=output.indexOf('\nCONSULTA CONCLUÍDA.');if(end<0)throw new Error('Auditoria incompleta.');return JSON.parse(output.slice(0,end));}
const initial=audit();
if(initial.freeDiskGiB<5)throw new Error('Espaço disponível insuficiente para a preparação.');
if(existsSync(directory))throw new Error('Já existe uma preparação Web neste diretório. Envie o resultado, sem apagar backups.');
for(const file of ['backup.mjs','verify-backup.mjs','restore-drill.mjs']){
 const path=repo+'/deploy/staging/'+file;
 if(sha256(readFileSync(path))!==sha256(Buffer.from(git('show',target+':deploy/staging/'+file))))throw new Error('Helper de backup local diferente do revisado.');
}
const containerNames=Object.keys(initial.containers);
function identities(){return JSON.parse(run('docker',['inspect',...containerNames])).map(c=>({name:c.Name.slice(1),id:c.Id,image:c.Image}));}
const before=identities(),statusBefore=git('status','--porcelain');
mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
mkdirSync(directory+'/runtime',{mode:0o700});
const log=directory+'/preparation.log',fd=openSync(log,'wx',0o600);
function logged(command,args){return run(command,args,{stdio:['ignore',fd,fd]});}
const savedFiles=[];
function savePrivate(source,destination){
 const info=lstatSync(source);if(!info.isFile()||info.isSymbolicLink())throw new Error('Arquivo de recuperação não é regular.');
 mkdirSync(dirname(destination),{recursive:true,mode:0o700});copyFileSync(source,destination);chmodSync(destination,0o600);
 savedFiles.push({source,backup:destination,uid:info.uid,gid:info.gid,mode:info.mode&0o777,sha256:sha256(readFileSync(destination))});
}
try{
 console.log('Preservando configurações e alterações locais em diretório privado...');
 const env=repo+'/deploy/staging/.env';savePrivate(env,directory+'/runtime/staging.env');
 for(const item of privateRuntimeSources(readFileSync(env,'utf8')))savePrivate(item.path,directory+'/runtime/'+item.key);
 savePrivate(repo+'/deploy/staging/Caddyfile',directory+'/runtime/Caddyfile');
 for(const file of initial.containers['ramo-nessa-staging-core-1'].composeFiles.split(','))savePrivate(file,directory+'/runtime/'+basename(file));
 savePrivate('/opt/ramo-nessa-site/compose.yml',directory+'/runtime/site-compose.yml');
 writeFileSync(directory+'/worktree.patch',git('diff','--binary','HEAD'),{mode:0o600});
 for(const file of safeUntrackedPaths(git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean)))savePrivate(join(repo,file),join(directory,'untracked',file));
 console.log('Criando e verificando backup do banco e documentos...');
 logged(process.execPath,[repo+'/deploy/staging/backup.mjs','--output-dir='+directory+'/core']);
 const coreBackup=join(directory,'core',completedBackupDirectory(readdirSync(directory+'/core')));
 logged(process.execPath,[repo+'/deploy/staging/verify-backup.mjs','--backup-dir='+coreBackup]);
 console.log('Testando restauração em container e volume descartáveis...');
 logged(process.execPath,[repo+'/deploy/staging/restore-drill.mjs','--backup-dir='+coreBackup]);
 console.log('Criando cópia consistente dos dados do site...');
 const site='ramo-nessa-site-institutional-site-1';
 const sqliteOutput=run('docker',['exec',site,'node','ops/backup.mjs']);
 const snapshot=sqliteOutput.match(/Backup SQLite consistente criado em (\/var\/lib\/ramo-site\/backups\/interests-[A-Za-z0-9:.T-]+\.sqlite)/)?.[1];
 if(!snapshot)throw new Error('Não foi possível identificar o snapshot SQLite.');
 run('docker',['exec',site,'node','--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1],{readOnly:true});try{const row=db.prepare('PRAGMA integrity_check').get();if(!row||Object.values(row)[0]!=='ok')process.exitCode=1;}finally{db.close();}`,snapshot]);
 logged('docker',['cp',site+':'+snapshot,directory+'/site.sqlite']);chmodSync(directory+'/site.sqlite',0o600);
 const assets=run('docker',['exec',site,'node','-e',`console.log(require('node:fs').existsSync('/var/lib/ramo-site/assets')?'yes':'no')`]).trim()==='yes';
 if(assets){const volume=initial.containers[site].mounts.find(m=>m.destination==='/var/lib/ramo-site')?.name;if(volume!=='ramo-nessa-site_interests')throw new Error('Volume do site inesperado.');
  const output=openSync(directory+'/site-assets.tar.gz','wx',0o600);try{run('docker',['run','--rm','--network','none','--read-only','--user','1000:1000','--security-opt','no-new-privileges','--cap-drop','ALL','-v',volume+':/source:ro','postgres:16','tar','-C','/source','-czf','-','assets'],{stdio:['ignore',output,fd]});}finally{closeSync(output);}
  logged('docker',['run','--rm','--network','none','--read-only','--security-opt','no-new-privileges','--cap-drop','ALL','-v',directory+':/backup:ro','postgres:16','tar','-tzf','/backup/site-assets.tar.gz']);
 }
 console.log('Preservando as imagens atuais para retorno...');
 const tags={};
 for(const item of before){
  const imageName=item.name==='ramo-nessa-staging-core-1'?'ramo-nessa-core':item.name==='ramo-nessa-staging-gateway-1'?'ramo-nessa-admin-gateway':item.name==='ramo-nessa-staging-postgres-1'?'ramo-nessa-postgres':'ramo-nessa-site';
  const tag=imageName+':rollback-web-'+target.slice(0,12);
  const existing=spawnSync('docker',['image','inspect',tag],{stdio:'ignore'});if(existing.status===0)throw new Error('Tag de recuperação já existe. Nenhuma tag foi substituída.');
  logged('docker',['image','tag',item.image,tag]);tags[item.name]={image:item.image,tag};
 }
 if(JSON.stringify(identities())!==JSON.stringify(before)||git('status','--porcelain')!==statusBefore)throw new Error('Serviços ou fonte mudaram durante a preparação.');
 audit();
 const report={target,createdAt:new Date().toISOString(),coreBackup,restoreDrillPassed:true,siteSnapshot:{file:directory+'/site.sqlite',sha256:sha256(readFileSync(directory+'/site.sqlite')),assets},runtimeFiles:savedFiles,images:tags,containers:before,worktreeStatus:statusBefore,caddySha256:initial.snapshotMatches?'5e95e7086c2a2f03c153cae8692e0cb5c210c5ee5ad598b406a0e1d1b66ce1c9':null};
 writeFileSync(directory+'/prepared.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('BACKUP E RETORNO PREPARADOS: '+directory);
 console.log('Banco e documentos: backup verificado e restauração isolada concluída.');
 console.log('Site: SQLite íntegro e imagens preservadas. Configurações privadas protegidas.');
 console.log('Core, gateway, PostgreSQL, site e alterações locais continuam como estavam. Migration 085 NÃO aplicada.');
}catch{console.error('Preparação interrompida. Nenhuma atualização foi iniciada. Log privado: '+log);process.exitCode=1;}
finally{closeSync(fd);}
