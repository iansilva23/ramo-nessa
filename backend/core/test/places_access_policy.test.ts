import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isApprovedExternalPlaceDetails,
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
  assert.equal(
    placesLocalityId('Sobral - CE, Brasil'),
    'sobral',
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


test('detalhes externos precisam corresponder à localidade aprovada', () => {
  const externalLocalities = ['sobral', 'camocim'];

  assert.equal(
    isApprovedExternalPlaceDetails({
      localityId: 'sobral',
      formattedAddress: 'Sobral - CE, Brasil',
      addressComponentNames: ['Sobral', 'Ceará', 'Brasil'],
      externalLocalities,
    }),
    true,
  );

  assert.equal(
    isApprovedExternalPlaceDetails({
      localityId: 'sobral',
      formattedAddress: 'Fortaleza - CE, Brasil',
      addressComponentNames: ['Fortaleza', 'Ceará', 'Brasil'],
      externalLocalities,
    }),
    false,
  );
});
