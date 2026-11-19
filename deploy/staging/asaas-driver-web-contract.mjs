import {isDeepStrictEqual} from 'node:util';
export const driverWebSource='21ae1f3101440336559647d11799fe4cb02978ef';
export const driverWebFile='RamoNessa-Motorista-Web-21ae1f310144.zip';
export const driverWebRelease='/opt/ramo-nessa-web/releases/driver-asaas-21ae1f310144';
export const driverWebPrivate='/var/backups/ramo-nessa-asaas/driver-web-21ae1f310144';
export const driverWebBefore='/opt/ramo-nessa-web/releases/2ee07808d819/bundles';
export const driverGatewayImage='sha256:59d92511d7f6bf5c39aa18975a1d74ae0526f60097a52a4524c1ed481051dae1';
export function gatewayWebPlan(before,bundleRoot=driverWebRelease+'/bundles'){
 if(Object.keys(before.services??{}).join(',')!=='gateway'||!/^sha256:[a-f0-9]{64}$/.test(before.services.gateway.image??''))throw Error('Plano deve conter somente gateway com imagem imutável.');
 if(!bundleRoot.startsWith('/')||/[\s$,:]/.test(bundleRoot))throw Error('Caminho de bundles inválido.');
 const model=structuredClone(before),mounts=model.services.gateway.volumes??[];
 const roots=mounts.filter(m=>m.target==='/srv/web');
 if(roots.length!==1||roots[0].type!=='bind'||roots[0].read_only!==true)throw Error('Mount Web fora do contrato.');
 roots[0].source=bundleRoot;
 return model;
}
export function assertGatewayWebDelta(before,after,bundleRoot){
 if(!isDeepStrictEqual(after,gatewayWebPlan(before,bundleRoot)))throw Error('Plano altera opções fora do mount Web.');
}
export function publicPushConfig(source){
 const match=source.match(/^\/\/[^\n]*\nself\.ramoPushConfig = ([\s\S]+);\s*$/);
 if(!match)throw Error('Configuração pública de push em formato inesperado.');
 const data=JSON.parse(match[1]),fields=['apiKey','appId','projectId','messagingSenderId','vapidKey'];
 if(!data||fields.some(k=>typeof data[k]!=='string'||!data[k]))throw Error('Configuração pública de push incompleta.');
 return data;
}
export function browserMapsKey(index){
 const key=index.match(/https:\/\/maps\.googleapis\.com\/maps\/api\/js\?key=([^"\s<>]+)/)?.[1];
 if(!key||!/^AIza[A-Za-z0-9_-]{35}$/.test(key))throw Error('Maps Web não configurado.');
 return key;
}
