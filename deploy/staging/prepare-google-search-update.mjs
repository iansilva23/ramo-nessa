// Stage approved binaries over the exact live Core image. No restart or SQL.
import {readFileSync,writeFileSync,mkdirSync,lstatSync,openSync,closeSync,unlinkSync,existsSync,statfsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {validate,runtimeIdentity} from './backup-regions-pricing.mjs';
import {servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {gatewayWebPlan} from './asaas-driver-web-contract.mjs';
import {assertMapProviders} from './prepare-web-map-update.mjs';
import {source,webSha,baselineSource,candidateSource,baselineWeb,oldWebRoot,newWebRoot,root,directory,names,assertFingerprint,assertImageDelta,assertCoreRuntime} from './google-search-update-contract.mjs';
import {io,digest,hashFile,hashTree,privateDir} from './google-search-update-io.mjs';

export async function prepareSearch(args,rehearsal={}){
  if(args.length!==2||args.some(p=>!p.startsWith('/')||!p.endsWith('.zip')))throw Error('Informe os ZIPs absolutos Web e Core, nessa ordem.');
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
  mkdirSync(root,{recursive:true,mode:0o700});privateDir(root);
  const lock=join(root,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  try{
    if(existsSync(directory)||existsSync(newWebRoot))throw Error('Preparação já existe. Confira o resultado anterior antes de repetir.');
    mkdirSync(directory,{mode:0o700});
    const {run,docker,inspect,image,fingerprint}=io(directory);
    const save=(name,value)=>writeFileSync(join(directory,name),typeof value==='string'?value:JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
    console.log('Conferindo Core e Web instalados. Catálogo, tarifas e dados financeiros serão preservados...');
    const before=Object.fromEntries(Object.keys(names).map(r=>[r,inspect(r)]));
    const ci=process.env.GITHUB_ACTIONS==='true'&&before.core.Config.Labels?.['br.com.ramonessa.regions-ci']==='true'&&before.gateway.Config.Labels?.['br.com.ramonessa.regions-ci']==='true';
    if(Object.keys(rehearsal).length&&!ci)throw Error('Opções de ensaio restritas ao fixture isolado do CI.');
    validate(before,{'core-image':rehearsal.coreImage??'sha256:de12cb8230f155d9c088bb12be097a2f866f368c2489e2da6ee55a098b8f6809','gateway-image':rehearsal.gatewayImage??'sha256:72c5f3b8fb7152673823fa968bf0d79e623805b2449d5faab3d78b7c8afd8cd6'});
    if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('Atualização exclusiva de homologação.');
    assertFingerprint(fingerprint(before.core.Id,true),baselineSource);
    const web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web'),caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
    if(web.Source!==oldWebRoot||hashTree(oldWebRoot)!==baselineWeb)throw Error('Web mudou desde a versão aprovada. Nada será sobrescrito.');
    if(statfsSync(root).bavail*statfsSync(root).bsize<1024**3)throw Error('Espaço insuficiente.');
    const configs={},models={},images={};
    for(const role of ['core','gateway']){
      const paths=(before[role].Config.Labels?.['com.docker.compose.project.config_files']??'').split(',');
      if(paths.length!==1||!paths[0].startsWith('/'))throw Error('Origem Compose exige revisão: '+role);
      const s=lstatSync(paths[0]);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0)throw Error('Compose deve ser arquivo regular de root.');
      const bytes=readFileSync(paths[0],'utf8'),raw=JSON.parse(bytes);
      if(raw.name!=='ramo-nessa-staging'||!raw.services?.[role]||raw.services[role].env_file)throw Error('Modelo não é autocontido: '+role);
      const resolved=JSON.parse(docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',paths[0],'config','--format','json']));
      images[role]=image(before[role].Image);assertEnvironmentMatches(resolved.services[role],before[role],images[role]);
      models[role]=servicePlan(resolved,role,before[role],before[role].Image);
      configs[role]={path:paths[0],sha256:digest(bytes)};save(role+'-source.private.json',bytes);
    }
    const here=dirname(fileURLToPath(import.meta.url));
    if(hashFile(args[0])!==webSha)throw Error('ZIP Web difere do pacote aprovado.');
    run('python3',[join(here,'stage-google-core.py'),args[1],join(directory,'core-patch')]);
    mkdirSync(dirname(newWebRoot),{recursive:true,mode:0o755});
    const staged=JSON.parse(run('python3',[join(here,'stage-regions-web.py'),'--archive',args[0],'--output',newWebRoot,'--source',source,'--sha256',webSha]));
    assertMapProviders(oldWebRoot,newWebRoot);
    const manifest=JSON.parse(readFileSync(join(directory,'core-patch','core-patch-manifest.json')));
    const baseTag='ramo-nessa-google-search-base:'+before.core.Image.slice(7);
    docker(['tag',before.core.Image,baseTag]);
    if(image(baseTag).Id!==before.core.Image)throw Error('Referência local da imagem Core divergente.');
    const dockerfile='FROM '+baseTag+'\n'+manifest.files.map(f=>'COPY --chmod=0644 '+f.path+' /app/'+f.path).join('\n')+'\n';
    writeFileSync(join(directory,'core-patch','Dockerfile'),dockerfile,{mode:0o600,flag:'wx'});
    console.log('Preparando imagem do Core com somente os seis arquivos compilados revisados...');
    const tag='ramo-nessa-google-search:'+source.slice(0,12);
    docker(['build','--network','none','--pull=false','-t',tag,join(directory,'core-patch')]);
    const nextImage=image(tag);assertImageDelta(images.core,nextImage);assertFingerprint(fingerprint(nextImage.Id),candidateSource);
    const nextCore=structuredClone(models.core);nextCore.services.core.image=nextImage.Id;
    const nextGateway=gatewayWebPlan(models.gateway,newWebRoot);
    save('runtime-before.private.json',before);save('core-image.private.json',images.core);save('gateway-image.private.json',images.gateway);save('candidate-image.private.json',nextImage);
    for(const [name,model]of Object.entries({'core-before':models.core,'core-after':nextCore,'gateway-before':models.gateway,'gateway-after':nextGateway})){
      save(name+'.compose.private.json',model);
      const roundtrip=JSON.parse(docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(directory,name+'.compose.private.json'),'config','--format','json']));
      const role=name.split('-')[0];if(!isDeepStrictEqual(roundtrip.services[role].environment,model.services[role].environment))throw Error('Compose alterou o ambiente privado na releitura.');
    }
    assertCoreRuntime(before.core,before.core,models.core,images.core);
    const planFiles=Object.fromEntries(['runtime-before.private.json','core-image.private.json','gateway-image.private.json','candidate-image.private.json','core-before.compose.private.json','core-after.compose.private.json','gateway-before.compose.private.json','gateway-after.compose.private.json'].map(p=>[p,hashFile(join(directory,p))]));
    const plan={format:1,source,createdAt:new Date().toISOString(),configs,caddy:{path:caddy.Source,sha256:hashFile(caddy.Source)},planFiles,newWebHash:hashTree(newWebRoot),oldWebHash:baselineWeb,coreImage:nextImage.Id,resetApplied:false,scope:['core-google-places','passenger-web','driver-web']};
    for(const role of Object.keys(names))if(runtimeIdentity(before[role])!==runtimeIdentity(inspect(role)))throw Error('Serviço mudou durante a preparação: '+role);
    for(const item of [...Object.values(configs),plan.caddy])if(hashFile(item.path)!==item.sha256)throw Error('Configuração mudou durante a preparação.');
    if(hashTree(oldWebRoot)!==baselineWeb)throw Error('Web ativo mudou durante a preparação.');
    save('prepared.private.json',plan);
    console.log(JSON.stringify({status:'BUSCA_GOOGLE_PREPARADA_SEM_ATIVACAO',directory,planSha256:hashFile(join(directory,'prepared.private.json')),source,webFiles:staged.files,servicesRestarted:false,resetApplied:false,providerConfigurationPreserved:true},null,2));
    return plan;
  }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await prepareSearch(process.argv.slice(2));}catch(e){console.error(e.message+' Nenhum serviço ativo foi substituído.');process.exitCode=1;}}
