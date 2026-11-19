import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test('Admin salva passeio e envia foto sem colocar token na URL', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      tour: {
        slug: 'lado-leste',
        enabled: false,
      },
    });
  };
  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_tours_test';

  await api.saveAgencyTour(token, 'lado-leste', {
    enabled: false,
    sortOrder: 10,
    title: 'Passeio Lado Leste',
    badge: 'COMPARTILHADO',
    shortDescription: 'Lagoas e praias.',
    description: 'Descrição completa.',
    highlights: ['Praia do Preá'],
    included: [],
    excluded: [],
    priceLabel: 'A partir de',
    priceCents: 7500,
    priceSuffix: 'por pessoa',
    whatsappPhone: '+5588999999999',
    whatsappMessage: 'Olá! Quero reservar.',
  });

  const image = Uint8Array.from([82, 78, 1, 2, 3]);
  await api.uploadAgencyTourCover(token, 'lado-leste', {
    bytes: image,
    contentType: 'image/webp',
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/v1/admin/tours/lado-leste');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].url.includes(token), false);

  assert.equal(calls[1].url, '/v1/admin/tours/lado-leste/cover');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers['content-type'], 'image/webp');
  assert.equal(
    calls[1].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.deepEqual([...calls[1].options.body], [...image]);
});

test('Admin lê foto privada de passeio em rascunho com Bearer', async () => {
  const calls = [];
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          return name.toLowerCase() === 'content-type'
            ? 'image/webp'
            : null;
        },
      },
      async arrayBuffer() {
        return bytes.buffer.slice(0);
      },
    };
  });
  const token = 'rn_admin_session_draft_cover_test';

  const cover = await api.agencyTourCover(token, 'lado-oeste');

  assert.equal(cover.contentType, 'image/webp');
  assert.deepEqual([...cover.bytes], [1, 2, 3, 4]);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].url.includes(token), false);
});

test('painel Admin expõe editor completo do catálogo de passeios', async () => {
  const [html, app, api] = await Promise.all([
    Promise.all([
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../pages/agency.html', import.meta.url), 'utf8'),
    ]).then((parts) => parts.join('\n')),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/api.js', import.meta.url), 'utf8'),
  ]);

  for (const id of [
    'tour-admin-list',
    'tour-form',
    'tour-enabled',
    'tour-title',
    'tour-badge',
    'tour-highlights',
    'tour-price-reais',
    'tour-whatsapp-phone',
    'tour-whatsapp-message',
    'tour-cover-file',
    'upload-tour-cover-button',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(app, /renderTourCatalog/);
  assert.match(app, /handleTourSubmit/);
  assert.match(app, /handleTourCoverUpload/);
  assert.match(app, /loadTourCoverPreview/);
  assert.match(api, /saveAgencyTour/);
  assert.match(api, /uploadAgencyTourCover/);
  assert.match(api, /agencyTourCover/);

  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(app.includes('localStorage'), false);
});
