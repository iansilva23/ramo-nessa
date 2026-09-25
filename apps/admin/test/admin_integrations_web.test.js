import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('admin exposes Google Maps production setup center', async () => {
  const [html, app, api] = await Promise.all([
    readFile(new URL('../index.html', root), 'utf8'),
    readFile(new URL('../src/app.js', root), 'utf8'),
    readFile(new URL('../src/api.js', root), 'utf8'),
  ]);

  assert.match(html, /data-view="integrations"/);
  assert.match(html, /id="view-integrations"/);
  assert.match(html, /Maps SDK for Android/);
  assert.match(html, /Places API \(New\)/);
  assert.match(html, /RAMO_GOOGLE_MAPS/);

  assert.match(app, /loadIntegrations/);
  assert.match(app, /google-credential-cards/);
  assert.match(api, /\/v1\/admin\/integrations/);

  assert.doesNotMatch(
    html,
    /AIza[0-9A-Za-z_-]{20,}/,
    'o HTML não deve conter chave Google real',
  );
});
