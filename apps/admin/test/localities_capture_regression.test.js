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

test('undo deletion restores the locality display name, not only its stable ID', () => {
  const source = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  const undo = source.match(/async function undoDelete\(\) \{[\s\S]*?\n  function renderDirectory\(/)?.[0];
  assert.ok(undo, 'undoDelete must exist');
  assert.match(
    undo,
    /kind: 'locality_structure'[\s\S]*?operation: 'add'[\s\S]*?kind: 'locality_label'[\s\S]*?label: model\.name/,
  );
  assert.match(undo, /kind: 'locality_geofence'/);
  assert.match(undo, /buildPricePatch\(/);
});

test('pricing draft cannot be published while unsaved locality edits are visible', () => {
  const source = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  const publish = source.match(/async function publishDraftNow\(\) \{[\s\S]*?\n  async function discardDraft\(/)?.[0];
  assert.ok(publish, 'publishDraftNow must exist');
  const unsavedCheck = publish.indexOf('hasUnsavedWizardChanges()');
  const apiCall = publish.indexOf('api.publishPricingVersion(');
  assert.ok(unsavedCheck >= 0 && unsavedCheck < apiCall);
  assert.match(publish, /Salve ou descarte as alterações da localidade antes de publicar/);
});

test('switching between localities cannot erase an unsaved wizard without confirmation', () => {
  const source = readFileSync(new URL('../src/localities-admin.js', import.meta.url), 'utf8');
  const open = source.match(/function openWizard\(nextMode, entry = null\) \{[\s\S]*?\n  function hasUnsavedWizardChanges\(/)?.[0];
  assert.ok(open, 'openWizard must exist');
  const guard = open.indexOf('hasUnsavedWizardChanges()');
  const confirm = open.indexOf("window.confirm('Descartar as alterações não salvas desta localidade?')");
  const overwrite = open.indexOf('mode = nextMode;');
  assert.ok(guard >= 0 && confirm > guard && overwrite > confirm);
});
