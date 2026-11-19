import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCancellationPolicy,validateCancellationPolicy,cancellationFee,CancellationError,validateRefundPix,cancellationTerms} from '../src/rides/manual-cancellation-policy.js';
test('40 seconds: free until deadline, then passenger blocked and admin applies snapshotted fee',()=>{
 const acceptedAt='2026-10-24T01:00:00Z',rule={enabled:true,freeSeconds:40,feeCents:500};
 const input={acceptedAt,rule,paidCents:10000,passenger:true};
 assert.equal(cancellationFee({...input,now:new Date('2026-10-24T01:00:39.999Z')}),0);
 assert.throws(()=>cancellationFee({...input,now:new Date('2026-10-24T01:00:40Z')}),e=>e instanceof CancellationError&&e.code==='FREE_PERIOD_ENDED');
 assert.equal(cancellationFee({...input,passenger:false,now:new Date('2026-10-24T01:00:40Z')}),500);
 assert.equal(cancellationFee({...input,passenger:false,paidCents:300,now:new Date('2026-10-24T01:01:00Z')}),300);
 assert.equal(cancellationFee({...input,acceptedAt:null,now:new Date('2026-10-24T01:05:00Z')}),0);
 assert.equal(cancellationTerms(rule,acceptedAt,new Date(acceptedAt)).cancelUntil,'2026-10-24T01:00:40.000Z');
});
test('categories start with unconfigured disabled fees and validate strictly',()=>{
 const p=defaultCancellationPolicy();assert.equal(p.car.freeSeconds,40);assert.equal(p.car.feeCents,null);assert.equal(p.car.enabled,false);
 assert.deepEqual(validateCancellationPolicy(p),p);
 assert.throws(()=>validateCancellationPolicy({...p,car:{...p.car,enabled:true}}));
 assert.throws(()=>validateCancellationPolicy({...p,car:{...p.car,feeCents:1.5}}));
 assert.throws(()=>validateCancellationPolicy({...p,car:{...p.car,freeSeconds:-1}}));
});
test('Pix requires valid key and holder',()=>{
 assert.equal(validateRefundPix({type:'cpf',key:'52998224725',holder:'Titular de teste'}).key,'52998224725');
 for(const key of ['11111111111','52998224724'])assert.throws(()=>validateRefundPix({type:'cpf',key,holder:'Teste'}));
 assert.throws(()=>validateRefundPix({type:'email',key:'invalid',holder:'Teste'}));
});
