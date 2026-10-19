import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresAdminRepository } from '../src/admin/repositories/postgres-admin-repository.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { PostgresPricingCatalogVersionRepository } from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';
import {
  createPricingCatalogDraft,
  deletePricingCatalogDraft,
  PricingCatalogVersionError,
  publishPricingCatalogVersion,
  updatePricingCatalogDraft,
} from '../src/pricing/pricing-catalog-version-service.js';
import { parsePricingCatalogDraftPatch } from '../src/pricing/pricing-catalog-version-validation.js';

// Intentionally runs only on the GitHub Actions PostgreSQL 16 disposable
// container; never against a configured VPS, staging or production database.
const disposableUrl = 'postgresql://ramo_ci:ramo_ci_ephemeral_only@127.0.0.1:5432/ramo_v5_ci';
const enabled = process.env.RAMO_V5_EPHEMERAL_PG === 'true' &&
  process.env.DATABASE_URL === disposableUrl &&
  process.env.GITHUB_ACTIONS === 'true';

test('Pricing V5: PostgreSQL descartável conserva rascunhos, revisões, vigência e auditoria', {
  skip: !enabled,
  timeout: 45_000,
}, async () => {
  const schema = 'v5_pricing_' + randomUUID().replaceAll('-', '');
  const root = createPostgresPool(disposableUrl);
  const isolatedUrl = new URL(disposableUrl);
  isolatedUrl.searchParams.set('options', '-c search_path=' + schema + ',public');
  const isolated = createPostgresPool(isolatedUrl.toString());
  const actor = { kind: 'user' as const, id: randomUUID(), name: 'Pricing V5 CI' };
  const versions = new PostgresPricingCatalogVersionRepository(isolated);
  const admin = new PostgresAdminRepository(isolated);
  const baseline = structuredClone(STATIC_PRICING_CATALOG_V1);
  const at = (iso: string) => new Date(iso);
  let createdSchema = false;

  try {
    await root.query('CREATE SCHEMA ' + schema);
    createdSchema = true;
    // Only the tables required by the versioning service are cloned.
    // No real API keys, payment providers or production tables are touched.
    await root.query('CREATE TABLE ' + schema +
      '.pricing_catalog_versions (LIKE public.pricing_catalog_versions INCLUDING ALL)');
    await root.query('CREATE TABLE ' + schema +
      '.admin_audit_log (LIKE public.admin_audit_log INCLUDING ALL)');

    const draft = await createPricingCatalogDraft({
      versions, admin, actor, now: at('2026-10-19T18:00:00.000Z'),
    });
    assert.equal(draft.status, 'draft');
    assert.deepEqual(draft.snapshot.distanceFarePolicies, []);
    assert.equal(await versions.findEffective('2026-10-19T18:00:00.000Z'), null);

    const savedDay = await updatePricingCatalogDraft({
      versions, admin, actor, versionId: draft.id,
      expectedUpdatedAt: draft.updatedAt,
      now: at('2026-10-19T18:01:00.000Z'),
      patch: parsePricingCatalogDraftPatch({
        kind: 'locality_price', hub: 'prea', localityId: 'cavalo-bravo',
        category: 'car', period: 'day',
        price: { kind: 'exact', amountCents: 4700 },
      }),
    });
    const savedNight = await updatePricingCatalogDraft({
      versions, admin, actor, versionId: draft.id,
      expectedUpdatedAt: savedDay.updatedAt,
      now: at('2026-10-19T18:02:00.000Z'),
      patch: parsePricingCatalogDraftPatch({
        kind: 'locality_price', hub: 'prea', localityId: 'cavalo-bravo',
        category: 'car', period: 'after_22',
        price: { kind: 'exact', amountCents: 5300 },
      }),
    });

    // Reopen using a different repository instance (new SQL queries).
    const reload = new PostgresPricingCatalogVersionRepository(isolated);
    const persisted = await reload.findById(draft.id);
    assert.equal(persisted?.status, 'draft');
    assert.equal(persisted?.snapshot.localities.prea['cavalo-bravo']?.car, 4700);
    assert.equal(persisted?.snapshot.localities.prea['cavalo-bravo']?.after22?.car, 5300);
    assert.deepEqual(persisted?.snapshot.distanceFarePolicies, []);
    assert.deepEqual(STATIC_PRICING_CATALOG_V1, baseline,
      'O catálogo estático aprovado não pode ser alterado');
    assert.equal(await reload.findEffective('2026-10-20T18:00:00.000Z'), null,
      'Salvar rascunho não é publicar tarifa');

    await assert.rejects(
      () => updatePricingCatalogDraft({
        versions, admin, actor, versionId: draft.id,
        expectedUpdatedAt: draft.updatedAt,
        patch: parsePricingCatalogDraftPatch({
          kind: 'locality_price', hub: 'prea', localityId: 'cavalo-bravo',
          category: 'car', period: 'day',
          price: { kind: 'exact', amountCents: 9999 },
        }),
      }),
      (error: unknown) => error instanceof PricingCatalogVersionError &&
        error.code === 'PRICING_VERSION_CONFLICT',
    );
    await assert.rejects(
      () => publishPricingCatalogVersion({
        versions, admin, actor, versionId: draft.id,
        expectedUpdatedAt: savedDay.updatedAt,
        now: at('2026-10-19T18:03:00.000Z'),
      }),
      (error: unknown) => error instanceof PricingCatalogVersionError &&
        error.code === 'PRICING_VERSION_CONFLICT',
    );
    assert.equal((await reload.findById(draft.id))?.status, 'draft');

    // In this disposable schema ONLY, simulate a deliberately authorized
    // future publication, to test effective date and version immutability.
    const future = '2030-10-20T03:00:00.000Z';
    const published = await publishPricingCatalogVersion({
      versions, admin, actor, versionId: draft.id,
      expectedUpdatedAt: savedNight.updatedAt,
      effectiveFrom: future,
      now: at('2026-10-19T18:04:00.000Z'),
    });
    assert.equal(published.status, 'published');
    assert.equal(await reload.findEffective('2030-10-20T02:59:59.999Z'), null);
    const effective = await reload.findEffective(future);
    assert.equal(effective?.id, draft.id);
    assert.equal(effective?.snapshot.localities.prea['cavalo-bravo']?.car, 4700);
    assert.equal(effective?.snapshot.localities.prea['cavalo-bravo']?.after22?.car, 5300);
    await assert.rejects(
      () => updatePricingCatalogDraft({
        versions, admin, actor, versionId: draft.id,
        expectedUpdatedAt: published.updatedAt,
        patch: parsePricingCatalogDraftPatch({
          kind: 'locality_price', hub: 'prea', localityId: 'cavalo-bravo',
          category: 'car', period: 'day',
          price: { kind: 'exact', amountCents: 9900 },
        }),
      }),
      (error: unknown) => error instanceof PricingCatalogVersionError &&
        error.code === 'PRICING_VERSION_NOT_DRAFT',
    );

    const otherDraft = await createPricingCatalogDraft({
      versions, admin, actor, now: at('2026-10-19T18:05:00.000Z'),
    });
    await deletePricingCatalogDraft({
      versions, admin, actor, versionId: otherDraft.id,
      expectedUpdatedAt: otherDraft.updatedAt,
      now: at('2026-10-19T18:06:00.000Z'),
    });
    assert.equal(await reload.findById(otherDraft.id), null);
    assert.equal((await reload.findById(draft.id))?.status, 'published');

    const actions = (await admin.listAudit(20)).map(row => row.action);
    assert.equal(actions.filter(x => x === 'pricing.catalog_version.created').length, 2);
    assert.equal(actions.filter(x => x === 'pricing.catalog_version.updated').length, 2);
    assert.equal(actions.filter(x => x === 'pricing.catalog_version.published').length, 1);
    assert.equal(actions.filter(x => x === 'pricing.catalog_version.deleted').length, 1);
    const recordCount = await isolated.query<{count: number}>(
      'SELECT COUNT(*)::int AS count FROM pricing_catalog_versions',
    );
    assert.equal(recordCount.rows[0]?.count, 1);
  } finally {
    await isolated.end();
    if (createdSchema) await root.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    await root.end();
  }
});
