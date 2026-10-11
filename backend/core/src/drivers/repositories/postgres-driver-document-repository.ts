import type { Pool } from 'pg';

import type { AdminActor } from '../../admin/admin-repository.js';
import type {
  DriverDocumentRecord,
  DriverDocumentRepository,
  DriverDocumentStatus,
  DriverDocumentType,
} from '../driver-document-repository.js';

interface DriverDocumentRow {
  id: string;
  driver_id: string;
  document_type: DriverDocumentType;
  storage_key: string;
  content_sha256: string;
  mime_type: 'image/jpeg' | 'image/png' | 'application/pdf';
  size_bytes: string | number;
  expires_on: string | Date | null;
  status: DriverDocumentStatus;
  is_current: boolean;
  rejection_reason: string | null;
  submitted_at: Date;
  reviewed_at: Date | null;
  reviewed_by_kind: 'api_key' | 'user' | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  created_at: Date;
  updated_at: Date;
}

function dateOnly(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function mapRow(row: DriverDocumentRow): DriverDocumentRecord {
  return {
    id: row.id,
    driverId: row.driver_id,
    documentType: row.document_type,
    storageKey: row.storage_key,
    contentSha256: row.content_sha256,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    ...(row.expires_on == null
      ? {}
      : { expiresOn: dateOnly(row.expires_on) }),
    status: row.status,
    isCurrent: row.is_current,
    ...(row.rejection_reason == null
      ? {}
      : { rejectionReason: row.rejection_reason }),
    submittedAt: row.submitted_at.toISOString(),
    ...(row.reviewed_at == null
      ? {}
      : { reviewedAt: row.reviewed_at.toISOString() }),
    ...(row.reviewed_by_kind == null ||
    row.reviewed_by_id == null ||
    row.reviewed_by_name == null
      ? {}
      : {
          reviewedBy: {
            kind: row.reviewed_by_kind,
            id: row.reviewed_by_id,
            name: row.reviewed_by_name,
          },
        }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresDriverDocumentRepository
  implements DriverDocumentRepository {
  constructor(private readonly pool: Pool) {}

  async listCurrent(driverId: string): Promise<DriverDocumentRecord[]> {
    const result = await this.pool.query<DriverDocumentRow>(
      `
      SELECT *
      FROM driver_documents
      WHERE driver_id = $1
        AND is_current = true
      ORDER BY document_type
      `,
      [driverId],
    );
    return result.rows.map(mapRow);
  }

  async findCurrent(
    driverId: string,
    documentType: DriverDocumentType,
  ): Promise<DriverDocumentRecord | null> {
    const result = await this.pool.query<DriverDocumentRow>(
      `
      SELECT *
      FROM driver_documents
      WHERE driver_id = $1
        AND document_type = $2
        AND is_current = true
      LIMIT 1
      `,
      [driverId, documentType],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }

  async submitCurrent(
    record: DriverDocumentRecord,
  ): Promise<DriverDocumentRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
        SELECT pg_advisory_xact_lock(
          hashtextextended($1 || ':' || $2, 0)
        )
        `,
        [record.driverId, record.documentType],
      );

      await client.query(
        `
        UPDATE driver_documents
        SET is_current = false, updated_at = $3
        WHERE driver_id = $1
          AND document_type = $2
          AND is_current = true
        `,
        [record.driverId, record.documentType, record.updatedAt],
      );

      const result = await client.query<DriverDocumentRow>(
        `
        INSERT INTO driver_documents (
          id, driver_id, document_type, storage_key,
          content_sha256, mime_type, size_bytes, expires_on,
          status, is_current, rejection_reason, submitted_at,
          reviewed_at, reviewed_by_kind, reviewed_by_id,
          reviewed_by_name, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          $13,$14,$15,$16,$17,$18
        )
        RETURNING *
        `,
        [
          record.id,
          record.driverId,
          record.documentType,
          record.storageKey,
          record.contentSha256,
          record.mimeType,
          record.sizeBytes,
          record.expiresOn ?? null,
          record.status,
          record.isCurrent,
          record.rejectionReason ?? null,
          record.submittedAt,
          record.reviewedAt ?? null,
          record.reviewedBy?.kind ?? null,
          record.reviewedBy?.id ?? null,
          record.reviewedBy?.name ?? null,
          record.createdAt,
          record.updatedAt,
        ],
      );

      await client.query('COMMIT');
      const row = result.rows[0];
      if (row == null) {
        throw new Error('Documento do motorista não foi persistido.');
      }
      return mapRow(row);
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async reviewCurrent(input: {
    driverId: string;
    documentType: DriverDocumentType;
    expectedStatus: 'pending' | 'approved';
    status: Exclude<DriverDocumentStatus, 'pending'>;
    rejectionReason?: string | undefined;
    reviewedAt: string;
    reviewedBy: AdminActor;
  }): Promise<DriverDocumentRecord | null> {
    const result = await this.pool.query<DriverDocumentRow>(
      `
      UPDATE driver_documents
      SET
        status = $4,
        rejection_reason = $5,
        reviewed_at = $6,
        reviewed_by_kind = $7,
        reviewed_by_id = $8,
        reviewed_by_name = $9,
        updated_at = $6
      WHERE driver_id = $1
        AND document_type = $2
        AND is_current = true
        AND status = $3
      RETURNING *
      `,
      [
        input.driverId,
        input.documentType,
        input.expectedStatus,
        input.status,
        input.rejectionReason ?? null,
        input.reviewedAt,
        input.reviewedBy.kind,
        input.reviewedBy.id,
        input.reviewedBy.name,
      ],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }
}
