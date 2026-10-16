import { createHash } from 'node:crypto';
export function compareMigrationHistory(applied, candidates){
  if(!Array.isArray(applied)||!applied.length)throw new Error('Histórico de migrations vazio/inválido.');
  const seen=new Set();
  for(const row of applied){
    if(!row||typeof row.filename!=='string'||seen.has(row.filename)||!candidates.has(row.filename))throw new Error('Migration aplicada duplicada ou ausente no candidato.');
    seen.add(row.filename);
    if(!/^[a-f0-9]{64}$/.test(row.checksum??'')||candidates.get(row.filename)!==row.checksum)throw new Error('Checksum de migration aplicada diverge do candidato.');
  }
  const pending=[...candidates].filter(([filename])=>!seen.has(filename)).map(([filename,checksum])=>({filename,checksum}));
  return {applied:applied.length,matched:seen.size,pending};
}
export function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
export function requireSnapshot(actual,expected){
  if(actual.head!==expected.head||actual.caddySha256!==expected.caddySha256)throw new Error('HEAD ou Caddyfile mudou desde o inventário. Nenhuma alteração realizada.');
  for(const [name,image]of Object.entries(expected.images)){
    const container=actual.containers[name];
    if(!container||container.image!==image||container.health!=='healthy')throw new Error('Container mudou ou não está saudável: '+name);
  }
}
