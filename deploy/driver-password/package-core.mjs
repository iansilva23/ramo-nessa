import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='release/driver-password/core';await mkdir(root,{recursive:true});
const names=['driver-password-auth-service','driver-password-auth-store','driver-password-auth-routes','passenger-password-auth-service','phone-otp-service'];
for(const name of names)await copyFile('backend/core/dist/src/auth/'+name+'.js',root+'/'+name+'.js');
await copyFile('backend/core/migrations/101_driver_password_login.sql',root+'/101_driver_password_login.sql');
const files={};for(const name of [...names.map(n=>n+'.js'),'101_driver_password_login.sql'])files[name]=createHash('sha256').update(await readFile(root+'/'+name)).digest('hex');
await writeFile(root+'/manifest.json',JSON.stringify({schema:1,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base:'5fa387e563074522a68adf3b3df9e7e18a4d0be6',files},null,2));
