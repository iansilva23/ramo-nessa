// Prepares a new immutable pair: byte-identical current passenger + reviewed driver.
// Does not run compose up, change Caddy/Core/DB, or mutate the active Web release.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,existsSync,mkdirSync,openSync,closeSync,unlinkSync,cpSync,renameSync,chmodSync,readdirSync,createReadStream,statfsSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {activationProject,sha256,environmentMap,assertEnvironmentMatches,servicePlan} from './asaas-activation-plan-contract.mjs';
import {receiverRoot} from './asaas-production-receiver-contract.mjs';
import {driverWebSource,driverWebFile,driverWebRelease as release,driverWebPrivate as root,driverWebBefore,driverGatewayImage,gatewayWebPlan,assertGatewayWebDelta,publicPushConfig,browserMapsKey} from './asaas-driver-web-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');
process.umask(0o077);
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const evidence=json(fileURLToPath(new URL('./asaas-driver-web-release.json',import.meta.url)));
if(evidence.sourceCommit!==driverWebSource||! /^[a-f0-9]{64}$/.test(evidence.archiveSha256??''))throw Error('Referência do pacote ainda não aprovada.');
const archive='/home/ubuntu/'+driverWebFile;
const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',site:'ramo-nessa-site-institutional-site-1',postgres:'ramo-nessa-staging-postgres-1'};
function privateDir(p){const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Pasta privada divergente.');}
privateDir(receiverRoot);privateDir('/var/lib/ramo-nessa-asaas-sandbox');
const lock='/var/lib/ramo-nessa-asaas-sandbox/execution.lock';closeSync(openSync(lock,'wx',0o600));
let ownRoot=false;
function run(command,args,options={}){
 const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH},...options});
 if(r.error||r.status!==0){if(ownRoot)writeFileSync(join(root,'last-error.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Verificação não concluída; diagnóstico privado preservado.');}return r.stdout;
}
const docker=args=>run('docker',args),inspect=n=>JSON.parse(docker(['inspect',n]))[0];
const snapshot=()=>Object.fromEntries(Object.entries(names).map(([k,n])=>[k,inspect(n)]));
const identity=c=>[c.Id,c.Image,c.State.StartedAt,c.Config.Env,c.Mounts,c.HostConfig.PortBindings,Object.keys(c.NetworkSettings.Networks).sort()];
async function fileHash(p){const h=createHash('sha256');for await(const c of createReadStream(p))h.update(c);return h.digest('hex');}
async function treeHash(path){
 const rows=[];async function visit(p){for(const name of readdirSync(p).sort()){const f=join(p,name),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado nos bundles.');if(s.isDirectory())await visit(f);else if(s.isFile())rows.push([relative(path,f),s.size,await fileHash(f)]);else throw Error('Arquivo inesperado nos bundles.');}}
 await visit(path);return sha256(JSON.stringify(rows));
}
const write=(p,d)=>writeFileSync(p,JSON.stringify(d,null,2),{mode:0o600,flag:'wx'});
try {
 if(existsSync(root)||existsSync(release))throw Error('Já existe preparação Web. Não repita; envie o resultado.');
 if(!existsSync(archive))throw Error('Pacote do motorista ainda não enviado para /home/ubuntu.');
 const before=snapshot(),receiver=json(join(receiverRoot,'activation.json'));
 if(receiver.phase!=='completed'||receiver.asaasPayoutsEnabled!==false||before.core.Image!==receiver.candidateImage)throw Error('Core receptor mudou desde a instalação.');
 const coreEnv=environmentMap(before.core.Config.Env);
 if(coreEnv.ASAAS_PAYOUTS_ENABLED!=='false'||coreEnv.ASAAS_WEBHOOK_ENABLED!=='true')throw Error('Estado Asaas exige revisão.');
 if(before.gateway.Image!==driverGatewayImage)throw Error('Imagem do ADM/gateway mudou.');
 for(const [k,c]of Object.entries(before))if(c.State.Health?.Status!=='healthy')throw Error('Serviço sem saúde: '+k);
 const web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web'),caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
 if(web?.Type!=='bind'||web.RW!==false||web.Source!==driverWebBefore||caddy?.Type!=='bind'||caddy.RW!==false)throw Error('Mounts ativos mudaram; nenhuma publicação será feita.');
 const paths=before.gateway.Config.Labels?.['com.docker.compose.project.config_files']?.split(',');
 const expected='/var/backups/ramo-nessa-asaas/5ffae7968796/activation-plan/gateway-candidate.compose.private.json';
 if(paths?.length!==1||paths[0]!==expected)throw Error('Origem do gateway diferente da esperada.');
 const source=paths[0],sourceHash=await fileHash(source),caddyHash=await fileHash(caddy.Source),webHash=await treeHash(web.Source),passengerHash=await treeHash(join(web.Source,'passenger'));
 if(statfsSync('/opt/ramo-nessa-web/releases').bavail*statfsSync('/opt/ramo-nessa-web/releases').bsize<1024*1024*1024)throw Error('Espaço insuficiente para preparar e preservar retorno.');
 const resolved=JSON.parse(docker(['compose','--project-name',activationProject,'-f',source,'config','--format','json']));
 const image=JSON.parse(docker(['image','inspect',before.gateway.Image]))[0];
 assertEnvironmentMatches(resolved.services.gateway,before.gateway,image);
 const rollback=servicePlan(resolved,'gateway',before.gateway,before.gateway.Image);
 mkdirSync(root,{mode:0o700});ownRoot=true;mkdirSync(release,{mode:0o700});
 write(join(root,'runtime-before.private.json'),before);
 write(join(root,'gateway-rollback.compose.private.json'),rollback);
 const staged=join(release,'staged-driver');
 console.log('Conferindo ZIP e hashes do motorista, sem alterar os bundles ativos...');
 const result=JSON.parse(run('python3',[fileURLToPath(new URL('./stage-asaas-driver-web.py',import.meta.url)),'--archive',archive,'--sha256',evidence.archiveSha256,'--output',staged]));
 run(process.execPath,[fileURLToPath(new URL('../../scripts/web/verify_web_bundle.mjs',import.meta.url)),'--role=driver','--dist='+staged]);
 if(!isDeepStrictEqual(publicPushConfig(readFileSync(join(web.Source,'driver','ramo_push_config.js'),'utf8')),publicPushConfig(readFileSync(join(staged,'ramo_push_config.js'),'utf8')))||
    browserMapsKey(readFileSync(join(web.Source,'driver','index.html'),'utf8'))!==browserMapsKey(readFileSync(join(staged,'index.html'),'utf8')))throw Error('Configuração pública Maps/Firebase difere do app atual.');
 const bundleRoot=join(release,'bundles');mkdirSync(bundleRoot,{mode:0o755});chmodSync(bundleRoot,0o755);
 cpSync(join(web.Source,'passenger'),join(bundleRoot,'passenger'),{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true,verbatimSymlinks:true});
 renameSync(staged,join(bundleRoot,'driver'));
 if(await treeHash(join(bundleRoot,'passenger'))!==passengerHash)throw Error('Cópia do passageiro não corresponde ao pacote ativo.');
 const driverHash=await treeHash(join(bundleRoot,'driver'));
 writeFileSync(join(bundleRoot,'release.json'),JSON.stringify({schemaVersion:2,kind:'composite',expectedOrigin:'https://app.ramonessa.com.br',passenger:{copiedFrom:web.Source,treeSha256:passengerHash},driver:{sourceCommit:driverWebSource,treeSha256:driverHash,archiveSha256:evidence.archiveSha256,manifestSha256:result.manifestSha256},realProviderAcceptance:false},null,2),{mode:0o644,flag:'wx'});
 chmodSync(join(bundleRoot,'release.json'),0o644);
 write(join(root,'driver-manifest.private.json'),result.manifest);
 const candidate=gatewayWebPlan(rollback,bundleRoot);assertGatewayWebDelta(rollback,candidate,bundleRoot);
 write(join(root,'gateway-candidate.compose.private.json'),candidate);
 const parsed=JSON.parse(docker(['compose','--project-name',activationProject,'-f',join(root,'gateway-candidate.compose.private.json'),'config','--format','json']));
 if(!isDeepStrictEqual(parsed.services.gateway.environment,candidate.services.gateway.environment))throw Error('Compose alterou ambiente privado na releitura.');
 writeFileSync(join(root,'gateway-env.private'),before.gateway.Config.Env.join('\n')+'\n',{mode:0o600,flag:'wx'});
 docker(['run','--rm','--network','none','--entrypoint','caddy','--env-file',join(root,'gateway-env.private'),'--mount','type=bind,src='+caddy.Source+',dst=/etc/caddy/Caddyfile,readonly',before.gateway.Image,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);
 const staticHashes=docker(['run','--rm','--network','none','--read-only','--entrypoint','sha256sum','--mount','type=bind,src='+bundleRoot+',dst=/srv/web,readonly',before.gateway.Image,'/srv/web/driver/main.dart.js','/srv/web/passenger/main.dart.js']).trim().split('\n').map(l=>l.split(/\s+/)[0]);
 if(staticHashes[0]!==await fileHash(join(bundleRoot,'driver','main.dart.js'))||staticHashes[1]!==await fileHash(join(bundleRoot,'passenger','main.dart.js')))throw Error('Arquivos não legíveis pela imagem do gateway.');
 const bindFiles=[];for(const c of Object.values(before))for(const m of c.Mounts??[])if(m.Type==='bind'&&lstatSync(m.Source).isFile()&&!bindFiles.some(x=>x.path===m.Source))bindFiles.push({path:m.Source,sha256:await fileHash(m.Source)});
 const after=snapshot();for(const k of Object.keys(names))if(!isDeepStrictEqual(identity(after[k]),identity(before[k]))||after[k].State.Health?.Status!=='healthy')throw Error('Runtime mudou durante a preparação: '+k);
 if(await fileHash(source)!==sourceHash||await fileHash(caddy.Source)!==caddyHash||await treeHash(web.Source)!==webHash)throw Error('Configuração ou bundles ativos mudaram durante a preparação.');
 write(join(root,'prepared.json'),{phase:'prepared',preparedAt:new Date().toISOString(),sourceCommit:driverWebSource,archiveSha256:evidence.archiveSha256,source,sourceHash,caddy:caddy.Source,caddyHash,bindFiles,oldBundleRoot:web.Source,oldWebHash:webHash,bundleRoot,newWebHash:await treeHash(bundleRoot),passengerHash,driverHash,gatewayImage:before.gateway.Image,servicesChanged:false,asaasPayoutsEnabled:false});
 console.log('WEB MOTORISTA PREPARADA. Termos dinâmicos, configuração pública e hashes conferidos.');
 console.log('Passageiro copiado sem alterar seus bytes. Versão anterior e plano de retorno preservados.');
 console.log('Nenhum serviço, migration, política ou provedor foi alterado. Publicação ainda não executada.');
}catch(error){if(ownRoot)writeFileSync(join(root,'preparation-error.private.log'),String(error.stack??error),{mode:0o600});console.error(error.message??'Preparação requer conferência.');console.error('Envie o resultado antes de repetir.');process.exitCode=1;}
finally{unlinkSync(lock);}
