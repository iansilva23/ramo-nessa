import assert from 'node:assert/strict';
import test from 'node:test';
import {listAdminStaff} from '../src/admin/admin-staff-service.js';
import {ADMIN_SCOPES} from '../src/admin/admin-repository.js';
import {effectiveAdminHumanUser, createAdminHumanUser, loginAdminHuman, authenticateAdminHumanSession} from '../src/admin/admin-human-auth-service.js';
import {totpCodeAt} from '../src/admin/admin-human-crypto.js';
import {InMemoryAdminHumanAuthRepository} from '../src/admin/repositories/in-memory-admin-human-auth-repository.js';

test('master recebe permissões novas no login e no servidor; funcionário permanece restrito e suspensão prevalece', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const now = new Date('2026-10-11T06:00:00.000Z');
  const encryptionKey = Buffer.alloc(32, 19);
  const created = await createAdminHumanUser({repository, name:'Ian Master', email:'owner@example.com', scopes:['marketing:read'], encryptionKey, now});
  const oldOwner = process.env.ADMIN_OWNER_USER_ID;
  process.env.ADMIN_OWNER_USER_ID = created.user.id;
  try {
    const logged = await loginAdminHuman({repository, email:created.user.emailNormalized, password:created.initialPassword, totpCode:totpCodeAt(created.totpSecretBase32, now), clientIp:'203.0.113.24', encryptionKey, rateLimitSecret:'master-scopes-test-secret-with-at-least-thirty-two-characters', now});
    assert.deepEqual(logged.user.scopes, ADMIN_SCOPES);
    const staff = await listAdminStaff({repository, ownerUserId:created.user.id});
    assert.equal(staff.users[0]?.isOwner, true);
    assert.deepEqual(staff.users[0]?.scopes, ADMIN_SCOPES);
    const headers = {authorization:'Bearer ' + logged.accessToken};
    for (const requiredScope of ADMIN_SCOPES) {
      await authenticateAdminHumanSession({repository, headers, requiredScope, now});
    }
    const authenticated = await authenticateAdminHumanSession({repository, headers, requiredScope:'marketing:send', now});
    assert.ok(authenticated.user.scopes.includes('marketing:write'));
    assert.deepEqual((await repository.findUserById(created.user.id))?.scopes, ['marketing:read'], 'permissões efetivas não reescrevem permissões de funcionário');
    process.env.ADMIN_OWNER_USER_ID = '11111111-1111-4111-8111-111111111111';
    await assert.rejects(authenticateAdminHumanSession({repository, headers, requiredScope:'marketing:send', now}), {code:'ADMIN_SCOPE_REQUIRED'});
    assert.equal(effectiveAdminHumanUser(created.user, ''), created.user);
    assert.equal(effectiveAdminHumanUser(created.user, 'Ian Master'), created.user);
    const suspended = {...created.user, status:'suspended' as const};
    assert.equal(effectiveAdminHumanUser(suspended, created.user.id), suspended);
    const deleted = {...created.user, deletedAt:now.toISOString()};
    assert.equal(effectiveAdminHumanUser(deleted, created.user.id), deleted);
    process.env.ADMIN_OWNER_USER_ID = created.user.id;
    await repository.setUserStatus({id:created.user.id, status:'suspended', updatedAt:now.toISOString()});
    await assert.rejects(authenticateAdminHumanSession({repository, headers, requiredScope:'marketing:send', now}), {code:'ADMIN_SESSION_INVALID'});
  } finally {
    if (oldOwner === undefined) delete process.env.ADMIN_OWNER_USER_ID;
    else process.env.ADMIN_OWNER_USER_ID = oldOwner;
  }
});
