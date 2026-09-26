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
  assert.deepEqual(view.pricingCatalog, {
    catalogVersion: 'v1',
    catalogVersionId: 'version-public-policy',
    catalogVersionNumber: 7,
  });

  assert.equal('commissionBps' in view, false);
  assert.equal('localities' in view, false);
  assert.equal('surcharges' in view, false);
});
