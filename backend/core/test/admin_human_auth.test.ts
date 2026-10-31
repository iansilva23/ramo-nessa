import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminHumanAuthenticationError,
  authenticateAdminHumanSession,
  createAdminHumanUser,
  hashAdminHumanSessionToken,
  loginAdminHuman,
  revokeAdminHumanSession,
} from '../src/admin/admin-human-auth-service.js';
import { totpCodeAt } from '../src/admin/admin-human-crypto.js';
import { InMemoryAdminHumanAuthRepository } from '../src/admin/repositories/in-memory-admin-human-auth-repository.js';
import { PostgresAdminHumanAuthRepository } from '../src/admin/repositories/postgres-admin-human-auth-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const encryptionKey = Buffer.alloc(32, 7);
const rateLimitSecret =
  'admin-human-auth-test-rate-limit-secret-1234567890';

test('login Admin humano exige senha + TOTP e guarda somente hash da sessão', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const created = await createAdminHumanUser({
    repository,
    name: 'Ian Admin',
    email: 'IAN.ADMIN@example.com',
    scopes: ['drivers:auth:read', 'audit:read'],
    encryptionKey,
    now: new Date('2026-09-23T21:00:00.000Z'),
  });

  assert.equal(created.user.emailNormalized, 'ian.admin@example.com');
  assert.notEqual(created.user.passwordHash, created.initialPassword);
  assert.equal(
    created.user.totpSecretCiphertext.includes(created.totpSecretBase32),
    false,
  );

  const loginAt = new Date('2026-09-23T21:01:00.000Z');
  const code = totpCodeAt(created.totpSecretBase32, loginAt);
  const logged = await loginAdminHuman({
    repository,
    email: 'ian.admin@example.com',
    password: created.initialPassword,
    totpCode: code,
    clientIp: '203.0.113.20',
    encryptionKey,
    rateLimitSecret,
    now: loginAt,
  });

  assert.ok(logged.accessToken.startsWith('rn_admin_session_'));
  assert.notEqual(logged.session.tokenHash, logged.accessToken);
  assert.equal(
    logged.session.tokenHash,
    hashAdminHumanSessionToken(logged.accessToken),
  );
  assert.equal(
    logged.session.expiresAt,
    '2026-09-23T23:01:00.000Z',
  );

  const authenticated = await authenticateAdminHumanSession({
    repository,
    headers: {
      authorization: `Bearer ${logged.accessToken}`,
    },
    requiredScope: 'audit:read',
    now: new Date('2026-09-23T21:02:00.000Z'),
  });
  assert.equal(authenticated.user.id, created.user.id);

  await assert.rejects(
    () =>
      authenticateAdminHumanSession({
        repository,
        headers: {
          authorization: `Bearer ${logged.accessToken}`,
        },
        requiredScope: 'drivers:auth:write',
        now: new Date('2026-09-23T21:02:10.000Z'),
      }),
    (error: unknown) =>
      error instanceof AdminHumanAuthenticationError &&
      error.code === 'ADMIN_SCOPE_REQUIRED',
  );

  await revokeAdminHumanSession({
    repository,
    headers: {
      authorization: `Bearer ${logged.accessToken}`,
    },
    now: new Date('2026-09-23T21:03:00.000Z'),
  });

  await assert.rejects(
    () =>
      authenticateAdminHumanSession({
        repository,
        headers: {
          authorization: `Bearer ${logged.accessToken}`,
        },
        now: new Date('2026-09-23T21:03:10.000Z'),
      }),
    (error: unknown) =>
      error instanceof AdminHumanAuthenticationError &&
      error.code === 'ADMIN_SESSION_INVALID',
  );
});

test('TOTP Admin não pode ser reutilizado', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const created = await createAdminHumanUser({
    repository,
    name: 'Replay Admin',
    email: 'replay@example.com',
    encryptionKey,
  });
  const now = new Date('2026-09-23T21:10:00.000Z');
  const code = totpCodeAt(created.totpSecretBase32, now);

  await loginAdminHuman({
    repository,
    email: created.user.emailNormalized,
    password: created.initialPassword,
    totpCode: code,
    encryptionKey,
    rateLimitSecret,
    now,
  });

  await assert.rejects(
    () =>
      loginAdminHuman({
        repository,
        email: created.user.emailNormalized,
        password: created.initialPassword,
        totpCode: code,
        encryptionKey,
        rateLimitSecret,
        now: new Date('2026-09-23T21:10:01.000Z'),
      }),
    (error: unknown) =>
      error instanceof AdminHumanAuthenticationError &&
      error.code === 'ADMIN_LOGIN_INVALID',
  );
});

