import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import type {
  OperationalSettingsRepository,
} from '../config/operational-settings-repository.js';
import type {
  DriverDocumentRepository,
  DriverDocumentType,
} from '../drivers/driver-document-repository.js';
import type {
  DriverDocumentComplianceRepository,
} from '../drivers/driver-document-compliance-repository.js';
import type { PushNotificationService } from '../notifications/push-notification-service.js';

export class AdminDriverDocumentComplianceError extends Error {
  constructor(
    public readonly code:
      | 'PUSH_PROVIDER_DISABLED'
      | 'DOCUMENT_COMPLIANCE_NOT_ACTIONABLE',
    message: string,
  ) {
    super(message);
    this.name = 'AdminDriverDocumentComplianceError';
  }
}

const REQUIRED_DOCUMENTS: readonly DriverDocumentType[] = [
  'driver_license',
  'vehicle_registration',
];

function effectiveStatus(
  record: Awaited<ReturnType<DriverDocumentRepository['findCurrent']>>,
  today: string,
): 'missing' | 'pending' | 'approved' | 'rejected' | 'expired' {
  if (record == null) return 'missing';
  if (
    record.status === 'approved' &&
    record.expiresOn != null &&
    record.expiresOn < today
  ) {
    return 'expired';
  }
  return record.status;
}

function issueLabel(
  type: DriverDocumentType,
  status: ReturnType<typeof effectiveStatus>,
): string {
  const document =
    type === 'driver_license' ? 'CNH' : 'CRLV';
  switch (status) {
    case 'missing':
      return `${document} não enviada`;
    case 'pending':
      return `${document} aguardando análise`;
    case 'rejected':
      return `${document} rejeitada`;
    case 'expired':
      return `${document} vencida`;
    case 'approved':
      return `${document} aprovada`;
  }
}

export async function adminDriverDocumentComplianceView(input: {
  documents: DriverDocumentRepository;
  controls: DriverDocumentComplianceRepository;
  settings: OperationalSettingsRepository;
  driverId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const [records, control, settings] = await Promise.all([
    input.documents.listCurrent(input.driverId),
    input.controls.get(input.driverId),
    input.settings.get(),
  ]);
  const byType = new Map(
    records.map((record) => [record.documentType, record]),
  );
  const issues = REQUIRED_DOCUMENTS
    .map((documentType) => {
      const record = byType.get(documentType) ?? null;
      const status = effectiveStatus(record, today);
      return {
        documentType,
        status,
        label: issueLabel(documentType, status),
        ...(record?.expiresOn == null
          ? {}
          : { expiresOn: record.expiresOn }),
        ...(record?.rejectionReason == null
          ? {}
          : { rejectionReason: record.rejectionReason }),
      };
    })
    .filter((item) => item.status !== 'approved');

  const documentsApproved = issues.length === 0;
  const manualBlocked = control?.manualBlocked === true;
  const autoEnforcementEnabled =
    settings.driverDocumentAutoEnforcement === true;
  const automaticBlock =
    autoEnforcementEnabled && !documentsApproved;
  const effectiveBlocked = manualBlocked || automaticBlock;

  return {
    driverId: input.driverId,
    documentsApproved,
    issues,
    mode: autoEnforcementEnabled ? 'automatic' : 'manual',
    autoEnforcementEnabled,
    manualBlocked,
    automaticBlock,
    effectiveBlocked,
    decisionRequired:
      !documentsApproved &&
      !effectiveBlocked &&
      !autoEnforcementEnabled,
    notifiedAt: control?.notifiedAt ?? null,
    acknowledgedAt: control?.acknowledgedAt ?? null,
    updatedAt: control?.updatedAt ?? null,
  };
}

export async function decideDriverDocumentCompliance(input: {
  documents: DriverDocumentRepository;
  controls: DriverDocumentComplianceRepository;
  settings: OperationalSettingsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  action: 'block' | 'keep_active' | 'unblock';
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const instant = now.toISOString();
  const current = await input.controls.get(input.driverId);
  const manualBlocked = input.action === 'block';

  await input.controls.save({
    driverId: input.driverId,
    manualBlocked,
    ...(current?.notifiedAt == null
      ? {}
      : { notifiedAt: current.notifiedAt }),
    acknowledgedAt: instant,
    updatedAt: instant,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action:
      input.action === 'block'
        ? 'driver.document_compliance.blocked'
        : input.action === 'unblock'
          ? 'driver.document_compliance.unblocked'
          : 'driver.document_compliance.kept_active',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      manualBlocked,
      decision: input.action,
    },
    createdAt: instant,
  });

  return adminDriverDocumentComplianceView({
    documents: input.documents,
    controls: input.controls,
    settings: input.settings,
    driverId: input.driverId,
    now,
  });
}

export async function notifyDriverDocumentCompliance(input: {
  documents: DriverDocumentRepository;
  controls: DriverDocumentComplianceRepository;
  settings: OperationalSettingsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  push: PushNotificationService;
  driverId: string;
  now?: Date;
}) {
  if (input.push.providerKind === 'disabled') {
    throw new AdminDriverDocumentComplianceError(
      'PUSH_PROVIDER_DISABLED',
      'O envio de aviso ao motorista ainda não está conectado ao Firebase.',
    );
  }

  const now = input.now ?? new Date();
  const status = await adminDriverDocumentComplianceView({
    documents: input.documents,
    controls: input.controls,
    settings: input.settings,
    driverId: input.driverId,
    now,
  });

  if (status.documentsApproved) {
    throw new AdminDriverDocumentComplianceError(
      'DOCUMENT_COMPLIANCE_NOT_ACTIONABLE',
      'Os documentos desse motorista já estão regulares.',
    );
  }

  const issueText = status.issues
    .map((issue) => issue.label)
    .join('; ');
  const stats = await input.push.notifySubject({
    subjectType: 'driver',
    subjectId: input.driverId,
    message: {
      type: 'driver.documents.attention',
      title: 'Atenção aos seus documentos',
      body:
        `${issueText}. Abra Documentos no app para conferir e regularizar.`,
      data: {
        section: 'documents',
      },
    },
    now,
  });

  const instant = now.toISOString();
  const current = await input.controls.get(input.driverId);
  await input.controls.save({
    driverId: input.driverId,
    manualBlocked: current?.manualBlocked ?? false,
    notifiedAt: instant,
    ...(current?.acknowledgedAt == null
      ? {}
      : { acknowledgedAt: current.acknowledgedAt }),
    updatedAt: instant,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'driver.document_compliance.notified',
    targetType: 'driver',
    targetId: input.driverId,
    metadata: {
      issues: status.issues.map((issue) => ({
        documentType: issue.documentType,
        status: issue.status,
      })),
      devices: stats.devices,
      delivered: stats.delivered,
      invalidated: stats.invalidated,
    },
    createdAt: instant,
  });

  return {
    ...status,
    notification: stats,
    notifiedAt: instant,
  };
}
