export function mergeWebCaddy(active,template){
 const marker='  handle_path /administrodo/* {';
 if(active.split(marker).length!==2||active.includes('handle_path /passageiro/')||active.includes('handle_path /motorista/'))throw new Error('Rotas atuais diferentes do esperado.');
 const start=template.indexOf('  # Web apps usam a mesma origem HTTPS');
 const end=template.indexOf(marker,start);
 if(start<0||end<=start)throw new Error('Fragmento Web do candidato não encontrado.');
 const fragment=template.slice(start,end);
 for(const path of ['passageiro','motorista'])if(fragment.split('handle_path /'+path+'/* {').length!==2)throw new Error('Fragmento Web inválido.');
 if(fragment.split('wss://{host}').length!==3||fragment.split('geolocation=(self)').length!==3)throw new Error('Escopos Web inválidos.');
 const offset=active.indexOf(marker);
 return {candidate:active.slice(0,offset)+fragment+active.slice(offset),fragment};
}
export function sameConfiguration(a,b){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
