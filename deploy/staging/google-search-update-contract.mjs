// One scoped Core/Web release. No catalog, migration or provider operations.
import {isDeepStrictEqual} from 'node:util';
import {assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {mounts} from './asaas-driver-web-switch-contract.mjs';
export const source='731d524d55ecfab945605c00611abd067bc955c5';
export const webSha='71c3c8348bdde3271c3dd14dfc8f12c350cd347490801adb2ec01c397024b665';
export const baselineSource='fd2e9deff407ab687d7085abf12c87ff0256856c08a809332860797e09bcd245';
export const candidateSource='28d8faa762d6da73c3a7bf0fa26f1fbe6e653cf9aa202be7c268d9f45aba5509';
export const lockSha='3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e';
export const baselineWeb='e1658422c61d3fa48ac2f1dfa44c0101f34b9879095d2ada782f97ad2d27bb1c';
export const oldWebRoot='/opt/ramo-nessa-web/releases/maps-0f5305ddef33/bundles';
export const root='/opt/ramo-nessa-google-search';
export const directory=root+'/'+source.slice(0,12);
export const newWebRoot='/opt/ramo-nessa-web/releases/google-'+source.slice(0,12)+'/bundles';
export const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
export function assertFingerprint(actual,expected){
  if(actual.source?.sha256!==expected||actual.packageLockSha256!==lockSha)throw Error('Core diverge da versão revisada. Nenhuma versão concorrente será substituída.');
}
export function assertImageDelta(before,after){
  if(!isDeepStrictEqual(before.Config,after.Config))throw Error('A imagem candidata altera configuração além dos arquivos compilados.');
}
export function assertCoreRuntime(before,current,model,image,{healthy=true}={}){
  if(current.Image!==image.Id||(healthy&&current.State.Health?.Status!=='healthy'))throw Error('Imagem/saúde do Core divergente.');
  assertEnvironmentMatches(model.services.core,current,image);
  if(!isDeepStrictEqual(mounts(before),mounts(current)))throw Error('Volumes do Core divergentes.');
  if(!isDeepStrictEqual(Object.keys(before.NetworkSettings.Networks).sort(),Object.keys(current.NetworkSettings.Networks).sort()))throw Error('Redes do Core divergentes.');
  for(const k of ['PortBindings','ReadonlyRootfs','RestartPolicy','LogConfig','Privileged','Memory','NanoCpus','PidsLimit','Binds','Tmpfs','ShmSize','Dns','ExtraHosts','Ulimits','GroupAdd','Init'])if(!isDeepStrictEqual(before.HostConfig[k]??null,current.HostConfig[k]??null))throw Error('Opção do Core divergente: '+k);
  for(const k of ['CapAdd','CapDrop','SecurityOpt'])if(!isDeepStrictEqual([...(before.HostConfig[k]??[])].sort(),[...(current.HostConfig[k]??[])].sort()))throw Error('Proteção do Core divergente: '+k);
  for(const k of ['User','Cmd','Entrypoint','WorkingDir','Healthcheck','StopSignal'])if(!isDeepStrictEqual(before.Config[k]??null,current.Config[k]??null))throw Error('Inicialização do Core divergente: '+k);
}
export async function switchSearch(steps){
  try{
    await steps.coreUp();await steps.coreVerify();
    await steps.gatewayUp();await steps.verify();
  }catch(cause){
    // Restore old Web before old Core; the new Core supports the old client.
    const failures=[];
    try{await steps.gatewayRollback();}catch(e){failures.push(e.message);}
    if(!failures.length)try{await steps.coreRollback();await steps.verifyRollback();}catch(e){failures.push(e.message);}
    const error=new Error(failures.length?'Atualização interrompida; retorno requer conferência.':'Atualização interrompida; versão anterior restaurada e conferida.',{cause});
    error.rollbackComplete=failures.length===0;error.rollbackFailures=failures;throw error;
  }
}
