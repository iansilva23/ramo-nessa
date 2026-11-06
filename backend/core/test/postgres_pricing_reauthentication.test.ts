import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createPostgresPool} from '../src/db/postgres.js';
import {PostgresAdminHumanAuthRepository} from '../src/admin/repositories/postgres-admin-human-auth-repository.js';
import {createAdminHumanUser,loginAdminHuman,reauthenticateAdminHuman} from '../src/admin/admin-human-auth-service.js';
import {totpCodeAt} from '../src/admin/admin-human-crypto.js';

const url='postgresql://ramo_ci:ramo_ci_ephemeral_only@127.0.0.1:5432/ramo_v5_ci';
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.RAMO_V5_EPHEMERAL_PG==='true'&&process.env.DATABASE_URL===url;
const key=Buffer.alloc(32,23),secret='disposable-postgres-pricing-reauthentication-only';

test('PostgreSQL pricing MFA: independent connections reject login-code replay, concurrent reuse, persisted failures and revoked sessions',{skip:!enabled,timeout:45000},async()=>{
  const poolA=createPostgresPool(url),poolB=createPostgresPool(url);
  const first=new PostgresAdminHumanAuthRepository(poolA),second=new PostgresAdminHumanAuthRepository(poolB);
  const email='pricing-reauth-'+randomUUID()+'@example.invalid';
  const loginAt=new Date('2026-10-20T12:00:00Z'),confirmAt=new Date(loginAt.getTime()+30000);
  let userId:string|undefined;
  try{
    const created=await createAdminHumanUser({repository:first,name:'Isolated PostgreSQL administrator',email,
      scopes:['pricing:read','pricing:write'],encryptionKey:key,now:loginAt});
    userId=created.user.id;
    const logged=await loginAdminHuman({repository:first,email,password:created.initialPassword,
      totpCode:totpCodeAt(created.totpSecretBase32,loginAt),encryptionKey:key,rateLimitSecret:secret,now:loginAt});
    const input={repository:first,headers:{authorization:'Bearer '+logged.accessToken},
      password:created.initialPassword,totpCode:totpCodeAt(created.totpSecretBase32,loginAt),
      encryptionKey:key,rateLimitSecret:secret,now:loginAt};
    await assert.rejects(reauthenticateAdminHuman({...input,repository:second}),/MFA novo/);
    const confirmation={...input,now:confirmAt,totpCode:totpCodeAt(created.totpSecretBase32,confirmAt)};
    const attempts=await Promise.allSettled([
      reauthenticateAdminHuman(confirmation),
      reauthenticateAdminHuman({...confirmation,repository:second}),
    ]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
    // Three attempts have already been persisted across the two pools.
    for(const repository of [first,second])
      await assert.rejects(reauthenticateAdminHuman({...confirmation,repository,password:'incorrect-password-long'}));
    await assert.rejects(reauthenticateAdminHuman({...confirmation,repository:second}),
      error=>(error as {code:string}).code==='ADMIN_LOGIN_RATE_LIMITED');
    const row=await poolB.query<{password_hash:string;totp_secret_ciphertext:string}>(
      'SELECT password_hash,totp_secret_ciphertext FROM admin_users WHERE id=$1',[userId]);
    assert.notEqual(row.rows[0]!.password_hash,created.initialPassword);
    assert.equal(row.rows[0]!.totp_secret_ciphertext.includes(created.totpSecretBase32),false);
    await first.revokeSession(logged.session.id,confirmAt.toISOString());
    await assert.rejects(reauthenticateAdminHuman({...confirmation,repository:second}),
      error=>(error as {code:string}).code==='ADMIN_SESSION_INVALID');
  }finally{
    if(userId){
      await poolA.query('DELETE FROM admin_sessions WHERE user_id=$1',[userId]);
      await poolA.query('DELETE FROM admin_users WHERE id=$1',[userId]);
    }
    await Promise.all([poolA.end(),poolB.end()]);
  }
});
