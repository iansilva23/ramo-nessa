import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';

test('ADM documenta e publica a imagem do login com Bearer', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      async json() { return { appAuthBranding: { heroImageVersion: 2 } }; },
    };
  });
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 1]);
  await api.uploadAppAuthHero('admin-session', {
    bytes,
    contentType: 'image/jpeg',
  });

  assert.equal(calls[0].url, '/v1/admin/app-auth-branding/hero');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.headers.authorization, 'Bearer admin-session');
  assert.equal(calls[0].url.includes('admin-session'), false);

  const [html, app] = await Promise.all([
    readFile(new URL('../pages/notifications.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  ]);
  for (const value of [
    'app-auth-hero-preview',
    'app-auth-hero-file',
    'upload-app-auth-hero-button',
    '1440 × 1080 px',
    '1200 × 900 px',
    'Máximo: 5 MB',
  ]) assert.match(html, new RegExp(value));
  assert.match(app, /handleAppAuthHeroUpload/);
  assert.match(app, /communications:write/);
});
