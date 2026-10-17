import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('locality name is editable while its stable price key stays protected', () => {
  const code = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  assert.match(code, /byId\('locality-name'\)\.disabled = false/);
  assert.match(code, /byId\('locality-scope'\)\.disabled = nextMode === 'edit'/);
  assert.match(code, /kind: 'locality_label'/);
  assert.match(code, /label: model\.name\.trim\(\)/);
  assert.match(code, /catalog\.localityDisplayNames/);
});
