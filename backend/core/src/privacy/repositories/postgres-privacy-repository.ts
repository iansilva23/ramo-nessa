import type { Pool } from 'pg';

import type { AuthSubjectType } from '../../auth/auth-session-repository.js';
import type {
  DataSubjectRequestAdminPage,
  DataSubjectRequestRecord,
  DataSubjectRequestStatus,
  DataSubjectRequestType,
  LegalDocumentAcceptanceRecord,
  LegalDocumentRecord,
  LegalDocumentStatus,
  LegalDocumentType,
  PrivacyPreferencesRecord,
  PrivacyRepository,
} from '../privacy-repository.js';

interface LegalDocumentRow {
  document_type: LegalDocumentType;
  version: number;
  title: string;
  content: string;
  status: LegalDocumentStatus;
  effective_at: Date;
  published_at: Date;
  created_at: Date;
}

interface LegalAcceptanceRow {
  id: string;
  subject_type: AuthSubjectType;
  subject_id: string;
  document_type: LegalDocumentType;
  document_version: number;
  accepted_at: Date;
}

interface PrivacyPreferencesRow {
  subject_type: AuthSubjectType;
  subject_id: string;
  marketing_notifications_enabled: boolean;
  updated_at: Date;
}

interface DataSubjectRequestRow {
  id: string;
  subject_type: AuthSubjectType;
  subject_id: string;
  request_type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  note: string | null;
  response: string | null;
  responded_by_name: string | null;
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapDocument(row: LegalDocumentRow): LegalDocumentRecord {
  return {
    documentType: row.document_type,
    version: row.version,
    title: row.title,
    content: row.content,
    status: row.status,
    effectiveAt: row.effective_at.toISOString(),
    publishedAt: row.published_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function mapAcceptance(
  row: LegalAcceptanceRow,
): LegalDocumentAcceptanceRecord {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    documentType: row.document_type,
    documentVersion: row.document_version,
    acceptedAt: row.accepted_at.toISOString(),
  };
}

function mapPreferences(row: PrivacyPreferencesRow): PrivacyPreferencesRecord {
  return {
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    marketingNotificationsEnabled: row.marketing_notifications_enabled,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapRequest(row: DataSubjectRequestRow): DataSubjectRequestRecord {
  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    requestType: row.request_type,
    status: row.status,
    ...(row.note == null ? {} : { note: row.note }),
    ...(row.response == null ? {} : { response: row.response }),
    ...(row.responded_by_name == null
      ? {}
      : { respondedByName: row.responded_by_name }),
    ...(row.responded_at == null
      ? {}
      : { respondedAt: row.responded_at.toISOString() }),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const DOCUMENT_COLUMNS = `
  document_type, version, title, content, status,
  effective_at, published_at, created_at
`;

const REQUEST_COLUMNS = `
  id, subject_type, subject_id, request_type, status, note,
  response, responded_by_name, responded_at, created_at, updated_at
`;

export class PostgresPrivacyRepository implements PrivacyRepository {
  constructor(private readonly pool: Pool) {}

  async listPublishedLegalDocuments(at: string): Promise<LegalDocumentRecord[]> {
    const result = await this.pool.query<LegalDocumentRow>(
      `
      SELECT DISTINCT ON (document_type) ${DOCUMENT_COLUMNS}
      FROM legal_documents
      WHERE status = 'published' AND effective_at <= $1
      ORDER BY document_type, effective_at DESC, version DESC
      `,
      [at],
    );
    return result.rows.map(mapDocument);
  }

  async latestLegalDocument(
    documentType: LegalDocumentType,
  ): Promise<LegalDocumentRecord | null> {
    const result = await this.pool.query<LegalDocumentRow>(
      `
      SELECT ${DOCUMENT_COLUMNS}
      FROM legal_documents
      WHERE document_type = $1
      ORDER BY version DESC
      LIMIT 1
      `,
      [documentType],
    );
    return result.rows[0] == null ? null : mapDocument(result.rows[0]);
  }

  async createLegalDocument(
    record: LegalDocumentRecord,
  ): Promise<LegalDocumentRecord> {
    const result = await this.pool.query<LegalDocumentRow>(
      `
      INSERT INTO legal_documents (
        document_type, version, title, content, status,
        effective_at, published_at, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING ${DOCUMENT_COLUMNS}
      `,
      [
        record.documentType,
        record.version,
        record.title,
        record.content,
        record.status,
        record.effectiveAt,
        record.publishedAt,
        record.createdAt,
      ],
    );
    return mapDocument(result.rows[0]!);
  }

  async acceptLegalDocument(
    record: LegalDocumentAcceptanceRecord,
  ): Promise<LegalDocumentAcceptanceRecord> {
    const result = await this.pool.query<LegalAcceptanceRow>(
      `
      INSERT INTO legal_document_acceptances (
        id, subject_type, subject_id, document_type,
        document_version, accepted_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (
        subject_type, subject_id, document_type, document_version
      ) DO UPDATE SET accepted_at = legal_document_acceptances.accepted_at
      RETURNING
        id, subject_type, subject_id, document_type,
        document_version, accepted_at
      `,
      [
        record.id,
        record.subjectType,
        record.subjectId,
        record.documentType,
        record.documentVersion,
        record.acceptedAt,
      ],
    );
    return mapAcceptance(result.rows[0]!);
  }

  async listLegalAcceptances(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<LegalDocumentAcceptanceRecord[]> {
    const result = await this.pool.query<LegalAcceptanceRow>(
      `
      SELECT
        id, subject_type, subject_id, document_type,
        document_version, accepted_at
      FROM legal_document_acceptances
      WHERE subject_type = $1 AND subject_id = $2
      ORDER BY accepted_at DESC
      `,
      [subjectType, subjectId],
    );
    return result.rows.map(mapAcceptance);
  }

  async getPreferences(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<PrivacyPreferencesRecord | null> {
    const result = await this.pool.query<PrivacyPreferencesRow>(
      `
      SELECT
        subject_type, subject_id,
        marketing_notifications_enabled, updated_at
      FROM privacy_preferences
      WHERE subject_type = $1 AND subject_id = $2
      LIMIT 1
      `,
      [subjectType, subjectId],
    );
    return result.rows[0] == null ? null : mapPreferences(result.rows[0]);
  }

  async savePreferences(
    record: PrivacyPreferencesRecord,
  ): Promise<PrivacyPreferencesRecord> {
    const result = await this.pool.query<PrivacyPreferencesRow>(
      `
      INSERT INTO privacy_preferences (
        subject_type, subject_id,
        marketing_notifications_enabled, updated_at
      ) VALUES ($1,$2,$3,$4)
      ON CONFLICT (subject_type, subject_id)
      DO UPDATE SET
        marketing_notifications_enabled = EXCLUDED.marketing_notifications_enabled,
        updated_at = EXCLUDED.updated_at
      RETURNING
        subject_type, subject_id,
        marketing_notifications_enabled, updated_at
      `,
      [
        record.subjectType,
        record.subjectId,
        record.marketingNotificationsEnabled,
        record.updatedAt,
      ],
    );
    return mapPreferences(result.rows[0]!);
  }

  async createDataSubjectRequest(
    record: DataSubjectRequestRecord,
  ): Promise<DataSubjectRequestRecord> {
    const result = await this.pool.query<DataSubjectRequestRow>(
      `
      INSERT INTO data_subject_requests (
        id, subject_type, subject_id, request_type, status,
        note, response, responded_by_name, responded_at,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING ${REQUEST_COLUMNS}
      `,
      [
        record.id,
        record.subjectType,
        record.subjectId,
        record.requestType,
        record.status,
        record.note ?? null,
        record.response ?? null,
        record.respondedByName ?? null,
        record.respondedAt ?? null,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return mapRequest(result.rows[0]!);
  }

  async listDataSubjectRequestsForSubject(
    subjectType: AuthSubjectType,
    subjectId: string,
    limit: number,
  ): Promise<DataSubjectRequestRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<DataSubjectRequestRow>(
      `
      SELECT ${REQUEST_COLUMNS}
      FROM data_subject_requests
      WHERE subject_type = $1 AND subject_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3
      `,
      [subjectType, subjectId, safeLimit],
    );
    return result.rows.map(mapRequest);
  }

  async listDataSubjectRequestsForAdmin(input: {
    status?: DataSubjectRequestStatus;
    limit: number;
    cursor?: { createdAt: string; id: string };
  }): Promise<DataSubjectRequestAdminPage> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(input.limit)));
    const result = await this.pool.query<DataSubjectRequestRow>(
      `
      SELECT ${REQUEST_COLUMNS}
      FROM data_subject_requests
      WHERE ($1::text IS NULL OR status = $1)
        AND (
          $2::timestamptz IS NULL OR
          created_at < $2 OR
          (created_at = $2 AND id < $3::uuid)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $4
      `,
      [
        input.status ?? null,
        input.cursor?.createdAt ?? null,
        input.cursor?.id ?? null,
        safeLimit + 1,
      ],
    );
    return {
      requests: result.rows.slice(0, safeLimit).map(mapRequest),
      hasMore: result.rows.length > safeLimit,
    };
  }

  async updateDataSubjectRequest(input: {
    id: string;
    status: 'in_progress' | 'completed' | 'rejected';
    response?: string;
    respondedByName?: string;
    respondedAt?: string;
    updatedAt: string;
  }): Promise<DataSubjectRequestRecord | null> {
    const result = await this.pool.query<DataSubjectRequestRow>(
      `
      UPDATE data_subject_requests
      SET
        status = $2,
        response = $3,
        responded_by_name = $4,
        responded_at = $5,
        updated_at = $6
      WHERE id = $1
      RETURNING ${REQUEST_COLUMNS}
      `,
      [
        input.id,
        input.status,
        input.response ?? null,
        input.respondedByName ?? null,
        input.respondedAt ?? null,
        input.updatedAt,
      ],
    );
    return result.rows[0] == null ? null : mapRequest(result.rows[0]);
  }
}
