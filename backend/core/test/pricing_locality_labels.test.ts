import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { adminPricingCatalogView } from '../src/pricing/admin-catalog.js';
import { InMemoryPricingCatalogVersionRepository } from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import { createPricingCatalogDraft, updatePricingCatalogDraft } from '../src/pricing/pricing-catalog-version-service.js';
import { parsePricingCatalogDraftPatch } from '../src/pricing/pricing-catalog-version-validation.js';

test('display name edits are persisted in the draft without changing fare keys or prices', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = { kind: 'user' as const, id: 'locality-label-review', name: 'Locality Review' };
  const original = await createPricingCatalogDraft({ versions, admin, actor });
  const priceBefore = structuredClone(original.snapshot.localities.prea.formosa);
  const patch = parsePricingCatalogDraftPatch({
    kind: 'locality_label',
    scope: 'prea',
    localityId: 'formosa',
    label: 'Formosa Centro',
  });
  const updated = await updatePricingCatalogDraft({
    versions, admin, actor, versionId: original.id, patch,
    expectedUpdatedAt: original.updatedAt,
  });

  assert.equal(updated.snapshot.localityDisplayNames?.prea.formosa, 'Formosa Centro');
  assert.deepEqual(updated.snapshot.localities.prea.formosa, priceBefore);
  const restored = await versions.findById(original.id);
  assert.equal(restored?.snapshot.localityDisplayNames?.prea.formosa, 'Formosa Centro');
  assert.equal(adminPricingCatalogView(updated.snapshot).localityDisplayNames.prea.formosa, 'Formosa Centro');
});

test('cannot rename an absent locality or accept a blank name', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = { kind: 'user' as const, id: 'locality-label-review', name: 'Locality Review' };
  const draft = await createPricingCatalogDraft({ versions, admin, actor });
  assert.throws(
    () => parsePricingCatalogDraftPatch({
      kind: 'locality_label', scope: 'prea', localityId: 'formosa', label: '  ',
    }),
  );
  await assert.rejects(
    () => updatePricingCatalogDraft({
      versions, admin, actor, versionId: draft.id,
      patch: parsePricingCatalogDraftPatch({
        kind: 'locality_label', scope: 'prea', localityId: 'local-inexistente', label: 'Local',
      }),
    }),
    /localidade precisa existir/i,
  );
});
