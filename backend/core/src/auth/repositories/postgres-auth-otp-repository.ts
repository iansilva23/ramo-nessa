import type { Pool } from 'pg';

import type {
  AuthIdentityListInput,
  AuthIdentityListPage,
  AuthIdentityRecord,
  AuthIdentityStatus,
  AuthIdentityStatusCounts,
  AuthOtpRepository,
  AuthRateLimitResult,
  OtpAttemptResult,
  OtpChallengeCreationResult,
  OtpChallengeRecord,
} from '../auth-otp-repository.js';
import type { AuthSubjectType } from '../auth-session-repository.js';

interface IdentityRow {
  id: string;
  subject_id: string;
  subject_type: AuthSubjectType;
  phone_e164: string;
  email_normalized: string | null;
  status: AuthIdentityStatus;
  created_at: Date;
  updated_at: Date;
}

interface RateLimitRow {
  bucket_key: string;
  window_started_at: Date;
  attempt_count: number;
  updated_at: Date;
}

interface ChallengeRow {
  id: string;
  identity_id: string;
  code_digest: string;
  expires_at: Date;
  attempt_count: number;
  requested_email_normalized: string | null;
  consumed_at: Date | null;
  created_at: Date;
}

function mapIdentity(row: IdentityRow): AuthIdentityRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    phoneE164: row.phone_e164,
    ...(row.email_normalized != null
      ? { emailNormalized: row.email_normalized }
      : {}),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapChallenge(row: ChallengeRow): OtpChallengeRecord {
  return {
    id: row.id,
    identityId: row.identity_id,
    codeDigest: row.code_digest,
    expiresAt: row.expires_at.toISOString(),
    attemptCount: row.attempt_count,
    ...(row.requested_email_normalized != null
      ? { requestedEmailNormalized: row.requested_email_normalized }
      : {}),
    ...(row.consumed_at != null
      ? { consumedAt: row.consumed_at.toISOString() }
      : {}),
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresAuthOtpRepository implements AuthOtpRepository {
  constructor(private readonly pool: Pool) {}

  async createIdentity(
    identity: AuthIdentityRecord,
  ): Promise<AuthIdentityRecord> {
    const result = await this.pool.query<IdentityRow>(
      `
      INSERT INTO auth_identities (
        id, subject_id, subject_type, phone_e164, email_normalized,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        identity.id,
        identity.subjectId,
        identity.subjectType,
        identity.phoneE164,
        identity.emailNormalized ?? null,
        identity.status,
        identity.createdAt,
        identity.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Identidade não foi persistida.');
    return mapIdentity(row);
  }

  async findOrCreatePassengerIdentity(
    identity: AuthIdentityRecord,
  ): Promise<AuthIdentityRecord> {
    if (identity.subjectType !== 'passenger') {
      throw new Error('Somente passageiro pode ser criado automaticamente.');
    }

    const result = await this.pool.query<IdentityRow>(
      `
      INSERT INTO auth_identities (
        id, subject_id, subject_type, phone_e164,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (subject_type, phone_e164)
      DO UPDATE SET phone_e164 = auth_identities.phone_e164
      RETURNING *
      `,
      [
        identity.id,
        identity.subjectId,
        identity.subjectType,
        identity.phoneE164,
        identity.status,
        identity.createdAt,
        identity.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Identidade não foi persistida.');
    return mapIdentity(row);
  }

  async findIdentityByPhone(
    subjectType: AuthSubjectType,
    phoneE164: string,
  ): Promise<AuthIdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      `
      SELECT *
      FROM auth_identities
      WHERE subject_type = $1 AND phone_e164 = $2
      LIMIT 1
      `,
      [subjectType, phoneE164],
    );
    return result.rows[0] == null ? null : mapIdentity(result.rows[0]);
  }

  async findIdentityById(id: string): Promise<AuthIdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      'SELECT * FROM auth_identities WHERE id = $1 LIMIT 1',
      [id],
    );
    return result.rows[0] == null ? null : mapIdentity(result.rows[0]);
  }

  async findIdentityBySubject(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<AuthIdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      `
      SELECT *
      FROM auth_identities
      WHERE subject_type = $1 AND subject_id = $2
      LIMIT 1
      `,
      [subjectType, subjectId],
    );
    return result.rows[0] == null ? null : mapIdentity(result.rows[0]);
  }

  async setIdentityEmail(input: {
    subjectType: AuthSubjectType;
    subjectId: string;
    emailNormalized: string;
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      `
      UPDATE auth_identities
      SET email_normalized = $3, updated_at = $4
      WHERE subject_type = $1 AND subject_id = $2
      RETURNING *
      `,
      [
        input.subjectType,
        input.subjectId,
        input.emailNormalized,
        input.updatedAt,
      ],
    );
    return result.rows[0] == null ? null : mapIdentity(result.rows[0]);
  }

  async setIdentityStatus(input: {
    subjectType: AuthSubjectType;
    subjectId: string;
    status: AuthIdentityStatus;
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      `
      UPDATE auth_identities
      SET status = $3, updated_at = $4
      WHERE subject_type = $1 AND subject_id = $2
      RETURNING *
      `,
      [
        input.subjectType,
        input.subjectId,
        input.status,
        input.updatedAt,
      ],
    );
    return result.rows[0] == null ? null : mapIdentity(result.rows[0]);
  }

  async listIdentities(
    input: AuthIdentityListInput,
  ): Promise<AuthIdentityListPage> {
    const result = await this.pool.query<IdentityRow>(
      `
      SELECT *
      FROM auth_identities
      WHERE subject_type = $1
        AND ($2::text IS NULL OR status = $2)
        AND (
          $3::text IS NULL
          OR strpos(lower(subject_id), lower($3)) > 0
          OR strpos(phone_e164, $3) > 0
          OR strpos(lower(COALESCE(email_normalized, '')), lower($3)) > 0
        )
        AND (
          $4::timestamptz IS NULL
          OR updated_at < $4::timestamptz
          OR (
            updated_at = $4::timestamptz
            AND id < $5::uuid
          )
        )
      ORDER BY updated_at DESC, id DESC
      LIMIT $6
      `,
      [
        input.subjectType,
        input.status ?? null,
        input.search?.trim() || null,
        input.cursor?.updatedAt ?? null,
        input.cursor?.id ?? null,
        input.limit + 1,
      ],
    );

    const hasMore = result.rows.length > input.limit;
    return {
      identities: result.rows.slice(0, input.limit).map(mapIdentity),
      hasMore,
    };
  }

  async countIdentitiesByStatus(
    subjectType: AuthSubjectType,
  ): Promise<AuthIdentityStatusCounts> {
    const result = await this.pool.query<{
      total: number;
      active: number;
      suspended: number;
    }>(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended
      FROM auth_identities
      WHERE subject_type = $1
      `,
      [subjectType],
    );
    return result.rows[0] ?? {
      total: 0,
      active: 0,
      suspended: 0,
    };
  }

  async consumeRateLimits(input: {
    rules: Array<{ key: string; limit: number; windowMs: number }>;
    now: string;
  }): Promise<AuthRateLimitResult> {
    if (input.rules.length === 0) {
      return { allowed: true, retryAfterMs: 0 };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const nowMs = Date.parse(input.now);

      await client.query(
        `
        DELETE FROM auth_otp_rate_limits
        WHERE updated_at < $1::timestamptz - INTERVAL '48 hours'
        `,
        [input.now],
      );

      for (const rule of input.rules) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [rule.key],
        );

        const existing = await client.query<RateLimitRow>(
          `
          SELECT bucket_key, window_started_at, attempt_count, updated_at
          FROM auth_otp_rate_limits
          WHERE bucket_key = $1
          FOR UPDATE
          `,
          [rule.key],
        );
        const row = existing.rows[0];

        if (
          row == null ||
          nowMs - row.window_started_at.getTime() >= rule.windowMs
        ) {
          await client.query(
            `
            INSERT INTO auth_otp_rate_limits (
              bucket_key, window_started_at, attempt_count, updated_at
            ) VALUES ($1, $2, 1, $2)
            ON CONFLICT (bucket_key)
            DO UPDATE SET
              window_started_at = EXCLUDED.window_started_at,
              attempt_count = 1,
              updated_at = EXCLUDED.updated_at
            `,
            [rule.key, input.now],
          );
          continue;
        }

        if (row.attempt_count >= rule.limit) {
          const retryAfterMs = Math.max(
            1,
            rule.windowMs -
              Math.max(0, nowMs - row.window_started_at.getTime()),
          );
          await client.query('ROLLBACK');
          return { allowed: false, retryAfterMs };
        }

        await client.query(
          `
          UPDATE auth_otp_rate_limits
          SET attempt_count = attempt_count + 1, updated_at = $2
          WHERE bucket_key = $1
          `,
          [rule.key, input.now],
        );
      }

      await client.query('COMMIT');
      return { allowed: true, retryAfterMs: 0 };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async createChallengeWithCooldown(input: {
    challenge: OtpChallengeRecord;
    now: string;
    cooldownMs: number;
  }): Promise<OtpChallengeCreationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
        DELETE FROM auth_otp_challenges
        WHERE
          (consumed_at IS NOT NULL
            AND consumed_at < $1::timestamptz - INTERVAL '24 hours')
          OR expires_at < $1::timestamptz - INTERVAL '24 hours'
        `,
        [input.now],
      );

      const lockedIdentity = await client.query<{ id: string }>(
        'SELECT id FROM auth_identities WHERE id = $1 FOR UPDATE',
        [input.challenge.identityId],
      );
      if (lockedIdentity.rows[0] == null) {
        throw new Error('Identidade OTP não encontrada.');
      }

      const latestResult = await client.query<ChallengeRow>(
        `
        SELECT *
        FROM auth_otp_challenges
        WHERE identity_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [input.challenge.identityId],
      );
      const latest = latestResult.rows[0];
      if (latest != null && latest.consumed_at == null) {
        const elapsedMs = Math.max(
          0,
          Date.parse(input.now) - latest.created_at.getTime(),
        );
        if (elapsedMs < input.cooldownMs) {
          await client.query('ROLLBACK');
          return {
            created: false,
            retryAfterMs: Math.max(1, input.cooldownMs - elapsedMs),
          };
        }

        await client.query(
          `
          UPDATE auth_otp_challenges
          SET consumed_at = COALESCE(consumed_at, $2::timestamptz)
          WHERE id = $1
          `,
          [latest.id, input.now],
        );
      }

      const inserted = await client.query<ChallengeRow>(
        `
        INSERT INTO auth_otp_challenges (
          id, identity_id, code_digest, expires_at,
          attempt_count, requested_email_normalized, consumed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          input.challenge.id,
          input.challenge.identityId,
          input.challenge.codeDigest,
          input.challenge.expiresAt,
          input.challenge.attemptCount,
          input.challenge.requestedEmailNormalized ?? null,
          input.challenge.consumedAt ?? null,
          input.challenge.createdAt,
        ],
      );
      const row = inserted.rows[0];
      if (row == null) throw new Error('Desafio OTP não foi persistido.');

      await client.query('COMMIT');
      return { created: true, challenge: mapChallenge(row) };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async createChallenge(
    challenge: OtpChallengeRecord,
  ): Promise<OtpChallengeRecord> {
    const result = await this.pool.query<ChallengeRow>(
      `
      INSERT INTO auth_otp_challenges (
        id, identity_id, code_digest, expires_at,
        attempt_count, requested_email_normalized, consumed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        challenge.id,
        challenge.identityId,
        challenge.codeDigest,
        challenge.expiresAt,
        challenge.attemptCount,
        challenge.requestedEmailNormalized ?? null,
        challenge.consumedAt ?? null,
        challenge.createdAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Desafio OTP não foi persistido.');
    return mapChallenge(row);
  }

  async findLatestChallengeByIdentityId(
    identityId: string,
  ): Promise<OtpChallengeRecord | null> {
    const result = await this.pool.query<ChallengeRow>(
      `
      SELECT *
      FROM auth_otp_challenges
      WHERE identity_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [identityId],
    );
    return result.rows[0] == null ? null : mapChallenge(result.rows[0]);
  }

  async cancelChallenge(
    challengeId: string,
    canceledAt: string,
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE auth_otp_challenges
      SET consumed_at = COALESCE(consumed_at, $2::timestamptz)
      WHERE id = $1
      `,
      [challengeId, canceledAt],
    );
  }

  async attemptChallenge(input: {
    challengeId: string;
    codeDigest: string;
    attemptedAt: string;
    maxAttempts: number;
  }): Promise<OtpAttemptResult | null> {
    const result = await this.pool.query<ChallengeRow & { matched: boolean }>(
      `
      UPDATE auth_otp_challenges
      SET
        attempt_count = attempt_count + 1,
        consumed_at = CASE
          WHEN code_digest = $2 THEN $3::timestamptz
          ELSE consumed_at
        END
      WHERE id = $1
        AND consumed_at IS NULL
        AND expires_at > $3::timestamptz
        AND attempt_count < $4
      RETURNING *, (code_digest = $2) AS matched
      `,
      [
        input.challengeId,
        input.codeDigest,
        input.attemptedAt,
        input.maxAttempts,
      ],
    );
    const row = result.rows[0];
    if (row == null) return null;
    return { challenge: mapChallenge(row), matched: row.matched };
  }
}
