import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminAuthenticationError,
  authenticateAdminBearer,
  hashAdminApiToken,
  issueAdminApiKey,
} from '../src/admin/admin-auth.js';
import {
  AdminDriverAuthError,
  provisionDriverAuthFromAdmin,
  setDriverAuthStatusFromAdmin,
} from '../src/admin/admin-driver-auth-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { issueAuthSession, hashBearerToken } from '../src/auth/auth-service.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import { PostgresAuthSessionRepository } from '../src/auth/repositories/postgres-auth-session-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

test('chave admin persiste somente hash, respeita escopo e revogação', async () => {
  const repository = new InMemoryAdminRepository();
  const issued = await issueAdminApiKey({
    repository,
    name: 'Operacao Jeri',
    scopes: ['drivers:auth:read'],
    now: new Date('2026-09-23T15:00:00.000Z'),
  });

  assert.ok(issued.token.startsWith('rn_admin_'));
  assert.equal(issued.key.tokenHash, hashAdminApiToken(issued.token));
  assert.notEqual(issued.key.tokenHash, issued.token);
  assert.equal(
    issued.key.expiresAt,
    '2026-12-22T15:00:00.000Z',
  );

  const authenticated = await authenticateAdminBearer({
    repository,
    headers: { authorization: `Bearer ${issued.token}` },
    requiredScope: 'drivers:auth:read',
    now: new Date('2026-09-23T15:01:00.000Z'),
  });
  assert.equal(authenticated.id, issued.key.id);

  await assert.rejects(
    () =>
      authenticateAdminBearer({
        repository,
        headers: { authorization: `Bearer ${issued.token}` },
        requiredScope: 'drivers:auth:write',
      }),
    (error: unknown) =>
      error instanceof AdminAuthenticationError &&
      error.code === 'ADMIN_SCOPE_REQUIRED',
  );

  assert.equal(
    await repository.revokeApiKey(
      issued.key.id,
      '2026-09-23T15:02:00.000Z',
    ),
    true,
  );

  await assert.rejects(
    () =>
      authenticateAdminBearer({
        repository,
        headers: { authorization: `Bearer ${issued.token}` },
        requiredScope: 'drivers:auth:read',
      }),
    (error: unknown) =>
      error instanceof AdminAuthenticationError &&
      error.code === 'ADMIN_AUTH_INVALID',
  );
});

test('chave admin expirada é recusada mesmo sem revogação', async () => {
  const repository = new InMemoryAdminRepository();
  const issued = await issueAdminApiKey({
    repository,
    name: 'Expiracao Admin',
    scopes: ['audit:read'],
    now: new Date('2026-09-23T15:00:00.000Z'),
    ttlMs: 24 * 60 * 60 * 1000,
  });

  await assert.rejects(
    () =>
      authenticateAdminBearer({
        repository,
        headers: { authorization: `Bearer ${issued.token}` },
        requiredScope: 'audit:read',
        now: new Date('2026-09-24T15:00:00.001Z'),
      }),
    (error: unknown) =>
      error instanceof AdminAuthenticationError &&
      error.code === 'ADMIN_AUTH_EXPIRED',
  );
});

test('provisionamento sem status nasce suspenso por padrão', async () => {
  const admin = new InMemoryAdminRepository();
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const actor = (
    await issueAdminApiKey({
      repository: admin,
      name: 'Provisionamento Seguro',
      scopes: ['drivers:auth:write'],
    })
  ).key;

  const result = await provisionDriverAuthFromAdmin({
    identities,
    sessions,
    admin,
    actor,
    driverId: 'driver-default-suspended',
    phone: '88999991259',
  });

  assert.equal(result.identity.status, 'suspended');
});

test('admin provisiona e suspende motorista, revogando sessões e auditando', async () => {
  const admin = new InMemoryAdminRepository();
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();

  const issuedAdmin = await issueAdminApiKey({
    repository: admin,
    name: 'Operacao Motoristas',
    scopes: ['drivers:auth:read', 'drivers:auth:write', 'audit:read'],
    now: new Date('2026-09-23T15:10:00.000Z'),
  });

  const provisioned = await provisionDriverAuthFromAdmin({
    identities,
    sessions,
    admin,
    actor: issuedAdmin.key,
    driverId: 'driver-admin-test-001',
    phone: '88 99999-1250',
    status: 'active',
    now: new Date('2026-09-23T15:11:00.000Z'),
  });
  assert.equal(provisioned.created, true);
  assert.equal(provisioned.identity.status, 'active');
  assert.equal(provisioned.identity.phoneE164, '+5588999991250');

  const driverSession = await issueAuthSession({
    repository: sessions,
    subjectId: 'driver-admin-test-001',
    subjectType: 'driver',
    now: new Date('2026-09-23T15:12:00.000Z'),
    ttlMs: 120_000,
  });

  const suspended = await setDriverAuthStatusFromAdmin({
    identities,
    sessions,
    admin,
    actor: issuedAdmin.key,
    driverId: 'driver-admin-test-001',
    status: 'suspended',
    now: new Date('2026-09-23T15:13:00.000Z'),
  });
  assert.equal(suspended.identity.status, 'suspended');
  assert.equal(suspended.revokedSessions, 1);

  const stored = await sessions.findByTokenHash(
    hashBearerToken(driverSession.token),
  );
  assert.equal(stored?.revokedAt, '2026-09-23T15:13:00.000Z');

  const audit = await admin.listAudit(20);
  assert.deepEqual(
    audit.map((entry) => entry.action).sort(),
    ['driver.auth.provisioned', 'driver.auth.status_changed'].sort(),
  );
  assert.equal(
    JSON.stringify(audit).includes('+5588999991250'),
    false,
  );
});

