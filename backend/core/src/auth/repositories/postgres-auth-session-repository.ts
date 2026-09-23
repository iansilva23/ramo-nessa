import type { Pool } from 'pg';

import type {
  AuthSessionRecord,
  AuthSessionRepository,
  AuthSubjectType,
} from '../auth-session-repository.js';

interface AuthSessionRow {
  id: string;
  subject_id: string;
  subject_type: AuthSubjectType;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

function mapSession(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at.toISOString(),
    ...(row.revoked_at != null
      ? { revokedAt: row.revoked_at.toISOString() }
      : {}),
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresAuthSessionRepository
  implements AuthSessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(session: AuthSessionRecord): Promise<AuthSessionRecord> {
    await this.pool.query(
      `
      DELETE FROM auth_sessions
      WHERE
        (revoked_at IS NOT NULL
          AND revoked_at < $1::timestamptz - INTERVAL '30 days')
        OR expires_at < $1::timestamptz - INTERVAL '30 days'
      `,
      [session.createdAt],
    );

    const result = await this.pool.query<AuthSessionRow>(
      `
      INSERT INTO auth_sessions (
        id, subject_id, subject_type, token_hash,
        expires_at, revoked_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        session.id,
        session.subjectId,
        session.subjectType,
        session.tokenHash,
        session.expiresAt,
        session.revokedAt ?? null,
        session.createdAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Sessão não foi persistida.');
    return mapSession(row);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<AuthSessionRecord | null> {
    const result = await this.pool.query<AuthSessionRow>(
      `
      SELECT *
      FROM auth_sessions
      WHERE token_hash = $1
      LIMIT 1
      `,
      [tokenHash],
    );
    return result.rows[0] == null ? null : mapSession(result.rows[0]);
  }

  async revoke(id: string, revokedAt: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, $2)
      WHERE id = $1
      `,
      [id, revokedAt],
    );
  }

  async revokeAllForSubject(
    subjectType: AuthSubjectType,
    subjectId: string,
    revokedAt: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `
      UPDATE auth_sessions
      SET revoked_at = $3
      WHERE
        subject_type = $1
        AND subject_id = $2
        AND revoked_at IS NULL
      `,
      [subjectType, subjectId, revokedAt],
    );
    return result.rowCount ?? 0;
  }
}
