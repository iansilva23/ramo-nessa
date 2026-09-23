import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from '../admin/admin-repository.js';
import type {
  DriverDocumentRecord,
  DriverDocumentRepository,
  DriverDocumentStatus,
  DriverDocumentType,
} from './driver-document-repository.js';
import type {
  DriverRegistryRepository,
} from './driver-registry-repository.js';
import type {
  ReviewDriverDocumentRequest,
  SubmitDriverDocumentRequest,
} from './driver-document-validation.js';

export class DriverDocumentError extends Error {
  constructor(
    public readonly code:
      | 'DRIVER_REGISTRY_NOT_FOUND'
      | 'DRIVER_VEHICLE_NOT_FOUND'
      | 'DOCUMENT_NOT_FOUND'
      | 'DOCUMENT_STORAGE_REFERENCE_INVALID'
      | 'DOCUMENT_ALREADY_EXPIRED'
      | 'DOCUMENT_REVIEW_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'DriverDocumentError';
  }
}

function expirationIsPast(
  expiresOn: string | undefined,
  now: Date,
): boolean {
  if (expiresOn == null) return false;
  const today = now.toISOString().slice(0, 10);
  return expiresOn < today;
}

function safeDocumentView(
  record: DriverDocumentRecord,
  now: Date,
) {
  const expiredByDate =
    record.expiresOn != null &&
    record.expiresOn < now.toISOString().slice(0, 10);
  const effectiveStatus: DriverDocumentStatus =
    record.status === 'approved' && expiredByDate
      ? 'expired'
      : record.status;

  return {
    id: record.id,
    documentType: record.documentType,
    status: record.status,
    effectiveStatus,
    hasPrivateFile: true,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    ...(record.expiresOn == null
      ? {}
      : { expiresOn: record.expiresOn }),
    ...(record.rejectionReason == null
      ? {}
      : { rejectionReason: record.rejectionReason }),
    submittedAt: record.submittedAt,
    ...(record.reviewedAt == null
      ? {}
      : { reviewedAt: record.reviewedAt }),
    ...(record.reviewedBy == null
      ? {}
      : { reviewedBy: record.reviewedBy }),
    updatedAt: record.updatedAt,
  };
}

export async function getDriverDocumentsForAdmin(input: {
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  driverId: string;
  now?: Date;
}) {
  const profile = await input.registry.findProfile(input.driverId);
  if (profile == null) {
    throw new DriverDocumentError(
      'DRIVER_REGISTRY_NOT_FOUND',
      'Cadastre o perfil do motorista antes dos documentos.',
    );
  }

  const now = input.now ?? new Date();
  const records = await input.documents.listCurrent(input.driverId);
  const items = records.map((record) =>
    safeDocumentView(record, now),
  );
  const byType = new Map(
    items.map((item) => [item.documentType, item]),
  );

  const required = [
    'driver_license',
    'vehicle_registration',
  ] as const;
  const documentsApproved = required.every(
    (type) => byType.get(type)?.effectiveStatus === 'approved',
  );

  return {
    items,
    requiredDocumentTypes: required,
    documentsApproved,
  };
}

export async function submitDriverDocumentFromAdmin(input: {
  registry: DriverRegistryRepository;
  documents: DriverDocumentRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  documentType: DriverDocumentType;
  data: SubmitDriverDocumentRequest;
  now?: Date;
}) {
  const [profile, vehicle] = await Promise.all([
    input.registry.findProfile(input.driverId),
    input.registry.findVehicleByDriverId(input.driverId),
  ]);
  if (profile == null) {
    throw new DriverDocumentError(
      'DRIVER_REGISTRY_NOT_FOUND',
      'Cadastre o perfil do motorista antes dos documentos.',
    );
  }
  if (
    input.documentType === 'vehicle_registration' &&
    vehicle == null
  ) {
    throw new DriverDocumentError(
      'DRIVER_VEHICLE_NOT_FOUND',
      'Cadastre o veículo antes do CRLV.',
    );
  }

  const requiredPrefix = `drivers/${input.driverId}/`;
  if (!input.data.storageKey.startsWith(requiredPrefix)) {
    throw new DriverDocumentError(
      'DOCUMENT_STORAGE_REFERENCE_INVALID',
      'A referência privada não pertence a este motorista.',
    );
  }

  const now = input.now ?? new Date();
  if (expirationIsPast(input.data.expiresOn, now)) {
    throw new DriverDocumentError(
      'DOCUMENT_ALREADY_EXPIRED',
      'Não é possível registrar um documento já vencido.',
    );
  }

  const instant = now.toISOString();
  const record = await input.documents.submitCurrent({
    id: randomUUID(),
    driverId: input.driverId,
    documentType: input.documentType,
    storageKey: input.data.storageKey,
    contentSha256: input.data.contentSha256,
    mimeType: input.data.mimeType,
    sizeBytes: input.data.sizeBytes,
    ...(input.data.expiresOn == null
      ? {}
      : { expiresOn: input.data.expiresOn }),
    status: 'pending',
    isCurrent: true,
    submittedAt: instant,
    createdAt: instant,
    updatedAt: instant,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver.document.submitted',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      documentType: input.documentType,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      ...(record.expiresOn == null
        ? {}
        : { expiresOn: record.expiresOn }),
    },
    createdAt: instant,
  });

  return safeDocumentView(record, now);
}

export async function reviewDriverDocumentFromAdmin(input: {
  documents: DriverDocumentRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  documentType: DriverDocumentType;
  review: ReviewDriverDocumentRequest;
  now?: Date;
}) {
  const current = await input.documents.findCurrent(
    input.driverId,
    input.documentType,
  );
  if (current == null) {
    throw new DriverDocumentError(
      'DOCUMENT_NOT_FOUND',
      'Documento atual não encontrado.',
    );
  }

  const now = input.now ?? new Date();
  if (
    input.review.status === 'approved' &&
    expirationIsPast(current.expiresOn, now)
  ) {
    throw new DriverDocumentError(
      'DOCUMENT_ALREADY_EXPIRED',
      'Documento vencido não pode ser aprovado.',
    );
  }

  const expectedStatus =
    input.review.status === 'expired'
      ? 'approved'
      : 'pending';

  const instant = now.toISOString();
  const updated = await input.documents.reviewCurrent({
    driverId: input.driverId,
    documentType: input.documentType,
    expectedStatus,
    status: input.review.status,
    ...(input.review.rejectionReason == null
      ? {}
      : { rejectionReason: input.review.rejectionReason }),
    reviewedAt: instant,
    reviewedBy: input.actor,
  });
  if (updated == null) {
    throw new DriverDocumentError(
      'DOCUMENT_REVIEW_CONFLICT',
      'O documento mudou de estado antes desta revisão.',
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver.document.reviewed',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      documentType: input.documentType,
      status: updated.status,
    },
    createdAt: instant,
  });

  return safeDocumentView(updated, now);
}