test('admin impede conflito de telefone e identificador de motorista', async () => {
  const admin = new InMemoryAdminRepository();
  const identities = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const actor = (
    await issueAdminApiKey({
      repository: admin,
      name: 'Conflitos',
      scopes: ['drivers:auth:write'],
    })
  ).key;

  await provisionDriverAuthFromAdmin({
    identities,
    sessions,
    admin,
    actor,
    driverId: 'driver-conflict-a',
    phone: '88999991251',
  });

  await assert.rejects(
    () =>
      provisionDriverAuthFromAdmin({
        identities,
        sessions,
        admin,
        actor,
        driverId: 'driver-conflict-b',
        phone: '88999991251',
      }),
    (error: unknown) =>
      error instanceof AdminDriverAuthError &&
      error.code === 'DRIVER_PHONE_CONFLICT',
  );

  await assert.rejects(
    () =>
      provisionDriverAuthFromAdmin({
        identities,
        sessions,
        admin,
        actor,
        driverId: 'driver-conflict-a',
        phone: '88999991252',
      }),
    (error: unknown) =>
      error instanceof AdminDriverAuthError &&
      error.code === 'DRIVER_ID_CONFLICT',
  );
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL protege chave admin, revoga sessão de motorista e registra auditoria',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const admin = new PostgresAdminRepository(pool);
    const identities = new PostgresAuthOtpRepository(pool);
    const sessions = new PostgresAuthSessionRepository(pool);
    const driverId = 'driver-admin-postgres-001';
    const phone = '+5588944441298';

    let adminKeyId = '';
    try {
      const issuedAdmin = await issueAdminApiKey({
        repository: admin,
        name: 'CI Admin',
        scopes: ['drivers:auth:read', 'drivers:auth:write', 'audit:read'],
        now: new Date('2026-09-23T16:00:00.000Z'),
      });
      adminKeyId = issuedAdmin.key.id;

      const keyRow = await pool.query<{
        token_hash: string;
        expires_at: Date;
      }>(
        'SELECT token_hash, expires_at FROM admin_api_keys WHERE id = $1',
        [adminKeyId],
      );
      assert.equal(
        keyRow.rows[0]?.token_hash,
        hashAdminApiToken(issuedAdmin.token),
      );
      assert.notEqual(keyRow.rows[0]?.token_hash, issuedAdmin.token);
      assert.equal(
        keyRow.rows[0]?.expires_at.toISOString(),
        issuedAdmin.key.expiresAt,
      );

      await provisionDriverAuthFromAdmin({
        identities,
        sessions,
        admin,
        actor: issuedAdmin.key,
        driverId,
        phone,
        status: 'active',
        now: new Date('2026-09-23T16:01:00.000Z'),
      });

      const driverSession = await issueAuthSession({
        repository: sessions,
        subjectId: driverId,
        subjectType: 'driver',
        now: new Date('2026-09-23T16:02:00.000Z'),
        ttlMs: 120_000,
      });

      const result = await setDriverAuthStatusFromAdmin({
        identities,
        sessions,
        admin,
        actor: issuedAdmin.key,
        driverId,
        status: 'suspended',
        now: new Date('2026-09-23T16:03:00.000Z'),
      });
      assert.equal(result.revokedSessions, 1);

      const sessionRow = await pool.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM auth_sessions WHERE id = $1',
        [driverSession.session.id],
      );
      assert.ok(sessionRow.rows[0]?.revoked_at);

      const auditRows = await pool.query<{
        action: string;
        metadata: Record<string, unknown>;
      }>(
        `
        SELECT action, metadata
        FROM admin_audit_log
        WHERE actor_key_id = $1
        ORDER BY created_at
        `,
        [adminKeyId],
      );
      assert.deepEqual(
        auditRows.rows.map((row) => row.action),
        ['driver.auth.provisioned', 'driver.auth.status_changed'],
      );
      assert.equal(
        JSON.stringify(auditRows.rows).includes(phone),
        false,
      );
    } finally {
      await pool.query(
        'DELETE FROM auth_sessions WHERE subject_id = $1',
        [driverId],
      );
      const identity = await pool.query<{ id: string }>(
        `SELECT id FROM auth_identities
         WHERE subject_type = 'driver' AND subject_id = $1`,
        [driverId],
      );
      for (const row of identity.rows) {
        await pool.query(
          'DELETE FROM auth_otp_challenges WHERE identity_id = $1',
          [row.id],
        );
      }
      await pool.query(
        `DELETE FROM auth_identities
         WHERE subject_type = 'driver' AND subject_id = $1`,
        [driverId],
      );
      if (adminKeyId) {
        await pool.query(
          'DELETE FROM admin_audit_log WHERE actor_key_id = $1',
          [adminKeyId],
        );
        await pool.query(
          'DELETE FROM admin_api_keys WHERE id = $1',
          [adminKeyId],
        );
      }
      await pool.end();
    }
  },
);
