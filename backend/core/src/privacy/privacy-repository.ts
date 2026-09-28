import type { AuthSubjectType } from '../auth/auth-session-repository.js';

export type LegalDocumentType = 'privacy_policy' | 'terms_of_use';
export type LegalDocumentStatus = 'published' | 'retired';

export interface LegalDocumentRecord {
  documentType: LegalDocumentType;
  version: number;
  title: string;
  content: string;
  status: LegalDocumentStatus;
  effectiveAt: string;
  publishedAt: string;
  createdAt: string;
}

export interface LegalDocumentAcceptanceRecord {
  id: string;
  subjectType: AuthSubjectType;
  subjectId: string;
  documentType: LegalDocumentType;
  documentVersion: number;
  acceptedAt: string;
}

export interface PrivacyPreferencesRecord {
  subjectType: AuthSubjectType;
  subjectId: string;
  marketingNotificationsEnabled: boolean;
  updatedAt: string;
}

export type DataSubjectRequestType =
  | 'access'
  | 'correction'
  | 'deletion'
  | 'anonymization'
  | 'portability'
  | 'consent_revocation';

export type DataSubjectRequestStatus =
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'rejected';

export interface DataSubjectRequestRecord {
  id: string;
  subjectType: AuthSubjectType;
  subjectId: string;
  requestType: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  note?: string;
  response?: string;
  respondedByName?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataSubjectRequestCursor {
  createdAt: string;
  id: string;
}

export interface DataSubjectRequestAdminPage {
  requests: DataSubjectRequestRecord[];
  hasMore: boolean;
}

export interface PrivacyRepository {
  listPublishedLegalDocuments(at: string): Promise<LegalDocumentRecord[]>;
  latestLegalDocument(
    documentType: LegalDocumentType,
  ): Promise<LegalDocumentRecord | null>;
  createLegalDocument(
    record: LegalDocumentRecord,
  ): Promise<LegalDocumentRecord>;
  acceptLegalDocument(
    record: LegalDocumentAcceptanceRecord,
  ): Promise<LegalDocumentAcceptanceRecord>;
  listLegalAcceptances(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<LegalDocumentAcceptanceRecord[]>;

  getPreferences(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<PrivacyPreferencesRecord | null>;
  savePreferences(
    record: PrivacyPreferencesRecord,
  ): Promise<PrivacyPreferencesRecord>;

  createDataSubjectRequest(
    record: DataSubjectRequestRecord,
  ): Promise<DataSubjectRequestRecord>;
  listDataSubjectRequestsForSubject(
    subjectType: AuthSubjectType,
    subjectId: string,
    limit: number,
  ): Promise<DataSubjectRequestRecord[]>;
  listDataSubjectRequestsForAdmin(input: {
    status?: DataSubjectRequestStatus;
    limit: number;
    cursor?: DataSubjectRequestCursor;
  }): Promise<DataSubjectRequestAdminPage>;
  updateDataSubjectRequest(input: {
    id: string;
    status: Exclude<DataSubjectRequestStatus, 'open'>;
    response?: string;
    respondedByName?: string;
    respondedAt?: string;
    updatedAt: string;
  }): Promise<DataSubjectRequestRecord | null>;
}
