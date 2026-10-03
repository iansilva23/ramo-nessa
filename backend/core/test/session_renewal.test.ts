import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateBearer, issueAuthSession } from '../src/auth/auth-service.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { PostgresAuthSessionRepository } from '../src/auth/repositories/postgres-auth-session-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';
import type { AuthSessionRepository } from '../src/auth/auth-session-repository.js';
const now=new Date('2026-10-03T12:00:00Z');
async function scenario(repository: AuthSessionRepository) {
  for (const subjectType of ['driver','passenger'] as const) {
    const issued=await issueAuthSession({repository,subjectId:'persistent-'+subjectType,subjectType,now});
    const headers={authorization:'Bearer '+issued.token};
    const later=new Date(now.getTime()+29*86400000);
    const session=await authenticateBearer({repository,headers,requiredType:subjectType,now:later,renewSession:true});
    assert.equal(Date.parse(session.expiresAt),later.getTime()+180*86400000);
    // Original bearer is still usable; logout revokes the extended session too.
    await authenticateBearer({repository,headers,now:new Date(now.getTime()+40*86400000)});
    await repository.revoke(session.id,later.toISOString());
    assert.equal(await repository.renewActive(session.id,later.toISOString(),new Date(later.getTime()+200*86400000).toISOString()),null);
    await assert.rejects(authenticateBearer({repository,headers,now:later,renewSession:true}),{code:'AUTH_INVALID'});
  }
  const expired=await issueAuthSession({repository,subjectId:'expired',subjectType:'passenger',now,ttlMs:60000});
  const time=new Date(now.getTime()+60000);
  assert.equal(await repository.renewActive(expired.session.id,time.toISOString(),new Date(time.getTime()+180*86400000).toISOString()),null);
  await assert.rejects(authenticateBearer({repository,headers:{authorization:'Bearer '+expired.token},now:time,renewSession:true}),{code:'AUTH_EXPIRED'});
}
test('active sessions renew for both roles; expired and logged-out sessions never revive',async()=>scenario(new InMemoryAuthSessionRepository()));
test('PostgreSQL renewal preserves logout and expiry boundaries', {skip:!process.env.DATABASE_URL},async()=>{
 const pool=createPostgresPool(process.env.DATABASE_URL!);
 try {await scenario(new PostgresAuthSessionRepository(pool));}
 finally {await pool.query("DELETE FROM auth_sessions WHERE subject_id IN ('persistent-driver','persistent-passenger','expired')");await pool.end();}
});
