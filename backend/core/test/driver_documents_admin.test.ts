import assert from 'node:assert/strict';
import test from 'node:test';

import { issueAdminApiKey } from '../src/admin/admin-auth.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import {
  DriverDocumentError,
  getDriverDocumentsForAdmin,
  reviewDriverDocumentFromAdmin,
  submitDriverDocumentFromAdmin,
} from '../src/drivers/driver-document-service.js';
import {
  parseReviewDriverDocumentRequest,
  parseSubmitDriverDocumentRequest,
} from '../src/drivers/driver-document-validation.js';
import { InMemoryDriverDocumentRepository } from '../src/drivers/repositories/in-memory-driver-document-repository.js';
import { PostgresDriverDocumentRepository } from '../src/drivers/repositories/postgres-driver-document-repository.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { PostgresDriverRegistryRepository } from '../src/drivers/repositories/postgres-driver-registry-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';

const actor = {
  kind: 'user' as const,
  id: 'admin-doc-test',
  name: 'Admin Documentos',
};

async function createRegistry(
  registry: InMemoryDriverRegistryRepository,
  driverId = 'driver-doc-one',
) {
  await registry.upsertProfile({
    driverId,
    fullName: 'Motorista Documento',
    status: 'approved',
    createdAt: '2026-09-23T18:00:00.000Z',
    updatedAt: '2026-09-23T18:00:00.000Z',
  });
  await registry.upsertVehicle({
    id: '11111111-1111-4111-8111-111111111231',
    driverId,
    plateNormalized: 'DOC1A23',
    make: 'Toyota',
    model: 'Hilux',
    modelYear: 2024,
    color: 'Branca',
    categories: ['car'],
    fourByFour: true,
    seatCapacity: 4,
    status: 'approved',
    createdAt: '2026-09-23T18:00:00.000Z',
    updatedAt: '2026-09-23T18:00:00.000Z',
  });
}

function submission(
  driverId: string,
  suffix: string,
) {
  return parseSubmitDriverDocumentRequest({
    storageKey: `drivers/${driverId}/documents/${suffix}`,
    contentSha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    sizeBytes: 250_000,
    expiresOn: '2027-12-31',
  });
}

test('documentos mantêm referência privada fora da resposta e exigem revisão explícita', async () => {
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const admin = new InMemoryAdminRepository();
  const driverId = 'driver-doc-one';
  await createRegistry(registry, driverId);

  const submitted = await submitDriverDocumentFromAdmin({
    registry,
    documents,
    admin,
    actor,
    driverId,
    documentType: 'driver_license',
    data: submission(driverId, 'cnh-v1.pdf'),
    now: new Date('2026-09-23T18:05:00.000Z'),
  });

  assert.equal(submitted.status, 'pending');
  assert.equal(submitted.effectiveStatus, 'pending');
  assert.equal(submitted.hasPrivateFile, true);
  assert.equal('storageKey' in submitted, false);
  assert.equal('contentSha256' in submitted, false);

  const pending = await getDriverDocumentsForAdmin({
    registry,
    documents,
    driverId,
    now: new Date('2026-09-23T18:06:00.000Z'),
  });
  assert.equal(pending.documentsApproved, false);

  const approved = await reviewDriverDocumentFromAdmin({
    documents,
    admin,
    actor,
    driverId,
    documentType: 'driver_license',
    review: { status: 'approved' },
    now: new Date('2026-09-23T18:07:00.000Z'),
  });
  assert.equal(approved.status, 'approved');

  await assert.rejects(
    () =>
      reviewDriverDocumentFromAdmin({
        documents,
        admin,
        actor,
        driverId,
        documentType: 'driver_license',
        review: { status: 'approved' },
        now: new Date('2026-09-23T18:08:00.000Z'),
      }),
    (error: unknown) =>
      error instanceof DriverDocumentError &&
      error.code === 'DOCUMENT_REVIEW_CONFLICT',
  );
});

