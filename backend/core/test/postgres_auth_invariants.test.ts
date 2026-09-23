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

  async sendCode(input: {
    phoneE164: string;
    code: string;
    challengeId: string;
    expiresInSeconds: number;
  }): Promise<void> {
    this.code = input.code;
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
