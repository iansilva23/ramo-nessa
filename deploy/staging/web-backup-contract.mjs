import { isAbsolute,basename } from 'node:path';
export function completedBackupDirectory(entries){
 const values=entries.filter(name=>/^\d{4}-\d{2}-\d{2}T[0-9-]+Z$/.test(name));
 if(values.length!==1)throw new Error('Não foi possível identificar um único backup concluído.');
 return values[0];
}
export function privateRuntimeSources(text){
 const names=new Set(['FIREBASE_SERVICE_ACCOUNT_HOST_FILE','GOOGLE_MAPS_SERVER_API_KEY_HOST_FILE','ENTRAR_API_SECRET_HOST_FILE']);
 const values=[];const seen=new Set();
 for(const raw of text.split(/\r?\n/)){
  const match=raw.trim().match(/^([A-Z_]+)\s*=(.*)$/);if(!match||!names.has(match[1]))continue;
  if(seen.has(match[1]))throw new Error('Referência privada duplicada no ambiente.');
  seen.add(match[1]);const path=match[2].trim();
  if(!isAbsolute(path)||/[\x00-\x20$]/.test(path)||path.includes('..')||basename(path)==='')throw new Error('Referência privada inválida no ambiente.');
  values.push({key:match[1],path});
 }
 return values;
}
export function safeUntrackedPaths(paths){
 return paths.map(path=>{if(!path||isAbsolute(path)||path.split('/').some(p=>p==='.'||p==='..')||path.includes('\0'))throw new Error('Arquivo local com caminho inesperado.');return path;});
}
