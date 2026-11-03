import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from '../../backend/core/node_modules/typescript/lib/typescript.js';
const root=process.argv[2];if(!root)throw Error('package directory required');
for(const name of ['activate.py','patch_runtime.py','web_release.py','isolated.py','migrate-one.mjs','test-migrations.mjs','candidate-http.test.mjs'])await copyFile('deploy/driver-password/'+name,root+'/'+name);
for(const name of ['driver_password_auth','driver_password_postgres']){
 const source=await readFile('backend/core/test/'+name+'.test.ts','utf8');
 const js=ts.transpileModule(source,{fileName:name+'.test.ts',compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("from '../src/","from '/app/dist/src/");
 await writeFile(root+'/'+name+'.test.mjs',js);
}
const core=JSON.parse(await readFile(root+'/core/manifest.json','utf8'));
const files={};async function walk(dir,relative=''){for(const e of await readdir(dir,{withFileTypes:true})){const r=relative+e.name;if(e.isDirectory())await walk(dir+'/'+e.name,r+'/');else if(e.isFile())files[r]=createHash('sha256').update(await readFile(dir+'/'+e.name)).digest('hex');else throw Error('Unexpected package entry');}}
await walk(root);delete files['release.json'];
await writeFile(root+'/release.json',JSON.stringify({schema:1,source:core.source,baseImage:'sha256:449ead609890bc47d4274d4bc3e1df545ba87f5a732881efeb4037482a2e4083',files},null,2));
