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

test('failed locality writes reload the draft and leave the edit wizard open for safe retry', () => {
  const source = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  const save = source.match(/async function saveWizard\(\) \{[\s\S]*?\n  async function deleteEntry\(/)?.[0];
  assert.ok(save, 'saveWizard must exist');
  assert.match(save, /await refresh\(\{ announce: false \}\)/);
  assert.match(save, /Some|Algumas mudanças podem ter ficado no rascunho/);
  assert.match(save, /Confira os dados e tente novamente antes de publicar/);
  assert.match(save, /catch \(error\)/);
  // Closing the form is success-only and is not permitted in the catch block.
  assert.doesNotMatch(save.split('} catch (error) {').pop(), /closeWizard\(/);
});

test('editing a locality protects unsaved form values on cancel/close', () => {
  const source = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  assert.match(source, /function hasUnsavedWizardChanges\(\)/);
  assert.match(source, /JSON\.stringify\(captureForm\(\)\) !== JSON\.stringify\(initialForm\)/);
  assert.match(source, /Descartar as alterações não salvas desta localidade/);
  assert.match(source, /closeWizard\(\{ force: true \}\)/);
});
