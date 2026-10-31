import assert from 'node:assert/strict';
import test from 'node:test';

import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { publicPricingPolicyView } from '../src/pricing/public-pricing-policy.js';

test('política pública expõe somente disponibilidade operacional necessária ao app', () => {
  const snapshot = structuredClone(STATIC_PRICING_CATALOG_V1);
  snapshot.categoryPolicies.moto.enabled = false;
  snapshot.zonePolicies.prea.enabled = false;
  snapshot.jeri.buggy.minPassengers = 2;
  snapshot.jeri.buggy.maxPassengers = 6;

  const view = publicPricingPolicyView({
    snapshot,
    reference: {
      catalogVersion: snapshot.catalogVersion,
      catalogVersionId: 'version-public-policy',
      catalogVersionNumber: 7,
    },
    version: null,
  });

  assert.equal(view.enabledCategories.includes('moto'), false);
  assert.equal(view.enabledCategories.includes('car'), true);
  assert.equal(view.enabledZones.includes('prea'), false);
  assert.equal(view.enabledZones.includes('jericoacoara'), true);
  assert.deepEqual(view.buggy, {
    minPassengers: 2,
    maxPassengers: 6,
  });
  assert.equal(
    view.localityPolicies.prea.some(
      (item) =>
        item.localityId === 'buraco-azul' &&
        item.enabledCategories.includes('comfort_black'),
    ),
    true,
  );
  assert.equal(
    view.localityPolicies.jijoca.some(
      (item) =>
        item.localityId === 'jijoca' &&
        item.enabledCategories.includes('comfort_black'),
    ),
    true,
  );
  assert.deepEqual(view.pricingCatalog, {
    catalogVersion: 'approved-2026-10-03',
    catalogVersionId: 'version-public-policy',
    catalogVersionNumber: 7,
  });

  // Shared transfer/geofence metadata is global; never duplicate it for
  // every locality (the app only needs localityId + enabledCategories).
  for (const localities of [view.localityPolicies.prea, view.localityPolicies.jijoca]) {
    for (const locality of localities) {
      assert.deepEqual(Object.keys(locality).sort(), ['enabledCategories','localityId']);
    }
  }
  assert.ok(Array.isArray(view.localityGeofences));
  assert.equal('commissionBps' in view, false);
  assert.equal('localities' in view, false);
  assert.equal('surcharges' in view, false);
});
