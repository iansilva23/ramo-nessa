import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {openSync,closeSync,readFileSync} from 'node:fs';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
import {PostgresAuthOtpRepository} from '/app/dist/src/auth/repositories/postgres-auth-otp-repository.js';
import {PostgresAuthSessionRepository} from '/app/dist/src/auth/repositories/postgres-auth-session-repository.js';
import {issueAuthSession} from '/app/dist/src/auth/auth-service.js';
test('exact candidate HTTP: native login, Web cookie, role isolation, enrollment and restart',async()=>{
 assert.equal(new URL(process.env.DATABASE_URL).hostname,'test-pg');
 const pool=createPostgresPool(process.env.DATABASE_URL),identities=new PostgresAuthOtpRepository(pool),sessions=new PostgresAuthSessionRepository(pool);
 const id=randomUUID(),subject='driver-http-'+randomUUID(),username='http'+randomUUID().replaceAll('-','').slice(0,12),email=username+'@example.test',password='SyntheticPassword123';
 const now=new Date().toISOString();
 await identities.createIdentity({id,subjectId:subject,subjectType:'driver',phoneE164:'+5588999999876',status:'active',createdAt:now,updatedAt:now});
 const verified=await issueAuthSession({repository:sessions,subjectId:subject,subjectType:'driver'});
 const passenger=await issueAuthSession({repository:sessions,subjectId:'passenger-isolated',subjectType:'passenger'});
 const base='http://127.0.0.1:18912',log='/tmp/driver-password-http.log';let child;
 async function stop(){if(!child||child.exitCode!=null)return;const c=child;await new Promise(r=>{const t=setTimeout(()=>c.kill('SIGKILL'),4000);c.once('exit',()=>{clearTimeout(t);r();});c.kill('SIGTERM');});}
 async function start(){
  const secret='synthetic-test-only-0123456789abcdef0123456789abcdef',fd=openSync(log,'a',0o600);
  child=spawn(process.execPath,['/app/dist/src/server.js'],{env:{...process.env,NODE_ENV:'test',PORT:'18912',ALLOW_DEV_IDENTITY:'false',ALLOW_DEV_OTP:'true',OTP_PROVIDER:'dev',OTP_HASH_SECRET:secret,OTP_RATE_LIMIT_SECRET:secret,PLACE_PROOF_SECRET:secret,ADMIN_LOGIN_RATE_LIMIT_SECRET:secret,ADMIN_MFA_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64'),DOCUMENT_INSPECTION_ENCRYPTION_KEY:Buffer.alloc(32,34).toString('base64'),DOCUMENT_STORAGE_LOCAL_DIR:'/tmp/driver-login-docs',PUSH_PROVIDER:'disabled',GEO_STORAGE_AUTOMATION_ENABLED:'false',DB_POOL_MAX:'2',SHUTDOWN_TIMEOUT_MS:'2000'},stdio:['ignore',fd,fd]});closeSync(fd);
  for(let i=0;i<100;i++){
   if(child.exitCode!=null)throw Error('Candidate startup failed: '+readFileSync(log,'utf8').slice(-3000));
   try{const r=await fetch(base+'/ready',{signal:AbortSignal.timeout(400)});await r.body?.cancel();if(r.ok)return;}catch{}
   await new Promise(r=>setTimeout(r,100));
  }throw Error('HTTP candidate not ready');
 }
 async function request(path,body,headers={}){return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});}
 try{
  await start();
  let r=await request('/v1/driver/me/login-credentials');assert.equal(r.status,401);await r.body?.cancel();
  r=await request('/v1/driver/me/login-credentials',undefined,{authorization:'Bearer '+passenger.token});assert.equal(r.status,401);assert.equal((await r.json()).error,'AUTH_ROLE_MISMATCH');
  r=await request('/v1/driver/me/login-credentials',{username,email,password},{authorization:'Bearer '+verified.token});assert.equal(r.status,201);assert.equal((await r.json()).configured,true);
  for(const identifier of [username,email.toUpperCase()]){r=await request('/v1/auth/driver/password/login',{identifier,password});assert.equal(r.status,201);const data=await r.json();assert.equal(data.subjectId,subject);assert.ok(data.accessToken);}
  r=await request('/v1/auth/driver/password/login',{identifier:username,password:'WrongPassword123'});assert.equal(r.status,401);assert.equal((await r.json()).error,'DRIVER_LOGIN_INVALID');
  r=await request('/v1/auth/driver/password/login',{identifier:username,password},{host:'app.ramonessa.com.br',origin:'https://app.ramonessa.com.br','sec-fetch-site':'same-origin','x-ramo-web-role':'driver'});
  assert.equal(r.status,201);const cookie=r.headers.get('set-cookie');assert.match(cookie,/__Host-ramo_driver=/);assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);const data=await r.json();assert.match(data.accessToken,/^ramo_web_driver_v1_[a-f0-9]{32}$/);assert.ok(!cookie.includes(data.accessToken));
  r=await request('/v1/driver/me/login-credentials',undefined,{host:'app.ramonessa.com.br','sec-fetch-site':'same-origin','x-ramo-web-role':'driver',authorization:'Bearer '+data.accessToken,cookie:cookie.split(';')[0]});assert.equal(r.status,200);assert.equal((await r.json()).username,username);
  r=await request('/v1/auth/driver/password/login',{identifier:username,password},{host:'app.ramonessa.com.br',origin:'https://evil.example','sec-fetch-site':'cross-site','x-ramo-web-role':'driver'});assert.equal(r.status,403);await r.body?.cancel();
  // Password login must not create or request a WhatsApp challenge.
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_otp_challenges WHERE identity_id=$1',[id])).rows[0].n,0);
  await stop();await start();
  r=await request('/v1/auth/driver/password/login',{identifier:username,password});assert.equal(r.status,201);assert.equal((await r.json()).subjectId,subject);
 }finally{await stop();await pool.query('DELETE FROM auth_sessions WHERE subject_id=ANY($1::text[])',[[subject,'passenger-isolated']]);await pool.query('DELETE FROM auth_identities WHERE id=$1',[id]);await pool.end();}
});
