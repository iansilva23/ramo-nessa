// Prepare only. No active SQL writes, deployment or payment/transfer requests.
import {readFileSync,writeFileSync,lstatSync,mkdirSync,openSync,closeSync,unlinkSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {storedStatus,parseProductionCredentials,assertPrivateParent} from './capture-mp-production.mjs';
import {runtimeIdentity,validate} from './backup-regions-pricing.mjs';
import {environmentMap,servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {io,hashFile,hashTree,privateDir} from './google-search-update-io.mjs';
import {names} from './google-search-update-contract.mjs';
import {productionPreparation as root,confirmedCore,confirmedGateway,verifyProductionAccount,productionCorePlan,assertProductionCoreDelta,inventoryTables,readProductionInventory,summarizeProductionInventory,inventoryDigest} from './mp-production-preflight-contract.mjs';

export async function prepareMpProduction(){
  if(process.getuid?.()!==0)throw Error('MP_SUDO_REQUIRED');process.umask(0o077);
  assertPrivateParent(dirname(root));privateDir(root);
  if(storedStatus().status!=='CREDENCIAIS_MP_JA_ARMAZENADAS')throw Error('MP_CREDENTIALS_MISSING');
  const lock=join(root,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  try{
    const dir=join(root,'preflight');
    if(existsSync(dir))throw Error('MP_PREFLIGHT_EXISTS');
    mkdirSync(dir,{mode:0o700});const {docker,inspect,image}=io(dir);
    const save=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
    const before=Object.fromEntries(Object.keys(names).map(r=>[r,inspect(r)]));
    validate(before,{'core-image':confirmedCore,'gateway-image':confirmedGateway});
    const env=environmentMap(before.core.Config.Env);
    if(env.NODE_ENV!=='staging'||env.MERCADO_PAGO_MODE!=='test'||env.MERCADO_PAGO_PIX_TEST_APPROVAL!=='true'||env.ASAAS_PAYOUTS_ENABLED!=='false'||env.ASAAS_PAYOUT_MODE!=='production')throw Error('MP_RUNTIME_CHANGED');
    const credentialFile=join(root,'credentials.private.json'),credentialHash=hashFile(credentialFile);
    const credentials=JSON.parse(readFileSync(credentialFile,'utf8'));
    parseProductionCredentials([credentials.publicKey,credentials.accessToken,credentials.webhookSecret,''].join('\0'));
    console.log('Conferindo o Access Token diretamente no Mercado Pago, sem criar cobranças...');
    const account=await verifyProductionAccount(credentials.accessToken);
    save('account.private.json',account);
    const source=before.core.Config.Labels?.['com.docker.compose.project.config_files'];
    if(source!=='/opt/ramo-nessa-google-search/731d524d55ec/core-after.compose.private.json')throw Error('MP_COMPOSE_SOURCE_CHANGED');
    const stat=lstatSync(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077))throw Error('MP_COMPOSE_UNSAFE');
    const sourceHash=hashFile(source);
    const model=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',source,'config','--format','json']));
    const coreImage=image(before.core.Image);assertEnvironmentMatches(model.services.core,before.core,coreImage);
    const rollback=servicePlan(model,'core',before.core,before.core.Image),candidate=productionCorePlan(rollback,credentials);
    assertProductionCoreDelta(rollback,candidate,credentials);
    save('runtime-before.private.json',before);save('core-image.private.json',coreImage);
    save('core-before.compose.private.json',rollback);save('core-after.compose.private.json',candidate);
    for(const [name,expected]of [['before',rollback],['after',candidate]]){
      const roundtrip=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,'core-'+name+'.compose.private.json'),'config','--format','json']));
      if(!isDeepStrictEqual(roundtrip.services.core.environment,expected.services.core.environment))throw Error('MP_COMPOSE_ROUNDTRIP_CHANGED');
    }
    // The program uses the deployed Core PostgreSQL helper and prints into a
    // private file only. No identifiers or account details enter public output.
    const program=`import {createPostgresPool} from '/app/dist/src/db/postgres.js';\nconst inventoryTables=${JSON.stringify(inventoryTables)};\nconst readProductionInventory=${readProductionInventory.toString()};\nconst pool=createPostgresPool(process.env.DATABASE_URL);let client;try{client=await pool.connect();console.log(JSON.stringify(await readProductionInventory(client)));}catch{process.stderr.write('MP_INVENTORY_FAILED');process.exitCode=1;}finally{client?.release();await pool.end();}`;
    const inventory=()=>{
      const r=spawnSync('docker',['exec','-i',names.core,'node','--input-type=module'],{input:program,encoding:'utf8',timeout:120000,maxBuffer:32*1024**2,env:{PATH:process.env.PATH}});
      if(r.error||r.status!==0)throw Error('MP_INVENTORY_FAILED');return JSON.parse(r.stdout);
    };
    const tables=inventory();save('financial-before.private.json',tables);const summary=summarizeProductionInventory(tables);
    save('financial-summary.private.json',summary);
    const web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web').Source;
    const caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile').Source;
    const webHash=hashTree(web),caddyHash=hashFile(caddy);
    console.log('Criando backup e testando a restauração em banco isolado. Os serviços ativos continuam funcionando...');
    const here=dirname(fileURLToPath(import.meta.url));
    const backup=spawnSync(process.execPath,[join(here,'backup-regions-pricing.mjs'),'--core-image='+confirmedCore,'--gateway-image='+confirmedGateway],{encoding:'utf8',timeout:1800000,maxBuffer:32*1024**2,env:{PATH:process.env.PATH}});
    writeFileSync(join(dir,'backup.private.log'),String(backup.stdout??'')+String(backup.stderr??''),{mode:0o600,flag:'wx'});
    if(backup.error||backup.status!==0)throw Error('MP_BACKUP_NOT_VERIFIED');
    const start=backup.stdout.lastIndexOf('{\n  "status": "BACKUP_VERIFICADO"');
    if(start<0)throw Error('MP_BACKUP_NOT_VERIFIED');const checkpoint=JSON.parse(backup.stdout.slice(start));
    if(!checkpoint.databaseRestoredInIsolation||hashFile(join(checkpoint.directory,'verified.private.json'))!==checkpoint.manifestSha256)throw Error('MP_BACKUP_NOT_VERIFIED');
    if(inventoryDigest(inventory())!==inventoryDigest(tables))throw Error('MP_FINANCIAL_DATA_CHANGED');
    for(const r of Object.keys(names))if(runtimeIdentity(inspect(r))!==runtimeIdentity(before[r]))throw Error('MP_SERVICE_CHANGED');
    if(hashFile(source)!==sourceHash||hashFile(credentialFile)!==credentialHash||hashTree(web)!==webHash||hashFile(caddy)!==caddyHash)throw Error('MP_FILES_CHANGED');
    const files=['runtime-before.private.json','core-image.private.json','account.private.json','core-before.compose.private.json','core-after.compose.private.json','financial-before.private.json'];
    save('prepared.private.json',{format:1,preparedAt:new Date().toISOString(),accountVerified:true,credentialHash,
      inventoryHash:inventoryDigest(tables),source,sourceHash,web,webHash,caddy,caddyHash,checkpoint,
      files:Object.fromEntries(files.map(p=>[p,hashFile(join(dir,p))])),activeRuntimeChanged:false,activeDatabaseChanged:false});
    console.log(JSON.stringify({status:'MP_PRODUCAO_PREPARADA_SEM_ATIVACAO',directory:dir,planSha256:hashFile(join(dir,'prepared.private.json')),
      accessTokenAuthenticated:true,productionAccount:true,backupVerified:true,databaseRestoredInIsolation:true,
      publicKeyPaymentAcceptancePending:true,externalWebhookAcceptancePending:true,financialInventory:summary,
      servicesRestarted:false,databaseChanged:false,testBalancesChanged:false,asaasChanged:false},null,2));
  }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{if(process.argv.length!==2)throw Error('MP_ARGUMENTS_INVALID');await prepareMpProduction();}
  catch(error){const code=/^MP_[A-Z0-9_]+$/.test(error.message)?error.message:'MP_PREPARATION_FAILED';console.error(code+': nenhum serviço ativo ou registro financeiro foi alterado.');process.exitCode=1;}
}
