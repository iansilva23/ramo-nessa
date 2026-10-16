import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fixWebPolicyHeader } from './web-refresh-contract.mjs';
const fixture=`{
 admin off
 auto_https off
}
:8088 {
  header {
    -Server
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
  }
  handle_path /passageiro/* {
    header Permissions-Policy "camera=(), microphone=(), geolocation=(self)"
    respond "passenger"
  }
  handle_path /motorista/* {
    header Permissions-Policy "camera=(), microphone=(), geolocation=(self)"
    respond "driver"
  }
  handle_path /administrodo/* {
    respond "admin"
  }
}
`;
function run(args){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r;}
test('real Caddy reproduces global GPS denial and fixed headers allow only the PWAs',async()=>{
  for(const fixed of [false,true]){
    const directory=mkdtempSync(join(tmpdir(),'ramo-policy-'));const file=join(directory,'Caddyfile');
    writeFileSync(file,fixed?fixWebPolicyHeader(fixture):fixture,{mode:0o644});
    const container='ramo-policy-'+randomBytes(8).toString('hex');
    try{
      run(['run','-d','--rm','--name',container,'--network','none','--mount','type=bind,src='+file+',dst=/etc/caddy/Caddyfile,readonly','caddy:2.10.2']);
      for(let attempt=0;attempt<30;attempt++){
        const r=spawnSync('docker',['exec',container,'wget','-q','-O','/dev/null','http://127.0.0.1:8088/administrodo/']);
        if(r.status===0)break;
        await new Promise(resolve=>setTimeout(resolve,200));
      }
      for(const path of ['/passageiro/','/motorista/','/administrodo/']){
        const response=run(['exec',container,'wget','-S','-O','/dev/null','http://127.0.0.1:8088'+path]);
        const values=[...response.stderr.matchAll(/permissions-policy:\s*([^\r\n]+)/ig)].map(match=>match[1]);
        assert.equal(values.length,1);
        assert.match(values[0],fixed&&path!=='/administrodo/'?/geolocation=\(self\)/:/geolocation=\(\)/);
        assert.ok(!/\n\s*server:/i.test(response.stderr));
      }
    }finally{spawnSync('docker',['rm','-f',container]);rmSync(directory,{recursive:true,force:true});}
  }
});
