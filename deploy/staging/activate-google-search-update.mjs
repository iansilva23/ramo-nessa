// Explicit Core + Web activation. Never resets the catalog or executes SQL.
import {readFileSync,writeFileSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {assertGatewayWebDelta} from './asaas-driver-web-contract.mjs';
import {assertWebGatewayRuntime} from './asaas-driver-web-switch-contract.mjs';
import {assertMapProviders} from './prepare-web-map-update.mjs';
import {source,baselineSource,candidateSource,baselineWeb,oldWebRoot,newWebRoot,root,directory,names,assertFingerprint,assertImageDelta,assertCoreRuntime,switchSearch} from './google-search-update-contract.mjs';
import {io,digest,hashFile,hashTree,privateDir} from './google-search-update-io.mjs';

export async function activateSearch(args,rehearsal={}){
  if(args.length!==2||args[0]!==directory||!/^[a-f0-9]{64}$/.test(args[1]))throw Error('Informe a preparação revisada e seu SHA-256.');
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
  privateDir(root);privateDir(directory);
  const lock=join(root,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  const journal=join(directory,'activation.private.json');
  const record=value=>writeFileSync(journal,JSON.stringify({...value,source,at:new Date().toISOString()},null,2),{mode:0o600});
  try{
    if(existsSync(journal))throw Error('Esta ativação já foi iniciada. Confira o registro antes de repetir.');
    if(hashFile(join(directory,'prepared.private.json'))!==args[1])throw Error('Integridade da preparação divergente.');
    const p=JSON.parse(readFileSync(join(directory,'prepared.private.json')));
    const expectedFiles=['runtime-before.private.json','core-image.private.json','gateway-image.private.json','candidate-image.private.json','core-before.compose.private.json','core-after.compose.private.json','gateway-before.compose.private.json','gateway-after.compose.private.json'].sort();
    if(p.format!==1||p.source!==source||p.resetApplied!==false||p.oldWebHash!==baselineWeb||!isDeepStrictEqual(p.scope,['core-google-places','passenger-web','driver-web'])||!isDeepStrictEqual(Object.keys(p.planFiles??{}).sort(),expectedFiles))throw Error('Plano fora do escopo aprovado.');
    for(const [name,hash]of Object.entries(p.planFiles))if(hashFile(join(directory,name))!==hash)throw Error('Arquivo operacional alterado.');
    const load=name=>JSON.parse(readFileSync(join(directory,name+'.private.json')));
    const before=load('runtime-before'),oldImage=load('core-image'),gatewayImage=load('gateway-image'),nextImage=load('candidate-image');
    const cb=load('core-before.compose'),ca=load('core-after.compose'),gb=load('gateway-before.compose'),ga=load('gateway-after.compose');
    const ci=process.env.GITHUB_ACTIONS==='true'&&before.core.Config.Labels?.['br.com.ramonessa.regions-ci']==='true'&&before.gateway.Config.Labels?.['br.com.ramonessa.regions-ci']==='true';
    if(Object.keys(rehearsal).length&&!ci)throw Error('Ensaio permitido somente no fixture isolado do CI.');
    if(!before.core.Config.Env.includes('NODE_ENV=staging')||nextImage.Id!==p.coreImage||oldImage.Id!==before.core.Image||gatewayImage.Id!==before.gateway.Image)throw Error('Identidade do plano divergente.');
    const expectedCore=structuredClone(cb);expectedCore.services.core.image=nextImage.Id;
    if(!isDeepStrictEqual(expectedCore,ca))throw Error('Plano Core altera opções além da imagem.');
    assertImageDelta(oldImage,nextImage);assertGatewayWebDelta(gb,ga,newWebRoot);
    const {inspect,image,fingerprint,compose,health}=io(directory);
    for(const role of Object.keys(names))if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('Serviço mudou desde a preparação: '+role);
    if(!isDeepStrictEqual(image(nextImage.Id).Config,nextImage.Config))throw Error('Imagem candidata divergente.');
    assertFingerprint(fingerprint(before.core.Id,true),baselineSource);assertFingerprint(fingerprint(nextImage.Id),candidateSource);
    const intact=()=>{
      for(const item of [...Object.values(p.configs),p.caddy])if(hashFile(item.path)!==item.sha256)throw Error('Configuração ativa alterada durante a operação.');
      if(hashTree(oldWebRoot)!==p.oldWebHash||hashTree(newWebRoot)!==p.newWebHash)throw Error('Pacote Web alterado.');
      for(const role of ['postgres','maps','site'])if(runtimeIdentity(inspect(role))!==runtimeIdentity(before[role]))throw Error('Serviço fora do escopo mudou: '+role);
    };
    intact();assertMapProviders(oldWebRoot,newWebRoot);
    const coreVerify=(model,img,sha,healthy=true)=>{const c=inspect('core');assertCoreRuntime(before.core,c,model,img,{healthy});assertFingerprint(fingerprint(c.Id,true),sha);intact();};
    const gatewayVerify=(model,web,healthy=true)=>{const c=inspect('gateway');if(!healthy)c.State.Health={Status:'healthy'};assertWebGatewayRuntime(before.gateway,c,model,gatewayImage,web);intact();};
    async function published(web){
      const origin=ci?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';
      for(const [role,path]of [['passenger','passageiro'],['driver','motorista']])for(const file of ['index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js']){
        const response=await fetch(origin+'/'+path+'/'+file+'?google-review='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});
        if(!response.ok||digest(Buffer.from(await response.arrayBuffer()))!==hashFile(join(web,role,file)))throw Error('Publicação Web divergente: '+role+'/'+file);
      }
    }
    const up=(role,version)=>compose(join(directory,role+'-'+version+'.compose.private.json'),role);
    const verifyAll=async(candidate)=>{coreVerify(candidate?ca:cb,candidate?nextImage:oldImage,candidate?candidateSource:baselineSource);gatewayVerify(candidate?ga:gb,candidate?newWebRoot:oldWebRoot);await published(candidate?newWebRoot:oldWebRoot);};
    record({phase:'switching'});
    try{
      await switchSearch({
        coreUp:async()=>{console.log('Atualizando somente a busca no Core, com ambiente e integrações preservados...');intact();gatewayVerify(gb,oldWebRoot);up('core','after');},
        coreVerify:async()=>{await health('core');coreVerify(ca,nextImage,candidateSource);if(rehearsal.failAfterCore)throw Error('Falha sintética após troca do Core.');},
        gatewayUp:async()=>{console.log('Atualizando os aplicativos Web com o pacote aprovado...');coreVerify(ca,nextImage,candidateSource);gatewayVerify(gb,oldWebRoot);up('gateway','after');},
        verify:async()=>{await health('gateway');await verifyAll(true);if(rehearsal.failAfterWeb)throw Error('Falha sintética após troca Web.');},
        gatewayRollback:async()=>{
          intact();const c=inspect('gateway'),web=c.Mounts.find(m=>m.Destination==='/srv/web')?.Source;
          if(![oldWebRoot,newWebRoot].includes(web))throw Error('Gateway concorrente: retorno recusado.');
          gatewayVerify(web===oldWebRoot?gb:ga,web,false);
          if(web!==oldWebRoot||c.State.Health?.Status!=='healthy')up('gateway','before');
          await health('gateway');gatewayVerify(gb,oldWebRoot);await published(oldWebRoot);
        },
        coreRollback:async()=>{
          intact();gatewayVerify(gb,oldWebRoot);const c=inspect('core');
          if(![oldImage.Id,nextImage.Id].includes(c.Image))throw Error('Core concorrente: retorno recusado.');
          assertCoreRuntime(before.core,c,c.Image===oldImage.Id?cb:ca,c.Image===oldImage.Id?oldImage:nextImage,{healthy:false});
          if(c.Image!==oldImage.Id||c.State.Health?.Status!=='healthy')up('core','before');
          await health('core');
        },
        verifyRollback:async()=>verifyAll(false),
      });
    }catch(e){record({phase:e.rollbackComplete?'rolled-back':'requires-review',rollbackComplete:e.rollbackComplete===true});throw e;}
    record({phase:'completed',oldCoreImage:oldImage.Id,newCoreImage:nextImage.Id,oldWebRoot,newWebRoot});
    console.log(JSON.stringify({status:'BUSCA_GOOGLE_ATUALIZADA',source,coreUpdated:true,passengerWebUpdated:true,driverWebUpdated:true,adminUpdated:false,resetApplied:false,nativeAppsUpdated:false,providerConfigurationPreserved:true,realDeviceAcceptancePending:true},null,2));
  }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await activateSearch(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
