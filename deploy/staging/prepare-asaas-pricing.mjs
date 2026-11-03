import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,chmodSync,statfsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {runtimeContract,activeCaddy,activeWeb,pricingRevision,validateRuntime,validateMigrations} from './asaas-runtime-contract.mjs';
const repo='/opt/ramo-nessa',revision=process.argv[2];
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
if(!/^[a-f0-9]{40}$/.test(revision??''))throw Error('Informe o commit completo.');
process.umask(0o077);
function run(cmd,args,options={}){
 const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe'],...options});
 if(r.error||r.status!==0)throw Error('Etapa não concluída: '+cmd+'. Saída privada não exibida.');
 return r.stdout;
}
const git=(...args)=>run('sudo',['-u','ubuntu','git','-C',repo,...args]);
const digest=b=>createHash('sha256').update(b).digest('hex');
const inspect=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,JSON.parse(run('docker',['inspect',v.name]))[0]]));
const start=inspect();validateRuntime(start);
const disk=statfsSync('/opt');if(disk.bavail*disk.bsize<2*1024**3)throw Error('Reserve pelo menos 2 GiB livres antes de preparar.');
// Ensure the combined candidate really contains the currently deployed pricing source.
for(const path of ['backend/core/src/pricing/quote-engine.ts',...git('ls-tree','-r','--name-only',pricingRevision,'apps/passenger','packages').trim().split('\n').filter(Boolean)]){
 if(git('rev-parse',revision+':'+path).trim()!==git('rev-parse',pricingRevision+':'+path).trim())throw Error('Código de preços/passageiro alterado: '+path);
}
const migrationFiles=git('ls-tree','--name-only',revision+':backend/core/migrations').trim().split('\n').filter(n=>n.endsWith('.sql'));
const candidate=Object.fromEntries(migrationFiles.map(n=>[n,digest(git('show',revision+':backend/core/migrations/'+n))]));
const query='BEGIN READ ONLY; SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t; COMMIT;';
const applied=JSON.parse(run('docker',['exec',runtimeContract.postgres.name,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','asaas-read-only',query]));
validateMigrations(applied,candidate);
const short=revision.slice(0,12),backup='/var/backups/ramo-nessa-asaas/'+short,release='/opt/ramo-nessa-asaas/releases/'+short;
if(existsSync(backup)||existsSync(release))throw Error('Preparação já existe. Não foi sobrescrita. Envie o resultado.');
mkdirSync(backup,{recursive:true,mode:0o700});chmodSync(backup,0o700);
mkdirSync(release,{recursive:true,mode:0o700});
const save=(name,data)=>writeFileSync(join(backup,name),data,{mode:0o600,flag:'wx'});
save('runtime-before.private.json',JSON.stringify(start,null,2));
save('migrations-before.json',JSON.stringify(applied,null,2));
save('Caddyfile.before',readFileSync(activeCaddy));
save('worktree-before.patch',git('diff','--binary','HEAD'));
save('worktree-status-before.txt',git('status','--porcelain','--untracked-files=all'));
const configPaths=[...new Set(Object.values(start).flatMap(s=>(s.Config.Labels?.['com.docker.compose.project.config_files']??'').split(',').filter(Boolean)))];
for(let i=0;i<configPaths.length;i++){
 const file=configPaths[i];if(!lstatSync(file).isFile())throw Error('Compose não é arquivo regular.');save('compose-'+i+'.private',readFileSync(file));
}
save('compose-paths.private.json',JSON.stringify(configPaths,null,2));
// Git archives contain binary data; use a separate binary read instead of the UTF-8 helper.
const bytes=run('sudo',['-u','ubuntu','git','-C',repo,'archive',revision,'backend/core','apps/admin'],{encoding:null});
run('tar',['-x','-C',release],{input:bytes});
const coreImage='ramo-nessa-core:asaas-pricing-'+short,gatewayImage='ramo-nessa-admin-gateway:asaas-pricing-'+short;
for(const [name,image] of [['core',coreImage],['gateway',gatewayImage]]){
 const check=spawnSync('docker',['image','inspect',image],{stdio:'ignore'});if(check.status===0)throw Error('Tag candidata já existe: '+name);
}
console.log('Preparando Core com preços atuais e Asaas desativado por padrão...');
run('docker',['build','-t',coreImage,join(release,'backend/core')],{stdio:'inherit'});
console.log('Preparando imagem do ADM...');
run('docker',['build','-t',gatewayImage,join(release,'apps/admin')],{stdio:'inherit'});
const env=start.gateway.Config.Env??[];
if(env.some(e=>/[\r\n]/.test(e)))throw Error('Ambiente multilinha exige revisão privada.');
save('gateway-env.private',env.join('\n')+'\n');
run('docker',['run','--rm','--network','none','--entrypoint','caddy','--env-file',join(backup,'gateway-env.private'),'--mount','type=bind,src='+activeCaddy+',dst=/etc/caddy/Caddyfile,readonly',gatewayImage,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);
console.log('Configuração ativa do gateway validada com a imagem candidata.');
const end=inspect();validateRuntime(end);
for(const k of Object.keys(start))if(start[k].Id!==end[k].Id||start[k].Image!==end[k].Image||start[k].State.StartedAt!==end[k].State.StartedAt)throw Error('Um serviço mudou durante a preparação.');
if(digest(readFileSync(activeCaddy))!==digest(readFileSync(join(backup,'Caddyfile.before'))))throw Error('Caddy ativo mudou durante a preparação.');
save('prepared.json',JSON.stringify({revision,pricingRevision,release,backup,coreImage,gatewayImage,activeWeb,activeCaddy,coreCandidate:JSON.parse(run('docker',['image','inspect',coreImage]))[0].Id,gatewayCandidate:JSON.parse(run('docker',['image','inspect',gatewayImage]))[0].Id,pending:['086_asaas_driver_payouts.sql'],servicesUnchanged:true,migrationApplied:false,asaasActivated:false},null,2));
console.log('PREPARAÇÃO CONCLUÍDA. Imagens candidatas criadas; configurações preservadas em pasta privada.');
console.log('Nenhum serviço foi substituído ou reiniciado. Migration 086 NÃO aplicada. Asaas NÃO ativado.');
