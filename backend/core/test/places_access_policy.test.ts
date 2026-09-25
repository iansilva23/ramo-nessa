import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isApprovedExternalPlacesQuery,
  placesLocalityId,
} from '../src/places/places-access-policy.js';

test('normaliza localidades externas com acentos e sufixo de endereço', () => {
  assert.equal(
    placesLocalityId('Triângulo do Marco, Ceará, Brasil'),
    'triangulo-do-marco',
  );
  assert.equal(
    placesLocalityId('Santana do Acaraú, CE'),
    'santana-do-acarau',
  );
});

test('busca externa só passa quando pertence ao catálogo vigente', () => {
  const externalLocalities = [
    'sobral',
    'camocim',
    'triangulo-do-marco',
  ];

  assert.equal(
    isApprovedExternalPlacesQuery({
      query: 'Sobral, Ceará, Brasil',
      externalLocalities,
    }),
    true,
  );
  assert.equal(
    isApprovedExternalPlacesQuery({
      query: 'Fortaleza, Ceará, Brasil',
      externalLocalities,
    }),
    false,
  );
});
