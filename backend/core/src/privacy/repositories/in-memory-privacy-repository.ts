import type {
  DataSubjectRequestAdminPage,
  DataSubjectRequestRecord,
  LegalDocumentAcceptanceRecord,
  LegalDocumentRecord,
  LegalDocumentType,
  PrivacyPreferencesRecord,
  PrivacyRepository,
} from '../privacy-repository.js';
import type { AuthSubjectType } from '../../auth/auth-session-repository.js';

function requestKey(subjectType: AuthSubjectType, subjectId: string): string {
  return `${subjectType}:${subjectId}`;
}

export class InMemoryPrivacyRepository implements PrivacyRepository {
  private readonly documents: LegalDocumentRecord[] = [];
  private readonly acceptances: LegalDocumentAcceptanceRecord[] = [];
  private readonly preferences = new Map<string, PrivacyPreferencesRecord>();
  private readonly requests = new Map<string, DataSubjectRequestRecord>();

  async listPublishedLegalDocuments(at: string): Promise<LegalDocumentRecord[]> {
    const current = new Map<LegalDocumentType, LegalDocumentRecord>();
    for (const document of this.documents) {
      if (
        document.status !== 'published' ||
        document.effectiveAt > at
      ) {
        continue;
      }
      const previous = current.get(document.documentType);
      if (
        previous == null ||
        document.effectiveAt > previous.effectiveAt ||
        (
          document.effectiveAt === previous.effectiveAt &&
          document.version > previous.version
        )
      ) {
        current.set(document.documentType, document);
      }
    }
    return [...current.values()].map((document) => structuredClone(document));
  }

  async latestLegalDocument(
    documentType: LegalDocumentType,
  ): Promise<LegalDocumentRecord | null> {
    const found = this.documents
      .filter((document) => document.documentType === documentType)
      .sort((a, b) => b.version - a.version)[0];
    return found == null ? null : structuredClone(found);
  }

  async createLegalDocument(
    record: LegalDocumentRecord,
  ): Promise<LegalDocumentRecord> {
    if (
      this.documents.some(
        (document) =>
          document.documentType === record.documentType &&
          document.version === record.version,
      )
    ) {
      throw new Error('Versão de documento legal duplicada.');
    }
    this.documents.push(structuredClone(record));
    return structuredClone(record);
  }

  async acceptLegalDocument(
    record: LegalDocumentAcceptanceRecord,
  ): Promise<LegalDocumentAcceptanceRecord> {
    const existing = this.acceptances.find(
      (acceptance) =>
        acceptance.subjectType === record.subjectType &&
        acceptance.subjectId === record.subjectId &&
        acceptance.documentType === record.documentType &&
        acceptance.documentVersion === record.documentVersion,
    );
    if (existing != null) return structuredClone(existing);
    this.acceptances.push(structuredClone(record));
    return structuredClone(record);
  }

  async listLegalAcceptances(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<LegalDocumentAcceptanceRecord[]> {
    return this.acceptances
      .filter(
        (acceptance) =>
          acceptance.subjectType === subjectType &&
          acceptance.subjectId === subjectId,
      )
      .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))
      .map((acceptance) => structuredClone(acceptance));
  }

  async getPreferences(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<PrivacyPreferencesRecord | null> {
    const found = this.preferences.get(requestKey(subjectType, subjectId));
    return found == null ? null : structuredClone(found);
  }

  async savePreferences(
    record: PrivacyPreferencesRecord,
  ): Promise<PrivacyPreferencesRecord> {
    this.preferences.set(
      requestKey(record.subjectType, record.subjectId),
      structuredClone(record),
    );
    return structuredClone(record);
  }

  async createDataSubjectRequest(
    record: DataSubjectRequestRecord,
  ): Promise<DataSubjectRequestRecord> {
    if (this.requests.has(record.id)) {
      throw new Error('Solicitação de privacidade duplicada.');
    }
    this.requests.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async listDataSubjectRequestsForSubject(
    subjectType: AuthSubjectType,
    subjectId: string,
    limit: number,
  ): Promise<DataSubjectRequestRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return [...this.requests.values()]
      .filter(
        (request) =>
          request.subjectType === subjectType &&
          request.subjectId === subjectId,
      )
      .sort((a, b) => {
        const created = b.createdAt.localeCompare(a.createdAt);
        return created !== 0 ? created : b.id.localeCompare(a.id);
      })
      .slice(0, safeLimit)
      .map((request) => structuredClone(request));
  }

  async listDataSubjectRequestsForAdmin(input: {
    status?: DataSubjectRequestRecord['status'];
    limit: number;
    cursor?: { createdAt: string; id: string };
  }): Promise<DataSubjectRequestAdminPage> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(input.limit)));
    const filtered = [...this.requests.values()]
      .filter(
        (request) => input.status == null || request.status === input.status,
      )
      .filter((request) => {
        if (input.cursor == null) return true;
        return (
          request.createdAt < input.cursor.createdAt ||
          (
            request.createdAt === input.cursor.createdAt &&
            request.id < input.cursor.id
          )
        );
      })
      .sort((a, b) => {
        const created = b.createdAt.localeCompare(a.createdAt);
        return created !== 0 ? created : b.id.localeCompare(a.id);
      });
    const rows = filtered.slice(0, safeLimit + 1);
    return {
      requests: rows.slice(0, safeLimit).map((request) => structuredClone(request)),
      hasMore: rows.length > safeLimit,
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
    const found = this.requests.get(input.id);
    if (found == null) return null;
    const updated: DataSubjectRequestRecord = {
      ...found,
      status: input.status,
      ...(input.response == null ? {} : { response: input.response }),
      ...(input.respondedByName == null
        ? {}
        : { respondedByName: input.respondedByName }),
      ...(input.respondedAt == null ? {} : { respondedAt: input.respondedAt }),
      updatedAt: input.updatedAt,
    };
    this.requests.set(input.id, updated);
    return structuredClone(updated);
  }
}
