import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,mkdirSync,openSync,closeSync,unlinkSync,existsSync,copyFileSync,chmodSync,createReadStream} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {runtimeIdentity,validate} from './backup-regions-pricing.mjs';
import {environmentMap,servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {io,hashFile,hashTree,privateDir} from './google-search-update-io.mjs';
import {names,assertCoreRuntime} from './google-search-update-contract.mjs';
import {storedStatus,assertPrivateParent} from './capture-mp-production.mjs';
import {productionPreparation as root,confirmedCore,confirmedGateway,assertProductionCoreDelta,verifyProductionAccount,inventoryDigest} from './mp-production-preflight-contract.mjs';
import {financialSubset,assertConfirmedTestInventory} from './mp-production-database.mjs';
import {switchMpProduction} from './mp-production-switch.mjs';

export function activationSha(args){if(args.length!==1||!(/^[a-f0-9]{64}$/).test(args[0]))throw Error('MP_PREPARATION_SHA_REQUIRED');return args[0];}
async function streamedHash(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
export const privatePaymentProbe=`
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {mercadoPagoOrdersClientFromEnv} from '/app/dist/src/payments/mercado-pago-orders.js';
import {createDriverPayoutProviderFromEnv} from '/app/dist/src/payments/driver-payout-provider.js';
try{
 const input=JSON.parse(readFileSync(0,'utf8'));
 if(process.env.MERCADO_PAGO_MODE!==input.mode||process.env.ASAAS_PAYOUTS_ENABLED!=='false'||createDriverPayoutProviderFromEnv(process.env)!==null)throw Error('mode');
 const mp=mercadoPagoOrdersClientFromEnv(process.env);if(!mp)throw Error('client');
 if(input.mode==='production'&&(process.env.MERCADO_PAGO_PIX_TEST_APPROVAL!=='false'||process.env.MERCADO_PAGO_ACCESS_TOKEN_TEST||mp.pixTestApproval!==false||mp.cardStorageScope!==createHash('sha256').update(process.env.MERCADO_PAGO_ACCESS_TOKEN).digest('hex')))throw Error('simulation');
 const origin='http://127.0.0.1:'+(process.env.PORT||'8080');
 for(const path of ['/health','/ready']){const r=await fetch(origin+path,{signal:AbortSignal.timeout(10000)});if(r.status!==200)throw Error('ready');}
 const response=await fetch(origin+'/v1/payments/policy',{signal:AbortSignal.timeout(10000)});const policy=await response.json();
 if(response.status!==200||policy.mercadoPagoPublicKey!==input.publicKey)throw Error('public-key');
 if((await fetch(origin+'/v1/admin/finance',{signal:AbortSignal.timeout(10000)})).status!==401)throw Error('admin-auth');
 const denied=await fetch(origin+'/v1/webhooks/mercado-pago/orders?type=order&data.id=ORD-CUTOVER-NOT-A-REAL-ORDER',{
  method:'POST',headers:{'content-type':'application/json','x-request-id':'cutover-invalid-signature','x-signature':'ts=1,v1=invalid'},body:'{}',signal:AbortSignal.timeout(10000)});
 if(denied.status!==401||(await denied.json()).error!=='INVALID_MERCADO_PAGO_SIGNATURE')throw Error('signature');
 console.log('MP_PRIVATE_PROBE_OK');
}catch{console.error('MP_PRIVATE_PROBE_FAILED');process.exitCode=1;}
`;

export async function activateMpProduction(args,rehearsal={}){
  const sha=activationSha(args);if(process.getuid?.()!==0)throw Error('MP_SUDO_REQUIRED');process.umask(0o077);
  const raw=spawnSync('docker',['inspect',names.core],{encoding:'utf8'});
  if(raw.status!==0)throw Error('MP_CORE_MISSING');const live=JSON.parse(raw.stdout)[0];
  if(Object.keys(rehearsal).length&&(process.env.GITHUB_ACTIONS!=='true'||live.Config.Labels?.['br.com.ramonessa.mp-ci']!=='true'))throw Error('MP_REHEARSAL_FORBIDDEN');
  const base=rehearsal.root??root;assertPrivateParent(dirname(base));privateDir(base);
  if(!rehearsal.root&&storedStatus().status!=='CREDENCIAIS_MP_JA_ARMAZENADAS')throw Error('MP_CREDENTIALS_MISSING');
  const dir=join(base,'preflight');privateDir(dir);
  const lock=join(base,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  const journal=join(base,'activation.private.json');let work,opened=false,journalCreated=false;
  let interrupted=false;const onInterrupt=()=>{interrupted=true;};for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,onInterrupt);
  const barrier=async()=>{await new Promise(setImmediate);if(interrupted)throw Error('MP_INTERRUPTED');};
  const record=data=>writeFileSync(journal,JSON.stringify({...data,at:new Date().toISOString()},null,2),{mode:0o600});
  try{
    if(existsSync(journal))throw Error('MP_ACTIVATION_ALREADY_STARTED');
    if(hashFile(join(dir,'prepared.private.json'))!==sha)throw Error('MP_PREPARATION_SHA_CHANGED');
    const p=JSON.parse(readFileSync(join(dir,'prepared.private.json')));
    const age=Date.now()-Date.parse(p.preparedAt);
    if(p.format!==1||!p.accountVerified||p.activeRuntimeChanged!==false||p.activeDatabaseChanged!==false||!Number.isFinite(age)||age<0||age>86400000)throw Error('MP_PREPARATION_INVALID_OR_EXPIRED');
    const expectedFiles=['runtime-before.private.json','core-image.private.json','account.private.json','core-before.compose.private.json','core-after.compose.private.json','financial-before.private.json'].sort();
    if(!isDeepStrictEqual(Object.keys(p.files??{}).sort(),expectedFiles))throw Error('MP_PREPARATION_FILES_INVALID');
    for(const [name,hash]of Object.entries(p.files))if(hashFile(join(dir,name))!==hash)throw Error('MP_PREPARATION_FILE_CHANGED');
    const before=JSON.parse(readFileSync(join(dir,'runtime-before.private.json'))),old=JSON.parse(readFileSync(join(dir,'core-before.compose.private.json'))),candidate=JSON.parse(readFileSync(join(dir,'core-after.compose.private.json'))),coreImage=JSON.parse(readFileSync(join(dir,'core-image.private.json')));
    const baselineEnvironment=environmentMap(before.core.Config.Env);
    if(['ALLOW_DEV_IDENTITY','ALLOW_DEV_OTP','ALLOW_DEV_PAYMENT_GATEWAY'].some(k=>baselineEnvironment[k]==='true'))throw Error('MP_DEV_BYPASS_ENABLED');
    validate(before,{'core-image':rehearsal.coreImage??confirmedCore,'gateway-image':rehearsal.gatewayImage??confirmedGateway});
    if(Object.values(before.core.HostConfig.PortBindings??{}).some(bindings=>bindings?.length)||before.core.HostConfig.NetworkMode==='host')throw Error('MP_CORE_DIRECT_INGRESS_REQUIRES_REVIEW');
    const {docker,inspect,image,compose,health}=io(dir);
    for(const role of Object.keys(names))if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('MP_RUNTIME_CHANGED');
    const credentials=JSON.parse(readFileSync(join(base,'credentials.private.json')));
    if(hashFile(join(base,'credentials.private.json'))!==p.credentialHash)throw Error('MP_CREDENTIALS_CHANGED');
    assertProductionCoreDelta(old,candidate,credentials);
    const account=await (rehearsal.verifyAccount??verifyProductionAccount)(credentials.accessToken);
    if(!isDeepStrictEqual(account,JSON.parse(readFileSync(join(dir,'account.private.json')))))throw Error('MP_ACCOUNT_CHANGED');
    const currentModel=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',p.source,'config','--format','json']));
    if(!isDeepStrictEqual(servicePlan(currentModel,'core',before.core,before.core.Image),old))throw Error('MP_ROLLBACK_MODEL_CHANGED');
    assertEnvironmentMatches(old.services.core,before.core,coreImage);
    if(image(before.core.Image).Id!==coreImage.Id)throw Error('MP_IMAGE_CHANGED');
    for(const [name,model]of [['before',old],['after',candidate]]){
      const parsed=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,'core-'+name+'.compose.private.json'),'config','--format','json']));
      if(!isDeepStrictEqual(parsed.services.core.environment,model.services.core.environment))throw Error('MP_COMPOSE_ROUNDTRIP_CHANGED');
    }
    const mountedFiles=before.core.Mounts.filter(m=>m.Type==='bind'&&lstatSync(m.Source).isFile()).map(m=>({path:m.Source,sha256:hashFile(m.Source)}));
    const intact=()=>{
      if(hashFile(p.source)!==p.sourceHash||hashFile(p.caddy)!==p.caddyHash||hashTree(p.web)!==p.webHash||hashFile(join(base,'credentials.private.json'))!==p.credentialHash)throw Error('MP_PROTECTED_FILE_CHANGED');
      for(const f of mountedFiles)if(hashFile(f.path)!==f.sha256)throw Error('MP_PROVIDER_FILE_CHANGED');
      for(const role of ['postgres','maps','site'])if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('MP_UNRELATED_SERVICE_CHANGED');
    };
    intact();
    const checkpoint=p.checkpoint;
    if(!checkpoint?.directory?.startsWith(rehearsal.backupPrefix??'/var/backups/ramo-nessa-regions/')||!checkpoint.databaseRestoredInIsolation||hashFile(join(checkpoint.directory,'verified.private.json'))!==checkpoint.manifestSha256)throw Error('MP_BACKUP_INVALID');
    const backup=JSON.parse(readFileSync(join(checkpoint.directory,'verified.private.json')));
    if(!backup.databaseRestoredInIsolation||!backup.files?.some(f=>f.name==='database.dump')||backup.runtimeIds?.core!==before.core.Id)throw Error('MP_BACKUP_INVALID');
    console.log('Conferindo integridade do backup e dos arquivos preservados...');
    for(const f of backup.files){if(!/^[A-Za-z0-9_.-]+$/.test(f.name)||await streamedHash(join(checkpoint.directory,f.name))!==f.sha256)throw Error('MP_BACKUP_FILE_CHANGED');}
    work=join(base,'activation');mkdirSync(work,{mode:0o700});
    const ops=join(work,'ops');mkdirSync(ops,{mode:0o700});const here=dirname(fileURLToPath(import.meta.url));
    for(const name of ['mp-production-database.mjs','mp-production-preflight-contract.mjs','asaas-activation-plan-contract.mjs']){copyFileSync(join(here,name),join(ops,name));chmodSync(join(ops,name),0o600);}
    const env=environmentMap(before.core.Config.Env),databaseEnv=Object.fromEntries(['DATABASE_URL','DB_SSL','DB_SSL_CA'].filter(k=>env[k]!=null).map(k=>[k,env[k]]));
    const reference='mp-production-cutover:'+sha;
    let context;
    const worker=mode=>{
      const input={mode,reference,databaseEnv,publicKey:credentials.publicKey,before:context};
      const r=spawnSync('docker',['run','--rm','-i','--pull','never','--user','0:0','--network','container:'+before.postgres.Id,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
        '--mount','type=bind,src='+ops+',dst=/ops,readonly','--mount','type=bind,src='+work+',dst=/work','--entrypoint','node',before.core.Image,'/ops/mp-production-database.mjs'],
        {input:JSON.stringify(input),encoding:'utf8',timeout:120000,maxBuffer:32*1024**2,env:{PATH:process.env.PATH}});
      if(r.error||r.status!==0){writeFileSync(join(work,'worker-error.private.log'),String(r.stderr??''),{mode:0o600});throw Error('MP_DATABASE_WORKER_FAILED');}
      return JSON.parse(r.stdout);
    };
    context=worker('context');
    if(inventoryDigest(financialSubset(context))!==p.inventoryHash)throw Error('MP_FINANCIAL_DATA_CHANGED');
    assertConfirmedTestInventory(financialSubset(context));
    writeFileSync(join(work,'context-before.private.json'),JSON.stringify(context),{mode:0o600,flag:'wx'});
    const oldPublicKey=context.operational_settings[0]?.mercado_pago_public_key??null;
    const gatewayShape=c=>({Id:c.Id,Image:c.Image,Config:c.Config,HostConfig:c.HostConfig,Mounts:c.Mounts,networks:Object.keys(c.NetworkSettings.Networks).sort()});
    const gatewayIntact=()=>{if(!isDeepStrictEqual(gatewayShape(inspect('gateway')),gatewayShape(before.gateway)))throw Error('MP_GATEWAY_CHANGED');};
    const coreGuard=model=>assertCoreRuntime(before.core,inspect('core'),model,coreImage,{healthy:false});
    const privateCheck=(mode,publicKey)=>{
      const r=spawnSync('docker',['exec','-i',names.core,'node','--input-type=module','-e',privatePaymentProbe],{input:JSON.stringify({mode,publicKey}),encoding:'utf8',timeout:60000,maxBuffer:4*1024**2,env:{PATH:process.env.PATH}});
      if(r.status!==0||r.stdout.trim()!=='MP_PRIVATE_PROBE_OK')throw Error('MP_CORE_PRIVATE_PROBE_FAILED');
    };
    const paused=()=>{gatewayIntact();if(inspect('gateway').State.Running)throw Error('MP_INGRESS_NOT_PAUSED');intact();};
    const publicCheck=async publicKey=>{
      const origin=rehearsal.origin??'https://app.ramonessa.com.br';
      for(const path of ['/ready','/administrodo/','/passageiro/','/motorista/']){const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000),cache:'no-store'});await r.arrayBuffer();if(r.status!==200)throw Error('MP_PUBLIC_HTTP_FAILED');}
      if((await fetch(origin+'/v1/admin/finance',{signal:AbortSignal.timeout(20000)})).status!==401)throw Error('MP_PUBLIC_ADMIN_AUTH_FAILED');
      const policy=await fetch(origin+'/v1/payments/policy',{signal:AbortSignal.timeout(20000),cache:'no-store'});
      if(policy.status!==200||(await policy.json()).mercadoPagoPublicKey!==publicKey)throw Error('MP_PUBLIC_KEY_NOT_PUBLISHED');
      gatewayIntact();intact();
    };
    for(const role of Object.keys(names))if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('MP_RUNTIME_CHANGED');
    await barrier();
    writeFileSync(journal,JSON.stringify({phase:'starting',preparationSha256:sha,at:new Date().toISOString()}),{mode:0o600,flag:'wx'});
    journalCreated=true;
    console.log('Pausando brevemente os aplicativos Web para retirar os saldos fictícios e ativar o Mercado Pago...');
    await switchMpProduction({
      pause:async()=>{record({phase:'pausing'});gatewayIntact();docker(['stop','--time','30',before.gateway.Id]);if(inspect('core').Id!==before.core.Id)throw Error('MP_CORE_CHANGED');docker(['stop','--time','30',before.core.Id]);await barrier();},
      assertPaused:async()=>{paused();if(inspect('core').State.Running)throw Error('MP_CORE_NOT_PAUSED');coreGuard(old);},
      applyData:async()=>{record({phase:'archiving-test-balances'});worker('apply');await barrier();},
      upProduction:async()=>{paused();record({phase:'starting-production-core'});compose(join(dir,'core-after.compose.private.json'),'core');await health('core');await barrier();},
      verifyPrivate:async()=>{paused();coreGuard(candidate);privateCheck('production',credentials.publicKey);worker('verify');if(rehearsal.failPrivate)throw Error('MP_SYNTHETIC_PRIVATE_FAILURE');await barrier();},
      openIngress:async()=>{paused();record({phase:'opening-production',productionMayBeOpen:true});opened=true;docker(['start',before.gateway.Id]);await health('gateway');},
      verifyPublic:()=>publicCheck(credentials.publicKey),
      ensurePaused:async()=>{gatewayIntact();if(inspect('gateway').State.Running)docker(['stop','--time','30',before.gateway.Id]);paused();},
      stopCandidate:async()=>{
        const r=spawnSync('docker',['inspect',names.core],{encoding:'utf8'});
        if(r.status!==0){if(docker(['ps','-a','--format','{{.Names}}']).trim().split('\n').includes(names.core))throw Error('MP_CORE_STATE_UNKNOWN');return;}
        try{coreGuard(candidate);}catch{coreGuard(old);}
        const current=inspect('core');if(current.State.Running)docker(['stop','--time','30',current.Id]);
      },
      reverseData:async()=>{
        paused();const file=join(work,'apply-receipt.private.json');
        if(existsSync(file))worker('reverse');else if(inventoryDigest(worker('context'))!==inventoryDigest(context))throw Error('MP_UNEXPECTED_DATABASE_CHANGES');
      },
      upRollback:async()=>{paused();record({phase:'returning-to-test-core'});compose(join(dir,'core-before.compose.private.json'),'core');await health('core');},
      verifyRollbackPrivate:async()=>{paused();coreGuard(old);privateCheck('test',oldPublicKey);},
      openRollbackIngress:async()=>{gatewayIntact();docker(['start',before.gateway.Id]);await health('gateway');},
      verifyRollbackPublic:()=>publicCheck(oldPublicKey)
    });
    record({phase:'completed',preparationSha256:sha,productionMayBeOpen:true});
    console.log(JSON.stringify({status:'MERCADO_PAGO_PRODUCAO_ATIVADO',mercadoPagoMode:'production',pixSimulation:false,
      publicKeyUpdated:true,testWalletBalanceCents:0,testRevenueBalanceCents:0,testRidesClosed:5,historyPreserved:true,
      coreImagePreserved:true,adminUpdated:false,webBundlesUpdated:false,nativeAppsUpdated:false,asaasPayoutsEnabled:false,
      realPixAcceptancePending:true,realCardAcceptancePending:true,realRefundAcceptancePending:true,externalWebhookAcceptancePending:true},null,2));
  }catch(error){
    if(journalCreated)record({phase:error.rollbackComplete===true?'rolled-back':'requires-review',rollbackComplete:error.rollbackComplete??false,productionMayBeOpen:opened||error.productionMayBeOpen===true});
    throw error;
  }finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,onInterrupt);unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{await activateMpProduction(process.argv.slice(2));}
  catch(error){console.error(/^MP_[A-Z0-9_]+$/.test(error.message)?error.message:'MP_ACTIVATION_REQUIRES_REVIEW');console.error('Não repita a ativação. Envie esta mensagem para conferir o estado e o registro privado.');process.exitCode=1;}
}
