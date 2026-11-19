import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminStaffError,
  createAdminStaff,
  deleteAdminStaff,
  listAdminStaff,
  updateAdminStaff,
} from '../src/admin/admin-staff-service.js';
import {
  AdminOwnerAuthorizationError,
  assertAdminOwner,
  isAdminOwner,
} from '../src/admin/admin-owner-authorization.js';
import { createAdminHumanUser } from '../src/admin/admin-human-auth-service.js';
import { InMemoryAdminHumanAuthRepository } from '../src/admin/repositories/in-memory-admin-human-auth-repository.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';

const encryptionKey = Buffer.alloc(32, 21);
const ownerId = '11111111-1111-4111-8111-111111111111';
const actor = { kind: 'user' as const, id: ownerId, name: 'Ian Owner' };

test('gestão de funcionários cria acesso granular e entrega credenciais somente no onboarding', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const admin = new InMemoryAdminRepository();

  const created = await createAdminStaff({
    repository,
    admin,
    actor,
    ownerUserId: ownerId,
    name: 'Atendimento Um',
    email: 'atendimento@example.com',
    scopes: ['support:write'],
    encryptionKey,
    now: new Date('2026-09-30T05:30:00.000Z'),
  });

  assert.deepEqual(
    new Set(created.user.scopes),
    new Set(['support:read', 'support:write']),
  );
  assert.equal(created.user.status, 'active');
  assert.ok(created.onboarding.initialPassword.length >= 16);
  assert.ok(created.onboarding.totpSecret.length > 10);
  assert.match(created.onboarding.otpauthUri, /^otpauth:\/\/totp\//);

  const listed = await listAdminStaff({ repository, ownerUserId: ownerId });
  assert.equal(listed.users.length, 1);
  assert.equal(
    Object.hasOwn(listed.users[0] ?? {}, 'passwordHash'),
    false,
  );
  assert.equal(
    Object.hasOwn(listed.users[0] ?? {}, 'totpSecretCiphertext'),
    false,
  );

  const audit = await admin.listAudit(10);
  assert.equal(audit[0]?.action, 'admin.staff.created');
});

test('redução de permissões e suspensão revogam sessões existentes', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const admin = new InMemoryAdminRepository();

  const created = await createAdminHumanUser({
    repository,
    name: 'Financeiro Um',
    email: 'financeiro@example.com',
    scopes: ['finance:read', 'finance:write'],
    encryptionKey,
    now: new Date('2026-09-30T05:31:00.000Z'),
  });

  await repository.createSession({
    id: '22222222-2222-4222-8222-222222222222',
    userId: created.user.id,
    tokenHash: 'hash-session-1',
    expiresAt: '2026-09-30T07:31:00.000Z',
    createdAt: '2026-09-30T05:31:00.000Z',
  });

  const updated = await updateAdminStaff({
    repository,
    admin,
    actor,
    ownerUserId: ownerId,
    userId: created.user.id,
    scopes: ['finance:read'],
    now: new Date('2026-09-30T05:32:00.000Z'),
  });
  assert.deepEqual(updated.user.scopes, ['finance:read']);
  assert.equal(updated.revokedSessions, 1);

  await repository.createSession({
    id: '33333333-3333-4333-8333-333333333333',
    userId: created.user.id,
    tokenHash: 'hash-session-2',
    expiresAt: '2026-09-30T07:33:00.000Z',
    createdAt: '2026-09-30T05:33:00.000Z',
  });

  const suspended = await updateAdminStaff({
    repository,
    admin,
    actor,
    ownerUserId: ownerId,
    userId: created.user.id,
    status: 'suspended',
    now: new Date('2026-09-30T05:34:00.000Z'),
  });
  assert.equal(suspended.user.status, 'suspended');
  assert.equal(suspended.revokedSessions, 1);
});

test('exclusão é lógica, encerra acesso, libera e-mail e preserva auditoria', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const admin = new InMemoryAdminRepository();

  const created = await createAdminHumanUser({
    repository,
    name: 'Suporte Dois',
    email: 'suporte2@example.com',
    scopes: ['support:read'],
    encryptionKey,
  });

  const deleted = await deleteAdminStaff({
    repository,
    admin,
    actor,
    ownerUserId: ownerId,
    userId: created.user.id,
    now: new Date('2026-09-30T05:35:00.000Z'),
  });

  assert.equal(deleted.userId, created.user.id);
  assert.equal(await repository.findUserByEmail('suporte2@example.com'), null);
  assert.equal(
    (await listAdminStaff({ repository, ownerUserId: ownerId })).users.length,
    0,
  );

  const stored = await repository.findUserById(created.user.id);
  assert.equal(stored?.status, 'suspended');
  assert.equal(stored?.deletedAt, '2026-09-30T05:35:00.000Z');
  assert.match(stored?.emailNormalized ?? '', /^deleted\+/);

  const audit = await admin.listAudit(10);
  assert.equal(audit[0]?.action, 'admin.staff.deleted');
  assert.equal(audit[0]?.metadata.email, 'suporte2@example.com');
});

test('conta proprietária é protegida contra alteração e exclusão', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const admin = new InMemoryAdminRepository();
  const owner = await createAdminHumanUser({
    repository,
    name: 'Ian Owner',
    email: 'owner@example.com',
    scopes: ['audit:read'],
    encryptionKey,
  });

  await assert.rejects(
    () =>
      updateAdminStaff({
        repository,
        admin,
        actor: { kind: 'user', id: owner.user.id, name: owner.user.name },
        ownerUserId: owner.user.id,
        userId: owner.user.id,
        status: 'suspended',
      }),
    (error: unknown) =>
      error instanceof AdminStaffError &&
      error.code === 'ADMIN_STAFF_OWNER_IMMUTABLE',
  );

  await assert.rejects(
    () =>
      deleteAdminStaff({
        repository,
        admin,
        actor: { kind: 'user', id: owner.user.id, name: owner.user.name },
        ownerUserId: owner.user.id,
        userId: owner.user.id,
      }),
    (error: unknown) =>
      error instanceof AdminStaffError &&
      error.code === 'ADMIN_STAFF_OWNER_IMMUTABLE',
  );
});

test('autorização de proprietário aceita somente a conta configurada', () => {
  const env = { ADMIN_OWNER_USER_ID: ownerId } as NodeJS.ProcessEnv;
  assert.equal(isAdminOwner(actor, env), true);
  assert.doesNotThrow(() => assertAdminOwner(actor, env));

  assert.throws(
    () =>
      assertAdminOwner(
        {
          kind: 'user',
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Outro Admin',
        },
        env,
      ),
    (error: unknown) =>
      error instanceof AdminOwnerAuthorizationError &&
      error.code === 'ADMIN_OWNER_REQUIRED',
  );
});