test('nova submissão substitui somente a versão atual e volta para pending', async () => {
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const admin = new InMemoryAdminRepository();
  const driverId = 'driver-doc-two';
  await createRegistry(registry, driverId);

  await submitDriverDocumentFromAdmin({
    registry,
    documents,
    admin,
    actor,
    driverId,
    documentType: 'driver_license',
    data: submission(driverId, 'cnh-v1.pdf'),
    now: new Date('2026-09-23T18:10:00.000Z'),
  });
  await reviewDriverDocumentFromAdmin({
    documents,
    admin,
    actor,
    driverId,
    documentType: 'driver_license',
    review: { status: 'approved' },
    now: new Date('2026-09-23T18:11:00.000Z'),
  });

  const replacement = await submitDriverDocumentFromAdmin({
    registry,
    documents,
    admin,
    actor,
    driverId,
    documentType: 'driver_license',
    data: {
      ...submission(driverId, 'cnh-v2.pdf'),
      contentSha256: 'b'.repeat(64),
    },
    now: new Date('2026-09-23T18:12:00.000Z'),
  });

  assert.equal(replacement.status, 'pending');
  const current = await documents.findCurrent(
    driverId,
    'driver_license',
  );
  assert.equal(current?.storageKey.endsWith('cnh-v2.pdf'), true);
  assert.equal(current?.contentSha256, 'b'.repeat(64));
});

test('CRLV exige veículo e referência privada deve pertencer ao motorista', async () => {
  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const admin = new InMemoryAdminRepository();

  await registry.upsertProfile({
    driverId: 'driver-doc-no-vehicle',
    fullName: 'Sem Veículo',
    status: 'pending',
    createdAt: '2026-09-23T18:20:00.000Z',
    updatedAt: '2026-09-23T18:20:00.000Z',
  });

  await assert.rejects(
    () =>
      submitDriverDocumentFromAdmin({
        registry,
        documents,
        admin,
        actor,
        driverId: 'driver-doc-no-vehicle',
        documentType: 'vehicle_registration',
        data: submission(
          'driver-doc-no-vehicle',
          'crlv.pdf',
        ),
      }),
    (error: unknown) =>
      error instanceof DriverDocumentError &&
      error.code === 'DRIVER_VEHICLE_NOT_FOUND',
  );

  await createRegistry(registry, 'driver-doc-prefix');
  await assert.rejects(
    () =>
      submitDriverDocumentFromAdmin({
        registry,
        documents,
        admin,
        actor,
        driverId: 'driver-doc-prefix',
        documentType: 'driver_license',
        data: {
          ...submission('other-driver', 'cnh.pdf'),
        },
      }),
    (error: unknown) =>
      error instanceof DriverDocumentError &&
      error.code === 'DOCUMENT_STORAGE_REFERENCE_INVALID',
  );
});

