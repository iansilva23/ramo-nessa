import type { AdminActor } from '../admin/admin-repository.js';

export const DRIVER_DOCUMENT_TYPES = [
  'driver_license',
  'vehicle_registration',
] as const;

export type DriverDocumentType =
  (typeof DRIVER_DOCUMENT_TYPES)[number];

export type DriverDocumentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired';

export interface DriverDocumentRecord {
  id: string;
  driverId: string;
  documentType: DriverDocumentType;
  storageKey: string;
  contentSha256: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  expiresOn?: string;
  status: DriverDocumentStatus;
  isCurrent: boolean;
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: AdminActor;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDocumentRepository {
  listCurrent(driverId: string): Promise<DriverDocumentRecord[]>;
  findCurrent(
    driverId: string,
    documentType: DriverDocumentType,
  ): Promise<DriverDocumentRecord | null>;
  submitCurrent(
    record: DriverDocumentRecord,
  ): Promise<DriverDocumentRecord>;
  reviewCurrent(input: {
    driverId: string;
    documentType: DriverDocumentType;
    expectedStatus: 'pending' | 'approved';
    status: Exclude<DriverDocumentStatus, 'pending'>;
    rejectionReason?: string | undefined;
    reviewedAt: string;
    reviewedBy: AdminActor;
  }): Promise<DriverDocumentRecord | null>;
}
