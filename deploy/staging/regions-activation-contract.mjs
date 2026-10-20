import {isDeepStrictEqual} from 'node:util';
import {environmentMap,escapeCompose,servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
export {environmentMap,escapeCompose,assertEnvironmentMatches};
function canonical(value,key=''){
 if(Array.isArray(value)){
  const rows=value.map(v=>canonical(v));
  if(['Env','Aliases','DNSNames','CapAdd','CapDrop','SecurityOpt'].includes(key))return rows.sort();
  if(key==='Mounts')return rows.sort((a,b)=>a.Destination.localeCompare(b.Destination));
  return rows;
 }
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k],k)]));
 return value;
}
export const identity=c=>JSON.stringify(canonical([c.Id,c.Image,c.State.StartedAt,c.Config,c.HostConfig,c.Mounts,c.NetworkSettings.Networks]));
export function makeModels(resolved,role,before,oldImage,newImage,webRoot) {
  assertEnvironmentMatches(resolved.services[role],before,oldImage);
  const actual=environmentMap(before.Config.Env);
  for(const key of Object.keys(environmentMap(newImage.Config.Env)))if(!Object.hasOwn(actual,key))throw Error('Imagem candidata acrescenta ambiente não revisado: '+key);
  const rollback=servicePlan(resolved,role,before,before.Image);
  rollback.services[role].environment=escapeCompose(actual);
  const candidate=structuredClone(rollback);candidate.services[role].image=newImage.Id;
  if(role==='gateway'){
    const mounts=candidate.services.gateway.volumes.filter(m=>m.target==='/srv/web');
    if(mounts.length!==1||mounts[0].type!=='bind'||mounts[0].read_only!==true)throw Error('Mount Web divergente.');
    mounts[0].source=webRoot;
  }
  return {candidate,rollback};
}
export function assertRuntime(before,current,role,image,model,webRoot) {
  if(current.Image!==image.Id||current.State.Health?.Status!=='healthy')throw Error('Imagem ou saúde divergente: '+role);
  assertEnvironmentMatches(model.services[role],current,image);
  const expected=structuredClone(before);
  if(role==='gateway')expected.Mounts.find(m=>m.Destination==='/srv/web').Source=webRoot;
  const mounts=c=>(c.Mounts||[]).map(m=>[m.Type,m.Name??null,m.Source,m.Destination,m.RW]).sort((a,b)=>a[3].localeCompare(b[3]));
  if(!isDeepStrictEqual(mounts(expected),mounts(current)))throw Error('Mounts divergentes: '+role);
  if(!isDeepStrictEqual(Object.keys(before.NetworkSettings.Networks).sort(),Object.keys(current.NetworkSettings.Networks).sort()))throw Error('Redes divergentes.');
  for(const key of ['PortBindings','ReadonlyRootfs','RestartPolicy','LogConfig','Privileged','Memory','MemorySwap','NanoCpus','PidsLimit','Dns','ExtraHosts'])if(!isDeepStrictEqual(current.HostConfig[key]??null,before.HostConfig[key]??null))throw Error('Opção de execução divergente: '+key);
  for(const key of ['CapAdd','CapDrop','SecurityOpt'])if(!isDeepStrictEqual([...(current.HostConfig[key]||[])].sort(),[...(before.HostConfig[key]||[])].sort()))throw Error('Proteção divergente: '+key);
  for(const key of ['User','Cmd','Entrypoint'])if(!isDeepStrictEqual(current.Config[key]??null,before.Config[key]??null))throw Error('Inicialização divergente: '+key);
}
