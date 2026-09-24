import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { resolvePricingCatalogContext } from '../src/pricing/effective-catalog.js';
import { quoteFare } from '../src/pricing/quote-engine.js';
import { InMemoryPricingCatalogVersionRepository } from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import {
  createPricingCatalogDraft,
  pricingCatalogVersionView,
  PricingCatalogVersionError,
  publishPricingCatalogVersion,
  updatePricingCatalogDraft,
} from '../src/pricing/pricing-catalog-version-service.js';
import { parsePricingCatalogDraftPatch } from '../src/pricing/pricing-catalog-version-validation.js';

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
  assert.equal(draft.snapshot.commissionBps, 1000);
  assert.equal(draft.effectiveFrom, undefined);

  const view = pricingCatalogVersionView(draft);
  assert.deepEqual(view.summary, {
    commissionBps: 1000,
    preaLocalities: Object.keys(draft.snapshot.localities.prea).length,
    jijocaLocalities: Object.keys(draft.snapshot.localities.jijoca).length,
    fixedRoutes: draft.snapshot.fixedRoutes.length,
    enabledCategories: draft.snapshot.categories.filter(
      (category) =>
        draft.snapshot.categoryPolicies[category].enabled,
    ).length,
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


test('resolver usa fallback v1 antes da vigência e versão publicada depois dela', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-runtime',
    name: 'Admin Pricing Runtime',
  };
  const modified = structuredClone(STATIC_PRICING_CATALOG_V1);
  const route = modified.fixedRoutes.find(
    (item) => item.id === 'prea-jijoca-car',
  );
  assert.ok(route);
  route.dayCents = 13000;

  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    snapshot: modified,
    now: new Date('2026-09-24T00:00:00.000Z'),
  });
  await publishPricingCatalogVersion({
    versions,
    admin,
    actor,
    versionId: draft.id,
    effectiveFrom: '2026-10-01T03:00:00.000Z',
    now: new Date('2026-09-24T00:05:00.000Z'),
  });

  const before = await resolvePricingCatalogContext({
    versions,
    at: new Date('2026-10-01T02:59:59.999Z'),
  });
  const after = await resolvePricingCatalogContext({
    versions,
    at: new Date('2026-10-01T03:00:00.000Z'),
  });

  const request = {
    origin: { zoneId: 'prea' as const },
    destination: { zoneId: 'jijoca' as const },
    category: 'car' as const,
    period: 'day' as const,
  };

  const beforeQuote = quoteFare(request, before.snapshot);
  const afterQuote = quoteFare(request, after.snapshot);
  assert.equal(beforeQuote.kind, 'exact');
  assert.equal(afterQuote.kind, 'exact');
  if (beforeQuote.kind === 'exact' && afterQuote.kind === 'exact') {
    assert.equal(beforeQuote.baseAmountCents, 12000);
    assert.equal(afterQuote.baseAmountCents, 13000);
  }
  assert.equal(before.reference.catalogVersionId, undefined);
  assert.equal(after.reference.catalogVersionId, draft.id);
  assert.equal(after.reference.catalogVersionNumber, 1);
});


test('edita somente o rascunho e preserva o catálogo v1 original', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-editor',
    name: 'Admin Pricing Editor',
  };

  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-09-24T00:00:00.000Z'),
  });

  const patch = parsePricingCatalogDraftPatch({
    kind: 'fixed_route',
    routeId: 'prea-jijoca-car',
    dayCents: 13500,
    after22Cents: 14500,
  });
  const updated = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch,
    now: new Date('2026-09-24T00:01:00.000Z'),
  });

  const staticRoute = STATIC_PRICING_CATALOG_V1.fixedRoutes.find(
    (item) => item.id === 'prea-jijoca-car',
  );
  const draftRoute = updated.snapshot.fixedRoutes.find(
    (item) => item.id === 'prea-jijoca-car',
  );

  assert.equal(staticRoute?.dayCents, 12000);
  assert.equal(staticRoute?.after22Cents, 14000);
  assert.equal(draftRoute?.dayCents, 13500);
  assert.equal(draftRoute?.after22Cents, 14500);

  const audit = await admin.listAudit(10);
  assert.equal(
    audit.some(
      (entry) =>
        entry.action === 'pricing.catalog_version.updated' &&
        entry.targetId === draft.id,
    ),
    true,
  );
});

test('edita preço por localidade com valor exato ou faixa validada', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-locality',
    name: 'Admin Pricing Locality',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
  });

  const exactPatch = parsePricingCatalogDraftPatch({
    kind: 'locality_price',
    hub: 'prea',
    localityId: 'prea',
    category: 'car',
    price: { kind: 'exact', amountCents: 2700 },
  });
  const exactUpdated = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: exactPatch,
  });
  assert.equal(
    exactUpdated.snapshot.localities.prea.prea?.car,
    2700,
  );

  const rangePatch = parsePricingCatalogDraftPatch({
    kind: 'locality_price',
    hub: 'prea',
    localityId: 'formosa',
    category: 'moto',
    price: {
      kind: 'range',
      minCents: 900,
      maxCents: 1100,
    },
  });
  const rangeUpdated = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: rangePatch,
  });
  assert.deepEqual(
    rangeUpdated.snapshot.localities.prea.formosa?.moto,
    { minCents: 900, maxCents: 1100 },
  );

  assert.throws(
    () =>
      parsePricingCatalogDraftPatch({
        kind: 'locality_price',
        hub: 'prea',
        localityId: 'formosa',
        category: 'moto',
        price: {
          kind: 'range',
          minCents: 1200,
          maxCents: 1000,
        },
      }),
    /minCents/,
  );
});


test('política de categoria fica no rascunho e pode desativar novas cotações', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-category-policy',
    name: 'Admin Category Policy',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-09-24T00:00:00.000Z'),
  });

  const patch = parsePricingCatalogDraftPatch({
    kind: 'category_policy',
    category: 'moto',
    enabled: false,
    requiresFourByFourOnJeriBoundary: false,
  });
  const updated = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch,
    now: new Date('2026-09-24T00:01:00.000Z'),
  });

  assert.equal(
    STATIC_PRICING_CATALOG_V1.categoryPolicies.moto.enabled,
    true,
  );
  assert.equal(updated.snapshot.categoryPolicies.moto.enabled, false);

  const request = {
    origin: { zoneId: 'prea' as const, localityId: 'prea' },
    destination: { zoneId: 'prea' as const, localityId: 'laguim' },
    category: 'moto' as const,
    period: 'day' as const,
  };

  assert.equal(quoteFare(request).kind, 'exact');
  assert.throws(
    () => quoteFare(request, updated.snapshot),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('desativada'),
  );

  const audit = await admin.listAudit(10);
  assert.equal(
    audit.some(
      (entry) =>
        entry.action === 'pricing.catalog_version.updated' &&
        entry.metadata?.kind === 'category_policy' &&
        entry.metadata?.category === 'moto',
    ),
    true,
  );
});
