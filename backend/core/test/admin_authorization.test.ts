import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticateAdminPrincipal,
} from '../src/admin/admin-authorization.js';
import {
  createAdminHumanUser,
  loginAdminHuman,
} from '../src/admin/admin-human-auth-service.js';
import { totpCodeAt } from '../src/admin/admin-human-crypto.js';
import {
  provisionDriverAuthFromAdmin,
} from '../src/admin/admin-driver-auth-service.js';
import { issueAdminApiKey } from '../src/admin/admin-auth.js';
import { InMemoryAdminHumanAuthRepository } from '../src/admin/repositories/in-memory-admin-human-auth-repository.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { PostgresAdminHumanAuthRepository } from '../src/admin/repositories/postgres-admin-human-auth-repository.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import { PostgresAuthSessionRepository } from '../src/auth/repositories/postgres-auth-session-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const encryptionKey = Buffer.alloc(32, 11);
const rateLimitSecret =
  'admin-principal-test-rate-limit-secret-123456789';

test('autorizador Admin aceita API key e sessão humana sem confundir prefixos', async () => {
  const apiKeys = new InMemoryAdminRepository();
  const humanAuth = new InMemoryAdminHumanAuthRepository();

  const issuedKey = await issueAdminApiKey({
    repository: apiKeys,
    name: 'Integracao Backend',
    scopes: ['drivers:auth:read'],
    now: new Date('2026-09-23T22:30:00.000Z'),
  });
  const apiActor = await authenticateAdminPrincipal({
    apiKeys,
    humanAuth,
    headers: {
      authorization: `Bearer ${issuedKey.token}`,
    },
    requiredScope: 'drivers:auth:read',
    now: new Date('2026-09-23T22:31:00.000Z'),
  });
  assert.deepEqual(apiActor, {
    kind: 'api_key',
    id: issuedKey.key.id,
    name: issuedKey.key.name,
  });

  const created = await createAdminHumanUser({
    repository: humanAuth,
    name: 'Operador Humano',
    email: 'operador@example.com',
    scopes: ['drivers:auth:write', 'audit:read'],
    encryptionKey,
    now: new Date('2026-09-23T22:32:00.000Z'),
  });
  const loginAt = new Date('2026-09-23T22:33:00.000Z');
  const logged = await loginAdminHuman({
    repository: humanAuth,
    email: created.user.emailNormalized,
    password: created.initialPassword,
    totpCode: totpCodeAt(created.totpSecretBase32, loginAt),
    encryptionKey,
    rateLimitSecret,
    now: loginAt,
  });

  const humanActor = await authenticateAdminPrincipal({
    apiKeys,
    humanAuth,
    headers: {
      authorization: `Bearer ${logged.accessToken}`,
    },
    requiredScope: 'drivers:auth:write',
    now: new Date('2026-09-23T22:34:00.000Z'),
  });
  assert.deepEqual(humanActor, {
    kind: 'user',
    id: created.user.id,
    name: created.user.name,
  });
});

