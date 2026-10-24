import assert from 'node:assert/strict';
import test from 'node:test';
import { filterGeoRegion, parseGeoUpload } from '../src/geo-admin.js';

const place = {
  source: 'osm', sourceId: 'node/120',
  name: 'Pousada Exemplo', address: 'Preá, Ceará',
  category: 'hospedagem', city: 'Cruz',
  latitude: -2.82017, longitude: -40.41467,
};

test('GeoAgent aceita somente bases próprias ou abertas, sem IDs duplicados', () => {
  assert.equal(parseGeoUpload([place]).length, 1);
  assert.equal(parseGeoUpload({ places: [place] })[0].sourceId, 'node/120');
  assert.throws(() => parseGeoUpload([{ ...place, source: 'google' }]), /fonte válida/);
  assert.throws(() => parseGeoUpload([place, place]), /duplicado/);
});

test('GeoAgent rejeita coordenadas ausentes, strings e imprecisões inválidas', () => {
  assert.throws(() => parseGeoUpload([{ ...place, latitude: '0' }]), /campos inválidos/);
  assert.throws(() => parseGeoUpload([{ ...place, longitude: 222 }]), /campos inválidos/);
  assert.throws(() => parseGeoUpload({places: []}), /entre 1 e 10.000/);
});

test('filtro da localidade não altera os registros nem inclui o Ceará inteiro', () => {
  const far = { ...place, sourceId: 'node/121', name: 'Praia de Fortaleza',
    latitude: -3.73, longitude: -38.53 };
  const uploaded = [place, far];
  assert.deepEqual(filterGeoRegion(uploaded, 'prea'), [place]);
  assert.deepEqual(filterGeoRegion(uploaded, 'all'), uploaded);
  assert.equal(uploaded.length, 2);
  assert.throws(() => filterGeoRegion(uploaded, 'invalid'), /desconhecida/);
});
