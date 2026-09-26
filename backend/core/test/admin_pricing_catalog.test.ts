import assert from 'node:assert/strict';
import test from 'node:test';

import { adminPricingCatalogView } from '../src/pricing/admin-catalog.js';

test('catálogo Admin é somente leitura e preserva a autoridade do Core', () => {
  const catalog = adminPricingCatalogView();

  assert.equal(catalog.catalogVersion, 'v1');
  assert.equal(catalog.authority, 'core');
  assert.equal(catalog.mode, 'static');
  assert.equal(catalog.editable, false);
  assert.equal(catalog.commissionBps, 1000);
  assert.deepEqual(catalog.periods, ['day', 'after_22']);
  assert.deepEqual(catalog.zones, [
    'jericoacoara',
    'jijoca',
    'prea',
    'external',
  ]);
  assert.deepEqual(catalog.categories, [
    'moto',
    'delivery',
    'car',
    'comfort_black',
    'buggy',
  ]);
  assert.deepEqual(
    catalog.categoryPolicies.find(
      (item) => item.category === 'comfort_black',
    ),
    {
      category: 'comfort_black',
      enabled: true,
      requiresFourByFourOnJeriBoundary: true,
    },
  );
  assert.deepEqual(
    catalog.zonePolicies.find(
      (item) => item.zoneId === 'external',
    ),
    {
      zoneId: 'external',
      enabled: true,
    },
  );
  assert.equal(
    catalog.externalLocalities.includes('airport-jjd'),
    true,
  );
  assert.equal(
    catalog.externalLocalities.includes('sobral'),
    true,
  );
});

test('catálogo Admin expõe localidades, faixas e rotas fixas sem resolver tarifa por conta própria', () => {
  const catalog = adminPricingCatalogView();

  const prea = catalog.localities.prea.find(
    (item) => item.localityId === 'prea',
  );
  assert.deepEqual(prea?.prices.car, {
    kind: 'exact',
    amountCents: 2500,
  });

  const formosa = catalog.localities.prea.find(
    (item) => item.localityId === 'formosa',
  );
  assert.deepEqual(formosa?.prices.moto, {
    kind: 'range',
    minCents: 800,
    maxCents: 1000,
  });

  const route = catalog.fixedRoutes.find(
    (item) => item.id === 'prea-jijoca-car',
  );
  assert.equal(route?.dayCents, 12000);
  assert.equal(route?.after22Cents, 14000);

  assert.equal(
    catalog.surcharges.preaLocalCarAfter22LocalityIds.includes(
      'prea',
    ),
    true,
  );
});