test('ação feita por sessão humana registra ator humano na auditoria', async () => {
  const apiKeys = new InMemoryAdminRepository();
  const humanAuth = new InMemoryAdminHumanAuthRepository();
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();

  const created = await createAdminHumanUser({
    repository: humanAuth,
    name: 'Aprovador Motoristas',
    email: 'aprovador@example.com',
    scopes: ['drivers:auth:write'],
    encryptionKey,
    now: new Date('2026-09-23T22:40:00.000Z'),
  });
  const loginAt = new Date('2026-09-23T22:41:00.000Z');
  const logged = await loginAdminHuman({
    repository: humanAuth,
    email: created.user.emailNormalized,
    password: created.initialPassword,
    totpCode: totpCodeAt(created.totpSecretBase32, loginAt),
    encryptionKey,
    rateLimitSecret,
    now: loginAt,
  });
  const actor = await authenticateAdminPrincipal({
    apiKeys,
    humanAuth,
    headers: {
      authorization: `Bearer ${logged.accessToken}`,
    },
    requiredScope: 'drivers:auth:write',
    now: new Date('2026-09-23T22:42:00.000Z'),
  });

  await provisionDriverAuthFromAdmin({
    identities,
    sessions,
    admin: apiKeys,
    actor,
    driverId: 'driver-human-admin-001',
    phone: '88999991271',
    now: new Date('2026-09-23T22:43:00.000Z'),
  });

  const audit = await apiKeys.listAudit(10);
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0]?.actor, {
    kind: 'user',
    id: created.user.id,
    name: created.user.name,
  });
  assert.equal(audit[0]?.action, 'driver.auth.provisioned');
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL persiste actor_user_id para ação do Admin humano',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const apiKeys = new PostgresAdminRepository(pool);
    const humanAuth = new PostgresAdminHumanAuthRepository(pool);
    const identities = new PostgresAuthOtpRepository(pool);
    const sessions = new PostgresAuthSessionRepository(pool);
    const email = 'principal-human-ci@example.com';
    const driverId = 'driver-human-principal-ci';
    let userId = '';

    try {
      const created = await createAdminHumanUser({
        repository: humanAuth,
        name: 'Principal Human CI',
        email,
        scopes: ['drivers:auth:write'],
        encryptionKey,
        now: new Date('2026-09-23T23:00:00.000Z'),
      });
      userId = created.user.id;

      const loginAt = new Date('2026-09-23T23:01:00.000Z');
      const logged = await loginAdminHuman({
        repository: humanAuth,
        email,
        password: created.initialPassword,
        totpCode: totpCodeAt(created.totpSecretBase32, loginAt),
        encryptionKey,
        rateLimitSecret,
        now: loginAt,
      });
      const actor = await authenticateAdminPrincipal({
        apiKeys,
        humanAuth,
        headers: {
          authorization: `Bearer ${logged.accessToken}`,
        },
        requiredScope: 'drivers:auth:write',
        now: new Date('2026-09-23T23:02:00.000Z'),
      });

      await provisionDriverAuthFromAdmin({
        identities,
        sessions,
        admin: apiKeys,
        actor,
        driverId,
        phone: '88999991272',
        now: new Date('2026-09-23T23:03:00.000Z'),
      });

      const row = await pool.query<{
        actor_key_id: string | null;
        actor_user_id: string | null;
        actor_name: string;
      }>(
        `
        SELECT actor_key_id, actor_user_id, actor_name
        FROM admin_audit_log
        WHERE target_type = 'driver' AND target_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [driverId],
      );
      assert.equal(row.rows[0]?.actor_key_id, null);
      assert.equal(row.rows[0]?.actor_user_id, userId);
      assert.equal(row.rows[0]?.actor_name, created.user.name);
    } finally {
      await pool.query(
        `DELETE FROM admin_audit_log
         WHERE target_type = 'driver' AND target_id = $1`,
        [driverId],
      );
      await pool.query(
        'DELETE FROM auth_sessions WHERE subject_id = $1',
        [driverId],
      );
      const identityRows = await pool.query<{ id: string }>(
        `
        SELECT id
        FROM auth_identities
        WHERE subject_type = 'driver' AND subject_id = $1
        `,
        [driverId],
      );
      for (const identity of identityRows.rows) {
        await pool.query(
          'DELETE FROM auth_otp_challenges WHERE identity_id = $1',
          [identity.id],
        );
      }
      await pool.query(
        `DELETE FROM auth_identities
         WHERE subject_type = 'driver' AND subject_id = $1`,
        [driverId],
      );
      if (userId) {
        await pool.query(
          'DELETE FROM admin_sessions WHERE user_id = $1',
          [userId],
        );
        await pool.query(
          'DELETE FROM admin_users WHERE id = $1',
          [userId],
        );
      }
      await pool.end();
    }
  },
);
