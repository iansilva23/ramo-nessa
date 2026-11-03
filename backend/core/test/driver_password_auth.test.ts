import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {InMemoryAuthOtpRepository} from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import {InMemoryAuthSessionRepository} from '../src/auth/repositories/in-memory-auth-session-repository.js';
import {InMemoryDriverPasswordAuthStore} from '../src/auth/driver-password-auth-store.js';
import {loginDriverWithPassword,enrollDriverPassword,requestDriverPasswordReset,completeDriverPasswordReset,normalizeDriverUsername,type DriverPasswordDependencies} from '../src/auth/driver-password-auth-service.js';
import {authenticateBearer} from '../src/auth/auth-service.js';
const now=new Date('2026-11-03T12:00:00Z'),password='Existing12345',replacement='Replacement98765';
async function fixture(enroll=true){
 const identities=new InMemoryAuthOtpRepository(),sessions=new InMemoryAuthSessionRepository(),store=new InMemoryDriverPasswordAuthStore(identities);
 const identity={id:randomUUID(),subjectId:'driver-'+randomUUID(),subjectType:'driver' as const,phoneE164:'+5588999994321',status:'active' as const,createdAt:now.toISOString(),updatedAt:now.toISOString()};
 await identities.createIdentity(identity);const d:DriverPasswordDependencies={identities,sessions,store,rateLimitSecret:'test-secret'};
 if(enroll)await enrollDriverPassword(d,{subjectId:identity.subjectId,username:'Ian.Driver',email:'IAN@example.com',password,now});
 const delivery={externalProvider:'entrar-whatsapp' as const,calls:0,phone:'',async sendCode(input:{phoneE164:string}){this.calls++;this.phone=input.phoneE164;return {reference:randomUUID()};},async verifyCode(input:{code:string}){return input.code==='654321';}};
 return {d,identity,delivery};
}
test('username and email recognize one driver using passenger password hashing, without OTP',async()=>{
 const {d,identity,delivery}=await fixture();
 for(const identifier of [' IAN.DRIVER ',' IAN@EXAMPLE.COM ']){const r=await loginDriverWithPassword(d,{identifier,password,now});assert.equal(r.subjectId,identity.subjectId);assert.equal(r.subjectType,'driver');}
 assert.equal(delivery.calls,0);const c=await d.store.findByIdentity(identity.id);assert.ok(c);assert.ok(c.passwordHash.startsWith('scrypt-passenger-v1$'));assert.notEqual(c.passwordHash,password);
});
test('enrollment cannot overwrite an account or claim another driver username/email',async()=>{
 const {d,identity}=await fixture();const other={...identity,id:randomUUID(),subjectId:'other-driver',phoneE164:'+5588999991234'};await d.identities.createIdentity(other);
 await assert.rejects(enrollDriverPassword(d,{subjectId:identity.subjectId,username:'different.name',email:'different@example.com',password,now}),{code:'DRIVER_CREDENTIALS_ALREADY_SET'});
 for(const [username,email] of [['IAN.DRIVER','other@example.com'],['other.driver','IAN@example.com']])await assert.rejects(enrollDriverPassword(d,{subjectId:other.subjectId,username:username!,email:email!,password,now}),{code:'DRIVER_CREDENTIALS_CONFLICT'});
 assert.equal(await d.store.findByIdentity(other.id),null);
});
test('username cannot collide with the email namespace',()=>{assert.equal(normalizeDriverUsername(' Ian.Driver '),'ian.driver');for(const s of ['ab','1driver','ian@example.com','ábc','a b','a'.repeat(33)])assert.throws(()=>normalizeDriverUsername(s),{code:'DRIVER_CREDENTIALS_INVALID'});});
test('same passenger password policy; missing and suspended accounts cannot authenticate',async()=>{
 const {d,identity}=await fixture(false);await assert.rejects(enrollDriverPassword(d,{subjectId:identity.subjectId,username:'ian.driver',email:'ian@example.com',password:'short1',now}),{code:'INVALID_PASSENGER_PASSWORD'});
 await assert.rejects(loginDriverWithPassword(d,{identifier:'missing',password,now}),{code:'DRIVER_LOGIN_INVALID'});
 await enrollDriverPassword(d,{subjectId:identity.subjectId,username:'ian.driver',email:'ian@example.com',password,now});
 await d.identities.setIdentityStatus({subjectType:'driver',subjectId:identity.subjectId,status:'suspended',updatedAt:now.toISOString()});await assert.rejects(loginDriverWithPassword(d,{identifier:'ian.driver',password,now}),{code:'DRIVER_LOGIN_INVALID'});
});
test('password attempts aggregate both aliases while extra WhatsApp limits are disabled',async()=>{
 const old=process.env.WHATSAPP_OTP_ABUSE_CONTROLS;process.env.WHATSAPP_OTP_ABUSE_CONTROLS='disabled';try{const {d}=await fixture();for(let i=0;i<6;i++)await assert.rejects(loginDriverWithPassword(d,{identifier:i%2?'ian.driver':'ian@example.com',password:'Incorrect12345',now}),{code:'DRIVER_LOGIN_INVALID'});await assert.rejects(loginDriverWithPassword(d,{identifier:'ian.driver',password,now}),{code:'DRIVER_LOGIN_RATE_LIMITED'});await loginDriverWithPassword(d,{identifier:'ian@example.com',password,now:new Date(now.getTime()+900000)});}finally{if(old===undefined)delete process.env.WHATSAPP_OTP_ABUSE_CONTROLS;else process.env.WHATSAPP_OTP_ABUSE_CONTROLS=old;}
});
test('passenger cannot enroll; a pending driver still requires admin approval for driver operations',async()=>{
 const {d,identity}=await fixture(false);await d.identities.createIdentity({...identity,id:randomUUID(),subjectId:'passenger-only',subjectType:'passenger',phoneE164:'+5588999991234'});await assert.rejects(enrollDriverPassword(d,{subjectId:'passenger-only',username:'another.name',email:'p@example.com',password,now}),{code:'DRIVER_LOGIN_INVALID'});
 const pending={...identity,id:randomUUID(),subjectId:'pending-driver',phoneE164:'+5588999996789',driverRegistrationOnly:true};await d.identities.createIdentity(pending);await enrollDriverPassword(d,{subjectId:pending.subjectId,username:'pending.driver',email:'pending@example.com',password,now});const r=await loginDriverWithPassword(d,{identifier:'pending.driver',password,now});await assert.rejects(authenticateBearer({repository:d.sessions,identities:d.identities,headers:{authorization:'Bearer '+r.accessToken},requiredType:'driver',now}),{code:'DRIVER_REGISTRATION_PENDING'});
});
test('recovery uses registered WhatsApp and gives an opaque response for missing accounts',async()=>{
 const {d,identity,delivery}=await fixture();const missing=await requestDriverPasswordReset(d,{identifier:'missing@example.com',delivery,now});assert.equal(delivery.calls,0);assert.equal(await d.store.findResetRequest(missing.challengeId),null);const r=await requestDriverPasswordReset(d,{identifier:'ian.driver',delivery,now});assert.equal(delivery.phone,identity.phoneE164);assert.equal(delivery.calls,1);assert.ok(await d.store.findResetRequest(r.challengeId));
});
test('correct OTP resets password, revokes old sessions and is single-use; wrong codes fail',async()=>{
 const {d,delivery}=await fixture();const old=await loginDriverWithPassword(d,{identifier:'ian.driver',password,now}),r=await requestDriverPasswordReset(d,{identifier:'ian.driver',delivery,now});await assert.rejects(completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'000000',password:replacement,delivery,now}),{code:'OTP_INVALID_OR_EXPIRED'});const fresh=await completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'654321',password:replacement,delivery,now});await assert.rejects(authenticateBearer({repository:d.sessions,headers:{authorization:'Bearer '+old.accessToken},now}),{code:'AUTH_INVALID'});await authenticateBearer({repository:d.sessions,headers:{authorization:'Bearer '+fresh.accessToken},requiredType:'driver',now});await assert.rejects(loginDriverWithPassword(d,{identifier:'ian.driver',password,now}),{code:'DRIVER_LOGIN_INVALID'});await loginDriverWithPassword(d,{identifier:'ian@example.com',password:replacement,now});await assert.rejects(completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'654321',password,delivery,now}),{code:'DRIVER_RESET_INVALID'});
});
test('weak replacement does not consume OTP and expiry preserves original password',async()=>{
 const {d,delivery}=await fixture();const r=await requestDriverPasswordReset(d,{identifier:'ian.driver',delivery,now});await assert.rejects(completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'654321',password:'short1',delivery,now}),{code:'INVALID_PASSENGER_PASSWORD'});assert.equal((await d.identities.findChallengeById(r.challengeId))?.consumedAt,undefined);await assert.rejects(completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'654321',password:replacement,delivery,now:new Date(now.getTime()+300001)}),{code:'DRIVER_RESET_INVALID'});await loginDriverWithPassword(d,{identifier:'ian.driver',password,now});
});
test('OTP belonging to a different account cannot authorize reset',async()=>{
 const {d,identity,delivery}=await fixture();const r=await requestDriverPasswordReset(d,{identifier:'ian.driver',delivery,now}),challenge=await d.identities.findChallengeById(r.challengeId);assert.ok(challenge);const passenger={...identity,id:randomUUID(),subjectId:'passenger',subjectType:'passenger' as const,phoneE164:'+5588999991234'};await d.identities.createIdentity(passenger);await d.identities.createChallenge({...challenge,identityId:passenger.id});await assert.rejects(completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'654321',password:replacement,delivery,now}),{code:'DRIVER_RESET_INVALID'});
});
test('two concurrent completions consume the same reset only once',async()=>{
 const {d,delivery}=await fixture();const r=await requestDriverPasswordReset(d,{identifier:'ian.driver',delivery,now});const outcomes=await Promise.allSettled([1,2].map(()=>completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'654321',password:replacement,delivery,now})));assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
});
test('upstream delivery failure preserves the password',async()=>{const {d}=await fixture();await assert.rejects(requestDriverPasswordReset(d,{identifier:'ian.driver',delivery:{externalProvider:'entrar-whatsapp',sendCode:async()=>{throw Error('unavailable');}},now}),{code:'OTP_DELIVERY_FAILED'});await loginDriverWithPassword(d,{identifier:'ian.driver',password,now});});
