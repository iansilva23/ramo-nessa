import type { Pool } from 'pg';

import type {
  AuthIdentityRecord,
  AuthIdentityStatus,
  AuthOtpRepository,
  OtpAttemptResult,
  OtpChallengeRecord,
} from '../auth-otp-repository.js';
import type { AuthSubjectType } from '../auth-session-repository.js';

interface IdentityRow {
  id: string;
  subject_id: string;
  subject_type: AuthSubjectType;
  phone_e164: string;
  status: AuthIdentityStatus;
  created_at: Date;
  updated_at: Date;
}

interface ChallengeRow {
  id: string;
  identity_id: string;
  code_digest: string;
  expires_at: Date;
  attempt_count: number;
  consumed_at: Date | null;
  created_at: Date;
}

function mapIdentity(row: IdentityRow): AuthIdentityRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    phoneE164: row.phone_e164,
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
        id, subject_id, subject_type, phone_e164,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
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

  async createChallenge(
    challenge: OtpChallengeRecord,
  ): Promise<OtpChallengeRecord> {
    const result = await this.pool.query<ChallengeRow>(
      `
      INSERT INTO auth_otp_challenges (
        id, identity_id, code_digest, expires_at,
        attempt_count, consumed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        challenge.id,
        challenge.identityId,
        challenge.codeDigest,
        challenge.expiresAt,
        challenge.attemptCount,
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
