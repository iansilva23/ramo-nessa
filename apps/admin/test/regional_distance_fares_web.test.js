import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('ADM de tarifas regionais exige configuração explícita e usa rascunhos', () => {
  const html = readFileSync(new URL('../pages/localities.html', import.meta.url), 'utf8');
  const code = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  for (const key of [
    'regional-fare-zone','regional-fare-category','regional-fare-localities',
    'regional-fare-day-min','regional-fare-day-km',
    'regional-fare-night-min','regional-fare-night-km',
    'regional-fare-min-km','regional-fare-max-km',
    'regional-fare-save','regional-fare-remove',
  ]) assert.match(html, new RegExp('id="'+key+'"'));
  assert.match(code,/scope: 'intra_zone'/);
  assert.match(code,/coveredLocalityIds: chosen/);
  assert.match(code,/if \(chosen.length < 2\)/);
  assert.match(code,/await applyPatch\(patch\)/);
  assert.match(code,/hasUnsavedWizardChanges\(\)/);
  assert.equal(code.includes('.innerHTML'), false);
});
