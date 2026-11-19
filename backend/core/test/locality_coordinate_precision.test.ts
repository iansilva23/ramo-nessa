import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { adminPricingCatalogView } from '../src/pricing/admin-catalog.js';
import { InMemoryPricingCatalogVersionRepository } from '../src/pricing/repositories/in-memory-pricing-catalog-version-repository.js';
import {
  createPricingCatalogDraft,
  updatePricingCatalogDraft,
  publishPricingCatalogVersion,
} from '../src/pricing/pricing-catalog-version-service.js';
import { parsePricingCatalogDraftPatch } from '../src/pricing/pricing-catalog-version-validation.js';

test('save, reload, and publish preserve 6-digit coordinates for locality markers', async () => {
  const versions = new InMemoryPricingCatalogVersionRepository();
  const admin = new InMemoryAdminRepository();
  const actor = { kind: 'user' as const, id: 'precise-locality-review', name: 'Precision Review' };
  const draft = await createPricingCatalogDraft({ versions, admin, actor });
  const modified = await updatePricingCatalogDraft({
    versions, admin, actor, versionId: draft.id, expectedUpdatedAt: draft.updatedAt,
    patch: parsePricingCatalogDraftPatch({
      kind: 'locality_geofence',
      operation: 'upsert',
      zoneId: 'prea',
      localityId: 'prea',
      centerLatitude: -2.820173,
      centerLongitude: -40.414671,
      radiusKm: 2.25,
    }),
  });
  const stored = await versions.findById(draft.id);
  const location = stored?.snapshot.localityGeofences.find(
    (area) => area.zoneId === 'prea' && area.localityId === 'prea',
  );
  assert.equal(location?.centerLatitude, -2.820173);
  assert.equal(location?.centerLongitude, -40.414671);
  assert.equal(location?.radiusKm, 2.25);
  const view = adminPricingCatalogView(stored!.snapshot);
  const displayed = view.localityGeofences.find(
    (area) => area.zoneId === 'prea' && area.localityId === 'prea',
  );
  assert.equal(displayed?.centerLatitude, -2.820173);
  assert.equal(displayed?.centerLongitude, -40.414671);
  const published = await publishPricingCatalogVersion({
    versions, admin, actor, versionId: draft.id,
    expectedUpdatedAt: modified.updatedAt,
  });
  assert.equal(published.snapshot.localityGeofences.find(
    (area) => area.zoneId === 'prea' && area.localityId === 'prea',
  )?.centerLongitude, -40.414671);
});

test('coordinates beyond valid global bounds are rejected, and low-precision radius remains valid', () => {
  for (const [lat, lon] of [[91, -40.41467], [-2.82, -181], [null, -40.4], [1, 'NaN']]) {
    assert.throws(() => parsePricingCatalogDraftPatch({
      kind: 'locality_geofence', operation: 'upsert',
      zoneId: 'prea', localityId: 'prea',
      centerLatitude: lat, centerLongitude: lon, radiusKm: 2,
    }));
  }
});
