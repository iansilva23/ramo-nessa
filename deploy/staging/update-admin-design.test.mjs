import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {checkAdminArguments,checkAdminDelta,parseAdminHashes,adminSourceRevision,adminBaseRevision} from './update-admin-design.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function inventory(rev){
 const paths=execFileSync('git',['ls-tree','-r','--name-only',rev,'--','apps/admin'],{encoding:'utf8'}).trim().split('\n').filter(p=>/^apps\/admin\/(?:index\.html|styles\.css|guide\.css|admin-workspace\.css|manual-refunds\.css|company-dashboard\.css|favicon\.svg|src\/|pages\/)/.test(p));
 return Object.fromEntries(paths.map(p=>[p.slice(11),hash(execFileSync('git',['show',rev+':'+p]))]));
}
const old=inventory(adminBaseRevision),next=inventory(adminSourceRevision);
test('only the pinned browser-tested revision is accepted',()=>{
 assert.doesNotThrow(()=>checkAdminArguments([adminSourceRevision]));
 for(const args of [[],['main'],[adminSourceRevision,'--force'],['a'.repeat(40)]])assert.throws(()=>checkAdminArguments(args));
});
test('complete real source inventories accept only reviewed organization changes',()=>assert.doesNotThrow(()=>checkAdminDelta(old,next)));
test('API, pricing, runtime and styles outside the reviewed design delta are immutable',()=>{
 for(const path of ['src/api.js','src/payout-policy.js','src/regions-pricing-admin.js','src/admin-workspace-bootstrap.js','pages/regions-pricing.html','styles.css','guide.css'])assert.throws(()=>checkAdminDelta(old,{...next,[path]:'changed'}));
 assert.throws(()=>checkAdminDelta(old,{...next,'src/unknown.js':'unknown'}));
});
test('deletions and missing organization assets are rejected',()=>{
 for(const path of ['index.html','admin-workspace.css','src/admin-components.js','src/admin-workspace.js','src/admin-workspace-bootstrap.js','guide.css','manual-refunds.css','company-dashboard.css']){const incomplete={...next};delete incomplete[path];assert.throws(()=>checkAdminDelta(old,incomplete));}
});
test('unsafe or duplicate container inventory paths are rejected',()=>{
 const h='a'.repeat(64);assert.deepEqual(parseAdminHashes(h+'  ./guide.css\n'),{'guide.css':h});
 for(const value of [h+' ./../secrets',h+' ./file\n'+h+' ./file','unknown',h+' ./file with spaces'])assert.throws(()=>parseAdminHashes(value));
});
test('derived image and inventory include all root stylesheets',()=>{
 const source=readFileSync(new URL('./update-admin-design.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('COPY index.html styles.css guide.css admin-workspace.css manual-refunds.css company-dashboard.css favicon.svg /srv/admin/'));
 assert.equal(old['guide.css'],next['guide.css']);
 assert.equal(old['manual-refunds.css'],next['manual-refunds.css']);
 assert.equal(old['company-dashboard.css'],next['company-dashboard.css']);
});
