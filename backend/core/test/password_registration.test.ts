import assert from 'node:assert/strict';
import test from 'node:test';
import {createRepositories} from '../src/db/repositories.js';
import {registerPasswordAccount} from '../src/auth/password-registration.js';
import {loginDriverWithPassword} from '../src/auth/driver-password-auth-service.js';
import {loginPassengerWithPassword} from '../src/auth/passenger-password-auth-service.js';
import {authenticateBearer} from '../src/auth/auth-service.js';
const now=new Date(),password='StrongExample123';
function fixture(){const r=createRepositories();return {r,d:{identities:r.authIdentityRepository,sessions:r.authSessionRepository,store:r.passwordRegistrationStore,rateLimitSecret:'local-password-registration-test-secret'}};}
test('new passenger registers with a password, without delivery; duplicate phone cannot claim identity',async()=>{
 const {r,d}=fixture();try{
 const input={role:'passenger' as const,phone:'88999994321',email:'new@example.test',fullName:'Novo Passageiro',password,now};
 const a=await registerPasswordAccount(d,input);
 await assert.rejects(registerPasswordAccount(d,{...input,email:'attacker@example.test'}),{code:'ACCOUNT_ALREADY_EXISTS'});
 const i=await r.authIdentityRepository.findIdentityBySubject('passenger',a.subjectId);assert.ok(i?.passwordHash);assert.notEqual(i.passwordHash,password);assert.equal(i.emailNormalized,input.email);
 const session=await loginPassengerWithPassword({identities:r.authIdentityRepository,sessions:r.authSessionRepository,email:input.email,password,rateLimitSecret:d.rateLimitSecret,now});assert.equal(session.subjectId,a.subjectId);
 }finally{await r.close();}
});
test('driver partner registration uses both aliases; pending driver cannot operate; duplicate aliases roll back',async()=>{
 const {r,d}=fixture();try{
 const input={role:'driver' as const,username:'partner.name',phone:'88999994322',email:'partner@example.test',fullName:'Motorista Parceiro',password,now};
 const a=await registerPasswordAccount(d,input);
 for(const identifier of [input.username,input.email]){
 const session=await loginDriverWithPassword({identities:r.authIdentityRepository,sessions:r.authSessionRepository,store:r.driverPasswordAuthStore,rateLimitSecret:d.rateLimitSecret},{identifier,password,now});assert.equal(session.subjectId,a.subjectId);
 await assert.rejects(authenticateBearer({repository:r.authSessionRepository,identities:r.authIdentityRepository,headers:{authorization:'Bearer '+session.accessToken},requiredType:'driver',now}),{code:'DRIVER_REGISTRATION_PENDING'});
 }
 const duplicate={...input,phone:'88999994323',email:'other@example.test'};
 await assert.rejects(registerPasswordAccount(d,duplicate));
 assert.equal(await r.authIdentityRepository.findIdentityByPhone('driver','+5588999994323'),null);
 }finally{await r.close();}
});
test('concurrent same-contact registrations create only one account',async()=>{
 const {r,d}=fixture();try{
 const input={role:'passenger' as const,phone:'88999994324',email:'concurrent@example.test',fullName:'Conta Concorrente',password,now};
 const results=await Promise.allSettled([1,2].map(()=>registerPasswordAccount(d,input)));
 assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(results.filter(v=>v.status==='rejected').length,1);
 }finally{await r.close();}
});
