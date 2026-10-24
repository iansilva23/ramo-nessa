import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPassengerSavedPlaceRepository } from '../src/passengers/repositories/in-memory-passenger-saved-place-repository.js';
import { savePassengerSavedPlace, listPassengerSavedPlaces } from '../src/passengers/passenger-saved-place-service.js';
import { reverseCoordinate } from '../src/places/reverse-coordinate.js';

const point = { latitude: -2.820123, longitude: -40.414567 };
const input = { passengerId: 'pin-passenger', kind: 'custom', label: 'Minha casa',
  name: 'Local escolhido no mapa', address: 'Local escolhido no mapa', ...point,
  addressDetails: { mapPinned: true, noNumber: false, houseNumber: '12A', complement: 'Portão azul', reference: 'Ao lado da escola' } };

test('pin sem rua persiste coordenadas e detalhes; edição mantém identidade e não duplica', async () => {
  const repository = new InMemoryPassengerSavedPlaceRepository();
  const saved = await savePassengerSavedPlace({ repository, ...input });
  assert.equal(saved.latitude, point.latitude);
  assert.deepEqual(saved.addressDetails, input.addressDetails);
  const edited = await savePassengerSavedPlace({ repository, ...input, id: saved.id,
    longitude: -40.414568, addressDetails: { mapPinned: true, noNumber: true, reference: 'Portão lateral' } });
  assert.equal(edited.id, saved.id);
  assert.equal(edited.createdAt, saved.createdAt);
  assert.equal((await listPassengerSavedPlaces({ repository, passengerId: input.passengerId })).items.length, 1);
  await assert.rejects(savePassengerSavedPlace({ repository, ...input, id: saved.id,
    passengerId: 'another-passenger' }), { code: 'SAVED_PLACE_NOT_FOUND' });
});

test('pin exige número ou Sem número e rejeita coordenadas ausentes', async () => {
  const repository = new InMemoryPassengerSavedPlaceRepository();
  await assert.rejects(savePassengerSavedPlace({ repository, ...input,
    addressDetails: { mapPinned: true, noNumber: false } }), { code: 'INVALID_SAVED_PLACE' });
  await assert.rejects(savePassengerSavedPlace({ repository, ...input,
    addressDetails: { mapPinned: true, noNumber: true, houseNumber: '12' } }), { code: 'INVALID_SAVED_PLACE' });
  await assert.rejects(savePassengerSavedPlace({ repository, ...input, latitude: null }), { code: 'INVALID_SAVED_PLACE' });
});

test('geocodificação exclui número vizinho e coordenadas retornadas pelo Google', async () => {
  const address = await reverseCoordinate({ ...point, apiKey: 'test-key', fetcher: async (url) => {
    const request = new URL(String(url));
    assert.equal(request.searchParams.get('latlng'), '-2.820123,-40.414567');
    return new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 1, lng: 2 } },
      address_components: [ { types: ['street_number'], long_name: '999' },
        { types: ['route'], long_name: 'Rua das Flores' },
        { types: ['administrative_area_level_2'], long_name: 'Cruz' } ] }] }));
  } });
  assert.deepEqual(address, { name: 'Rua das Flores', address: 'Rua das Flores, Cruz' });
});

test('falha de geocodificação permite salvar pin sem rua e não vaza erro do provedor', async () => {
  assert.equal(await reverseCoordinate({ ...point }), null);
  assert.equal(await reverseCoordinate({ ...point, apiKey: 'test-key',
    fetcher: async () => new Response(JSON.stringify({ status: 'REQUEST_DENIED', error_message: 'private' })) }), null);
  assert.equal(await reverseCoordinate({ ...point, apiKey: 'test-key', fetcher: async () => { throw new Error('private'); } }), null);
});
