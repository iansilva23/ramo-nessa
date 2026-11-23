// Prepare from the exact installed Google Web release. No ZIP download, Core,
// ADM, database, provider or active file writes. Old bundles remain available.
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync,unlinkSync,openSync,closeSync,lstatSync,readdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {validate,runtimeIdentity} from './backup-regions-pricing.mjs';
import {servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {gatewayWebPlan} from './asaas-driver-web-contract.mjs';
import {assertMapProviders} from './prepare-web-map-update.mjs';
import {io,digest,hashFile,hashTree,privateDir} from './google-search-update-io.mjs';
import {names} from './google-search-update-contract.mjs';
export const directSource='2c8963b2a0a6e1fcc332114b5cc4d198c2bacdb2';
export const directRoot='/opt/ramo-nessa-regions/direct-entry-updates';
export const directDir=directRoot+'/'+directSource.slice(0,12);
export const directBundle='/opt/ramo-nessa-web/releases/direct-'+directSource.slice(0,12)+'/bundles';
export const googleBundle='/opt/ramo-nessa-web/releases/google-731d524d55ec/bundles';
const googlePlan='/opt/ramo-nessa-google-search/731d524d55ec/prepared.private.json';
const googleDigest='42d755b89d92cb67196d7b481652471dcc8f62462c3bbf274bf4ec31fa94c50a';
export function directIndex(source){
  if((source.match(/<link rel="stylesheet" href="ramo_entry_gate\.css">/g)??[]).length!==1||(source.match(/<script src="ramo_entry_gate\.js"><\/script>/g)??[]).length!==1)throw Error('Imports da entrada diferentes da versão auditada.');
  const next=source.replace(/^.*<link rel="stylesheet" href="ramo_entry_gate\.css">[^\n]*\n/m,'').replace(/^.*<script src="ramo_entry_gate\.js"><\/script>[^\n]*\n/m,'');
  if(next.includes('ramo_entry_gate'))throw Error('Import remanescente da tela removida.');return next;
}
export function assertDirectWebDelta(before,after){
  const files=root=>{const result=[];function walk(p){for(const name of readdirSync(p).sort()){const file=join(p,name),s=lstatSync(file);if(s.isSymbolicLink())throw Error('Link inesperado.');if(s.isDirectory())walk(file);else if(s.isFile())result.push(relative(root,file));else throw Error('Arquivo inesperado.');}}walk(root);return result.sort();};
  const removed=['passenger','driver'].flatMap(r=>[r+'/ramo_entry_gate.js',r+'/ramo_entry_gate.css']);
  const oldFiles=files(before),newFiles=files(after);
  if(removed.some(p=>!oldFiles.includes(p))||!isDeepStrictEqual(oldFiles.filter(p=>!removed.includes(p)),newFiles))throw Error('A remoção altera arquivos além da tela de entrada.');
  for(const p of newFiles){
    if(p==='passenger/index.html'||p==='driver/index.html'){
      if(readFileSync(join(after,p),'utf8')!==directIndex(readFileSync(join(before,p),'utf8')))throw Error('HTML altera mais que os imports removidos.');
    }else if(hashFile(join(before,p))!==hashFile(join(after,p)))throw Error('Arquivo aprovado alterado: '+p);
  }
}
export async function prepareDirect(rehearsal={}){
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
  mkdirSync(directRoot,{recursive:true,mode:0o700});privateDir(directRoot);
  const lock=join(directRoot,'operations.lock');closeSync(openSync(lock,'wx',0o600));
  try{
    if(existsSync(directDir)||existsSync(directBundle))throw Error('Candidata já existe. Confira a preparação anterior antes de repetir.');
    mkdirSync(directDir,{mode:0o700});const {docker,inspect,image}=io(directDir);
    const before=Object.fromEntries(Object.keys(names).map(r=>[r,inspect(r)]));
    if(Object.keys(rehearsal).length&&(process.env.GITHUB_ACTIONS!=='true'||before.gateway.Config.Labels?.['br.com.ramonessa.regions-ci']!=='true'))throw Error('Ensaio restrito ao runner isolado.');
    const bytes=readFileSync(rehearsal.baselinePlan??googlePlan);if(digest(bytes)!==(rehearsal.baselineDigest??googleDigest))throw Error('Plano Google instalado diferente do retorno confirmado.');
    const base=JSON.parse(bytes);
    validate(before,{'core-image':base.coreImage,'gateway-image':rehearsal.gatewayImage??'sha256:72c5f3b8fb7152673823fa968bf0d79e623805b2449d5faab3d78b7c8afd8cd6'});
    if(!before.core.Config.Env.includes('NODE_ENV=staging'))throw Error('Procedimento exclusivo da homologação.');
    const web=before.gateway.Mounts.find(m=>m.Destination==='/srv/web'),caddy=before.gateway.Mounts.find(m=>m.Destination==='/etc/caddy/Caddyfile');
    if(web.Source!==googleBundle||hashTree(web.Source)!==base.newWebHash)throw Error('Os apps mudaram desde a atualização Google. Nada será sobrescrito.');
    const paths=(before.gateway.Config.Labels?.['com.docker.compose.project.config_files']??'').split(',');
    if(paths.length!==1||!paths[0].startsWith('/'))throw Error('Origem Compose exige revisão.');
    const stat=lstatSync(paths[0]);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0)throw Error('Compose precisa ser arquivo regular de root.');
    const raw=JSON.parse(readFileSync(paths[0]));if(raw.name!=='ramo-nessa-staging'||raw.services?.gateway?.env_file)throw Error('Compose não é autocontido.');
    const model=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',paths[0],'config','--format','json']));
    const gatewayImage=image(before.gateway.Image);assertEnvironmentMatches(model.services.gateway,before.gateway,gatewayImage);
    const rollback=servicePlan(model,'gateway',before.gateway,before.gateway.Image),candidate=gatewayWebPlan(rollback,directBundle);
    mkdirSync(resolve(directBundle,'..'),{recursive:true,mode:0o755});cpSync(googleBundle,directBundle,{recursive:true,errorOnExist:true,force:false});
    for(const role of ['passenger','driver']){
      const path=join(directBundle,role,'index.html');writeFileSync(path,directIndex(readFileSync(path,'utf8')));
      for(const name of ['ramo_entry_gate.js','ramo_entry_gate.css'])unlinkSync(join(directBundle,role,name));
    }
    assertDirectWebDelta(googleBundle,directBundle);assertMapProviders(googleBundle,directBundle);
    const save=(name,value)=>writeFileSync(join(directDir,name),JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});
    save('runtime-before.private.json',before);save('gateway-image.private.json',gatewayImage);save('candidate.compose.private.json',candidate);save('rollback.compose.private.json',rollback);
    for(const name of ['candidate','rollback']){
      const parsed=JSON.parse(docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',join(directDir,name+'.compose.private.json'),'config','--format','json']));
      if(!isDeepStrictEqual(parsed.services.gateway.environment,model.services.gateway.environment))throw Error('Ambiente mudou na releitura.');
    }
    const plan={format:1,sourceCommit:directSource,gatewayImage:before.gateway.Image,bundleRoot:directBundle,oldBundleRoot:googleBundle,newWebHash:hashTree(directBundle),oldWebHash:base.newWebHash,caddy:caddy.Source,caddyHash:hashFile(caddy.Source),sourceConfig:paths[0],sourceConfigHash:hashFile(paths[0]),planFiles:Object.fromEntries(['runtime-before.private.json','gateway-image.private.json','candidate.compose.private.json','rollback.compose.private.json'].map(n=>[n,hashFile(join(directDir,n))])),resetApplied:false,servicesRestarted:false,scope:['passenger-web','driver-web']};
    for(const r of Object.keys(names))if(runtimeIdentity(inspect(r))!==runtimeIdentity(before[r]))throw Error('Serviço mudou durante a preparação: '+r);
    if(hashTree(googleBundle)!==base.newWebHash)throw Error('Web ativo mudou durante a preparação.');save('prepared.private.json',plan);
    console.log(JSON.stringify({status:'ENTRADA_DIRETA_PREPARADA',directory:directDir,planSha256:hashFile(join(directDir,'prepared.private.json')),servicesRestarted:false,coreUpdated:false,adminUpdated:false,resetApplied:false},null,2));return plan;
  }finally{unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==2)throw Error('Este preparo não recebe parâmetros.');try{await prepareDirect();}catch(e){console.error(e.message+' Nenhum serviço ativo foi atualizado.');process.exitCode=1;}}
