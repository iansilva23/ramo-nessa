import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';

test('real Core HTTP: password registration, cookies, role boundaries and removed endpoints', {timeout:60000}, async()=>{
 const reservation=createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as {port:number}).port;await new Promise<void>((r,j)=>reservation.close(e=>e?j(e):r()));
 const secret='synthetic-password-only-secret-0123456789abcdef',key=Buffer.alloc(32,19).toString('base64');
 const child=spawn(process.execPath,['dist/src/server.js'],{env:{...process.env,NODE_ENV:'test',PORT:String(port),AUTH_PASSWORD_RATE_LIMIT_SECRET:secret,ADMIN_LOGIN_RATE_LIMIT_SECRET:secret,ADMIN_MFA_ENCRYPTION_KEY:key,DOCUMENT_INSPECTION_ENCRYPTION_KEY:key,PLACE_PROOF_SECRET:secret,PUSH_PROVIDER:'disabled',GEO_STORAGE_AUTOMATION_ENABLED:'false',DOCUMENT_STORAGE_LOCAL_DIR:'/tmp/ramo-password-http-'+port,SHUTDOWN_TIMEOUT_MS:'1000'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);
 const base='http://127.0.0.1:'+port,subjects:string[]=[];
 const post=(path:string,body:unknown,headers:Record<string,string>={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
 try{
  let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('Core failed to start: '+logs.slice(-2500));try{const r=await fetch(base+'/ready',{signal:AbortSignal.timeout(200)});await r.body?.cancel();if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true,logs.slice(-2000));
  const suffix=randomUUID().replaceAll('-','').slice(0,10),password='StrongPassword123';
  const passenger={fullName:'Passageiro Teste',phone:'889'+String(Math.floor(10000000+Math.random()*89999999)),email:suffix+'@example.test',password};
  let r=await post('/v1/auth/passenger/password/register',passenger);assert.equal(r.status,201,await r.clone().text());const p=await r.json() as {subjectId:string;accessToken:string};subjects.push(p.subjectId);
  r=await post('/v1/auth/passenger/password/register',{...passenger,email:'other-'+passenger.email});assert.equal(r.status,409);await r.body?.cancel();
  r=await post('/v1/auth/passenger/password/login',{email:passenger.email,password},{'x-ramo-web-role':'passenger',origin:'https://127.0.0.1:'+port,'sec-fetch-site':'same-origin'});assert.equal(r.status,201,await r.clone().text());assert.match(r.headers.get('set-cookie')??'',/HttpOnly; Secure; SameSite=Strict/);assert.match((await r.json() as {accessToken:string}).accessToken,/^ramo_web_passenger_v1_/);
  const driver={...passenger,phone:'889'+String(Math.floor(10000000+Math.random()*89999999)),email:'d-'+passenger.email,username:'driver'+suffix};
  r=await post('/v1/auth/driver/password/register',driver);assert.equal(r.status,201,await r.clone().text());const d=await r.json() as {subjectId:string;accessToken:string};subjects.push(d.subjectId);
  for(const identifier of [driver.username,driver.email]){r=await post('/v1/auth/driver/password/login',{identifier,password});assert.equal(r.status,201);assert.equal((await r.json() as {subjectId:string}).subjectId,d.subjectId);}
  r=await fetch(base+'/v1/driver/me/login-credentials',{headers:{authorization:'Bearer '+p.accessToken}});assert.equal(r.status,401);await r.body?.cancel();
  r=await fetch(base+'/v1/driver/me/offer',{headers:{authorization:'Bearer '+d.accessToken}});assert.equal(r.status,403);await r.body?.cancel();
  for(const path of ['/v1/auth/otp/request','/v1/auth/otp/verify','/v1/auth/driver-registration/request','/v1/auth/passenger/password/reset/request','/v1/auth/driver/password/reset/request','/v1/auth/driver/password/reset/complete','/v1/auth/driver/password/reset/save']){r=await post(path,{});assert.equal(r.status,404,path);await r.body?.cancel();}
 }finally{
  if(child.exitCode===null)await new Promise<void>(resolve=>{const timeout=setTimeout(()=>child.kill('SIGKILL'),4000);child.once('exit',()=>{clearTimeout(timeout);resolve();});child.kill('SIGTERM');});
  if(process.env.DATABASE_URL){const pool=createPostgresPool(process.env.DATABASE_URL);try{await pool.query('DELETE FROM auth_sessions WHERE subject_id=ANY($1::text[])',[subjects]);await pool.query('DELETE FROM auth_identities WHERE subject_id=ANY($1::text[])',[subjects]);}finally{await pool.end();}}
 }
});
