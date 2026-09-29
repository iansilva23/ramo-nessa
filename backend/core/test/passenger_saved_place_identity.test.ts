import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryPassengerSavedPlaceRepository } from '../src/passengers/repositories/in-memory-passenger-saved-place-repository.js';
import {
  PassengerSavedPlaceError,
  listPassengerSavedPlaces,
  savePassengerSavedPlace,
} from '../src/passengers/passenger-saved-place-service.js';

test('local salvo preserva identidade renovável sem persistir placeProof', async () => {
  const repository = new InMemoryPassengerSavedPlaceRepository();

  const saved = await savePassengerSavedPlace({
    repository,
    passengerId: 'passenger-saved-place-test',
    kind: 'home',
    name: 'Aranaú',
    address: 'Aranaú, Acaraú - CE',
    latitude: -2.9,
    longitude: -40.2,
    providerPlaceId: 'google-place-aranau',
    approvedPricingZoneId: 'prea',
    approvedPricingLocalityId: 'aranau',
    now: new Date('2026-09-29T12:00:00.000Z'),
  });

  assert.equal(saved.providerPlaceId, 'google-place-aranau');
  assert.equal(saved.approvedPricingZoneId, 'prea');
  assert.equal(saved.approvedPricingLocalityId, 'aranau');
  assert.equal('placeProof' in saved, false);

  const listed = await listPassengerSavedPlaces({
    repository,
    passengerId: 'passenger-saved-place-test',
  });
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0]?.providerPlaceId, 'google-place-aranau');
  assert.equal(listed.items[0]?.approvedPricingLocalityId, 'aranau');
});

test('classificação aprovada exige providerPlaceId renovável', async () => {
  const repository = new InMemoryPassengerSavedPlaceRepository();

  await assert.rejects(
    savePassengerSavedPlace({
      repository,
      passengerId: 'passenger-saved-place-test',
      kind: 'work',
      name: 'Sobral',
      address: 'Sobral - CE',
      latitude: -3.688,
      longitude: -40.3499,
      approvedPricingZoneId: 'external',
      approvedPricingLocalityId: 'sobral',
    }),
    (error: unknown) =>
      error instanceof PassengerSavedPlaceError &&
      error.code === 'INVALID_SAVED_PLACE',
  );
});
