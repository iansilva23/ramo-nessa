import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminDriverDocumentComplianceView,
  decideDriverDocumentCompliance,
  listAdminDriverDocumentComplianceAlerts,
} from '../src/admin/admin-driver-document-compliance-service.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryOperationalSettingsRepository } from '../src/config/in-memory-operational-settings-repository.js';
import {
  DriverAppError,
  updateDriverSupplyFromApp,
} from '../src/drivers/driver-app-service.js';
import { driverOperationalEligibility } from '../src/drivers/driver-operational-eligibility.js';
import { InMemoryDriverDocumentComplianceRepository } from '../src/drivers/repositories/in-memory-driver-document-compliance-repository.js';
import { InMemoryDriverDocumentRepository } from '../src/drivers/repositories/in-memory-driver-document-repository.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';

const now = new Date('2026-09-25T12:00:00.000Z');
const actor = {
  kind: 'user' as const,
  id: 'admin-document-compliance',
  name: 'Operador Ramo Nessa',
};

async function approvedRegistry(
  registry: InMemoryDriverRegistryRepository,
  driverId: string,
) {
  await registry.upsertProfile({
    driverId,
    fullName: 'Motorista Teste',
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await registry.upsertVehicle({
    id: `vehicle-${driverId}`,
    driverId,
    plateNormalized: 'ABC1D23',
    make: 'Toyota',
    model: 'Corolla',
    modelYear: 2025,
    color: 'Prata',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

async function approvedDocuments(
  documents: InMemoryDriverDocumentRepository,
  driverId: string,
  expiresOn = '2028-09-25',
) {
  for (const documentType of [
    'driver_license',
    'vehicle_registration',
  ] as const) {
    await documents.submitCurrent({
      id: `${driverId}-${documentType}`,
      driverId,
      documentType,
      storageKey: `drivers/${driverId}/${documentType}/file.pdf`,
      contentSha256: 'b'.repeat(64),
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      expiresOn,
      status: 'approved',
      isCurrent: true,
      submittedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
}

test('modo manual alerta pendência sem bloquear novas corridas sozinho', async () => {
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const controls = new InMemoryDriverDocumentComplianceRepository();
  const settings = new InMemoryOperationalSettingsRepository();
  const driverId = 'driver-manual-docs';

  await approvedRegistry(registry, driverId);

  const status = await adminDriverDocumentComplianceView({
    documents,
    controls,
    settings,
    driverId,
    now,
  });

  assert.equal(status.mode, 'manual');
  assert.equal(status.autoEnforcementEnabled, false);
  assert.equal(status.documentsApproved, false);
  assert.equal(status.decisionRequired, true);
  assert.equal(status.effectiveBlocked, false);
  assert.equal(status.issues.length, 2);

  const eligibility = await driverOperationalEligibility({
    registry,
    documents,
    driverId,
    enforceDocuments: false,
    manualDocumentBlocked: false,
    now,
  });
  assert.equal(eligibility.eligible, true);
});

test('Admin pode manter ativo ou bloquear novas corridas sem suspender a conta', async () => {
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const controls = new InMemoryDriverDocumentComplianceRepository();
  const settings = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();
  const driverId = 'driver-human-decision';

  await approvedRegistry(registry, driverId);

  const kept = await decideDriverDocumentCompliance({
    documents,
    controls,
    settings,
    admin,
    actor,
    driverId,
    action: 'keep_active',
    now,
  });
  assert.equal(kept.manualBlocked, false);
  assert.equal(kept.effectiveBlocked, false);
  assert.ok(kept.acknowledgedAt);

  const blocked = await decideDriverDocumentCompliance({
    documents,
    controls,
    settings,
    admin,
    actor,
    driverId,
    action: 'block',
    now: new Date('2026-09-25T12:05:00.000Z'),
  });
  assert.equal(blocked.manualBlocked, true);
  assert.equal(blocked.effectiveBlocked, true);

  const eligibility = await driverOperationalEligibility({
    registry,
    documents,
    driverId,
    enforceDocuments: false,
    manualDocumentBlocked: true,
    now,
  });
  assert.equal(eligibility.eligible, false);
  if (!eligibility.eligible) {
    assert.equal(eligibility.reason, 'manual_document_block');
  }

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 2);
  assert.equal(
    audit[0]?.action,
    'driver.document_compliance.blocked',
  );
  assert.equal(
    audit[1]?.action,
    'driver.document_compliance.kept_active',
  );
});

test('modo automático só bloqueia documentos irregulares quando Admin liga o toggle', async () => {
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const controls = new InMemoryDriverDocumentComplianceRepository();
  const settings = new InMemoryOperationalSettingsRepository();
  const driverId = 'driver-auto-docs';

  await approvedRegistry(registry, driverId);
  await settings.update({
    driverDocumentAutoEnforcement: true,
    updatedAt: now.toISOString(),
  });

  const status = await adminDriverDocumentComplianceView({
    documents,
    controls,
    settings,
    driverId,
    now,
  });
  assert.equal(status.mode, 'automatic');
  assert.equal(status.automaticBlock, true);
  assert.equal(status.effectiveBlocked, true);
  assert.equal(status.decisionRequired, false);

  const blocked = await driverOperationalEligibility({
    registry,
    documents,
    driverId,
    enforceDocuments: true,
    manualDocumentBlocked: false,
    now,
  });
  assert.equal(blocked.eligible, false);
  if (!blocked.eligible) {
    assert.equal(blocked.reason, 'documents');
  }

  await approvedDocuments(documents, driverId);
  const restored = await driverOperationalEligibility({
    registry,
    documents,
    driverId,
    enforceDocuments: true,
    manualDocumentBlocked: false,
    now,
  });
  assert.equal(restored.eligible, true);
});

test('corrida ativa continua enviando GPS mesmo com bloqueio manual', async () => {
  const drivers = new InMemoryDriverSupplyRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const driverId = 'driver-active-ride';

  await approvedRegistry(registry, driverId);
  await drivers.upsert({
    driverId,
    vehicleId: `vehicle-${driverId}`,
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: true,
    latitude: -2.82,
    longitude: -40.41,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const updated = await updateDriverSupplyFromApp({
    drivers,
    registry,
    documents,
    driverId,
    enforceDocuments: false,
    manualDocumentBlocked: true,
    latitude: -2.821,
    longitude: -40.412,
    now: new Date('2026-09-25T12:10:00.000Z'),
  });

  assert.equal(updated.busy, true);
  assert.equal(updated.online, true);
  assert.equal(updated.latitude, -2.821);
  assert.equal(updated.longitude, -40.412);
});

test('bloqueio manual impede ficar online quando não há corrida ativa', async () => {
  const drivers = new InMemoryDriverSupplyRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const driverId = 'driver-manually-blocked';

  await approvedRegistry(registry, driverId);

  await assert.rejects(
    updateDriverSupplyFromApp({
      drivers,
      registry,
      documents,
      driverId,
      enforceDocuments: false,
      manualDocumentBlocked: true,
      online: true,
      latitude: -2.82,
      longitude: -40.41,
      now,
    }),
    (error: unknown) =>
      error instanceof DriverAppError &&
      error.code === 'DRIVER_DOCUMENTS_NOT_APPROVED',
  );
});


test('lista do ADM respeita decisão de manter ativo até a pendência mudar', async () => {
  const identities = new InMemoryAuthOtpRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const controls = new InMemoryDriverDocumentComplianceRepository();
  const settings = new InMemoryOperationalSettingsRepository();
  const admin = new InMemoryAdminRepository();
  const driverId = 'driver-alert-decision';

  await identities.createIdentity({
    id: 'identity-driver-alert-decision',
    subjectId: driverId,
    subjectType: 'driver',
    phoneE164: '+5588999999999',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  let alerts = await listAdminDriverDocumentComplianceAlerts({
    identities,
    documents,
    controls,
    settings,
    now,
  });
  assert.equal(alerts.total, 1);
  assert.equal(alerts.decisionRequired, 1);
  assert.equal(alerts.items[0]?.decisionRequired, true);

  await decideDriverDocumentCompliance({
    documents,
    controls,
    settings,
    admin,
    actor,
    driverId,
    action: 'keep_active',
    now: new Date('2026-09-25T12:05:00.000Z'),
  });

  alerts = await listAdminDriverDocumentComplianceAlerts({
    identities,
    documents,
    controls,
    settings,
    now: new Date('2026-09-25T12:06:00.000Z'),
  });
  assert.equal(alerts.total, 1);
  assert.equal(alerts.decisionRequired, 0);
  assert.equal(alerts.items[0]?.decisionRequired, false);
  assert.equal(alerts.items[0]?.effectiveBlocked, false);

  await documents.submitCurrent({
    id: 'driver-alert-decision-driver-license',
    driverId,
    documentType: 'driver_license',
    storageKey:
      'drivers/driver-alert-decision/driver_license/new.pdf',
    contentSha256: 'c'.repeat(64),
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    expiresOn: '2028-09-25',
    status: 'pending',
    isCurrent: true,
    submittedAt: '2026-09-25T12:10:00.000Z',
    createdAt: '2026-09-25T12:10:00.000Z',
    updatedAt: '2026-09-25T12:10:00.000Z',
  });

  alerts = await listAdminDriverDocumentComplianceAlerts({
    identities,
    documents,
    controls,
    settings,
    now: new Date('2026-09-25T12:11:00.000Z'),
  });
  assert.equal(alerts.decisionRequired, 1);
  assert.equal(alerts.items[0]?.decisionRequired, true);
});
