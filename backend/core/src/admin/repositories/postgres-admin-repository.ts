import type { Pool } from 'pg';

import type {
  AdminApiKeyRecord,
  AdminAuditRecord,
  AdminRepository,
  AdminScope,
} from '../admin-repository.js';

interface AdminKeyRow {
  id: string;
  name: string;
  token_hash: string;
  scopes: AdminScope[];
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  last_used_at: Date | null;
}

interface AdminAuditRow {
  id: string;
  actor_key_id: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

function mapKey(row: AdminKeyRow): AdminApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.token_hash,
    scopes: [...row.scopes],
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    ...(row.revoked_at != null
      ? { revokedAt: row.revoked_at.toISOString() }
      : {}),
    ...(row.last_used_at != null
      ? { lastUsedAt: row.last_used_at.toISOString() }
      : {}),
  };
}

function mapAudit(row: AdminAuditRow): AdminAuditRecord {
  return {
    id: row.id,
    actorKeyId: row.actor_key_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly pool: Pool) {}

  async createApiKey(record: AdminApiKeyRecord): Promise<AdminApiKeyRecord> {
    const result = await this.pool.query<AdminKeyRow>(
      `
      INSERT INTO admin_api_keys (
        id, name, token_hash, scopes,
        expires_at, created_at, revoked_at, last_used_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        record.id,
        record.name,
        record.tokenHash,
        record.scopes,
        record.expiresAt,
        record.createdAt,
        record.revokedAt ?? null,
        record.lastUsedAt ?? null,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Chave administrativa não foi persistida.');
    return mapKey(row);
  }

  async findApiKeyByTokenHash(
    tokenHash: string,
  ): Promise<AdminApiKeyRecord | null> {
    const result = await this.pool.query<AdminKeyRow>(
      'SELECT * FROM admin_api_keys WHERE token_hash = $1 LIMIT 1',
      [tokenHash],
    );
    return result.rows[0] == null ? null : mapKey(result.rows[0]);
  }

  async touchApiKeyLastUsed(id: string, usedAt: string): Promise<void> {
    await this.pool.query(
      'UPDATE admin_api_keys SET last_used_at = $2 WHERE id = $1',
      [id, usedAt],
    );
  }

  async revokeApiKey(id: string, revokedAt: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE admin_api_keys
      SET revoked_at = COALESCE(revoked_at, $2)
      WHERE id = $1
      RETURNING id
      `,
      [id, revokedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async appendAudit(record: AdminAuditRecord): Promise<AdminAuditRecord> {
    const result = await this.pool.query<AdminAuditRow>(
      `
      INSERT INTO admin_audit_log (
        id, actor_key_id, actor_name, action,
        target_type, target_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      RETURNING *
      `,
      [
        record.id,
        record.actorKeyId,
        record.actorName,
        record.action,
        record.targetType,
        record.targetId,
        JSON.stringify(record.metadata),
        record.createdAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Auditoria administrativa não persistida.');
    return mapAudit(row);
  }

  async listAudit(limit: number): Promise<AdminAuditRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<AdminAuditRow>(
      `
      SELECT *
      FROM admin_audit_log
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [safeLimit],
    );
    return result.rows.map(mapAudit);
  }
}
