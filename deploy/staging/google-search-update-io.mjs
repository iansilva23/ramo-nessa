import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {names} from './google-search-update-contract.mjs';
import {coreSourceFingerprintProgram} from './inspect-regions-pricing.mjs';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export function hashFile(path){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink())throw Error('Arquivo regular obrigatório.');return digest(readFileSync(path));}
export function hashTree(root){
  if(!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink())throw Error('Pasta regular obrigatória.');
  const rows=[];function visit(p){for(const n of readdirSync(p).sort()){const f=join(p,n),s=lstatSync(f);if(s.isSymbolicLink())throw Error('Link inesperado.');if(s.isDirectory())visit(f);else if(s.isFile())rows.push([relative(root,f),s.size,hashFile(f)]);else throw Error('Arquivo inesperado.');}}visit(root);return digest(JSON.stringify(rows));
}
export function privateDir(path){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o077))throw Error('Diretório privado precisa pertencer ao root e ter modo 0700.');}
export function io(logDir){
  function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',timeout:300000,maxBuffer:64*1024**2,env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});if(r.error||r.status!==0){if(logDir)writeFileSync(join(logDir,'command.private.log'),String(r.stdout??'')+String(r.stderr??''),{mode:0o600});throw Error('Falha em '+command+'. Detalhes preservados no registro privado.');}return r.stdout;}
  const docker=args=>run('docker',args);
  const inspect=role=>JSON.parse(docker(['inspect',names[role]]))[0];
  const image=id=>JSON.parse(docker(['image','inspect',id]))[0];
  const fingerprint=(id,container=false)=>JSON.parse(docker(container?['exec',id,'node','--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']:['run','--rm','--network','none','--entrypoint','node',id,'--input-type=module','-e',coreSourceFingerprintProgram,'/app/dist/src','/app/package-lock.json']));
  const compose=(path,role)=>docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',path,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate',role]);
  async function health(role){for(let n=0;n<90;n++){const c=inspect(role);if(c.State.Running&&c.State.Health?.Status==='healthy')return;await new Promise(r=>setTimeout(r,1000));}throw Error('Saúde não confirmada: '+role);}
  return {run,docker,inspect,image,fingerprint,compose,health};
}
