import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { PostgresPricingCatalogVersionRepository } from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import {
  PricingCatalogVersionError,
  updatePricingCatalogDraft,
} from '../src/pricing/pricing-catalog-version-service.js';
import { parsePricingCatalogDraftPatch } from '../src/pricing/pricing-catalog-version-validation.js';

const connection = process.env.RAMO_V5_ATOMIC_PG_URL?.trim();
const enabled = Boolean(connection && process.env.RAMO_V5_EPHEMERAL_PG === 'true');
function localDbUrl(): string {
  if (!enabled) throw new Error('PostgreSQL temporário não configurado.');
  const url = new URL(connection!);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== '5432' ||
    url.pathname !== '/ramo_v5_ci' ||
    url.protocol !== 'postgresql:'
  ) {
    throw new Error('Proibido executar o teste fora do banco CI descartável.');
  }
  return url.toString();
}
function batch(patches: unknown[]) {
  return parsePricingCatalogDraftPatch({ kind: 'batch', patches });
}

test('real disposable PostgreSQL: locality batch is atomic, audited, and CAS-protected', {
  skip: !enabled,
}, async () => {
  const url = localDbUrl();
  const schema = 'v5_locality_' + randomUUID().replaceAll('-', '');
  const root = createPostgresPool(url);
  const isolatedUrl = new URL(url);
  isolatedUrl.searchParams.set('options', '-c search_path=' + schema + ',public');
  const pool = createPostgresPool(isolatedUrl.toString());
  const versions = new PostgresPricingCatalogVersionRepository(pool);
  const admin = new PostgresAdminRepository(pool);
  const actor = { kind: 'user' as const, id: randomUUID(), name: 'CI Locality Writer' };
  const draftId = randomUUID();

  try {
    await root.query('CREATE SCHEMA ' + schema);
    // Match actual migrated table columns and constraints, but keep all test
    // rows in a temporary schema in the disposable GitHub Actions database.
    await root.query('CREATE TABLE ' + schema +
      '.pricing_catalog_versions (LIKE public.pricing_catalog_versions INCLUDING ALL)');
    await root.query('CREATE TABLE ' + schema +
      '.admin_audit_log (LIKE public.admin_audit_log INCLUDING ALL)');

    const draft = await versions.createDraft({
      id: draftId, snapshot: structuredClone(STATIC_PRICING_CATALOG_V1),
      createdBy: actor, createdAt: new Date().toISOString(),
    });
    const added = await updatePricingCatalogDraft({
      versions, admin, actor, versionId: draftId,
      expectedUpdatedAt: draft.updatedAt,
      patch: batch([
        { kind: 'locality_structure', operation: 'add', scope: 'prea', localityId: 'lagoa-ci' },
        { kind: 'locality_label', scope: 'prea', localityId: 'lagoa-ci', label: 'Lagoa CI' },
        {
          kind: 'locality_geofence', operation: 'upsert', zoneId: 'prea',
          localityId: 'lagoa-ci', centerLatitude: -2.820179,
          centerLongitude: -40.414678, radiusKm: 2.25,
        },
        {
          kind: 'locality_price', hub: 'prea', localityId: 'lagoa-ci',
          category: 'moto', price: { kind: 'exact', amountCents: 1200 },
        },
        {
          kind: 'locality_policy', hub: 'prea', localityId: 'lagoa-ci',
          enabledCategories: ['moto'], applyNightSurcharge: false,
        },
      ]),
    });
    const saved = await versions.findById(draftId);
    assert.equal(saved?.status, 'draft');
    assert.equal(saved?.snapshot.localityDisplayNames?.prea['lagoa-ci'], 'Lagoa CI');
    assert.equal(saved?.snapshot.localities.prea['lagoa-ci']?.moto, 1200);
    assert.equal(saved?.snapshot.localityGeofences.find(
      x => x.localityId === 'lagoa-ci',
    )?.centerLongitude, -40.414678);
    assert.equal(saved?.updatedAt, added.updatedAt);
    const audits = await admin.listAudit(50);
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.metadata.kind, 'batch');
    assert.equal(audits[0]?.metadata.count, 5);

    // First two sub-patches are valid. The third tries to delete a geofence
    // already removed inside the working snapshot and must roll back *all*.
    const doomed = batch([
      { kind: 'locality_label', scope: 'prea', localityId: 'lagoa-ci', label: 'NÃO PERSISTIR' },
      { kind: 'locality_geofence', operation: 'remove', zoneId: 'prea', localityId: 'lagoa-ci' },
      { kind: 'locality_geofence', operation: 'remove', zoneId: 'prea', localityId: 'lagoa-ci' },
    ]);
    await assert.rejects(
      () => updatePricingCatalogDraft({
        versions, admin, actor, versionId: draftId,
        expectedUpdatedAt: added.updatedAt, patch: doomed,
      }),
      (error: unknown) => error instanceof PricingCatalogVersionError &&
        error.code === 'PRICING_RULE_NOT_FOUND',
    );
    const afterReject = await versions.findById(draftId);
    assert.deepEqual(afterReject?.snapshot, saved?.snapshot);
    assert.equal(afterReject?.updatedAt, added.updatedAt);
    assert.equal((await admin.listAudit(50)).length, 1);

    await assert.rejects(
      () => updatePricingCatalogDraft({
        versions, admin, actor, versionId: draftId,
        expectedUpdatedAt: draft.updatedAt,
        patch: batch([
          { kind: 'locality_label', scope: 'prea', localityId: 'lagoa-ci',
            label: 'STALE WRITER' },
        ]),
      }),
      (error: unknown) => error instanceof PricingCatalogVersionError &&
        error.code === 'PRICING_VERSION_CONFLICT',
    );
    assert.equal((await versions.findById(draftId))?.snapshot
      .localityDisplayNames?.prea['lagoa-ci'], 'Lagoa CI');

    const counts = await pool.query(
      'SELECT count(*)::int AS n FROM pricing_catalog_versions WHERE id = $1',
      [draftId],
    );
    assert.equal(counts.rows[0]?.n, 1);
  } finally {
    await pool.end();
    await root.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await root.end();
  }
});
