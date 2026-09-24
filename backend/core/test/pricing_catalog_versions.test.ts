import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryPricingCatalogVersionRepository } from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import {
  createPricingCatalogDraft,
  pricingCatalogVersionView,
  PricingCatalogVersionError,
  publishPricingCatalogVersion,
} from '../src/pricing/pricing-catalog-version-service.js';

test('cria rascunho imutável do catálogo atual e registra auditoria', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-test',
    name: 'Admin Pricing Test',
  };
  const now = new Date('2026-09-24T00:00:00.000Z');

  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now,
  });

  assert.equal(draft.versionNumber, 1);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.snapshot.catalogVersion, 'v1');
  assert.equal(draft.snapshot.editable, false);
  assert.equal(draft.effectiveFrom, undefined);

  const view = pricingCatalogVersionView(draft);
  assert.deepEqual(view.summary, {
    commissionBps: 1000,
    preaLocalities: draft.snapshot.localities.prea.length,
    jijocaLocalities: draft.snapshot.localities.jijoca.length,
    fixedRoutes: draft.snapshot.fixedRoutes.length,
  });

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.action, 'pricing.catalog_version.created');
  assert.equal(audit[0]?.actor.kind, 'user');
  assert.equal(audit[0]?.targetId, draft.id);
});

test('publica rascunho com vigência futura e só o torna efetivo na data definida', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-test',
    name: 'Admin Pricing Test',
  };
  const createdAt = new Date('2026-09-24T00:00:00.000Z');
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: createdAt,
  });

  const published = await publishPricingCatalogVersion({
    versions,
    admin,
    actor,
    versionId: draft.id,
    effectiveFrom: '2026-10-01T03:00:00.000Z',
    now: new Date('2026-09-24T00:10:00.000Z'),
  });

  assert.equal(published.status, 'published');
  assert.equal(
    published.effectiveFrom,
    '2026-10-01T03:00:00.000Z',
  );
  assert.equal(
    await versions.findEffective('2026-10-01T02:59:59.999Z'),
    null,
  );
  assert.equal(
    (await versions.findEffective('2026-10-01T03:00:00.000Z'))?.id,
    draft.id,
  );

  const audit = await admin.listAudit(10);
  assert.deepEqual(
    audit.map((entry) => entry.action),
    [
      'pricing.catalog_version.published',
      'pricing.catalog_version.created',
    ],
  );

  await assert.rejects(
    () =>
      publishPricingCatalogVersion({
        versions,
        admin,
        actor,
        versionId: draft.id,
        now: new Date('2026-09-24T00:20:00.000Z'),
      }),
    (error) =>
      error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_VERSION_NOT_DRAFT',
  );
});

test('rejeita vigência inválida sem publicar o rascunho', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'api_key' as const,
    id: 'key-pricing-test',
    name: 'Pricing Automation',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-09-24T00:00:00.000Z'),
  });

  await assert.rejects(
    () =>
      publishPricingCatalogVersion({
        versions,
        admin,
        actor,
        versionId: draft.id,
        effectiveFrom: 'amanhã às oito',
      }),
    (error) =>
      error instanceof PricingCatalogVersionError &&
      error.code === 'INVALID_EFFECTIVE_FROM',
  );

  assert.equal((await versions.findById(draft.id))?.status, 'draft');
});
