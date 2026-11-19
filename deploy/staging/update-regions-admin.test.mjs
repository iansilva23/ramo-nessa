import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkAdminArguments,checkAdminDelta,parseAdminHashes,adminSourceRevision} from './update-regions-admin.mjs';
const old={'index.html':'same','src/api.js':'same','src/payout-policy.js':'finance','styles.css':'old','src/regions-pricing-admin.js':'old'};
const next={...old,'styles.css':'new','src/regions-pricing-admin.js':'new','src/regions-pricing-help.js':'help','src/help/regions-pricing-guide.js':'guide'};
test('only the complete approved source revision can be installed',()=>{
 assert.doesNotThrow(()=>checkAdminArguments([adminSourceRevision]));
 for(const args of [[],['main'],[adminSourceRevision,'--force'],['a'.repeat(40)]])assert.throws(()=>checkAdminArguments(args));
});
test('ADM update accepts only help/coordinate static changes',()=>assert.doesNotThrow(()=>checkAdminDelta(old,next)));
test('financial controls, auth shell and API cannot be replaced by this update',()=>{
 for(const path of ['index.html','src/api.js','src/payout-policy.js'])assert.throws(()=>checkAdminDelta(old,{...next,[path]:'changed'}));
 assert.throws(()=>checkAdminDelta(old,{...next,'src/unreviewed.js':'new'}));
});
test('deletions and an incomplete help package are rejected',()=>{
 const deleted={...next};delete deleted['styles.css'];assert.throws(()=>checkAdminDelta(old,deleted));
 const missing={...next};delete missing['src/help/regions-pricing-guide.js'];assert.throws(()=>checkAdminDelta(old,missing));
});
test('inventory parses safe paths and rejects traversal, duplicates and unknown output',()=>{
 const hash='a'.repeat(64);assert.deepEqual(parseAdminHashes(hash+'  ./src/help/regions-pricing-guide.js\n'),{'src/help/regions-pricing-guide.js':hash});
 for(const value of [hash+' ./../secrets',hash+' ./file\n'+hash+' ./file','unknown',hash+' ./file with spaces'])assert.throws(()=>parseAdminHashes(value));
});
