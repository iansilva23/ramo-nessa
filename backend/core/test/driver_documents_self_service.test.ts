import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DriverDocumentError,
  submitDriverDocumentFromDriverApp,
} from '../src/drivers/driver-document-service.js';
import { LocalPrivateDocumentStorage } from '../src/drivers/driver-document-private-storage.js';
import { InMemoryDriverDocumentRepository } from '../src/drivers/repositories/in-memory-driver-document-repository.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';

async function setup() {
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const directory = await mkdtemp(
    join(tmpdir(), 'ramo-driver-documents-'),
  );
  const storage = new LocalPrivateDocumentStorage(directory);
  const instant = '2026-09-24T20:00:00.000Z';

  await registry.upsertProfile({
    driverId: 'driver-doc-self',
    fullName: 'Motorista Documentos',
    status: 'approved',
    createdAt: instant,
    updatedAt: instant,
  });

  return { registry, documents, storage, directory };
}

test('motorista envia CNH privada e documento entra em análise', async () => {
  const { registry, documents, storage, directory } = await setup();

  try {
    const bytes = Buffer.from(
      '%PDF-1.4\n% CNH privada do teste\n',
      'utf8',
    );
    const result = await submitDriverDocumentFromDriverApp({
      registry,
      documents,
      storage,
      driverId: 'driver-doc-self',
      documentType: 'driver_license',
      bytes,
      mimeType: 'application/pdf',
      expiresOn: '2028-09-24',
      now: new Date('2026-09-24T21:00:00.000Z'),
    });

    assert.equal(result.documentType, 'driver_license');
    assert.equal(result.status, 'pending');
    assert.equal(result.effectiveStatus, 'pending');
    assert.equal(result.mimeType, 'application/pdf');
    assert.equal(result.sizeBytes, bytes.length);
    assert.equal(result.expiresOn, '2028-09-24');

    const current = await documents.findCurrent(
      'driver-doc-self',
      'driver_license',
    );
    assert.ok(current);
    assert.match(
      current.storageKey,
      /^drivers\/driver-doc-self\/driver_license\/.+\.pdf$/,
    );

    const stored = await storage.read(current.storageKey);
    assert.equal(stored.contentType, 'application/pdf');
    assert.deepEqual(stored.bytes, bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('motorista não consegue enviar conteúdo falso como PDF', async () => {
  const { registry, documents, storage, directory } = await setup();

  try {
    await assert.rejects(
      submitDriverDocumentFromDriverApp({
        registry,
        documents,
        storage,
        driverId: 'driver-doc-self',
        documentType: 'driver_license',
        bytes: Buffer.from('arquivo que não é PDF', 'utf8'),
        mimeType: 'application/pdf',
      }),
      (error: unknown) =>
        error instanceof DriverDocumentError &&
        error.code === 'DOCUMENT_CONTENT_INVALID',
    );

    assert.equal(
      await documents.findCurrent(
        'driver-doc-self',
        'driver_license',
      ),
      null,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
