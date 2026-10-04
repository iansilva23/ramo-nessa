import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { resolvePricingCatalogContext } from '../src/pricing/effective-catalog.js';
import { quoteFare } from '../src/pricing/quote-engine.js';
import { InMemoryPricingCatalogVersionRepository } from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import {
  createPricingCatalogDraft,
  deletePricingCatalogDraft,
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
  assert.equal(draft.snapshot.catalogVersion, 'approved-2026-10-03');
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
    enabledZones: draft.snapshot.zones.filter(
      (zoneId) => draft.snapshot.zonePolicies[zoneId].enabled,
    ).length,
    externalLocalities: draft.snapshot.externalLocalities.length,
  });

  const audit = await admin.listAudit(10);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.action, 'pricing.catalog_version.created');
  assert.equal(audit[0]?.actor.kind, 'user');
  assert.equal(audit[0]?.targetId, draft.id);
});

test('exclui somente rascunho e registra auditoria sem tocar em versões publicadas', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-delete',
    name: 'Admin Pricing Delete',
  };

  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-09-30T20:00:00.000Z'),
  });

  const deleted = await deletePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    expectedUpdatedAt: draft.updatedAt,
    now: new Date('2026-09-30T20:01:00.000Z'),
  });

  assert.equal(deleted.id, draft.id);
  assert.equal(await versions.findById(draft.id), null);

  const audit = await admin.listAudit(10);
  assert.equal(audit[0]?.action, 'pricing.catalog_version.deleted');
  assert.equal(audit[0]?.targetId, draft.id);

  const nextDraft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-09-30T20:02:00.000Z'),
  });
  const published = await publishPricingCatalogVersion({
    versions,
    admin,
    actor,
    versionId: nextDraft.id,
    expectedUpdatedAt: nextDraft.updatedAt,
    now: new Date('2026-09-30T20:03:00.000Z'),
  });

  await assert.rejects(
    () =>
      deletePricingCatalogDraft({
        versions,
        admin,
        actor,
        versionId: published.id,
        expectedUpdatedAt: published.updatedAt,
      }),
    (error: unknown) =>
      error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_VERSION_NOT_DRAFT',
  );

  assert.equal(
    (await versions.findById(published.id))?.status,
    'published',
  );
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


test('estrutura de localidades é editada somente no rascunho com proteções', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-location-structure',
    name: 'Admin Location Structure',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
  });

  const add = parsePricingCatalogDraftPatch({
    kind: 'locality_structure',
    operation: 'add',
    scope: 'prea',
    localityId: 'novo-destino-teste',
  });
  const added = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: add,
  });

  assert.deepEqual(
    added.snapshot.localities.prea['novo-destino-teste'],
    {},
  );
  assert.equal(
    STATIC_PRICING_CATALOG_V1.localities.prea['novo-destino-teste'],
    undefined,
  );

  const remove = parsePricingCatalogDraftPatch({
    kind: 'locality_structure',
    operation: 'remove',
    scope: 'prea',
    localityId: 'novo-destino-teste',
  });
  const removed = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: remove,
  });
  assert.equal(
    removed.snapshot.localities.prea['novo-destino-teste'],
    undefined,
  );

  await assert.rejects(
    () =>
      updatePricingCatalogDraft({
        versions,
        admin,
        actor,
        versionId: draft.id,
        patch: parsePricingCatalogDraftPatch({
          kind: 'locality_structure',
          operation: 'remove',
          scope: 'prea',
          localityId: 'prea',
        }),
      }),
    (error: unknown) =>
      error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_STRUCTURE_CONFLICT',
  );

  await assert.rejects(
    () =>
      updatePricingCatalogDraft({
        versions,
        admin,
        actor,
        versionId: draft.id,
        patch: parsePricingCatalogDraftPatch({
          kind: 'locality_structure',
          operation: 'remove',
          scope: 'external',
          localityId: 'airport-jjd',
        }),
      }),
    (error: unknown) =>
      error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_STRUCTURE_CONFLICT',
  );
});

test('zona pode ser desativada por versão sem alterar o catálogo estático', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-zone-policy',
    name: 'Admin Zone Policy',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
  });

  const updated = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'zone_policy',
      zoneId: 'prea',
      enabled: false,
    }),
  });

  assert.equal(
    STATIC_PRICING_CATALOG_V1.zonePolicies.prea.enabled,
    true,
  );
  assert.equal(updated.snapshot.zonePolicies.prea.enabled, false);

  const request = {
    origin: { zoneId: 'prea' as const },
    destination: { zoneId: 'jijoca' as const },
    category: 'car' as const,
    period: 'day' as const,
  };

  assert.equal(quoteFare(request).kind, 'exact');
  assert.throws(
    () => quoteFare(request, updated.snapshot),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('desativada'),
  );
});

