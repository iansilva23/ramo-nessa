import { readFile,writeFile,readdir,lstat } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadPublicWebConfiguration } from './public_web_configuration.mjs';
import { verifyWebHomologation } from './verify_web_homologation.mjs';
const args=process.argv.slice(2),prefixes=['--passenger=','--driver=','--commit=','--output='];
if(args.length!==4||prefixes.some(p=>args.filter(a=>a.startsWith(p)).length!==1))throw new Error('Informe --passenger, --driver, --commit e --output.');
const get=p=>args.find(a=>a.startsWith(p)).slice(p.length);
const commit=get('--commit=');if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Revisão exata inválida.');
const config=await loadPublicWebConfiguration();
const roots={passenger:resolve(get('--passenger=')),driver:resolve(get('--driver='))};
await verifyWebHomologation({...roots,expectedProject:config.expectedProject});
for(const [role,root]of Object.entries(roots)){
 const source=await readFile(join(root,'ramo_push_config.js'),'utf8');
 const match=source.match(/^\/\/[^\n]*\nself\.ramoPushConfig = ([\s\S]+);\s*$/);
 const actual=JSON.parse(match[1]);
 if(Object.keys(config.apps[role]).some(field=>actual[field]!==config.apps[role][field]))throw new Error('Bundle não corresponde à configuração pública aprovada: '+role);
}
const output=resolve(get('--output='));
for(const root of Object.values(roots))if(output===root||output.startsWith(root+'/'))throw new Error('Grave o manifesto fora dos bundles.');
const roles={};
for(const [role,root]of Object.entries(roots)){
 const files=[];
 async function walk(relative=''){
  for(const name of (await readdir(join(root,relative))).sort()){
   const rel=relative?relative+'/'+name:name,path=join(root,rel),stat=await lstat(path);
   if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))throw new Error('Arquivo de bundle inseguro.');
   if(stat.isDirectory())await walk(rel);else files.push({path:rel,bytes:stat.size,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
  }
 }
 await walk();
 const digest=createHash('sha256');for(const f of files)digest.update(f.path+'\0'+f.sha256+'\0'+f.bytes+'\n');
 roles[role]={treeSha256:digest.digest('hex'),files};
}
await writeFile(output,JSON.stringify({schemaVersion:1,commit,expectedOrigin:config.expectedOrigin,expectedProject:config.expectedProject,roles,structuralCheck:true,providerHomologation:false},null,2)+'\n',{flag:'wx'});
console.log('Manifesto dos dois bundles criado; nenhuma publicação foi realizada.');
