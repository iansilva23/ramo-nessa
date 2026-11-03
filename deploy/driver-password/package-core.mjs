import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ts from '../../backend/core/node_modules/typescript/lib/typescript.js';
const base='5fa387e563074522a68adf3b3df9e7e18a4d0be6';
const root='release/driver-password/core';await mkdir(root,{recursive:true});
const names=['driver-password-auth-service','driver-password-auth-store','driver-password-auth-routes','passenger-password-auth-service','phone-otp-service'];
for(const name of names)await copyFile('backend/core/dist/src/auth/'+name+'.js',root+'/'+name+'.js');
for(const name of ['passenger-password-auth-service','phone-otp-service']){
 const file='backend/core/src/auth/'+name+'.ts';
 const source=execFileSync('git',['show',base+':'+file],{encoding:'utf8'});
 const output=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,sourceMap:true}}).outputText;
 await writeFile(root+'/before-'+name+'.js',output);
}
await copyFile('backend/core/migrations/101_driver_password_login.sql',root+'/101_driver_password_login.sql');
await mkdir(root+'/test-migrations',{recursive:true});
for(const n of (await readdir('backend/core/migrations')).filter(n=>/^\d+.*\.sql$/.test(n)))await copyFile('backend/core/migrations/'+n,root+'/test-migrations/'+n);
const files={};
for(const n of [...names.map(n=>n+'.js'),'before-passenger-password-auth-service.js','before-phone-otp-service.js','101_driver_password_login.sql',...(await readdir(root+'/test-migrations')).map(n=>'test-migrations/'+n)])files[n]=createHash('sha256').update(await readFile(root+'/'+n)).digest('hex');
await writeFile(root+'/manifest.json',JSON.stringify({schema:1,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base,files},null,2));