test('destino externo adicionado no rascunho só é reconhecido por esse catálogo', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-external-locality',
    name: 'Admin External Locality',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
  });

  const updated = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_structure',
      operation: 'add',
      scope: 'external',
      localityId: 'novo-destino-externo',
    }),
  });

  assert.equal(
    updated.snapshot.externalLocalities.includes(
      'novo-destino-externo',
    ),
    true,
  );
  assert.equal(
    STATIC_PRICING_CATALOG_V1.externalLocalities.includes(
      'novo-destino-externo',
    ),
    false,
  );
});


test('Admin versiona comissão, horário, coleta, adicionais, Buggy e entrega', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-commercial-policy',
    name: 'Admin Commercial Policy',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
  });

  const patches = [
    parsePricingCatalogDraftPatch({
      kind: 'commission_policy',
      commissionBps: 1250,
    }),
    parsePricingCatalogDraftPatch({
      kind: 'period_policy',
      nightStartHour: 21,
      dayStartHour: 5,
    }),
    parsePricingCatalogDraftPatch({
      kind: 'pickup_policy',
      freeKm: 2.5,
      fuelPriceCentsPerLiter: 735,
      motoReferenceKmPerLiter: 35,
      carReferenceKmPerLiter: 10,
    }),
    parsePricingCatalogDraftPatch({
      kind: 'surcharge_policy',
      preaComfortCents: 5500,
      preaLocalCarAfter22Cents: 1900,
      preaLocalCarAfter22LocalityIds: ['prea', 'formosa'],
    }),
    parsePricingCatalogDraftPatch({
      kind: 'buggy_policy',
      minPassengers: 1,
      maxPassengers: 5,
      dayBaseCents: 4500,
      after22BaseCents: 6500,
      perPassengerCents: 300,
    }),
    parsePricingCatalogDraftPatch({
      kind: 'delivery_bands',
      bands: [
        { maxKm: 0.8, amountCents: 600 },
        { maxKm: 1.5, amountCents: 900 },
        { maxKm: 2.5, amountCents: 1200 },
      ],
      aboveMaxCents: 1500,
    }),
  ];

  let updated = draft;
  for (const patch of patches) {
    updated = await updatePricingCatalogDraft({
      versions,
      admin,
      actor,
      versionId: draft.id,
      patch,
    });
  }

  assert.equal(updated.snapshot.commissionBps, 1250);
  assert.deepEqual(updated.snapshot.periodPolicy, {
    nightStartHour: 21,
    dayStartHour: 5,
  });
  assert.deepEqual(updated.snapshot.pickupPolicy, {
    freeKm: 2.5,
    fuelPriceCentsPerLiter: 735,
    motoReferenceKmPerLiter: 35,
    carReferenceKmPerLiter: 10,
  });
  assert.deepEqual(updated.snapshot.surcharges, {
    preaComfortCents: 5500,
    preaLocalCarAfter22Cents: 1900,
    preaLocalCarAfter22LocalityIds: ['formosa', 'prea'],
  });
  assert.deepEqual(updated.snapshot.jeri.buggy, {
    minPassengers: 1,
    maxPassengers: 5,
    dayBaseCents: 4500,
    after22BaseCents: 6500,
    perPassengerCents: 300,
  });
  assert.deepEqual(updated.snapshot.jeri.deliveryBands, [
    { maxKm: 0.8, amountCents: 600 },
    { maxKm: 1.5, amountCents: 900 },
    { maxKm: 2.5, amountCents: 1200 },
  ]);
  assert.equal(updated.snapshot.jeri.deliveryAboveMaxCents, 1500);

  assert.equal(STATIC_PRICING_CATALOG_V1.commissionBps, 1000);
  assert.equal(STATIC_PRICING_CATALOG_V1.periodPolicy.nightStartHour, 22);
  assert.equal(STATIC_PRICING_CATALOG_V1.pickupPolicy.freeKm, 8);
  assert.equal(STATIC_PRICING_CATALOG_V1.jeri.buggy.dayBaseCents, 3500);
  assert.equal(STATIC_PRICING_CATALOG_V1.jeri.deliveryAboveMaxCents, 600);
});

