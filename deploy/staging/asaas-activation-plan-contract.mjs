// Build a private, self-contained Compose plan from resolved live service definitions.
import {createHash} from 'node:crypto';
export const activationProject='ramo-nessa-staging';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function environmentMap(lines){
 const result={};for(const line of lines??[]){const i=line.indexOf('=');if(i<1)throw Error('Ambiente inválido.');const key=line.slice(0,i);if(Object.hasOwn(result,key))throw Error('Ambiente duplicado: '+key);result[key]=line.slice(i+1);}return result;
}
export function assertEnvironmentMatches(resolved,container,image){
 const actual=environmentMap(container.Config.Env),expected={...environmentMap(image.Config.Env),...resolved.environment};
 for(const key of new Set([...Object.keys(actual),...Object.keys(expected)]))if(actual[key]!==expected[key])throw Error('Compose resolvido difere do ambiente ativo: '+key+'. Valores privados não exibidos.');
}
const unsupported=['network_mode','volumes_from','secrets','configs','devices','privileged','extends','external_links'];
export function servicePlan(resolved,name,container,candidateImage,{disabledAsaas=false}={}){
 if(!['core','gateway'].includes(name)||resolved.name!==activationProject||container.Config.Labels?.['com.docker.compose.project']!==activationProject||container.Config.Labels?.['com.docker.compose.service']!==name)throw Error('Projeto/serviço diferentes do esperado.');
 const service=structuredClone(resolved.services?.[name]);if(!service)throw Error('Serviço ausente.');
 for(const key of unsupported)if(service[key])throw Error('Configuração exige revisão: '+key);
 if(service.container_name&&service.container_name!==container.Name.slice(1))throw Error('Nome do container divergiu.');
 service.container_name=container.Name.slice(1);service.image=candidateImage;
 delete service.build;delete service.depends_on;service.pull_policy='never';
 if(disabledAsaas){
  const e=service.environment??{};
  if((e.DRIVER_PAYOUT_PROVIDER_NAME&&!['asaas',''].includes(e.DRIVER_PAYOUT_PROVIDER_NAME))||e.DRIVER_PAYOUT_PROVIDER_URL||e.DRIVER_PAYOUT_PROVIDER_TOKEN||e.ASAAS_PAYOUTS_ENABLED==='true')throw Error('Há provedor de repasses ativo; não será substituído automaticamente.');
  service.environment={...e,DRIVER_PAYOUT_PROVIDER_NAME:'asaas',ASAAS_PAYOUTS_ENABLED:'false'};
 }
 const plan={name:activationProject,services:{[name]:service},networks:{},volumes:{}};
 for(const [key,value] of Object.entries(service.networks??{})){
  const actualName=resolved.networks?.[key]?.name,actual=container.NetworkSettings.Networks?.[actualName];
  if(!actualName||!actual)throw Error('Rede resolvida difere da rede ativa.');
  plan.networks[key]={name:actualName,external:true};
  service.networks[key]={...(value??{}),aliases:[...new Set([...(value?.aliases??[]),...(actual.Aliases??[])])]};
 }
 const configuredMounts=[];
 for(const mount of service.volumes??[]){
  let source=mount.source;
  if(mount.type==='volume'){
   source=resolved.volumes?.[mount.source]?.name;if(!source)throw Error('Volume sem nome explícito.');
   plan.volumes[mount.source]={name:source,external:true};
  }else if(mount.type!=='bind')throw Error('Tipo de mount exige revisão.');
  const active=container.Mounts?.find(x=>x.Destination===mount.target);
  if(!active||active.Type!==mount.type||(mount.type==='volume'?active.Name:active.Source)!==source||active.RW===Boolean(mount.read_only))throw Error('Mount resolvido difere do mount ativo: '+mount.target);
  configuredMounts.push(mount.target);
 }
 if((container.Mounts??[]).some(x=>!configuredMounts.includes(x.Destination)))throw Error('Há mounts ativos ausentes no Compose resolvido.');
 return plan;
}
// Config output must be escaped before becoming another Compose input. Secrets may contain '$'.
export function escapeCompose(value){
 if(typeof value==='string')return value.replaceAll('$',()=> '$$');
 if(Array.isArray(value))return value.map(escapeCompose);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,escapeCompose(v)]));
 return value;
}
export function changesForAsaas(before,after){
 const differences=[];for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(before[key]!==after[key])differences.push(key);
 if(differences.some(k=>!['ASAAS_PAYOUTS_ENABLED','DRIVER_PAYOUT_PROVIDER_NAME'].includes(k))||after.ASAAS_PAYOUTS_ENABLED!=='false'||after.DRIVER_PAYOUT_PROVIDER_NAME!=='asaas')throw Error('Plano altera ambiente fora do escopo.');
 return differences;
}
