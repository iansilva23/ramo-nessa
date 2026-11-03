import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {InMemoryAuthIdentityRepository} from '../src/auth/repositories/in-memory-auth-identity-repository.js';
import {InMemoryAuthSessionRepository} from '../src/auth/repositories/in-memory-auth-session-repository.js';
import {InMemoryDriverPasswordAuthStore} from '../src/auth/driver-password-auth-store.js';
import {loginDriverWithPassword,enrollDriverPassword,normalizeDriverUsername,type DriverPasswordDependencies} from '../src/auth/driver-password-auth-service.js';
import {authenticateBearer} from '../src/auth/auth-service.js';
const now=new Date('2026-11-03T12:00:00Z'),password='Existing12345',replacement='Replacement98765';
async function fixture(enroll=true){
 const identities=new InMemoryAuthIdentityRepository(),sessions=new InMemoryAuthSessionRepository(),store=new InMemoryDriverPasswordAuthStore(identities);
 const identity={id:randomUUID(),subjectId:'driver-'+randomUUID(),subjectType:'driver' as const,phoneE164:'+5588999994321',status:'active' as const,createdAt:now.toISOString(),updatedAt:now.toISOString()};
 await identities.createIdentity(identity);const d:DriverPasswordDependencies={identities,sessions,store,rateLimitSecret:'test-secret'};
 if(enroll)await enrollDriverPassword(d,{subjectId:identity.subjectId,username:'Ian.Driver',email:'IAN@example.com',password,now});
 return {d,identity};
}
test('username and email recognize one driver using passenger password hashing, without OTP',async()=>{
 const {d,identity}=await fixture();
 for(const identifier of [' IAN.DRIVER ',' IAN@EXAMPLE.COM ']){const r=await loginDriverWithPassword(d,{identifier,password,now});assert.equal(r.subjectId,identity.subjectId);assert.equal(r.subjectType,'driver');}
 const c=await d.store.findByIdentity(identity.id);assert.ok(c);assert.ok(c.passwordHash.startsWith('scrypt-passenger-v1$'));assert.notEqual(c.passwordHash,password);
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
test('password attempts aggregate both aliases',async()=>{
 const {d}=await fixture();for(let i=0;i<6;i++)await assert.rejects(loginDriverWithPassword(d,{identifier:i%2?'ian.driver':'ian@example.com',password:'Incorrect12345',now}),{code:'DRIVER_LOGIN_INVALID'});
 await assert.rejects(loginDriverWithPassword(d,{identifier:'ian.driver',password,now}),{code:'DRIVER_LOGIN_RATE_LIMITED'});
 await loginDriverWithPassword(d,{identifier:'ian@example.com',password,now:new Date(now.getTime()+900000)});
});
test('passenger cannot enroll; a pending driver still requires admin approval for driver operations',async()=>{
 const {d,identity}=await fixture(false);await d.identities.createIdentity({...identity,id:randomUUID(),subjectId:'passenger-only',subjectType:'passenger',phoneE164:'+5588999991234'});await assert.rejects(enrollDriverPassword(d,{subjectId:'passenger-only',username:'another.name',email:'p@example.com',password,now}),{code:'DRIVER_LOGIN_INVALID'});
 const pending={...identity,id:randomUUID(),subjectId:'pending-driver',phoneE164:'+5588999996789',driverRegistrationOnly:true};await d.identities.createIdentity(pending);await enrollDriverPassword(d,{subjectId:pending.subjectId,username:'pending.driver',email:'pending@example.com',password,now});const r=await loginDriverWithPassword(d,{identifier:'pending.driver',password,now});await assert.rejects(authenticateBearer({repository:d.sessions,identities:d.identities,headers:{authorization:'Bearer '+r.accessToken},requiredType:'driver',now}),{code:'DRIVER_REGISTRATION_PENDING'});
});
