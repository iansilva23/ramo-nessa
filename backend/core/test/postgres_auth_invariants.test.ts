import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthenticationError, authenticateBearer, hashBearerToken, issueAuthSession } from '../src/auth/auth-service.js';
import { PostgresAuthSessionRepository } from '../src/auth/repositories/postgres-auth-session-repository.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import type { OtpDeliveryProvider } from '../src/auth/otp-delivery-provider.js';
import {
  requestPhoneOtp,
  verifyPhoneOtp,
} from '../src/auth/phone-otp-service.js';
import { createPostgresPool } from '../src/db/postgres.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL persiste somente hash do token e respeita revogação',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresAuthSessionRepository(pool);
    const now = new Date('2026-09-23T09:45:00.000Z');

    try {
      const issued = await issueAuthSession({
        repository,
        subjectId: 'postgres-passenger-auth',
        subjectType: 'passenger',
        now,
        ttlMs: 120_000,
      });

      const row = await pool.query<{
        token_hash: string;
        subject_id: string;
        subject_type: string;
      }>(
        `
        SELECT token_hash, subject_id, subject_type
        FROM auth_sessions
        WHERE id = $1
        `,
        [issued.session.id],
      );

      assert.equal(row.rows[0]?.subject_id, 'postgres-passenger-auth');
      assert.equal(row.rows[0]?.subject_type, 'passenger');
      assert.equal(row.rows[0]?.token_hash, hashBearerToken(issued.token));
      assert.notEqual(row.rows[0]?.token_hash, issued.token);

      const authenticated = await authenticateBearer({
        repository,
        headers: { authorization: `Bearer ${issued.token}` },
        requiredType: 'passenger',
        now: new Date('2026-09-23T09:45:30.000Z'),
      });
      assert.equal(authenticated.id, issued.session.id);

      await repository.revoke(
        issued.session.id,
        '2026-09-23T09:45:40.000Z',
      );

      await assert.rejects(
        () =>
          authenticateBearer({
            repository,
            headers: { authorization: `Bearer ${issued.token}` },
            requiredType: 'passenger',
            now: new Date('2026-09-23T09:45:50.000Z'),
          }),
        (error: unknown) =>
          error instanceof AuthenticationError &&
          error.code === 'AUTH_INVALID',
      );
    } finally {
      await pool.query(
        `DELETE FROM auth_sessions WHERE subject_id = $1`,
        ['postgres-passenger-auth'],
      );
      await pool.end();
    }
  },
);


class PostgresRecordingDelivery implements OtpDeliveryProvider {
  code = '';
  sent = 0;

  async sendCode(input: {
    phoneE164: string;
    code: string;
    challengeId: string;
    expiresInSeconds: number;
  }): Promise<void> {
    this.code = input.code;
    this.sent += 1;
  }
}

test(
  'PostgreSQL persiste OTP, consome uma vez e emite sessão',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const otpRepository = new PostgresAuthOtpRepository(pool);
    const sessionRepository = new PostgresAuthSessionRepository(pool);
    const delivery = new PostgresRecordingDelivery();
    const phone = '+5588944441234';

    try {
      const requested = await requestPhoneOtp({
        repository: otpRepository,
        delivery,
        subjectType: 'passenger',
        phone,
        now: new Date('2026-09-23T11:00:00.000Z'),
      });

      const row = await pool.query<{
        code_digest: string;
        attempt_count: number;
        consumed_at: Date | null;
      }>(
        `
        SELECT code_digest, attempt_count, consumed_at
        FROM auth_otp_challenges
        WHERE id = $1
        `,
        [requested.challengeId],
      );
      assert.ok(row.rows[0]?.code_digest);
      assert.notEqual(row.rows[0]?.code_digest, delivery.code);
      assert.equal(row.rows[0]?.attempt_count, 0);
      assert.equal(row.rows[0]?.consumed_at, null);

      const verified = await verifyPhoneOtp({
        repository: otpRepository,
        sessions: sessionRepository,
        challengeId: requested.challengeId,
        code: delivery.code,
        now: new Date('2026-09-23T11:00:20.000Z'),
      });
      assert.equal(verified.subjectType, 'passenger');
      assert.ok(verified.accessToken.length >= 32);

      const consumed = await pool.query<{
        attempt_count: number;
        consumed_at: Date | null;
      }>(
        `
        SELECT attempt_count, consumed_at
        FROM auth_otp_challenges
        WHERE id = $1
        `,
        [requested.challengeId],
      );
      assert.equal(consumed.rows[0]?.attempt_count, 1);
      assert.ok(consumed.rows[0]?.consumed_at);

      await assert.rejects(() =>
        verifyPhoneOtp({
          repository: otpRepository,
          sessions: sessionRepository,
          challengeId: requested.challengeId,
          code: delivery.code,
          now: new Date('2026-09-23T11:00:30.000Z'),
        }),
      );
    } finally {
      const identities = await pool.query<{ id: string; subject_id: string }>(
        'SELECT id, subject_id FROM auth_identities WHERE phone_e164 = $1',
        [phone],
      );
      for (const identity of identities.rows) {
        await pool.query(
          'DELETE FROM auth_sessions WHERE subject_id = $1',
          [identity.subject_id],
        );
        await pool.query(
          'DELETE FROM auth_otp_challenges WHERE identity_id = $1',
          [identity.id],
        );
      }
      await pool.query(
        'DELETE FROM auth_identities WHERE phone_e164 = $1',
        [phone],
      );
      await pool.end();
    }
  },
);


