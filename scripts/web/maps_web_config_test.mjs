import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateMapsWebKey, prepareMapsWebIndex } from './maps_web_config.mjs';
const fixtureKey = 'AIza' + 'a'.repeat(35); // Invalid provider fixture; never sent to Google.
const marker = '__RAMO_GOOGLE_MAPS_WEB_KEY__';
const index = '<script src="https://maps.googleapis.com/maps/api/js?key=' + marker + '"></script>';

test('public key shape is inserted without changing the rest of the app', () => {
  assert.equal(prepareMapsWebIndex(index, '  ' + fixtureKey + '  '),
    index.replace(marker, fixtureKey));
});
test('unconfigured public build is rejected; CI review must be explicit', () => {
  assert.throws(() => prepareMapsWebIndex(index, ''), /ausente\/inválida/);
  assert.throws(() => validateMapsWebKey('WEB_KEY_NOT_CONFIGURED_FOR_CI'), /ausente\/inválida/);
  assert.ok(prepareMapsWebIndex(index, '', { allowReviewPlaceholder: true })
    .includes('WEB_KEY_NOT_CONFIGURED_FOR_CI'));
});
test('malformed key, markup, substitutions and private JSON are rejected without echo', () => {
  for (const raw of ['short', fixtureKey + '&x=1', fixtureKey + '" onload="x',
    '$' + '(secret)', '{"private_key":"sensitive-fixture"}', fixtureKey + '\nother']) {
    assert.throws(() => prepareMapsWebIndex(index, raw), error =>
      error instanceof Error && !error.message.includes(raw) &&
      !error.message.includes('sensitive-fixture'));
  }
});
test('duplicate, missing or replaced marker cannot silently create a bundle', () => {
  for (const raw of [index + marker, index.replace(marker, fixtureKey), '<p>' + marker + '</p>']) {
    assert.throws(() => prepareMapsWebIndex(raw, fixtureKey), /Entrypoint/);
  }
});
for (const role of ['passenger', 'driver']) {
  test(role + ' original entry point has one safe Maps injection location', async () => {
    const source = await readFile(new URL('../../apps/' + role + '/web/index.html', import.meta.url), 'utf8');
    const prepared = prepareMapsWebIndex(source, fixtureKey);
    assert.ok(!prepared.includes(marker));
    assert.ok(prepared.includes('src="ramo_push_config.js"'));
    assert.ok(prepared.includes('src="flutter_bootstrap.js"'));
  });
}