test('rejeição exige motivo e documento vencido não é aprovado', async () => {
  assert.deepEqual(
    parseReviewDriverDocumentRequest({
      status: 'rejected',
      rejectionReason: 'Imagem ilegível',
    }),
    {
      status: 'rejected',
      rejectionReason: 'Imagem ilegível',
    },
  );
  assert.throws(
    () =>
      parseReviewDriverDocumentRequest({
        status: 'rejected',
      }),
    /rejectionReason é obrigatório/,
  );

  const registry = new InMemoryDriverRegistryRepository();
  const documents = new InMemoryDriverDocumentRepository();
  const admin = new InMemoryAdminRepository();
  const driverId = 'driver-doc-expiry';
  await createRegistry(registry, driverId);

  await submitDriverDocumentFromAdmin({
    registry,
    documents,
    admin,
    actor,
    driverId,
    documentType: 'driver_license',
    data: {
      ...submission(driverId, 'cnh.pdf'),
      expiresOn: '2026-09-24',
    },
    now: new Date('2026-09-23T18:30:00.000Z'),
  });

  await assert.rejects(
    () =>
      reviewDriverDocumentFromAdmin({
        documents,
        admin,
        actor,
        driverId,
        documentType: 'driver_license',
        review: { status: 'approved' },
        now: new Date('2026-09-25T12:00:00.000Z'),
      }),
    (error: unknown) =>
      error instanceof DriverDocumentError &&
      error.code === 'DOCUMENT_ALREADY_EXPIRED',
  );
});

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL preserva histórico, uma versão atual e revisão auditada',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const registry = new PostgresDriverRegistryRepository(pool);
    const documents = new PostgresDriverDocumentRepository(pool);
    const admin = new PostgresAdminRepository(pool);
    const driverId = 'driver-doc-postgres';
    let keyId = '';

    try {
      await registry.upsertProfile({
        driverId,
        fullName: 'Documento PostgreSQL',
        status: 'approved',
        createdAt: '2026-09-23T19:00:00.000Z',
        updatedAt: '2026-09-23T19:00:00.000Z',
      });
      await registry.upsertVehicle({
        id: '33333333-3333-4333-8333-333333333331',
        driverId,
        plateNormalized: 'PGD1A23',
        make: 'Toyota',
        model: 'Hilux',
        modelYear: 2024,
        color: 'Prata',
        categories: ['car'],
        fourByFour: true,
        seatCapacity: 4,
        status: 'approved',
        createdAt: '2026-09-23T19:00:00.000Z',
        updatedAt: '2026-09-23T19:00:00.000Z',
      });

      const issued = await issueAdminApiKey({
        repository: admin,
        name: 'Document PG Test',
        scopes: [
          'drivers:documents:read',
          'drivers:documents:write',
          'audit:read',
        ],
        now: new Date('2026-09-23T19:00:00.000Z'),
      });
      keyId = issued.key.id;
      const apiActor = {
        kind: 'api_key' as const,
        id: issued.key.id,
        name: issued.key.name,
      };

      await submitDriverDocumentFromAdmin({
        registry,
        documents,
        admin,
        actor: apiActor,
        driverId,
        documentType: 'driver_license',
        data: submission(driverId, 'cnh-v1.pdf'),
        now: new Date('2026-09-23T19:01:00.000Z'),
      });
      await reviewDriverDocumentFromAdmin({
        documents,
        admin,
        actor: apiActor,
        driverId,
        documentType: 'driver_license',
        review: { status: 'approved' },
        now: new Date('2026-09-23T19:02:00.000Z'),
      });
      await submitDriverDocumentFromAdmin({
        registry,
        documents,
        admin,
        actor: apiActor,
        driverId,
        documentType: 'driver_license',
        data: {
          ...submission(driverId, 'cnh-v2.pdf'),
          contentSha256: 'c'.repeat(64),
        },
        now: new Date('2026-09-23T19:03:00.000Z'),
      });

      const rows = await pool.query<{
        is_current: boolean;
        status: string;
        storage_key: string;
      }>(
        `
        SELECT is_current, status, storage_key
        FROM driver_documents
        WHERE driver_id = $1
          AND document_type = 'driver_license'
        ORDER BY submitted_at
        `,
        [driverId],
      );
      assert.equal(rows.rowCount, 2);
      assert.equal(rows.rows[0]?.is_current, false);
      assert.equal(rows.rows[0]?.status, 'approved');
      assert.equal(rows.rows[1]?.is_current, true);
      assert.equal(rows.rows[1]?.status, 'pending');

      const safe = await getDriverDocumentsForAdmin({
        registry,
        documents,
        driverId,
        now: new Date('2026-09-23T19:04:00.000Z'),
      });
      assert.equal(safe.items.length, 1);
      assert.equal('storageKey' in safe.items[0]!, false);
      assert.equal('contentSha256' in safe.items[0]!, false);

      const audit = await pool.query<{ action: string }>(
        `
        SELECT action
        FROM admin_audit_log
        WHERE target_type = 'driver' AND target_id = $1
        ORDER BY created_at
        `,
        [driverId],
      );
      assert.deepEqual(
        audit.rows.map((row) => row.action),
        [
          'driver.document.submitted',
          'driver.document.reviewed',
          'driver.document.submitted',
        ],
      );
    } finally {
      await pool.query(
        "DELETE FROM admin_audit_log WHERE target_type = 'driver' AND target_id = $1",
        [driverId],
      );
      await pool.query(
        'DELETE FROM driver_documents WHERE driver_id = $1',
        [driverId],
      );
      await pool.query(
        'DELETE FROM driver_vehicles WHERE driver_id = $1',
        [driverId],
      );
      await pool.query(
        'DELETE FROM driver_profiles WHERE driver_id = $1',
        [driverId],
      );
      if (keyId) {
        await pool.query(
          'DELETE FROM admin_api_keys WHERE id = $1',
          [keyId],
        );
      }
      await pool.end();
    }
  },
);
