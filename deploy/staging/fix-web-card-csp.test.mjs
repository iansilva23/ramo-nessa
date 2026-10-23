import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {mkdtempSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {patchCardPolicy,passengerPolicy,patchConnectPolicy,secureFieldOrigins,writeInPlace,assertGateway} from './fix-web-card-csp.mjs';
const source=readFileSync(new URL('Caddyfile',import.meta.url),'utf8');
const baseline=source.replace('connect-src '+secureFieldOrigins.join(' ')+' ','connect-src ');
test('repair adds only both Secure Fields preflight origins in passenger connect-src and is idempotent',()=>{
 const next=patchCardPolicy(baseline);assert.equal(next,source);assert.equal(patchCardPolicy(next),next);
 for(const origin of secureFieldOrigins)assert(passengerPolicy(next).policy.split(';').find(d=>d.trim().startsWith('connect-src ')).split(/\s+/).includes(origin));
 const old=passengerPolicy(baseline),after=passengerPolicy(next);
 assert.equal(baseline.slice(0,old.start),next.slice(0,after.start));assert.equal(baseline.slice(old.end),next.slice(after.end));
 assert.equal(after.policy.replace(secureFieldOrigins.join(' ')+' ',''),old.policy);
});
test('missing or ambiguous policies fail before writing and partially repaired policies add only missing origins',()=>{
 assert.throws(()=>patchCardPolicy(baseline.replace('handle_path /passageiro/*','handle_path /other/*')));
 assert.throws(()=>patchConnectPolicy("default-src 'self'"));
 assert.throws(()=>patchConnectPolicy("connect-src 'self'; connect-src https://api.mercadopago.com"));
 const partial=patchConnectPolicy(passengerPolicy(baseline).policy.replace('connect-src ','connect-src '+secureFieldOrigins[0]+' '));
 for(const origin of secureFieldOrigins)assert.equal(partial.split(origin).length,2);
});
test('in-place write preserves the mounted inode and rollback removes appended bytes; concurrent edits are refused',()=>{
 const root=mkdtempSync(join(tmpdir(),'ramo-card-write-')),file=join(root,'Caddyfile'),hash=b=>createHash('sha256').update(b).digest('hex');
 try{const old=Buffer.from(baseline),next=Buffer.from(patchCardPolicy(baseline));writeFileSync(file,old);const ino=statSync(file).ino;
 writeInPlace(file,next,hash(old));assert.equal(statSync(file).ino,ino);assert.equal(readFileSync(file).toString(),next.toString());
 assert.throws(()=>writeInPlace(file,old,hash(old)));assert.equal(readFileSync(file).toString(),next.toString());
 writeInPlace(file,old,hash(next));assert.equal(statSync(file).ino,ino);assert.equal(readFileSync(file).toString(),old.toString());
 }finally{rmSync(root,{recursive:true});}
});
test('gateway API configuration or wrong mount/process cannot be silently patched',()=>{
 const gateway={State:{Running:true,Paused:false,Health:{Status:'healthy'}},Path:'caddy',Args:['run','--config','/etc/caddy/Caddyfile'],Mounts:[{Type:'bind',Destination:'/etc/caddy/Caddyfile',Source:'/fixture/Caddyfile'}]};
 assert.equal(assertGateway(gateway),'/fixture/Caddyfile');
 assert.throws(()=>assertGateway({...gateway,Args:['run','--resume']}));
 assert.throws(()=>assertGateway({...gateway,Mounts:[]}));
 assert.throws(()=>assertGateway({...gateway,State:{Running:true}}));
});
