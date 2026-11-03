// Actual Core process and HTTP routing against a disposable PostgreSQL schema.
// No VPS, provider key, payment, driver notification or real database is used.
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresAdminRepository} from '../src/admin/repositories/postgres-admin-repository.js';
import {PostgresAdminHumanAuthRepository} from '../src/admin/repositories/postgres-admin-human-auth-repository.js';
import {PostgresPricingCatalogVersionRepository} from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import {issueAuthSession} from '../src/auth/auth-service.js';
import {PostgresAuthSessionRepository} from '../src/auth/repositories/postgres-auth-session-repository.js';
import {PostgresAuthOtpRepository} from '../src/auth/repositories/postgres-auth-otp-repository.js';
import {pricingPeriodAt} from '../src/pricing/period.js';
import {createAdminHumanUser} from '../src/admin/admin-human-auth-service.js';
import {totpCodeAt} from '../src/admin/admin-human-crypto.js';
import {STATIC_PRICING_CATALOG_V1} from '../src/pricing/catalog-snapshot.js';
import {prepareThreeRegionCatalog} from '../src/pricing/management-service.js';

const disposable='postgresql://ramo_ci:ramo_ci_ephemeral_only@127.0.0.1:5432/ramo_v5_ci';
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_V5_EPHEMERAL_PG==='true'&&process.env.DATABASE_URL===disposable;
const key=Buffer.alloc(32,29),secret='isolated-managed-http-login-rate-limit-secret';
const origin='http://127.0.0.1:18766',path='/v1/admin/pricing/management';
test('actual Core HTTP/PostgreSQL: login, direct saves, public policy, sensitive MFA, two writers, simulation and safe archive',{skip:!enabled,timeout:90000},async()=>{
  const schema='managed_http_'+randomUUID().replaceAll('-',''),root=createPostgresPool(disposable);
  const database=new URL(disposable);database.searchParams.set('options','-c search_path='+schema+',public');
  const pool=createPostgresPool(database.toString()),admin=new PostgresAdminRepository(pool),humans=new PostgresAdminHumanAuthRepository(pool);
  const versions=new PostgresPricingCatalogVersionRepository(pool),users:string[]=[];
  let server:ReturnType<typeof spawn>|undefined;
  const request=async(method:string,endpoint:string,token?:string,body?:unknown)=>{
    const response=await fetch(origin+endpoint,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(8000)});
    return {status:response.status,body:await response.json() as Record<string,any>};
  };
  try{
    await root.query('CREATE SCHEMA '+schema);
    for(const table of ['pricing_catalog_versions','admin_audit_log','admin_users','admin_sessions','admin_login_rate_limits','auth_sessions','auth_identities'])
      await root.query('CREATE TABLE '+schema+'.'+table+' (LIKE public.'+table+' INCLUDING ALL)');
    const accounts=[];
    for(const [i,scopes]of [['writer',['pricing:read','pricing:write']],['other',['pricing:read','pricing:write']],['reader',['pricing:read']]] as const){
      const user=await createAdminHumanUser({repository:humans,name:'HTTP '+i,email:i+'-'+randomUUID()+'@example.invalid',scopes:[...scopes],encryptionKey:key});
      users.push(user.user.id);accounts.push(user);
    }
    const [writer,other,reader]=accounts;
    assert.ok(writer&&other&&reader);
    const id=randomUUID(),instant=new Date(Date.now()-1000).toISOString(),actor={kind:'user' as const,id:writer.user.id,name:writer.user.name};
    assert.ok(await versions.commitDirect!({admin,expectedEffectiveId:null,
      record:{id,status:'published',snapshot:prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),createdBy:actor,publishedBy:actor,createdAt:instant,updatedAt:instant,publishedAt:instant,effectiveFrom:instant},
      audit:{id:randomUUID(),actor,action:'test.managed_http.seed',targetType:'pricing_catalog_version',targetId:id,metadata:{},createdAt:instant}}));
    const logs:string[]=[];
    server=spawn(process.execPath,['--import','tsx','src/server.ts'],{cwd:fileURLToPath(new URL('../',import.meta.url)),
      env:{...process.env,DATABASE_URL:database.toString(),PORT:'18766',NODE_ENV:'test',ROUTING_PROVIDER:'google',
        GOOGLE_MAPS_SERVER_API_KEY:'',GOOGLE_PLACES_API_KEY:'',MERCADO_PAGO_MODE:'disabled',
        GEO_CATALOG_SEARCH_ENABLED:'false',GEO_PASSENGER_LEARNING_ENABLED:'false',GEO_STORAGE_AUTOMATION_ENABLED:'false',
        ADMIN_MFA_ENCRYPTION_KEY:key.toString('base64'),ADMIN_LOGIN_RATE_LIMIT_SECRET:secret},
      stdio:['ignore','pipe','pipe']});
    const collect=(b:Buffer)=>{if(logs.join('').length<16000)logs.push(b.toString());};
    server.stdout?.on('data',collect);server.stderr?.on('data',collect);
    let ready=false;
    for(let i=0;i<100;i++){
      if(server.exitCode!==null)throw Error('Isolated Core exited: '+logs.join('').slice(-4000));
      try{if((await request('GET','/ready')).status===200){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,'Isolated Core readiness');
    assert.equal((await request('GET',path)).status,401);
    const login=async(account:typeof writer)=>{
      const response=await request('POST','/v1/admin/auth/login',undefined,{email:account.user.emailNormalized,password:account.initialPassword,
        totpCode:totpCodeAt(account.totpSecretBase32,new Date())});
      assert.equal(response.status,200);assert.equal(typeof response.body.accessToken,'string');return response.body.accessToken as string;
    };
    const writerToken=await login(writer),otherToken=await login(other),readerToken=await login(reader);
    const initial=await request('GET',path,readerToken);assert.equal(initial.status,200);
    assert.equal(initial.body.operations.regions.length,3);assert.equal(initial.body.operations.rates.length,0);
    assert.deepEqual((await request('GET','/v1/pricing/policy')).body.enabledCategories,[]);
    const region=initial.body.operations.regions.find((r:{id:string})=>r.id==='prea');
    const edit={requestId:randomUUID(),expectedRevision:initial.body.revision,mutation:{kind:'region.save',region:{...region,name:'Preá · teste isolado'}}};
    assert.equal((await request('PUT',path,readerToken,edit)).status,403);
    assert.equal((await request('PUT',path,writerToken,edit)).status,428);
    assert.equal((await request('GET',path,writerToken)).body.revision,initial.body.revision);
    const invalid=await request('PUT',path,writerToken,{...edit,confirmation:{password:'incorrect-password-long',totpCode:'000000'}});
    assert.equal(invalid.status,401);
    const updated=await request('PUT',path,writerToken,{...edit,confirmation:{password:writer.initialPassword,
      totpCode:totpCodeAt(writer.totpSecretBase32,new Date(Date.now()+30000))}});
    assert.equal(updated.status,200);
    const replay=await request('PUT',path,writerToken,edit);assert.equal(replay.status,200);
    assert.equal(replay.body.savedVersionId,edit.requestId);
    const rate=(id:string)=>({id,name:'Tarifa sintética HTTP',kind:'fixed',originRegionId:'prea',destinationRegionId:'prea',
      bidirectional:true,categoryId:'moto',enabled:true,archived:false,day:{amountCents:2500,minimumCents:0},
      night:null,includedPassengers:1,perExtraPassengerCents:0,extras:[]});
    const requests=[writerToken,otherToken].map((token,i)=>request('PUT',path,token,{requestId:randomUUID(),expectedRevision:updated.body.revision,
      mutation:{kind:'rate.save',rate:rate('http-rate-'+i)}}));
    const raced=await Promise.all(requests);
    assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);
    const saved=raced.find(r=>r.status===200)!;
    assert.equal(saved.body.operations.rates.length,1);
    const rule=saved.body.operations.rates[0];
    assert.deepEqual((await request('GET','/v1/pricing/policy')).body.enabledCategories,['moto']);
    const quote={origin:{zoneId:'prea',localityId:'prea'},destination:{zoneId:'prea',localityId:'prea'},category:'moto',period:'day',
      passengers:1,pickup:{latitude:region.latitude,longitude:region.longitude},dropoff:{latitude:region.latitude,longitude:region.longitude}};
    // NODE_ENV=test intentionally refuses missing development identity with 503.
    // An explicit invalid passenger session must be rejected with 401.
    const anonymous=await request('POST','/v1/pricing/quote',undefined,quote);
    assert.equal(anonymous.status,503);assert.equal(anonymous.body.error,'AUTH_NOT_CONFIGURED');
    assert.equal((await request('POST','/v1/pricing/quote','invalid-passenger-session',quote)).status,401);
    const passengerId=randomUUID(),identityId=randomUUID(),createdAt=new Date().toISOString();
    await new PostgresAuthOtpRepository(pool).createIdentity({id:identityId,subjectId:passengerId,subjectType:'passenger',
      phoneE164:'+5588999999899',status:'active',createdAt,updatedAt:createdAt});
    const passenger=await issueAuthSession({repository:new PostgresAuthSessionRepository(pool),subjectId:passengerId,
      subjectType:'passenger',ttlMs:3600000});
    const period=pricingPeriodAt(new Date(),STATIC_PRICING_CATALOG_V1.periodPolicy);
    const publicQuote=await request('POST','/v1/pricing/quote',passenger.token,{...quote,period:period==='day'?'after_22':'day',tripDistanceKm:4999});
    assert.equal(publicQuote.status,period==='day'?200:422);
    if(period==='day')assert.equal(publicQuote.body.totalAmountCents,2500);
    else assert.equal(publicQuote.body.error,'UNKNOWN_ROUTE');
    const simulated=await request('POST',path+'/simulate',readerToken,quote);
    assert.equal(simulated.status,200);assert.equal(simulated.body.quote.totalAmountCents,2500);
    assert.equal((await request('POST',path+'/simulate',readerToken,{...quote,period:'after_22'})).status,422);
    const archived=await request('PUT',path,otherToken,{requestId:randomUUID(),expectedRevision:saved.body.revision,
      mutation:{kind:'rate.archive',id:rule.id},confirmation:{password:other.initialPassword,
        totpCode:totpCodeAt(other.totpSecretBase32,new Date(Date.now()+30000))}});
    assert.equal(archived.status,200);assert.equal(archived.body.operations.rates[0].archived,true);
    assert.deepEqual((await request('GET','/v1/pricing/policy')).body.enabledCategories,[]);
    const history=await request('GET',path+'/history',readerToken);
    assert.equal(history.status,200);assert.equal(history.body.items.length,4);
    const audits=await pool.query<{actor_user_id:string;metadata:Record<string,unknown>}>('SELECT actor_user_id,metadata FROM admin_audit_log');
    assert.equal(audits.rows.length,4);
    assert.ok(audits.rows.every(row=>users.includes(row.actor_user_id)));
    const json=JSON.stringify(audits.rows);
    for(const account of accounts){
      assert.equal(json.includes(account.initialPassword),false);
      assert.equal(json.includes(account.totpSecretBase32),false);
    }
    assert.equal(audits.rows.filter(row=>row.metadata.before&&row.metadata.after).length,3);
  }finally{
    if(server&&server.exitCode===null){
      const stopped=once(server,'exit');server.kill('SIGTERM');
      await Promise.race([stopped,new Promise(resolve=>setTimeout(resolve,3000))]);
      if(server.exitCode===null)server.kill('SIGKILL');
    }
    for(const userId of users){
      await pool.query('DELETE FROM admin_sessions WHERE user_id=$1',[userId]);
      await pool.query('DELETE FROM admin_users WHERE id=$1',[userId]);
    }
    await pool.end();await root.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await root.end();
  }
});
