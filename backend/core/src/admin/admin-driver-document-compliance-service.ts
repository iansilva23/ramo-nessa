import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import type {
  OperationalSettingsRepository,
} from '../config/operational-settings-repository.js';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
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
      const statusChangedAt =
        status === 'expired' && record?.expiresOn != null
          ? `${record.expiresOn}T00:00:00.000Z`
          : record?.updatedAt ?? '1970-01-01T00:00:00.000Z';
      return {
        documentType,
        status,
        label: issueLabel(documentType, status),
        statusChangedAt,
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
  const latestIssueAt = issues.reduce<string | null>(
    (latest, issue) => {
      if (
        latest == null ||
        Date.parse(issue.statusChangedAt) > Date.parse(latest)
      ) {
        return issue.statusChangedAt;
      }
      return latest;
    },
    null,
  );
  const acknowledgedAt = control?.acknowledgedAt ?? null;
  const issueChangedAfterDecision =
    latestIssueAt != null &&
    (
      acknowledgedAt == null ||
      Date.parse(latestIssueAt) > Date.parse(acknowledgedAt)
    );

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
      !autoEnforcementEnabled &&
      issueChangedAfterDecision,
    notifiedAt: control?.notifiedAt ?? null,
    acknowledgedAt,
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


export async function listAdminDriverDocumentComplianceAlerts(input: {
  identities: AuthOtpRepository;
  documents: DriverDocumentRepository;
  controls: DriverDocumentComplianceRepository;
  settings: OperationalSettingsRepository;
  now?: Date;
  maxDrivers?: number;
}) {
  const now = input.now ?? new Date();
  const maxDrivers = Math.max(
    1,
    Math.min(1000, input.maxDrivers ?? 500),
  );
  const identities = [];
  let cursor:
    | { updatedAt: string; id: string }
    | undefined;

  while (identities.length < maxDrivers) {
    const page = await input.identities.listIdentities({
      subjectType: 'driver',
      status: 'active',
      limit: Math.min(100, maxDrivers - identities.length),
      ...(cursor == null ? {} : { cursor }),
    });
    identities.push(...page.identities);
    if (!page.hasMore || page.identities.length === 0) break;
    const last = page.identities[page.identities.length - 1]!;
    cursor = {
      updatedAt: last.updatedAt,
      id: last.id,
    };
  }

  const alerts = (
    await Promise.all(
      identities.map(async (identity) => {
        const compliance = await adminDriverDocumentComplianceView({
          documents: input.documents,
          controls: input.controls,
          settings: input.settings,
          driverId: identity.subjectId,
          now,
        });
        if (compliance.documentsApproved) return null;
        return {
          driverId: identity.subjectId,
          phoneE164: identity.phoneE164,
          ...compliance,
        };
      }),
    )
  )
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => {
      const rank = (item: {
        effectiveBlocked: boolean;
        decisionRequired: boolean;
        notifiedAt: string | null;
      }) => {
        if (item.decisionRequired) return 0;
        if (item.effectiveBlocked) return 1;
        if (item.notifiedAt == null) return 2;
        return 3;
      };
      return rank(a) - rank(b) ||
        a.driverId.localeCompare(b.driverId);
    });

  return {
    mode:
      (await input.settings.get()).driverDocumentAutoEnforcement
        ? 'automatic'
        : 'manual',
    total: alerts.length,
    decisionRequired: alerts.filter(
      (item) => item.decisionRequired,
    ).length,
    blocked: alerts.filter(
      (item) => item.effectiveBlocked,
    ).length,
    items: alerts,
  };
}
