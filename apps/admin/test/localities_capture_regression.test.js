import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('saving a locality never reads an undefined entry variable', () => {
  const source = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  const capture = source.match(/function captureForm\(\) \{[\s\S]*?\n  function applyForm\(/)?.[0];
  assert.ok(capture, 'captureForm must be available');
  assert.doesNotMatch(capture, /\bentry\.prices\b/);
  assert.match(capture, /editing\?\.prices/);
  assert.match(capture, /localitySelectionFromInputs\(/);
});
