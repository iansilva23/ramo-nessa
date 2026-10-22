// Private local preparation only. Does not change runtime, SQL or contact a provider.
import {mkdirSync,lstatSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function parseProductionCredentials(input){
  const values=input.split('\0');
  if(values.length!==4||values.pop()!=='')throw Error('Entrada privada incompleta.');
  const [publicKey,accessToken,webhookSecret]=values.map(v=>v.trim());
  if(!/^APP_USR-[A-Za-z0-9_-]{10,500}$/.test(publicKey))throw Error('Confira o campo Public Key de produção.');
  if(!/^APP_USR-[A-Za-z0-9_-]{10,1000}$/.test(accessToken))throw Error('Confira o campo Access Token de produção.');
  if(publicKey===accessToken)throw Error('Public Key e Access Token não podem ser iguais.');
  if(!/^[A-Za-z0-9_-]{16,255}$/.test(webhookSecret))throw Error('Confira a assinatura secreta do webhook de produção.');
  return {format:1,publicKey,accessToken,webhookSecret};
}
const parent='/opt/ramo-nessa-private';
const directory=parent+'/mp-production-20261022';
export function assertPrivateParent(dir){
  const stat=lstatSync(dir);
  // The shared root-owned parent can be traversable (0755) by provider
  // processes. Only the dedicated credential directory must be root-only.
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o022))throw Error('Pasta principal exige proprietário root e nenhuma escrita por grupo ou outros.');
}
function assertPrivateDirectory(dir){
  const stat=lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077))throw Error('Diretório privado inválido.');
}
export function storeInDirectory(input,dir){
  const payload=parseProductionCredentials(input);
  // An empty directory from an interrupted preparation may be reused; an
  // existing file is NEVER replaced, including a symlink or partial file.
  try{mkdirSync(dir,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  assertPrivateDirectory(dir);
  writeFileSync(dir+'/credentials.private.json',JSON.stringify({...payload,capturedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});
}
export function storedStatus(){
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');
  let parentExists=false,directoryExists=false;
  try{assertPrivateParent(parent);parentExists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(parentExists)try{assertPrivateDirectory(directory);directoryExists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(directoryExists){
    try{
      const path=directory+'/credentials.private.json',stat=lstatSync(path);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077)||stat.size>4096)throw Error('Arquivo privado inválido.');
      const c=JSON.parse(readFileSync(path,'utf8'));
      parseProductionCredentials([c.publicKey,c.accessToken,c.webhookSecret,''].join('\0'));
      return {status:'CREDENCIAIS_MP_JA_ARMAZENADAS',runtimeChanged:false};
    }catch(error){if(error.code!=='ENOENT')throw Error('Arquivo de credenciais existente exige revisão privada; não será sobrescrito.');}
  }
  return {status:'CREDENCIAIS_MP_NAO_ARMAZENADAS',parentExists,directoryExists,runtimeChanged:false};
}
export function saveProductionCredentials(input){
  if(process.getuid?.()!==0)throw Error('Execute com sudo.');
  process.umask(0o077);
  // Create only the known private parent if absent, without chmod/chown of
  // existing Asaas or provider folders.
  try{mkdirSync(parent,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  assertPrivateParent(parent);
  storeInDirectory(input,directory);
  console.log(JSON.stringify({status:'CREDENCIAIS_MP_ARMAZENADAS',runtimeChanged:false,paymentsCreated:false,testBalanceChanged:false,asaasChanged:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length===3&&process.argv[2]==='--status'){console.log(JSON.stringify(storedStatus()));process.exit(0);}
    if(process.argv.length!==2)throw Error('Argumentos inválidos.');
    let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>4096)throw Error('Entrada muito longa.');}
    // Validate before creating anything, avoiding empty preparations on a typo.
    parseProductionCredentials(input);saveProductionCredentials(input);
  }catch(error){
    const known=['Pasta principal exige proprietário root e nenhuma escrita por grupo ou outros.','Entrada privada incompleta.','Confira o campo Public Key de produção.','Confira o campo Access Token de produção.','Public Key e Access Token não podem ser iguais.','Confira a assinatura secreta do webhook de produção.','Diretório privado inválido.','Arquivo de credenciais existente exige revisão privada; não será sobrescrito.','Execute com sudo.','Entrada muito longa.','Argumentos inválidos.'];
    const message=known.includes(error.message)?error.message:({EEXIST:'Já existe um arquivo de credenciais. Use --status; nada foi sobrescrito.',ENOENT:'Pasta privada ausente. Nada foi sobrescrito.',EACCES:'Permissão insuficiente no armazenamento privado.',ENOSPC:'Espaço insuficiente no armazenamento privado.'}[error.code]??'Falha no armazenamento privado.');
    console.error('Preparação interrompida: '+message+' Nenhum serviço foi alterado.');process.exitCode=1;
  }
}