test('rejeita políticas comerciais inválidas antes de alterar o rascunho', () => {
  assert.throws(
    () =>
      parsePricingCatalogDraftPatch({
        kind: 'commission_policy',
        commissionBps: 10001,
      }),
    /commissionBps/,
  );
  assert.throws(
    () =>
      parsePricingCatalogDraftPatch({
        kind: 'period_policy',
        nightStartHour: 22,
        dayStartHour: 22,
      }),
    /diferentes/,
  );
  assert.throws(
    () =>
      parsePricingCatalogDraftPatch({
        kind: 'buggy_policy',
        minPassengers: 5,
        maxPassengers: 4,
        dayBaseCents: 4000,
        after22BaseCents: 6000,
        perPassengerCents: 200,
      }),
    /minPassengers/,
  );
  assert.throws(
    () =>
      parsePricingCatalogDraftPatch({
        kind: 'delivery_bands',
        bands: [
          { maxKm: 1.2, amountCents: 700 },
          { maxKm: 0.7, amountCents: 500 },
        ],
      }),
    /ordem crescente/,
  );
});


test('rejeita edição e publicação com revisão stale do rascunho', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-concurrency',
    name: 'Admin Pricing Concurrency',
  };
  const createdAt = new Date('2026-09-27T06:10:00.000Z');
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: createdAt,
  });

  const firstPatch = parsePricingCatalogDraftPatch({
    kind: 'commission_policy',
    commissionBps: 1100,
  });
  const updated = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: firstPatch,
    expectedUpdatedAt: draft.updatedAt,
    // Mesmo instante de criação: o serviço precisa avançar o revision timestamp.
    now: createdAt,
  });

  assert.notEqual(updated.updatedAt, draft.updatedAt);
  assert.equal(updated.snapshot.commissionBps, 1100);

  const stalePatch = parsePricingCatalogDraftPatch({
    kind: 'commission_policy',
    commissionBps: 1200,
  });

  await assert.rejects(
    () =>
      updatePricingCatalogDraft({
        versions,
        admin,
        actor,
        versionId: draft.id,
        patch: stalePatch,
        expectedUpdatedAt: draft.updatedAt,
      }),
    (error: unknown) =>
      error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_VERSION_CONFLICT',
  );

  await assert.rejects(
    () =>
      publishPricingCatalogVersion({
        versions,
        admin,
        actor,
        versionId: draft.id,
        expectedUpdatedAt: draft.updatedAt,
      }),
    (error: unknown) =>
      error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_VERSION_CONFLICT',
  );

  const stillDraft = await versions.findById(draft.id);
  assert.equal(stillDraft?.status, 'draft');
  assert.equal(stillDraft?.snapshot.commissionBps, 1100);

  const published = await publishPricingCatalogVersion({
    versions,
    admin,
    actor,
    versionId: draft.id,
    expectedUpdatedAt: updated.updatedAt,
  });
  assert.equal(published.status, 'published');
});


test('edita geofence versionada por alfinete e raio sem deixar resíduo', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-pricing-geofence',
    name: 'Admin Pricing Geofence',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-09-30T10:00:00.000Z'),
  });

  const added = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_structure',
      operation: 'add',
      scope: 'prea',
      localityId: 'lagoa-grande',
    }),
    now: new Date('2026-09-30T10:01:00.000Z'),
  });
  assert.ok(added.snapshot.localities.prea['lagoa-grande']);

  const geofenced = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_geofence',
      operation: 'upsert',
      zoneId: 'prea',
      localityId: 'lagoa-grande',
      centerLatitude: -2.835,
      centerLongitude: -40.405,
      radiusKm: 1.75,
    }),
    now: new Date('2026-09-30T10:02:00.000Z'),
  });

  assert.deepEqual(
    geofenced.snapshot.localityGeofences.find(
      (item) =>
        item.zoneId === 'prea' &&
        item.localityId === 'lagoa-grande',
    ),
    {
      zoneId: 'prea',
      localityId: 'lagoa-grande',
      centerLatitude: -2.835,
      centerLongitude: -40.405,
      radiusKm: 1.75,
    },
  );

  const moved = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_geofence',
      operation: 'upsert',
      zoneId: 'prea',
      localityId: 'lagoa-grande',
      centerLatitude: -2.836,
      centerLongitude: -40.406,
      radiusKm: 2.25,
    }),
    now: new Date('2026-09-30T10:03:00.000Z'),
  });
  const area = moved.snapshot.localityGeofences.find(
    (item) =>
      item.zoneId === 'prea' &&
      item.localityId === 'lagoa-grande',
  );
  assert.equal(area?.centerLatitude, -2.836);
  assert.equal(area?.radiusKm, 2.25);

  const removed = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_structure',
      operation: 'remove',
      scope: 'prea',
      localityId: 'lagoa-grande',
    }),
    now: new Date('2026-09-30T10:04:00.000Z'),
  });
  assert.equal(
    removed.snapshot.localityGeofences.some(
      (item) =>
        item.zoneId === 'prea' &&
        item.localityId === 'lagoa-grande',
    ),
    false,
  );
});


