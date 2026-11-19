import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,access} from 'node:fs/promises';
import {InMemoryAuthIdentityRepository} from '../src/auth/repositories/in-memory-auth-identity-repository.js';
test('retired phone authentication has no routes, provider, challenge methods or app screens',async()=>{
 const server=await readFile(new URL('../src/server.ts',import.meta.url),'utf8');
 for(const route of ['/v1/auth/otp/','/password/reset/','/v1/auth/driver-registration/request'])assert.equal(server.includes(route),false);
 for(const name of ['phone-otp-service.ts','otp-delivery-provider.ts','entrar-whatsapp-otp-provider.ts'])await assert.rejects(access(new URL('../src/auth/'+name,import.meta.url)));
 assert.equal('createChallenge' in new InMemoryAuthIdentityRepository(),false);
 for(const role of ['driver','passenger']){
  await assert.rejects(access(new URL('../../../apps/'+role+'/lib/src/core/auth/phone_login_screen.dart',import.meta.url)));
  const service=await readFile(new URL('../../../apps/'+role+'/lib/src/core/auth/password_auth_service.dart',import.meta.url),'utf8');
  assert.equal(/RequestedOtp|requestOtp|verifyOtp|PasswordReset/.test(service),false);
 }
});
