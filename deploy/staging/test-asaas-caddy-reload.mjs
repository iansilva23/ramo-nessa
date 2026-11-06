// Disposable CI proof: same admin-off/run-file mode as the inspected gateway.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {guardedWrite} from './asaas-sandbox-webhook-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('CI only.');
const dir=mkdtempSync(join(tmpdir(),'asaas-signal-')),file=join(dir,'Caddyfile'),name='asaas-signal-ci-'+randomBytes(8).toString('hex');
const before='{\n admin off\n auto_https off\n}\n:8080 {\n respond /ready 200\n respond 404\n}\n';
const after=before.replace(' respond /ready 200',' respond /__asaas_sandbox/transfers 401\n respond /ready 200');
const run=args=>{const r=spawnSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(r.status!==0)throw Error('Disposable Caddy CI command failed: '+r.stderr);return r.stdout;};
let created=false;
try{
 writeFileSync(file,before);chmodSync(file,0o644);
 run(['run','-d','--name',name,'--network','none','--mount','type=bind,src='+file+',dst=/etc/caddy/Caddyfile,readonly','caddy:2.11.7-alpine','caddy','run','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);created=true;
 const initial=JSON.parse(run(['inspect',name]))[0];
 // wget exits nonzero for 401/404, so inspect via BusyBox sh without surfacing expected errors.
 const expect=async(path,status)=>{for(let n=0;n<30;n++){const r=spawnSync('docker',['exec',name,'sh','-c','wget -S -O /dev/null "$1" 2>&1 || true','sh','http://127.0.0.1:8080'+path],{encoding:'utf8'});if(r.stdout.includes(' '+status+' '))return;await new Promise(r=>setTimeout(r,300));}throw Error('Disposable route did not reach '+status);};
 await expect('/ready',200);await expect('/__asaas_sandbox/transfers',404);
 guardedWrite(file,before,after);run(['exec',name,'caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile']);run(['kill','--signal=USR1',name]);
 await expect('/__asaas_sandbox/transfers',401);await expect('/ready',200);
 guardedWrite(file,after,before);run(['kill','--signal=USR1',name]);await expect('/__asaas_sandbox/transfers',404);await expect('/ready',200);
 const final=JSON.parse(run(['inspect',name]))[0];assert.equal(final.Id,initial.Id);assert.equal(final.State.StartedAt,initial.State.StartedAt);assert.equal(final.RestartCount,0);
 console.log('CADDY RELOAD CI PASSED: admin off, read-only bind inode preserved, USR1 activate/rollback, same container and start time.');
}finally{if(created)run(['rm','-f',name]);rmSync(dir,{recursive:true,force:true});}
