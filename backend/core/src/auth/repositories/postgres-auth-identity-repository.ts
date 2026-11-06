import type { Pool } from 'pg';

import type {
  AuthFederatedIdentityRecord,
  AuthFederatedProvider,
  AuthIdentityListInput,
  AuthIdentityListPage,
  AuthIdentityRecord,
  AuthIdentityStatus,
  AuthIdentityStatusCounts,
  AuthIdentityRepository,
  AuthRateLimitResult,
} from '../auth-identity-repository.js';
import type { AuthSubjectType } from '../auth-session-repository.js';

interface IdentityRow {
  id: string;
  subject_id: string;
  subject_type: AuthSubjectType;
  phone_e164: string;
  email_normalized: string | null;
  full_name: string | null;
  password_hash: string | null;
  photo_url: string | null;
  photo_updated_at: Date | null;
  status: AuthIdentityStatus;
  driver_registration_only: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FederatedIdentityRow {
  provider: AuthFederatedProvider;
  provider_subject: string;
  identity_id: string;
  email_normalized: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RateLimitRow {
  bucket_key: string;
  window_started_at: Date;
  attempt_count: number;
  updated_at: Date;
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
    ...(row.full_name != null ? { fullName: row.full_name } : {}),
    ...(row.password_hash != null
      ? { passwordHash: row.password_hash }
      : {}),
    ...(row.photo_url != null ? { photoUrl: row.photo_url } : {}),
    ...(row.photo_updated_at != null
      ? { photoUpdatedAt: row.photo_updated_at.toISOString() }
      : {}),
    status: row.status,
    ...(row.driver_registration_only ? { driverRegistrationOnly: true } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapFederatedIdentity(
  row: FederatedIdentityRow,
): AuthFederatedIdentityRecord {
  return {
    provider: row.provider,
    providerSubject: row.provider_subject,
    identityId: row.identity_id,
    ...(row.email_normalized == null
      ? {}
      : { emailNormalized: row.email_normalized }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresAuthIdentityRepository implements AuthIdentityRepository {
  constructor(private readonly pool: Pool) {}

  async createIdentity(
    identity: AuthIdentityRecord,
  ): Promise<AuthIdentityRecord> {
    const result = await this.pool.query<IdentityRow>(
      `
      INSERT INTO auth_identities (
        id, subject_id, subject_type, phone_e164, email_normalized,
        full_name, password_hash, photo_url,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        identity.id,
        identity.subjectId,
        identity.subjectType,
        identity.phoneE164,
        identity.emailNormalized ?? null,
        identity.fullName ?? null,
        identity.passwordHash ?? null,
        identity.photoUrl ?? null,
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
  async findIdentityByEmail(
    subjectType: AuthSubjectType,
    emailNormalized: string,
  ): Promise<AuthIdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      `
      SELECT *
      FROM auth_identities
      WHERE subject_type = $1 AND email_normalized = $2
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      `,
      [subjectType, emailNormalized],
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

  async findFederatedIdentity(
    provider: AuthFederatedProvider,
    providerSubject: string,
  ): Promise<AuthFederatedIdentityRecord | null> {
    const result = await this.pool.query<FederatedIdentityRow>(
      `
      SELECT *
      FROM auth_federated_identities
      WHERE provider = $1 AND provider_subject = $2
      LIMIT 1
      `,
      [provider, providerSubject],
    );
    return result.rows[0] == null
      ? null
      : mapFederatedIdentity(result.rows[0]);
  }

  async findFederatedIdentityForAccount(input: {
    provider: AuthFederatedProvider;
    identityId: string;
  }): Promise<AuthFederatedIdentityRecord | null> {
    const result = await this.pool.query<FederatedIdentityRow>(
      `
      SELECT *
      FROM auth_federated_identities
      WHERE provider = $1 AND identity_id = $2
      LIMIT 1
      `,
      [input.provider, input.identityId],
    );
    return result.rows[0] == null
      ? null
      : mapFederatedIdentity(result.rows[0]);
  }

  async linkFederatedIdentity(
    record: AuthFederatedIdentityRecord,
  ): Promise<AuthFederatedIdentityRecord> {
    const result = await this.pool.query<FederatedIdentityRow>(
      `
      INSERT INTO auth_federated_identities (
        provider,
        provider_subject,
        identity_id,
        email_normalized,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (provider, provider_subject)
      DO UPDATE SET
        email_normalized = EXCLUDED.email_normalized,
        updated_at = EXCLUDED.updated_at
      WHERE
        auth_federated_identities.identity_id =
          EXCLUDED.identity_id
      RETURNING *
      `,
      [
        record.provider,
        record.providerSubject,
        record.identityId,
        record.emailNormalized ?? null,
        record.createdAt,
        record.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error(
        'Identidade social já vinculada a outra conta.',
      );
    }
    return mapFederatedIdentity(row);
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

  async setPassengerAccount(input: {
    subjectId: string;
    fullName?: string | null;
    emailNormalized?: string | null;
    passwordHash?: string;
    photoUrl?: string | null;
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null> {
    const current = await this.findIdentityBySubject(
      'passenger',
      input.subjectId,
    );
    if (current == null) return null;

    const result = await this.pool.query<IdentityRow>(
      `
      UPDATE auth_identities
      SET
        full_name = $2,
        email_normalized = $3,
        password_hash = $4,
        photo_url = $5,
        updated_at = $6
      WHERE subject_type = 'passenger' AND subject_id = $1
      RETURNING *
      `,
      [
        input.subjectId,
        input.fullName === undefined
          ? current.fullName ?? null
          : input.fullName,
        input.emailNormalized === undefined
          ? current.emailNormalized ?? null
          : input.emailNormalized,
        input.passwordHash ?? current.passwordHash ?? null,
        input.photoUrl === undefined
          ? current.photoUrl ?? null
          : input.photoUrl,
        input.updatedAt,
      ],
    );
    return result.rows[0] == null ? null : mapIdentity(result.rows[0]);
  }

  async updatePassengerProfilePhoto(input: {
    subjectId: string;
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      `
      UPDATE auth_identities
      SET
        photo_bytes = $2,
        photo_mime_type = $3,
        photo_updated_at = $4,
        photo_url = NULL,
        updated_at = $4
      WHERE subject_type = 'passenger'
        AND subject_id = $1
      RETURNING *
      `,
      [
        input.subjectId,
        input.bytes,
        input.mimeType,
        input.updatedAt,
      ],
    );
    return result.rows[0] == null ? null : mapIdentity(result.rows[0]);
  }

  async findPassengerProfilePhoto(subjectId: string): Promise<{
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  } | null> {
    const result = await this.pool.query<{
      photo_bytes: Buffer | null;
      photo_mime_type: string | null;
      photo_updated_at: Date | null;
    }>(
      `
      SELECT photo_bytes, photo_mime_type, photo_updated_at
      FROM auth_identities
      WHERE subject_type = 'passenger'
        AND subject_id = $1
      LIMIT 1
      `,
      [subjectId],
    );
    const row = result.rows[0];
    if (
      row?.photo_bytes == null ||
      row.photo_mime_type == null ||
      row.photo_updated_at == null
    ) {
      return null;
    }
    if (
      row.photo_mime_type !== 'image/jpeg' &&
      row.photo_mime_type !== 'image/png' &&
      row.photo_mime_type !== 'image/webp'
    ) {
      return null;
    }
    return {
      bytes: row.photo_bytes,
      mimeType: row.photo_mime_type,
      updatedAt: row.photo_updated_at.toISOString(),
    };
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
      SET status = $3, updated_at = $4,
        driver_registration_only = CASE WHEN $1 = 'driver' AND $3 = 'active' THEN false ELSE driver_registration_only END
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
          OR ($1 = 'passenger' AND strpos(
            translate(lower(COALESCE(full_name, '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
            translate(lower($3), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn')
          ) > 0)
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
        DELETE FROM auth_password_rate_limits
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
          FROM auth_password_rate_limits
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
            INSERT INTO auth_password_rate_limits (
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
          UPDATE auth_password_rate_limits
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
