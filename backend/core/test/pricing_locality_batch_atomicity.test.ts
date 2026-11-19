import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryPricingCatalogVersionRepository } from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import {
  PricingCatalogVersionError,
  createPricingCatalogDraft,
  updatePricingCatalogDraft,
} from '../src/pricing/pricing-catalog-version-service.js';
import { parsePricingCatalogDraftPatch } from '../src/pricing/pricing-catalog-version-validation.js';

function fixture() {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = { kind: 'user' as const, id: 'atomic-locality-test', name: 'Atomic Locality' };
  return { versions, admin, actor };
}

function batch(patches: unknown[]) {
  return parsePricingCatalogDraftPatch({ kind: 'batch', patches });
}

test('one locality batch commits name, geofence, price and policy with one draft update and one audit', async () => {
  const env = fixture();
  const draft = await createPricingCatalogDraft(env);
  const patch = batch([
    { kind: 'locality_structure', operation: 'add', scope: 'prea', localityId: 'lagoa-atomo' },
    { kind: 'locality_label', scope: 'prea', localityId: 'lagoa-atomo', label: 'Lagoa Átomo' },
    {
      kind: 'locality_geofence', operation: 'upsert', zoneId: 'prea',
      localityId: 'lagoa-atomo', centerLatitude: -2.820179, centerLongitude: -40.414678,
      radiusKm: 2.75,
    },
    {
      kind: 'locality_price', hub: 'prea', localityId: 'lagoa-atomo',
      category: 'moto', price: { kind: 'exact', amountCents: 1200 },
    },
    {
      kind: 'locality_policy', hub: 'prea', localityId: 'lagoa-atomo',
      enabledCategories: ['moto'], applyNightSurcharge: false,
    },
  ]);
  const saved = await updatePricingCatalogDraft({
    ...env, versionId: draft.id, patch,
    expectedUpdatedAt: draft.updatedAt,
  });
  assert.equal(saved.snapshot.localityDisplayNames?.prea['lagoa-atomo'], 'Lagoa Átomo');
  assert.equal(saved.snapshot.localities.prea['lagoa-atomo']?.moto, 1200);
  const pin = saved.snapshot.localityGeofences.find(x => x.localityId === 'lagoa-atomo');
  assert.equal(pin?.centerLatitude, -2.820179);
  assert.equal(pin?.centerLongitude, -40.414678);
  assert.deepEqual(saved.snapshot.localityPolicies.prea['lagoa-atomo']?.enabledCategories, ['moto']);
  assert.notEqual(saved.updatedAt, draft.updatedAt);
  assert.deepEqual((await env.versions.findById(draft.id))?.snapshot, saved.snapshot);

  const updates = (await env.admin.listAudit(100)).filter(
    entry => entry.action === 'pricing.catalog_version.updated',
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.metadata?.kind, 'batch');
  assert.equal(updates[0]?.metadata?.count, 5);
});

test('a late failing patch leaves the original draft and audit unchanged', async () => {
  const env = fixture();
  const draft = await createPricingCatalogDraft(env);
  const bad = batch([
    { kind: 'locality_structure', operation: 'add', scope: 'prea', localityId: 'lagoa-reversivel' },
    { kind: 'locality_geofence', operation: 'remove', zoneId: 'prea', localityId: 'lagoa-reversivel' },
  ]);
  await assert.rejects(
    () => updatePricingCatalogDraft({
      ...env, versionId: draft.id, patch: bad, expectedUpdatedAt: draft.updatedAt,
    }),
    (error: unknown) => error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_RULE_NOT_FOUND',
  );
  assert.deepEqual((await env.versions.findById(draft.id))?.snapshot, draft.snapshot);
  assert.equal((await env.versions.findById(draft.id))?.updatedAt, draft.updatedAt);
  assert.equal((await env.admin.listAudit(100)).length, 1);
});

test('batch enforces one locality, limit, no nested or unrelated policies', () => {
  const one = {kind: 'locality_label', scope: 'prea', localityId: 'prea', label: 'Preá'};
  assert.throws(() => batch([]), /entre 1 e 20/);
  assert.throws(() => batch(Array(21).fill(one)), /entre 1 e 20/);
  assert.throws(() => batch([one, {
    kind: 'locality_label', scope: 'prea', localityId: 'formosa', label: 'Formosa',
  }]), /mesma localidade/);
  assert.throws(() => batch([{kind: 'batch', patches: [one]}]), /aninhados/);
  assert.throws(() => batch([{kind: 'commission_policy', commissionBps: 1500}]), /somente alterações da mesma localidade/);
});

test('stale batch conflicts without overwriting another operator', async () => {
  const env = fixture();
  const draft = await createPricingCatalogDraft(env);
  const first = await updatePricingCatalogDraft({
    ...env, versionId: draft.id, expectedUpdatedAt: draft.updatedAt,
    patch: batch([{kind: 'locality_label', scope: 'prea', localityId: 'prea', label: 'Novo Preá'}]),
  });
  await assert.rejects(
    () => updatePricingCatalogDraft({
      ...env, versionId: draft.id, expectedUpdatedAt: draft.updatedAt,
      patch: batch([{kind: 'locality_label', scope: 'prea', localityId: 'prea', label: 'Preá antigo'}]),
    }),
    (error: unknown) => error instanceof PricingCatalogVersionError &&
      error.code === 'PRICING_VERSION_CONFLICT',
  );
  assert.equal((await env.versions.findById(draft.id))?.updatedAt, first.updatedAt);
  assert.equal((await env.versions.findById(draft.id))?.snapshot.localityDisplayNames?.prea.prea, 'Novo Preá');
});
