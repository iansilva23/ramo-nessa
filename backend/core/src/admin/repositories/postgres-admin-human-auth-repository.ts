import type { Pool } from 'pg';

import type { AdminScope } from '../admin-repository.js';
import type {
  AdminHumanAuthRepository,
  AdminHumanSessionRecord,
  AdminHumanStatus,
  AdminHumanUserRecord,
  AdminLoginRateLimitResult,
} from '../admin-human-auth-repository.js';

interface UserRow {
  id: string;
  name: string;
  email_normalized: string;
  password_hash: string;
  totp_secret_ciphertext: string;
  scopes: AdminScope[];
  status: AdminHumanStatus;
  last_totp_counter: string | number | null;
  created_at: Date;
  updated_at: Date;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

interface RateLimitRow {
  bucket_key: string;
  window_started_at: Date;
  attempt_count: number;
  updated_at: Date;
}

function mapUser(row: UserRow): AdminHumanUserRecord {
  return {
    id: row.id,
    name: row.name,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash,
    totpSecretCiphertext: row.totp_secret_ciphertext,
    scopes: [...row.scopes],
    status: row.status,
    ...(row.last_totp_counter != null
      ? { lastTotpCounter: Number(row.last_totp_counter) }
      : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSession(row: SessionRow): AdminHumanSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at.toISOString(),
    ...(row.revoked_at != null
      ? { revokedAt: row.revoked_at.toISOString() }
      : {}),
    ...(row.last_used_at != null
      ? { lastUsedAt: row.last_used_at.toISOString() }
      : {}),
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresAdminHumanAuthRepository
  implements AdminHumanAuthRepository {
  constructor(private readonly pool: Pool) {}

  async createUser(
    user: AdminHumanUserRecord,
  ): Promise<AdminHumanUserRecord> {
    const result = await this.pool.query<UserRow>(
      `
      INSERT INTO admin_users (
        id, name, email_normalized, password_hash,
        totp_secret_ciphertext, scopes, status, last_totp_counter,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        user.id,
        user.name,
        user.emailNormalized,
        user.passwordHash,
        user.totpSecretCiphertext,
        user.scopes,
        user.status,
        user.lastTotpCounter ?? null,
        user.createdAt,
        user.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Usuário Admin não foi persistido.');
    return mapUser(row);
  }

  async findUserByEmail(
    emailNormalized: string,
  ): Promise<AdminHumanUserRecord | null> {
    const result = await this.pool.query<UserRow>(
      'SELECT * FROM admin_users WHERE email_normalized = $1 LIMIT 1',
      [emailNormalized],
    );
    return result.rows[0] == null ? null : mapUser(result.rows[0]);
  }

  async findUserById(id: string): Promise<AdminHumanUserRecord | null> {
    const result = await this.pool.query<UserRow>(
      'SELECT * FROM admin_users WHERE id = $1 LIMIT 1',
      [id],
    );
    return result.rows[0] == null ? null : mapUser(result.rows[0]);
  }

  async setUserStatus(input: {
    id: string;
    status: AdminHumanStatus;
    updatedAt: string;
  }): Promise<AdminHumanUserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `
      UPDATE admin_users
      SET status = $2, updated_at = $3
      WHERE id = $1
      RETURNING *
      `,
      [input.id, input.status, input.updatedAt],
    );
    return result.rows[0] == null ? null : mapUser(result.rows[0]);
  }

  async consumeTotpCounter(input: {
    userId: string;
    counter: number;
    updatedAt: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE admin_users
      SET last_totp_counter = $2, updated_at = $3
      WHERE id = $1
        AND (
          last_totp_counter IS NULL
          OR last_totp_counter < $2
        )
      RETURNING id
      `,
      [input.userId, input.counter, input.updatedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createSession(
    session: AdminHumanSessionRecord,
  ): Promise<AdminHumanSessionRecord> {
    await this.pool.query(
      `
      DELETE FROM admin_sessions
      WHERE
        (revoked_at IS NOT NULL
          AND revoked_at < $1::timestamptz - INTERVAL '7 days')
        OR expires_at < $1::timestamptz - INTERVAL '7 days'
      `,
      [session.createdAt],
    );

    const result = await this.pool.query<SessionRow>(
      `
      INSERT INTO admin_sessions (
        id, user_id, token_hash, expires_at,
        revoked_at, last_used_at, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        session.id,
        session.userId,
        session.tokenHash,
        session.expiresAt,
        session.revokedAt ?? null,
        session.lastUsedAt ?? null,
        session.createdAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Sessão Admin não foi persistida.');
    return mapSession(row);
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<AdminHumanSessionRecord | null> {
    const result = await this.pool.query<SessionRow>(
      'SELECT * FROM admin_sessions WHERE token_hash = $1 LIMIT 1',
      [tokenHash],
    );
    return result.rows[0] == null ? null : mapSession(result.rows[0]);
  }

  async touchSession(id: string, usedAt: string): Promise<void> {
    await this.pool.query(
      'UPDATE admin_sessions SET last_used_at = $2 WHERE id = $1',
      [id, usedAt],
    );
  }

  async revokeSession(id: string, revokedAt: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE admin_sessions
      SET revoked_at = COALESCE(revoked_at, $2)
      WHERE id = $1
      `,
      [id, revokedAt],
    );
  }

  async revokeSessionsForUser(
    userId: string,
    revokedAt: string,
  ): Promise<number> {
    const result = await this.pool.query(
      `
      UPDATE admin_sessions
      SET revoked_at = $2
      WHERE user_id = $1 AND revoked_at IS NULL
      `,
      [userId, revokedAt],
    );
    return result.rowCount ?? 0;
  }

  async consumeRateLimits(input: {
    rules: Array<{ key: string; limit: number; windowMs: number }>;
    now: string;
  }): Promise<AdminLoginRateLimitResult> {
    if (input.rules.length === 0) {
      return { allowed: true, retryAfterMs: 0 };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const nowMs = Date.parse(input.now);
      await client.query(
        `
        DELETE FROM admin_login_rate_limits
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
          SELECT *
          FROM admin_login_rate_limits
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
            INSERT INTO admin_login_rate_limits (
              bucket_key, window_started_at, attempt_count, updated_at
            ) VALUES ($1,$2,1,$2)
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
          UPDATE admin_login_rate_limits
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
}
