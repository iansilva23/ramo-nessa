import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';

import {
  DriverDocumentInspectionError,
  issueDriverDocumentInspection,
  readDriverDocumentInspection,
} from '../src/drivers/driver-document-inspection.js';
import type {
  PrivateDocumentStorage,
} from '../src/drivers/driver-document-private-storage.js';
import { InMemoryDriverDocumentRepository } from '../src/drivers/repositories/in-memory-driver-document-repository.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';

const pdfBytes = Buffer.from(
  '%PDF-1.4\n% Ramo Nessa private document fixture\n',
  'utf8',
);
const pdfSha = createHash('sha256').update(pdfBytes).digest('hex');

async function fixture() {
  const documents = new InMemoryDriverDocumentRepository();
  const admin = new InMemoryAdminRepository();
  await documents.submitCurrent({
    id: '11111111-1111-4111-8111-111111111111',
    driverId: 'driver-inspection-test',
    documentType: 'driver_license',
    storageKey:
      'drivers/driver-inspection-test/documents/cnh-private.pdf',
    contentSha256: pdfSha,
    mimeType: 'application/pdf',
    sizeBytes: pdfBytes.length,
    status: 'pending',
    isCurrent: true,
    submittedAt: '2026-09-24T02:00:00.000Z',
    createdAt: '2026-09-24T02:00:00.000Z',
    updatedAt: '2026-09-24T02:00:00.000Z',
  });

  const storage: PrivateDocumentStorage = {
    async read(storageKey) {
      assert.equal(
        storageKey,
        'drivers/driver-inspection-test/documents/cnh-private.pdf',
      );
      return {
        bytes: Buffer.from(pdfBytes),
        contentType: 'application/pdf',
      };
    },
  };
  return { documents, admin, storage };
}

test('inspeção emite token opaco auditado e valida arquivo privado', async () => {
  const { documents, admin, storage } = await fixture();
  const key = randomBytes(32);
  const now = new Date('2026-09-24T02:10:00.000Z');

  const issued = await issueDriverDocumentInspection({
    documents,
    admin,
    actor: {
      kind: 'user',
      id: 'admin-inspection-test',
      name: 'Admin Inspection Test',
    },
    driverId: 'driver-inspection-test',
    documentType: 'driver_license',
    encryptionKey: key,
    ttlSeconds: 60,
    now,
  });

  assert.match(
    issued.inspectionToken,
    /^rn_doc_inspect_v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  );
  assert.equal(
    issued.inspectionToken.includes('cnh-private'),
    false,
  );
  assert.equal(
    issued.expiresAt,
    '2026-09-24T02:11:00.000Z',
  );

  const inspected = await readDriverDocumentInspection({
    token: issued.inspectionToken,
    encryptionKey: key,
    storage,
    now: new Date('2026-09-24T02:10:30.000Z'),
  });
  assert.equal(inspected.mimeType, 'application/pdf');
  assert.equal(inspected.documentType, 'driver_license');
  assert.deepEqual(inspected.bytes, pdfBytes);

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 1);
  assert.equal(
    audit[0]?.action,
    'driver.document.inspection_requested',
  );
  assert.equal(audit[0]?.actor.kind, 'user');
  const serializedAudit = JSON.stringify(audit[0]);
  assert.equal(serializedAudit.includes('storageKey'), false);
  assert.equal(serializedAudit.includes('cnh-private'), false);
  assert.equal(
    serializedAudit.includes(issued.inspectionToken),
    false,
  );
});

test('token adulterado e token expirado são recusados', async () => {
  const { documents, admin, storage } = await fixture();
  const key = randomBytes(32);
  const issued = await issueDriverDocumentInspection({
    documents,
    admin,
    actor: {
      kind: 'user',
      id: 'admin-inspection-test',
      name: 'Admin Inspection Test',
    },
    driverId: 'driver-inspection-test',
    documentType: 'driver_license',
    encryptionKey: key,
    ttlSeconds: 60,
    now: new Date('2026-09-24T02:10:00.000Z'),
  });

  const last = issued.inspectionToken.at(-1);
  const tampered =
    issued.inspectionToken.slice(0, -1) +
    (last === 'A' ? 'B' : 'A');

  await assert.rejects(
    readDriverDocumentInspection({
      token: tampered,
      encryptionKey: key,
      storage,
      now: new Date('2026-09-24T02:10:30.000Z'),
    }),
    (error: unknown) =>
      error instanceof DriverDocumentInspectionError &&
      error.code === 'DOCUMENT_INSPECTION_TOKEN_INVALID',
  );

  await assert.rejects(
    readDriverDocumentInspection({
      token: issued.inspectionToken,
      encryptionKey: key,
      storage,
      now: new Date('2026-09-24T02:11:00.000Z'),
    }),
    (error: unknown) =>
      error instanceof DriverDocumentInspectionError &&
      error.code === 'DOCUMENT_INSPECTION_TOKEN_EXPIRED',
  );
});

test('hash, MIME, tamanho ou assinatura divergente bloqueiam inspeção', async () => {
  const { documents, admin } = await fixture();
  const key = randomBytes(32);
  const issued = await issueDriverDocumentInspection({
    documents,
    admin,
    actor: {
      kind: 'user',
      id: 'admin-inspection-test',
      name: 'Admin Inspection Test',
    },
    driverId: 'driver-inspection-test',
    documentType: 'driver_license',
    encryptionKey: key,
    ttlSeconds: 60,
    now: new Date('2026-09-24T02:10:00.000Z'),
  });

  const badStorage: PrivateDocumentStorage = {
    async read() {
      const bytes = Buffer.from(
        'not a pdf but with a different hash',
        'utf8',
      );
      return { bytes, contentType: 'application/pdf' };
    },
  };

  await assert.rejects(
    readDriverDocumentInspection({
      token: issued.inspectionToken,
      encryptionKey: key,
      storage: badStorage,
      now: new Date('2026-09-24T02:10:30.000Z'),
    }),
    (error: unknown) =>
      error instanceof DriverDocumentInspectionError &&
      error.code === 'DOCUMENT_INSPECTION_INTEGRITY_FAILED',
  );
});
