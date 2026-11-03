import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
process.env.WHATSAPP_OTP_ABUSE_CONTROLS = 'disabled';
const root = process.env.LOGIN_POLICY_MODULE_ROOT || resolve('backend/core/dist/src/auth');
const read = p => import(pathToFileURL(resolve(root, p)).href);
const {requestPhoneOtp,verifyPhoneOtp} = await read('phone-otp-service.js');
const {InMemoryAuthOtpRepository} = await read('repositories/in-memory-auth-otp-repository.js');
const {InMemoryAuthSessionRepository} = await read('repositories/in-memory-auth-session-repository.js');
const start = Date.parse('2026-11-03T10:00:00Z');
async function setup(role, external=false) {
 const repository = new InMemoryAuthOtpRepository();
 const sessions = new InMemoryAuthSessionRepository();
 await repository.createIdentity({id:'identity-'+role,subjectId:'subject-'+role,subjectType:role,
  phoneE164:'+5588999994321',status:'active',createdAt:new Date(start).toISOString(),updatedAt:new Date(start).toISOString()});
 repository.consumeRateLimits = async()=>{throw Error('Unexpected local login rate-limit call');};
 const sent=[];
 const delivery = {sendCode:async input=>{sent.push(input);return {reference:'upstream-'+sent.length};}};
 if(external) { delivery.externalProvider='entrar-whatsapp';delivery.verifyCode=async({code})=>code==='123456'; }
 return {repository,sessions,delivery,sent};
}
for(const role of ['driver','passenger']) {
 test(role+': repeated requests bypass frequency and cooldown',async()=>{
  const f=await setup(role,true);
  for(let i=0;i<30;i++) {
   const r=await requestPhoneOtp({...f,subjectType:role,phone:'88999994321',now:new Date(start+i)});
   assert.equal(r.retryAfterSeconds,0);
  }
  assert.equal(f.sent.length,30);
 });
 test(role+': wrong codes still fail; valid code after sixth error is single use',async()=>{
  const f=await setup(role,true);
  const r=await requestPhoneOtp({...f,subjectType:role,phone:'88999994321',now:new Date(start)});
  for(let i=0;i<7;i++) await assert.rejects(verifyPhoneOtp({...f,challengeId:r.challengeId,code:'000000',now:new Date(start+100+i)}),{code:'OTP_INVALID_OR_EXPIRED'});
  assert.equal((await verifyPhoneOtp({...f,challengeId:r.challengeId,code:'123456',now:new Date(start+200)})).subjectType,role);
  await assert.rejects(verifyPhoneOtp({...f,challengeId:r.challengeId,code:'123456',now:new Date(start+201)}),{code:'OTP_INVALID_OR_EXPIRED'});
 });
 test(role+': expired code still fails',async()=>{
  const f=await setup(role,true);
  const r=await requestPhoneOtp({...f,subjectType:role,phone:'88999994321',now:new Date(start)});
  await assert.rejects(verifyPhoneOtp({...f,challengeId:r.challengeId,code:'123456',now:new Date(start+301000)}),{code:'OTP_INVALID_OR_EXPIRED'});
 });
}

test('non-WhatsApp delivery keeps rate limits with WhatsApp controls disabled',async()=>{
 const f=await setup('passenger');
 await assert.rejects(requestPhoneOtp({...f,subjectType:'passenger',phone:'88999994321',now:new Date(start)}),/Unexpected local login rate-limit call/);
 assert.equal(f.sent.length,0);
});
