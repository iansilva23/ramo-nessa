import {openSync,readFileSync,writeSync,ftruncateSync,fsyncSync,closeSync,constants} from 'node:fs';
import {sandboxWebhookPath} from './asaas-sandbox-webhook-http.mjs';
export function sandboxCaddyCandidate(text,alias){
 if(!/^ramo-asaas-sandbox-[a-f0-9]{32}-receiver$/.test(alias))throw Error('Unexpected receiver name.');
 if(text.includes(sandboxWebhookPath))throw Error('Webhook route already present; inspect existing state.');
 const matches=[...text.matchAll(/^([ \t]*)@api path \/v1\/\* \/health \/ready\r?$/gm)];
 if(matches.length!==1)throw Error('API marker differs from inspected configuration.');
 const m=matches[0],indent=m[1],eol=text.includes('\r\n')?'\r\n':'\n';
 const block=[`${indent}# Temporary isolated Asaas Sandbox receiver; no live payout processing.`,`${indent}handle ${sandboxWebhookPath} {`,`${indent}  reverse_proxy ${alias}:8080`,`${indent}}`,''].join(eol)+eol;
 return text.slice(0,m.index)+block+text.slice(m.index);
}
// Keep the inode: Docker has a read-only bind mount of this specific file.
export function guardedWrite(path,expected,next){
 const fd=openSync(path,constants.O_RDWR|constants.O_NOFOLLOW);
 try{
  if(!readFileSync(fd).equals(Buffer.from(expected)))throw Error('Configuration changed; refusing overwrite.');
  const bytes=Buffer.from(next);let n=0;while(n<bytes.length)n+=writeSync(fd,bytes,n,bytes.length-n,n);
  ftruncateSync(fd,bytes.length);fsyncSync(fd);
 }finally{closeSync(fd);}
}
