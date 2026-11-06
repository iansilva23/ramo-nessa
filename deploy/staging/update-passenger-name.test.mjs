import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {checkArguments,checkDelta,source,baseCore,baseAdmin,adminFiles,coreFiles} from './update-passenger-name.mjs';
const git=args=>execFileSync('git',args,{encoding:'utf8'}),hash=b=>createHash('sha256').update(b).digest('hex');
function inventory(rev){return Object.fromEntries(git(['ls-tree','-r','--name-only',rev,'--','apps/admin']).trim().split('\n').filter(p=>/^apps\/admin\/(?:index\.html|styles\.css|guide\.css|admin-workspace\.css|favicon\.svg|src\/|pages\/)/.test(p)).map(p=>[p.slice(11),hash(git(['show',rev+':'+p]))]));}
test('only the pinned tested source is accepted',()=>{assert.doesNotThrow(()=>checkArguments([source]));for(const args of [[],['main'],[source,'--force']])assert.throws(()=>checkArguments(args));});
test('real ADM source delta is exactly the four reviewed passenger assets',()=>{const old=inventory(baseAdmin),next=inventory(source);assert.doesNotThrow(()=>checkDelta(old,next,adminFiles));for(const p of ['index.html','src/api.js','styles.css','guide.css','src/regions-pricing-admin.js'])assert.throws(()=>checkDelta(old,{...next,[p]:'bad'},adminFiles));for(const p of adminFiles){const missing={...next};delete missing[p];assert.throws(()=>checkDelta(old,missing,adminFiles));}});
test('Core source delta has only two repositories and the directory response',()=>{
 const changed=git(['diff','--name-only',baseCore,source,'--','backend/core']).trim().split('\n');
 const production=changed.filter(p=>!p.startsWith('backend/core/test/'));
 assert.deepEqual(production.sort(),coreFiles.map(p=>'backend/core/src/'+p.replace(/\.js$/,'.ts')).sort());
 assert.equal(git(['diff',baseCore,source,'--','backend/core/package-lock.json','backend/core/migrations']), '');
});
test('no mobile sources are changed',()=>assert.equal(git(['diff',baseCore,source,'--','apps/driver','apps/passenger','packages']),''));
