// Gateway mount switch only. No Core, migration, policy or transfer operations.
import {isDeepStrictEqual} from 'node:util';
import {assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
export const mounts=c=>(c.Mounts??[]).map(m=>[m.Type,m.Name??null,m.Source,m.Destination,m.RW]).sort((a,b)=>a[3].localeCompare(b[3]));
export function assertWebGatewayRuntime(before,current,model,image,bundleRoot){
 if(current.Image!==before.Image||current.State.Health?.Status!=='healthy')throw Error('Imagem ou saúde do gateway divergente.');
 assertEnvironmentMatches(model.services.gateway,current,image);
 const expected=structuredClone(before);
 const web=expected.Mounts.filter(m=>m.Destination==='/srv/web');
 if(web.length!==1||web[0].Type!=='bind'||web[0].RW!==false)throw Error('Mount Web inesperado.');
 web[0].Source=bundleRoot;
 if(!isDeepStrictEqual(mounts(current),mounts(expected)))throw Error('Mounts do gateway divergentes.');
 if(!isDeepStrictEqual(Object.keys(current.NetworkSettings.Networks).sort(),Object.keys(before.NetworkSettings.Networks).sort()))throw Error('Redes divergentes.');
 for(const key of ['PortBindings','ReadonlyRootfs','RestartPolicy','LogConfig','Privileged','Memory','NanoCpus','PidsLimit'])if(!isDeepStrictEqual(current.HostConfig[key]??null,before.HostConfig[key]??null))throw Error('Opção do gateway divergente: '+key);
 for(const key of ['CapAdd','CapDrop','SecurityOpt'])if(!isDeepStrictEqual([...(current.HostConfig[key]??[])].sort(),[...(before.HostConfig[key]??[])].sort()))throw Error('Proteção do gateway divergente: '+key);
 for(const key of ['User','Cmd','Entrypoint'])if(!isDeepStrictEqual(current.Config[key]??null,before.Config[key]??null))throw Error('Inicialização do gateway divergente: '+key);
}
export async function switchDriverWeb(steps){
 try{await steps.up();await steps.check();await steps.verify();}
 catch(cause){
  const errors=[];
  try{await steps.rollback();}catch(e){errors.push(e.message??'rollback');}
  if(!errors.length)try{await steps.verifyRollback();}catch(e){errors.push(e.message??'verification');}
  const error=new Error(errors.length?'Publicação Web requer conferência; retorno não confirmado.':'Publicação Web interrompida; gateway anterior restaurado e conferido.',{cause});
  error.rollbackComplete=errors.length===0;error.rollbackFailures=errors;throw error;
 }
}
