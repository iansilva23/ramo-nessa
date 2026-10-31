import { readFile } from 'node:fs/promises';
const fields=['apiKey','appId','projectId','messagingSenderId','vapidKey'];
const fail=()=>{throw new Error('Configuração pública Web inválida; confira projeto, origem, dois appIds Web e VAPID público.');};
export function validatePublicWebConfiguration(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail();
  if(Object.keys(input).sort().join(',')!=='apps,expectedOrigin,expectedProject,schemaVersion'||input.schemaVersion!==1)fail();
  if(typeof input.expectedProject!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(input.expectedProject))fail();
  let origin;try{origin=new URL(input.expectedOrigin);}catch{fail();}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.origin!==input.expectedOrigin)fail();
  if(!input.apps||Object.keys(input.apps).sort().join(',')!=='driver,passenger')fail();
  for(const role of ['passenger','driver']){
    const value=input.apps[role];
    if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==fields.length||fields.some(f=>typeof value[f]!=='string'||!value[f].trim()||value[f]!==value[f].trim()||value[f].length>512))fail();
    if(!/^AIza[A-Za-z0-9_-]{35}$/.test(value.apiKey)||!/^\d+$/.test(value.messagingSenderId)||!new RegExp('^1:'+value.messagingSenderId+':web:[a-f0-9]+$').test(value.appId)||value.projectId!==input.expectedProject)fail();
    const vapid=Buffer.from(value.vapidKey,'base64url');
    if(!/^[A-Za-z0-9_-]{87}$/.test(value.vapidKey)||vapid.length!==65||vapid[0]!==4||vapid.toString('base64url')!==value.vapidKey)fail();
  }
  if(input.apps.passenger.appId===input.apps.driver.appId||input.apps.passenger.messagingSenderId!==input.apps.driver.messagingSenderId)fail();
  return structuredClone(input);
}
export async function loadPublicWebConfiguration(path=new URL('../../config/web/firebase.public.json',import.meta.url)){
  let data;try{const source=await readFile(path,'utf8');if(source.length>16384)fail();data=JSON.parse(source);}catch{fail();}
  return validatePublicWebConfiguration(data);
}
