import assert from 'node:assert/strict';
import test from 'node:test';
import {moneyInputCents,overlappingRegions,formatRate,nextTabIndex} from '../src/regions-pricing-model.js';
import {createAdminApi} from '../src/api.js';
test('currency input uses exact decimal cents and rejects malformed/free prices',()=>{
  assert.equal(moneyInputCents('12,34'),1234);assert.equal(moneyInputCents('0.05'),5);
  assert.equal(moneyInputCents('',{optional:true}),null);
  for(const value of ['','1.005','-1','NaN','Infinity','1e3','1000001'])assert.throws(()=>moneyInputCents(value));
});
test('overlap detection excludes itself, disabled regions and archived regions',()=>{
  const r={id:'one',latitude:-2.82,longitude:-40.41,radiusKm:1,enabled:true,archived:false};
  assert.deepEqual(overlappingRegions(r,[r,{...r,id:'two'},{...r,id:'off',enabled:false},{...r,id:'old',archived:true}]).map(r=>r.id),['two']);
});
test('missing night tariff displays unavailability; fixed and km are distinct',()=>{
  assert.equal(formatRate({kind:'fixed',day:{amountCents:2500,minimumCents:0}},'night'),'Indisponível');
  assert.match(formatRate({kind:'distance',day:{amountCents:250,minimumCents:1000}},'day'),/km/);
});
test('keyboard navigation wraps and supports Home/End',()=>{
  assert.equal(nextTabIndex(0,'ArrowLeft',4),3);assert.equal(nextTabIndex(3,'ArrowRight',4),0);
  assert.equal(nextTabIndex(2,'Home',4),0);assert.equal(nextTabIndex(1,'End',4),3);
});
test('management mutation keeps credentials in body and Bearer in header, never URL',async()=>{
  const calls=[],api=createAdminApi(async(url,options)=>{calls.push({url,options});return{ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({prepared:true})};});
  await api.savePricingManagement('private-session',{requestId:'id',expectedRevision:'old',mutation:{kind:'rate.archive',id:'rate'},confirmation:{password:'not-real-password',totpCode:'123456'}});
  assert.equal(calls[0].url,'/v1/admin/pricing/management');assert.equal(calls[0].options.method,'PUT');
  assert.equal(calls[0].options.headers.authorization,'Bearer private-session');
  assert.ok(!calls[0].url.includes('private-session'));assert.ok(!calls[0].url.includes('123456'));
  assert.equal(calls[0].options.cache,'no-store');
});
