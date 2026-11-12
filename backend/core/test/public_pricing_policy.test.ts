import assert from 'node:assert/strict';
import test from 'node:test';

import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { publicPricingPolicyView } from '../src/pricing/public-pricing-policy.js';
import { prepareThreeRegionCatalog } from '../src/pricing/management-service.js';
import type { ManagedRate } from '../src/pricing/managed-operations.js';

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
  assert.equal('availableRouteCategories' in view, false);
});

test('disponibilidade exige tarifa ativa no trajeto, direção e horário consultados', () => {
  const snapshot = prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1);
  const buggy: ManagedRate = {
    id: 'buggy-jeri-prea', name: 'Buggy Jeri Preá', categoryId: 'buggy',
    originRegionId: 'jericoacoara', destinationRegionId: 'prea',
    enabled: true, archived: false, bidirectional: false, kind: 'fixed',
    day: { amountCents: 4000, minimumCents: 4000 }, night: null,
    includedPassengers: 1, perExtraPassengerCents: 0, extras: [],
  };
  snapshot.managedOperations!.rates.push(
    buggy,
    { ...buggy, id: 'delivery-other-route', categoryId: 'delivery', destinationRegionId: 'jijoca' },
    { ...buggy, id: 'comfort-archived', categoryId: 'comfort_black', archived: true },
    { ...buggy, id: 'moto-disabled', categoryId: 'moto', enabled: false },
  );
  const context = { snapshot, reference: { catalogVersion: snapshot.catalogVersion }, version: null };
  const availability = (originRegionId: string, destinationRegionId: string, time: string) =>
    publicPricingPolicyView(context, { originRegionId, destinationRegionId, at: new Date(time) })
      .availableRouteCategories;

  const day = '2026-11-09T15:00:00Z';
  assert.ok(publicPricingPolicyView(context).enabledCategories.includes('delivery'));
  assert.deepEqual(availability('jericoacoara', 'prea', day), ['buggy']);
  assert.deepEqual(availability('prea', 'jericoacoara', day), []);
  assert.deepEqual(availability('jericoacoara', 'prea', '2026-11-10T02:00:00Z'), []);
  assert.deepEqual(availability('jericoacoara', 'unknown', day), []);
  buggy.bidirectional = true;
  assert.deepEqual(availability('prea', 'jericoacoara', day), ['buggy']);
  snapshot.managedOperations!.regions.find(region => region.id === 'prea')!.enabled = false;
  assert.deepEqual(availability('jericoacoara', 'prea', day), []);
});
