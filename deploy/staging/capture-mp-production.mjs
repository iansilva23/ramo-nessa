// Private local preparation only. Does not change runtime, SQL or contact a provider.
import {mkdirSync,lstatSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function parseProductionCredentials(input){
  const values=input.split('\0');
  if(values.length!==4||values.pop()!=='')throw Error('Entrada privada incompleta.');
  const [publicKey,accessToken,webhookSecret]=values.map(v=>v.trim());
  if(!/^APP_USR-[A-Za-z0-9_-]{10,500}$/.test(publicKey)||!/^APP_USR-[A-Za-z0-9_-]{10,1000}$/.test(accessToken)||publicKey===accessToken)throw Error('Confira Public Key e Access Token de produção, em seus respectivos campos.');
  if(!/^[A-Za-z0-9_-]{16,255}$/.test(webhookSecret))throw Error('Confira a assinatura secreta do webhook de produção.');
  return {format:1,publicKey,accessToken,webhookSecret};
}
export function saveProductionCredentials(input){
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');
  process.umask(0o077);
  const dir='/opt/ramo-nessa-private/mp-production-20261022';
  mkdirSync(dir,{mode:0o700});
  const stat=lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077))throw Error('Diretório privado inválido.');
  const payload=parseProductionCredentials(input);
  writeFileSync(dir+'/credentials.private.json',JSON.stringify({...payload,capturedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({status:'CREDENCIAIS_MP_ARMAZENADAS',runtimeChanged:false,paymentsCreated:false,testBalanceChanged:false,asaasChanged:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>4096)throw Error('Entrada muito longa.');}
    // Validate before creating anything, avoiding empty preparations on a typo.
    parseProductionCredentials(input);saveProductionCredentials(input);
  }catch{console.error('Preparação interrompida: confira os três campos e se já existe uma preparação. Nenhum serviço foi alterado.');process.exitCode=1;}
}
