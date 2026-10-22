import assert from 'node:assert/strict';import test from 'node:test';
import {switchMpProduction} from './mp-production-switch.mjs';
import {activationSha} from './activate-mp-production.mjs';
import {archiveTestBalances} from './mp-production-database.mjs';
function fixture(fail){const calls=[],steps=Object.fromEntries(['pause','assertPaused','applyData','upProduction','verifyPrivate','openIngress','verifyPublic','ensurePaused','stopCandidate','reverseData','upRollback','verifyRollbackPrivate','openRollbackIngress','verifyRollbackPublic'].map(k=>[k,async()=>{calls.push(k);if(k===fail)throw Error('fixture '+k);} ]));return {calls,steps};}
test('success keeps ingress closed until SQL and private Core checks finish',async()=>{const f=fixture();assert.deepEqual(await switchMpProduction(f.steps),{completed:true});assert.deepEqual(f.calls,['pause','assertPaused','applyData','upProduction','verifyPrivate','openIngress','verifyPublic']);});
for(const fail of ['pause','assertPaused','applyData','upProduction','verifyPrivate'])test('recovery before ingress opens: '+fail,async()=>{
  const f=fixture(fail);await assert.rejects(()=>switchMpProduction(f.steps),e=>e.rollbackComplete===true);
  assert.ok(f.calls.indexOf('ensurePaused')<f.calls.indexOf('upRollback'));
  assert.ok(f.calls.indexOf('verifyRollbackPrivate')<f.calls.indexOf('openRollbackIngress'));
  assert.equal(f.calls.includes('reverseData'),['applyData','upProduction','verifyPrivate'].includes(fail));
});
for(const fail of ['openIngress','verifyPublic'])test('never reverses finance after ingress may have opened: '+fail,async()=>{const f=fixture(fail);await assert.rejects(()=>switchMpProduction(f.steps),e=>e.productionMayBeOpen===true);assert.ok(!f.calls.includes('reverseData')&&!f.calls.includes('upRollback'));});
test('failed reversal keeps ingress closed and does not start old Core',async()=>{const f=fixture('verifyPrivate');f.steps.reverseData=async()=>{f.calls.push('reverseData');throw Error('concurrent change');};await assert.rejects(()=>switchMpProduction(f.steps),e=>e.rollbackComplete===false);assert.ok(!f.calls.includes('upRollback')&&!f.calls.includes('openRollbackIngress'));});
test('requires pinned preparation SHA and rejects missing/extra arguments',()=>{assert.equal(activationSha(['a'.repeat(64)]),'a'.repeat(64));for(const a of [[],['bad'],['a'.repeat(64),'extra']])assert.throws(()=>activationSha(a));});
test('compensation is balanced, restores original accounts to zero and rejects invalid/unbalanced input',()=>{
  const before=[{account_key:'passenger:p:wallet',direction:'credit',amount_cents:15700},{account_key:'platform:revenue',direction:'credit',amount_cents:70},{account_key:'processor:a:clearing',direction:'debit',amount_cents:15770}];
  const entries=archiveTestBalances(before),balances=new Map();for(const e of [...before,...entries])balances.set(e.account_key,(balances.get(e.account_key)??0)+(e.direction==='credit'?e.amount_cents:-e.amount_cents));
  for(const e of before)assert.equal(balances.get(e.account_key),0);assert.equal([...balances.values()].reduce((a,b)=>a+b,0),0);
  assert.throws(()=>archiveTestBalances(before.slice(1)));assert.throws(()=>archiveTestBalances([{account_key:'x',direction:'credit',amount_cents:0}]));
});