test('regras por localidade habilitam categorias e adicional noturno sem perder preço', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-locality-policy',
    name: 'Admin Locality Policy',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-09-30T12:00:00.000Z'),
  });

  await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_structure',
      operation: 'add',
      scope: 'prea',
      localityId: 'lagoa-nova',
    }),
    now: new Date('2026-09-30T12:01:00.000Z'),
  });

  const priced = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_price',
      hub: 'prea',
      localityId: 'lagoa-nova',
      category: 'moto',
      price: {
        kind: 'exact',
        amountCents: 1800,
      },
    }),
    now: new Date('2026-09-30T12:02:00.000Z'),
  });

  assert.deepEqual(
    priced.snapshot.localityPolicies.prea['lagoa-nova'],
    {
      enabledCategories: ['moto'],
      applyNightSurcharge: false,
    },
  );

  const ruled = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_policy',
      hub: 'prea',
      localityId: 'lagoa-nova',
      enabledCategories: [
        'moto',
        'car',
        'comfort_black',
      ],
      applyNightSurcharge: true,
    }),
    now: new Date('2026-09-30T12:03:00.000Z'),
  });

  assert.deepEqual(
    ruled.snapshot.localityPolicies.prea['lagoa-nova'],
    {
      enabledCategories: [
        'moto',
        'car',
        'comfort_black',
      ],
      applyNightSurcharge: true,
    },
  );
  assert.equal(
    ruled.snapshot.surcharges
      .preaLocalCarAfter22LocalityIds
      .includes('lagoa-nova'),
    true,
  );
  assert.equal(
    ruled.snapshot.localities.prea['lagoa-nova']?.moto,
    1800,
  );

  const removed = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_structure',
      operation: 'remove',
      scope: 'prea',
      localityId: 'lagoa-nova',
    }),
    now: new Date('2026-09-30T12:04:00.000Z'),
  });

  assert.equal(
    removed.snapshot.localityPolicies.prea['lagoa-nova'],
    undefined,
  );
  assert.equal(
    removed.snapshot.surcharges
      .preaLocalCarAfter22LocalityIds
      .includes('lagoa-nova'),
    false,
  );
});


test('versiona fallback por distância e limpa regra ao remover a localidade-base', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = {
    kind: 'user' as const,
    id: 'admin-distance-fallback',
    name: 'Admin Distance Fallback',
  };
  const draft = await createPricingCatalogDraft({
    versions,
    admin,
    actor,
    now: new Date('2026-10-01T00:00:00.000Z'),
  });

  await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_structure',
      operation: 'add',
      scope: 'prea',
      localityId: 'base-distancia-teste',
    }),
    now: new Date('2026-10-01T00:01:00.000Z'),
  });

  const withRule = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'distance_fare_policy',
      operation: 'upsert',
      anchorZoneId: 'prea',
      anchorLocalityId: 'base-distancia-teste',
      category: 'car',
      minKm: 3,
      maxKm: 120,
      minimumFareCents: 1800,
      pricePerKmCents: 320,
    }),
    now: new Date('2026-10-01T00:02:00.000Z'),
  });

  assert.deepEqual(withRule.snapshot.distanceFarePolicies, [
    {
      id: 'distance-prea-base-distancia-teste-car',
      anchorZoneId: 'prea',
      anchorLocalityId: 'base-distancia-teste',
      category: 'car',
      minKm: 3,
      maxKm: 120,
      minimumFareCents: 1800,
      pricePerKmCents: 320,
    },
  ]);

  const removed = await updatePricingCatalogDraft({
    versions,
    admin,
    actor,
    versionId: draft.id,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_structure',
      operation: 'remove',
      scope: 'prea',
      localityId: 'base-distancia-teste',
    }),
    now: new Date('2026-10-01T00:03:00.000Z'),
  });

  assert.deepEqual(removed.snapshot.distanceFarePolicies, []);

  assert.throws(
    () =>
      parsePricingCatalogDraftPatch({
        kind: 'distance_fare_policy',
        operation: 'upsert',
        anchorZoneId: 'prea',
        anchorLocalityId: 'prea',
        category: 'car',
        minKm: 20,
        maxKm: 10,
        minimumFareCents: 1500,
        pricePerKmCents: 300,
      }),
    /maxKm/,
  );
});
