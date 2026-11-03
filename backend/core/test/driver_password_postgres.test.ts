import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,randomInt} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresAuthOtpRepository} from '../src/auth/repositories/postgres-auth-otp-repository.js';
import {PostgresAuthSessionRepository} from '../src/auth/repositories/postgres-auth-session-repository.js';
import {PostgresDriverPasswordAuthStore} from '../src/auth/driver-password-auth-store.js';
import {enrollDriverPassword,loginDriverWithPassword,requestDriverPasswordReset,completeDriverPasswordReset} from '../src/auth/driver-password-auth-service.js';
import {authenticateBearer} from '../src/auth/auth-service.js';
import {hashPassengerPassword} from '../src/auth/passenger-password-auth-service.js';
const url=process.env.DATABASE_URL;
test('PostgreSQL: credentials, concurrent uniqueness, atomic reset and stale-session rejection', {skip:!url}, async()=>{
 const pool=createPostgresPool(url!),identities=new PostgresAuthOtpRepository(pool),sessions=new PostgresAuthSessionRepository(pool),store=new PostgresDriverPasswordAuthStore(pool);
 const d={identities,sessions,store,rateLimitSecret:'isolated-test-secret'},ids:string[]=[],subjects:string[]=[],now=new Date();
 const name='driver'+randomUUID().replaceAll('-','').slice(0,12),email=name+'@example.test',password='ExistingPassword123',newPassword='NewPassword456';
 try{
  for(let n=0;n<2;n++){const id=randomUUID(),subject='driver-login-'+randomUUID();ids.push(id);subjects.push(subject);await identities.createIdentity({id,subjectId:subject,subjectType:'driver',phoneE164:'+55889'+String(randomInt(10000000,99999999)),status:'active',createdAt:now.toISOString(),updatedAt:now.toISOString()});}
  const concurrent=await Promise.allSettled(subjects.map(subjectId=>enrollDriverPassword(d,{subjectId,username:name,email,password,now})));
  assert.equal(concurrent.filter(v=>v.status==='fulfilled').length,1);assert.equal(concurrent.filter(v=>v.status==='rejected').length,1);
  const credential=await store.findByIdentifier(name);assert.ok(credential);assert.notEqual(credential.passwordHash,password);
  const old=await loginDriverWithPassword(d,{identifier:email.toUpperCase(),password,now});const identity=await identities.findIdentityById(credential.identityId);assert.ok(identity);assert.equal(old.subjectId,identity.subjectId);
  const delivery={externalProvider:'entrar-whatsapp' as const,async sendCode(){return{reference:randomUUID()};},async verifyCode(input:{code:string}){return input.code==='123456';}};
  const r=await requestDriverPasswordReset(d,{identifier:name,delivery,now});
  const done=await Promise.allSettled([1,2].map(()=>completeDriverPasswordReset(d,{challengeId:r.challengeId,code:'123456',password:newPassword,delivery,now})));
  assert.equal(done.filter(v=>v.status==='fulfilled').length,1);
  await assert.rejects(authenticateBearer({repository:sessions,headers:{authorization:'Bearer '+old.accessToken},now}),{code:'AUTH_INVALID'});
  await assert.rejects(loginDriverWithPassword(d,{identifier:name,password,now}),{code:'DRIVER_LOGIN_INVALID'});
  const fresh=await loginDriverWithPassword(d,{identifier:name,password:newPassword,now});
  const staleSession={id:randomUUID(),subjectId:identity.subjectId,subjectType:'driver' as const,tokenHash:randomUUID(),createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+60000).toISOString()};
  assert.equal(await store.saveLoginSession(credential,staleSession,sessions),false);
  assert.equal((await pool.query('SELECT id FROM auth_sessions WHERE id=$1',[staleSession.id])).rowCount,0);
  // Force a DB failure after mutation steps: the transaction must restore both credentials and sessions.
  const r2=await requestDriverPasswordReset(d,{identifier:name,delivery,now:new Date(now.getTime()+61000)});const saved=await store.findResetRequest(r2.challengeId);assert.ok(saved);
  const freshSession=await authenticateBearer({repository:sessions,headers:{authorization:'Bearer '+fresh.accessToken},now});
  await assert.rejects(store.completeReset(saved,await hashPassengerPassword('ShouldNotPersist123'),freshSession,sessions,now.toISOString()));
  assert.equal((await store.findResetRequest(r2.challengeId))?.consumedAt,undefined);
  await authenticateBearer({repository:sessions,headers:{authorization:'Bearer '+fresh.accessToken},now});
  await loginDriverWithPassword(d,{identifier:name,password:newPassword,now});
 }finally{
  await pool.query('DELETE FROM auth_sessions WHERE subject_id=ANY($1::text[])',[subjects]);await pool.query('DELETE FROM auth_identities WHERE id=ANY($1::uuid[])',[ids]);await pool.end();
 }
});
