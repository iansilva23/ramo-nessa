// Preparation only: creates a private Core-only plan and tests credentials offline.
// Does not run compose up, migrate, alter Caddy, subscribe a webhook or POST to Asaas.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,existsSync,mkdirSync,chownSync,openSync,closeSync,unlinkSync,constants,readdirSync,createReadStream} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {activationProject,sha256,environmentMap,composeEnvironmentToRuntime,assertEnvironmentMatches,servicePlan} from './asaas-activation-plan-contract.mjs';
import {receiverRevision,receiverImage,receiverRoot as root,productionSecrets,expectedCore,expectedGateway,receiverSecretTargets,receiverEnvironment,receiverPlan,assertReceiverDelta,receiverProbeSource} from './asaas-production-receiver-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
process.umask(0o077);
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',site:'ramo-nessa-site-institutional-site-1',postgres:'ramo-nessa-staging-postgres-1'};
function privateDir(path,{parent=false}={}){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&(parent?0o022:0o077)))throw Error('Pasta privada divergente.');}
for(const p of ['/opt/ramo-nessa-private','/var/backups/ramo-nessa-asaas'])privateDir(p,{parent:true});
for(const p of [productionSecrets,'/var/lib/ramo-nessa-asaas-sandbox'])privateDir(p);
const lock='/var/lib/ramo-nessa-asaas-sandbox/execution.lock';
closeSync(openSync(lock,'wx',0o600));
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,data)=>writeFileSync(p,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
function run(args,options={}){
 const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH},...options});
 if(r.error||r.status!==0){if(existsSync(root))writeFileSync(join(root,'last-error.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Verificação Docker não concluída. Diagnóstico privado preservado.');}
 return r.stdout;
}
const inspect=name=>JSON.parse(run(['inspect',name]))[0];
const snapshot=()=>Object.fromEntries(Object.entries(names).map(([k,n])=>[k,inspect(n)]));
const identity=c=>[c.Id,c.Image,c.State.StartedAt,c.Config.Env,c.Mounts,c.HostConfig.PortBindings,Object.keys(c.NetworkSettings.Networks).sort()];
function assertSame(before,after){for(const k of Object.keys(names))if(!isDeepStrictEqual(identity(before[k]),identity(after[k]))||after[k].State.Health?.Status!=='healthy')throw Error('Runtime mudou: '+k);}
const sql=query=>run(['exec',names.postgres,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','receiver-read-only',query]);
const migrationQuery='BEGIN READ ONLY; SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t; COMMIT;';
async function fileHash(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
async function treeHash(path){const list=[];async function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado nos bundles.');if(s.isDirectory())await visit(f);else if(s.isFile())list.push([relative(path,f),s.size,await fileHash(f)]);else throw Error('Arquivo inesperado nos bundles.');}}await visit(path);return sha256(JSON.stringify(list));}
let ownRoot=false;
try{
 if(existsSync(root))throw Error('Já existe uma preparação de receptor. Não repita; envie o resultado.');
 const before=snapshot();
 if(before.core.Image!==expectedCore||before.gateway.Image!==expectedGateway)throw Error('Core/ADM diferentes dos conferidos. Nenhum serviço alterado.');
 for(const [key,c]of Object.entries(before))if(c.State.Health?.Status!=='healthy')throw Error('Serviço sem saúde: '+key);
 const active=environmentMap(before.core.Config.Env);
 if(active.NODE_ENV!=='staging'||active.DRIVER_PAYOUT_PROVIDER_NAME!=='asaas'||active.ASAAS_PAYOUTS_ENABLED!=='false'||active.ASAAS_WEBHOOK_ENABLED==='true')throw Error('Ambiente ativo exige revisão.');
 const oldPlan='/var/backups/ramo-nessa-asaas/5ffae7968796/activation-plan';
 if(json(join(oldPlan,'activation.json')).phase!=='completed')throw Error('Ativação anterior não concluída.');
 const sources=before.core.Config.Labels?.['com.docker.compose.project.config_files']?.split(',');
 if(sources?.length!==1||sources[0]!==join(oldPlan,'core-candidate.compose.private.json'))throw Error('Origem Compose ativa diferente da esperada.');
 const source=sources[0],sourceHash=await fileHash(source);
 const resolved=JSON.parse(run(['compose','--project-name',activationProject,'-f',source,'config','--format','json']));
 const oldImage=JSON.parse(run(['image','inspect',before.core.Image]))[0];
 assertEnvironmentMatches(resolved.services.core,before.core,oldImage);
 const rollback=servicePlan(resolved,'core',before.core,before.core.Image);
 const candidate=JSON.parse(run(['image','inspect',receiverImage]))[0];
 if(candidate.Id===before.core.Image||candidate.Config.User!=='node')throw Error('Imagem candidata inesperada.');
 const uid=JSON.parse(run(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',candidate.Id,'node','-e','console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid()}))']));
 if(!Number.isInteger(uid.uid)||uid.uid<1||!Number.isInteger(uid.gid)||uid.gid<1)throw Error('Usuário da imagem inválido.');
 const schema=JSON.parse(sql(migrationQuery));
 const catalog=JSON.parse(run(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',candidate.Id,'node','--input-type=module','-e',"import{readdirSync,readFileSync}from'node:fs';import{createHash}from'node:crypto';console.log(JSON.stringify(Object.fromEntries(readdirSync('/app/migrations').filter(n=>n.endsWith('.sql')).map(n=>[n,createHash('sha256').update(readFileSync('/app/migrations/'+n)).digest('hex')]))))"]));
 if(!schema.some(r=>r.filename==='086_asaas_driver_payouts.sql')||schema.length!==Object.keys(catalog).length||schema.some(r=>catalog[r.filename]!==r.checksum))throw Error('Histórico de migrations divergiu da imagem; não será migrado automaticamente.');
 const policy=JSON.parse(sql("BEGIN READ ONLY; SELECT row_to_json(t) FROM (SELECT mode,automatic_enabled,anticipation_minimum_cents,anticipation_fee_cents FROM driver_payout_settings WHERE id=1) t; COMMIT;"));
 if(policy.mode!=='manual'||policy.automatic_enabled!==false)throw Error('Mantenha os repasses em modo manual antes de preparar.');
 if(Number(sql("BEGIN READ ONLY; SELECT count(*) FROM asaas_driver_transfer_attempts WHERE environment='production'; COMMIT;").trim())!==0)throw Error('Há tentativas de produção; conciliação específica necessária.');
 const caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile'),web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web');
 if(caddy?.Type!=='bind'||caddy.RW!==false||web?.Type!=='bind'||web.RW!==false)throw Error('Mounts do gateway inesperados.');
 const caddyHash=await fileHash(caddy.Source),webHash=await treeHash(web.Source);
 const bindFiles=[];for(const c of Object.values(before))for(const m of c.Mounts??[])if(m.Type==='bind'&&lstatSync(m.Source).isFile()&&!bindFiles.some(x=>x.path===m.Source))bindFiles.push({path:m.Source,sha256:await fileHash(m.Source)});
 mkdirSync(root,{mode:0o700});ownRoot=true;mkdirSync(join(root,'runtime-secrets'),{mode:0o700});
 write(join(root,'runtime-before.private.json'),before);
 write(join(root,'core-rollback.compose.private.json'),rollback);
 write(join(root,'migrations-before.json'),schema);
 write(join(root,'policy-before.private.json'),policy);
 const secretRecords=[];
 for(const [name,target]of Object.entries(receiverSecretTargets)){
  const original=join(productionSecrets,name),fd=openSync(original,constants.O_RDONLY|constants.O_NOFOLLOW);
  let bytes;
  try{
   const s=(await import('node:fs')).fstatSync(fd);
   if(!s.isFile()||s.uid!==0||(s.mode&0o777)!==0o600||s.size>4096)throw Error('Credencial original sem proteção esperada.');
   bytes=readFileSync(fd);
  }finally{closeSync(fd);}
  const value=bytes.toString('utf8').trim();
  if(!/^\S{20,4096}$/.test(value)||(name==='webhook-token'&&!/^\S{32,255}$/.test(value)))throw Error('Formato de credencial inválido.');
  const path=join(root,'runtime-secrets',name);
  writeFileSync(path,bytes,{mode:0o600,flag:'wx'});chownSync(path,uid.uid,uid.gid);
  secretRecords.push({original,path,target,sha256:sha256(bytes),uid:uid.uid,gid:uid.gid});
 }
 const model=receiverPlan(rollback,candidate.Id);
 assertReceiverDelta(rollback,model,candidate.Id);
 const expectedEnv={...environmentMap(candidate.Config.Env),...composeEnvironmentToRuntime(model.services.core.environment)};
 for(const key of new Set([...Object.keys(active),...Object.keys(expectedEnv)]))if(!Object.hasOwn(receiverEnvironment,key)&&active[key]!==expectedEnv[key])throw Error('Imagem candidata alteraria ambiente fora do escopo: '+key);
 write(join(root,'core-receiver.compose.private.json'),model);
 const reread=JSON.parse(run(['compose','--project-name',activationProject,'-f',join(root,'core-receiver.compose.private.json'),'config','--format','json']));
 if(!isDeepStrictEqual(reread.services.core.environment,model.services.core.environment))throw Error('Compose alterou ambiente privado na releitura.');
 const probeArgs=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges'];
 for(const [key,value]of Object.entries(receiverEnvironment))probeArgs.push('--env',key+'='+value);
 for(const entry of secretRecords)probeArgs.push('--mount','type=bind,src='+entry.path+',dst='+entry.target+',readonly');
 probeArgs.push(candidate.Id,'node','--input-type=module','-e',receiverProbeSource);
 console.log('Testando leitura privada das credenciais e bloqueio de envio em container sem internet...');
 if(run(probeArgs).trim()!=='RECEIVER_PRIVATE_PROBE_OK')throw Error('Proteção de envio não confirmada.');
 if(await fileHash(source)!==sourceHash||await fileHash(caddy.Source)!==caddyHash||await treeHash(web.Source)!==webHash)throw Error('Arquivos ativos mudaram durante a preparação.');
 for(const entry of bindFiles)if(await fileHash(entry.path)!==entry.sha256)throw Error('Arquivo montado mudou durante a preparação.');
 assertSame(before,snapshot());
 if(!isDeepStrictEqual(JSON.parse(sql(migrationQuery)),schema)||!isDeepStrictEqual(JSON.parse(sql("BEGIN READ ONLY; SELECT row_to_json(t) FROM (SELECT mode,automatic_enabled,anticipation_minimum_cents,anticipation_fee_cents FROM driver_payout_settings WHERE id=1) t; COMMIT;")),policy))throw Error('Histórico ou política mudou durante a preparação.');
 write(join(root,'prepared.json'),{phase:'prepared',revision:receiverRevision,preparedAt:new Date().toISOString(),beforeImage:before.core.Image,candidateImage:candidate.Id,source,sourceHash,bindFiles,secrets:secretRecords,caddy:caddy.Source,caddyHash,web:web.Source,webHash,uid,asaasPayoutsEnabled:false,servicesChanged:false,migrationApplied:false});
 console.log('RECEPTOR DE PRODUÇÃO PREPARADO. Credenciais legíveis pelo usuário node e envios bloqueados.');
 console.log('Plano de retorno preservado. Core, ADM, Web, site e banco ativos não foram alterados.');
 console.log('Ainda NÃO ative ou cadastre o webhook; a troca do Core será uma etapa separada.');
}catch(error){
 if(ownRoot)writeFileSync(join(root,'preparation-error.private.log'),String(error.stack??error),{mode:0o600});
 console.error(error.message??'Preparação requer conferência.');console.error('Nenhum serviço foi substituído. Envie o resultado antes de repetir.');process.exitCode=1;
}finally{unlinkSync(lock);}