test(
  'PostgreSQL serializa solicitações OTP concorrentes do mesmo telefone',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const otpRepository = new PostgresAuthOtpRepository(pool);
    const delivery = new PostgresRecordingDelivery();
    const phone = '+5588944441242';
    const now = new Date('2026-09-23T12:30:00.000Z');

    try {
      const results = await Promise.allSettled([
        requestPhoneOtp({
          repository: otpRepository,
          delivery,
          subjectType: 'passenger',
          phone,
          now,
        }),
        requestPhoneOtp({
          repository: otpRepository,
          delivery,
          subjectType: 'passenger',
          phone,
          now,
        }),
      ]);

      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      assert.equal(
        results.filter((result) => result.status === 'rejected').length,
        1,
      );
      assert.equal(delivery.sent, 1);

      const active = await pool.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM auth_otp_challenges c
        JOIN auth_identities i ON i.id = c.identity_id
        WHERE i.phone_e164 = $1 AND c.consumed_at IS NULL
        `,
        [phone],
      );
      assert.equal(active.rows[0]?.count, '1');

      const rawLeak = await pool.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM auth_otp_rate_limits
        WHERE bucket_key LIKE '%' || $1 || '%'
        `,
        [phone],
      );
      assert.equal(rawLeak.rows[0]?.count, '0');
    } finally {
      const identities = await pool.query<{ id: string }>(
        'SELECT id FROM auth_identities WHERE phone_e164 = $1',
        [phone],
      );
      for (const identity of identities.rows) {
        await pool.query(
          'DELETE FROM auth_otp_challenges WHERE identity_id = $1',
          [identity.id],
        );
      }
      await pool.query(
        'DELETE FROM auth_identities WHERE phone_e164 = $1',
        [phone],
      );
      await pool.end();
    }
  },
);


test(
  'PostgreSQL limpa artefatos antigos de autenticação sem apagar dados ativos',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const sessions = new PostgresAuthSessionRepository(pool);
    const otp = new PostgresAuthOtpRepository(pool);
    const phone = '+5588944441299';

    try {
      await pool.query(
        `
        INSERT INTO auth_sessions (
          id, subject_id, subject_type, token_hash,
          expires_at, revoked_at, created_at
        ) VALUES (
          '99999999-9999-4999-8999-999999999991',
          'retention-old-session',
          'passenger',
          'retention-old-session-hash',
          '2026-07-01T12:01:00.000Z',
          NULL,
          '2026-07-01T12:00:00.000Z'
        )
        `,
      );

      const active = await issueAuthSession({
        repository: sessions,
        subjectId: 'retention-active-session',
        subjectType: 'passenger',
        now: new Date('2026-09-23T14:00:00.000Z'),
        ttlMs: 120_000,
      });

      const oldCount = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM auth_sessions
         WHERE subject_id = 'retention-old-session'`,
      );
      assert.equal(oldCount.rows[0]?.count, '0');

      const activeCount = await pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM auth_sessions WHERE id = $1',
        [active.session.id],
      );
      assert.equal(activeCount.rows[0]?.count, '1');

      const now = '2026-09-23T14:10:00.000Z';
      const identity = await otp.createIdentity({
        id: '99999999-9999-4999-8999-999999999992',
        subjectId: 'retention-otp-passenger',
        subjectType: 'passenger',
        phoneE164: phone,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await pool.query(
        `
        INSERT INTO auth_otp_challenges (
          id, identity_id, code_digest, expires_at,
          attempt_count, consumed_at, created_at
        ) VALUES (
          '99999999-9999-4999-8999-999999999993',
          $1,
          'old-digest',
          '2026-09-20T12:05:00.000Z',
          1,
          '2026-09-20T12:01:00.000Z',
          '2026-09-20T12:00:00.000Z'
        )
        `,
        [identity.id],
      );

      await otp.createChallengeWithCooldown({
        challenge: {
          id: '99999999-9999-4999-8999-999999999994',
          identityId: identity.id,
          codeDigest: 'new-digest',
          expiresAt: '2026-09-23T14:15:00.000Z',
          attemptCount: 0,
          createdAt: now,
        },
        now,
        cooldownMs: 60_000,
      });

      const oldChallengeCount = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM auth_otp_challenges
         WHERE id = '99999999-9999-4999-8999-999999999993'`,
      );
      assert.equal(oldChallengeCount.rows[0]?.count, '0');

      const newChallengeCount = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM auth_otp_challenges
         WHERE id = '99999999-9999-4999-8999-999999999994'`,
      );
      assert.equal(newChallengeCount.rows[0]?.count, '1');
    } finally {
      await pool.query(
        `DELETE FROM auth_sessions
         WHERE subject_id IN ('retention-old-session', 'retention-active-session')`,
      );
      const identities = await pool.query<{ id: string }>(
        'SELECT id FROM auth_identities WHERE phone_e164 = $1',
        [phone],
      );
      for (const identity of identities.rows) {
        await pool.query(
          'DELETE FROM auth_otp_challenges WHERE identity_id = $1',
          [identity.id],
        );
      }
      await pool.query(
        'DELETE FROM auth_identities WHERE phone_e164 = $1',
        [phone],
      );
      await pool.end();
    }
  },
);
