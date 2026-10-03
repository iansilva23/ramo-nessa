import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveApprovedLocalPlace } from '../src/places/local-place-policy.js';

test('classifica localidades específicas antes dos hubs genéricos', () => {
  assert.deepEqual(
    resolveApprovedLocalPlace({
      name: 'Preá Beach Villas',
      address: 'Praia do Preá, Cruz - CE',
      addressComponentNames: ['Preá', 'Cruz', 'Ceará'],
    }),
    {
      zoneId: 'prea',
      localityId: 'prea-beach-villas',
    },
  );

  assert.deepEqual(
    resolveApprovedLocalPlace({
      name: 'Córrego da Forquilha II',
      address: 'Jijoca de Jericoacoara - CE',
      addressComponentNames: ['Jijoca de Jericoacoara', 'Ceará'],
    }),
    {
      zoneId: 'jijoca',
      localityId: 'corrego-da-forquilha-ii',
    },
  );
});

test('hubs usam o nome do lugar e não o endereço inteiro', () => {
  assert.deepEqual(
    resolveApprovedLocalPlace({
      name: 'Jericoacoara',
      address: 'Jericoacoara, Jijoca de Jericoacoara - CE',
    }),
    {
      zoneId: 'jericoacoara',
      localityId: 'jericoacoara',
    },
  );

  assert.equal(
    resolveApprovedLocalPlace({
      name: 'Pousada sem alias específico',
      address: 'Preá, Cruz - CE',
      addressComponentNames: ['Preá', 'Cruz'],
    }),
    null,
  );
});

test('reconhece aeroporto JJD como localidade externa especial', () => {
  assert.deepEqual(
    resolveApprovedLocalPlace({
      name: 'Aeroporto Regional de Jericoacoara',
      address: 'Cruz - CE, Brasil',
    }),
    {
      zoneId: 'external',
      localityId: 'airport-jjd',
    },
  );
});