test('login Admin aplica rate-limit persistente sem depender de usuário existente', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();

  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(
      () =>
        loginAdminHuman({
          repository,
          email: 'nao-existe@example.com',
          password: 'SenhaInvalida!123456',
          totpCode: '000000',
          clientIp: '203.0.113.30',
          encryptionKey,
          rateLimitSecret,
          now: new Date(
            Date.parse('2026-09-23T21:20:00.000Z') + index * 1000,
          ),
        }),
      (error: unknown) =>
        error instanceof AdminHumanAuthenticationError &&
        error.code === 'ADMIN_LOGIN_INVALID',
    );
  }

  await assert.rejects(
    () =>
      loginAdminHuman({
        repository,
        email: 'nao-existe@example.com',
        password: 'SenhaInvalida!123456',
        totpCode: '000000',
        clientIp: '203.0.113.30',
        encryptionKey,
        rateLimitSecret,
        now: new Date('2026-09-23T21:20:06.000Z'),
      }),
    (error: unknown) =>
      error instanceof AdminHumanAuthenticationError &&
      error.code === 'ADMIN_LOGIN_RATE_LIMITED' &&
      (error.retryAfterSeconds ?? 0) > 0,
  );
});

test('suspensão do usuário Admin invalida sessão existente', async () => {
  const repository = new InMemoryAdminHumanAuthRepository();
  const created = await createAdminHumanUser({
    repository,
    name: 'Suspended Admin',
    email: 'suspended@example.com',
    encryptionKey,
  });
  const now = new Date('2026-09-23T21:30:00.000Z');
  const logged = await loginAdminHuman({
    repository,
    email: created.user.emailNormalized,
    password: created.initialPassword,
    totpCode: totpCodeAt(created.totpSecretBase32, now),
    encryptionKey,
    rateLimitSecret,
    now,
  });

  await repository.setUserStatus({
    id: created.user.id,
    status: 'suspended',
    updatedAt: '2026-09-23T21:31:00.000Z',
  });

  await assert.rejects(
    () =>
      authenticateAdminHumanSession({
        repository,
        headers: {
          authorization: `Bearer ${logged.accessToken}`,
        },
        now: new Date('2026-09-23T21:31:10.000Z'),
      }),
    (error: unknown) =>
      error instanceof AdminHumanAuthenticationError &&
      error.code === 'ADMIN_SESSION_INVALID',
  );
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL protege senha, TOTP, sessão e rate-limit do Admin humano',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresAdminHumanAuthRepository(pool);
    const email = 'admin-human-ci@example.com';

    try {
      const created = await createAdminHumanUser({
        repository,
        name: 'Admin Human CI',
        email,
        scopes: ['audit:read'],
        encryptionKey,
        now: new Date('2026-09-23T22:00:00.000Z'),
      });

      const row = await pool.query<{
        password_hash: string;
        totp_secret_ciphertext: string;
      }>(
        `SELECT password_hash, totp_secret_ciphertext
         FROM admin_users
         WHERE id = $1`,
        [created.user.id],
      );
      assert.notEqual(
        row.rows[0]?.password_hash,
        created.initialPassword,
      );
      assert.equal(
        row.rows[0]?.totp_secret_ciphertext.includes(
          created.totpSecretBase32,
        ),
        false,
      );

      const now = new Date('2026-09-23T22:01:00.000Z');
      const logged = await loginAdminHuman({
        repository,
        email,
        password: created.initialPassword,
        totpCode: totpCodeAt(created.totpSecretBase32, now),
        clientIp: '203.0.113.40',
        encryptionKey,
        rateLimitSecret,
        now,
      });

      const sessionRow = await pool.query<{ token_hash: string }>(
        'SELECT token_hash FROM admin_sessions WHERE id = $1',
        [logged.session.id],
      );
      assert.equal(
        sessionRow.rows[0]?.token_hash,
        hashAdminHumanSessionToken(logged.accessToken),
      );
      assert.notEqual(
        sessionRow.rows[0]?.token_hash,
        logged.accessToken,
      );

      const rawLeak = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM admin_login_rate_limits
         WHERE bucket_key LIKE '%' || $1 || '%'`,
        [email],
      );
      assert.equal(rawLeak.rows[0]?.count, '0');
    } finally {
      const users = await pool.query<{ id: string }>(
        'SELECT id FROM admin_users WHERE email_normalized = $1',
        [email],
      );
      for (const user of users.rows) {
        await pool.query(
          'DELETE FROM admin_sessions WHERE user_id = $1',
          [user.id],
        );
      }
      await pool.query(
        'DELETE FROM admin_users WHERE email_normalized = $1',
        [email],
      );
      await pool.end();
    }
  },
);
