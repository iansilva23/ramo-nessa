import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalityCoordinates } from '../src/locality-coordinates.js';
test('coordinates accept negatives, decimal comma and zero without rounding', () => {
  assert.deepEqual(parseLocalityCoordinates(' -2,795612 ', '-40.514278'), {latitude:-2.795612,longitude:-40.514278});
  assert.deepEqual(parseLocalityCoordinates('0', '0'), {latitude:0,longitude:0});
});
test('empty, malformed or unrepresentable coordinates never reposition the map', () => {
  for (const [lat,lon] of [['','0'], ['0',''], ['abc','0'], ['1e2','0'], ['86','0'], ['0','181'], ['NaN','0']]) {
    assert.throws(() => parseLocalityCoordinates(lat,lon));
  }
});
