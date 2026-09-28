import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('cliente Admin consulta e atende LGPD sem vazar Bearer na URL', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'PUT') {
      return jsonResponse(201, {
        documentType: 'privacy_policy',
        version: 2,
      });
    }
    if (options.method === 'PATCH') {
      return jsonResponse(200, {
        id: '7d87b20a-15f7-4a15-bd73-b8e89e622f11',
        status: 'completed',
      });
    }
    return jsonResponse(200, {
      legalDocuments: [],
      requests: [],
      nextCursor: {
        createdAt: '2026-09-28T18:00:00.000Z',
        id: '0863e897-efff-45a1-8501-159040820571',
      },
    });
  });

  const token = 'rn_admin_session_privacy_secret';
  const cursor = {
    createdAt: '2026-09-28T17:00:00.000Z',
    id: '234a8737-eaae-4e29-a10a-bae70ca3e499',
  };

  const page = await api.privacy(token, {
    limit: 25,
    status: 'in_progress',
    cursor,
  });

  assert.equal(page.requests.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes(token), false);

  const listUrl = new URL(calls[0].url, 'https://admin.local');
  assert.equal(listUrl.pathname, '/v1/admin/privacy');
  assert.equal(listUrl.searchParams.get('limit'), '25');
  assert.equal(listUrl.searchParams.get('status'), 'in_progress');
  assert.equal(
    listUrl.searchParams.get('cursorCreatedAt'),
    cursor.createdAt,
  );
  assert.equal(listUrl.searchParams.get('cursorId'), cursor.id);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');

  await api.publishPrivacyDocument(token, {
    documentType: 'privacy_policy',
    title: 'Política de Privacidade',
    content:
      'Conteúdo jurídico revisado com tamanho suficiente para publicação administrativa segura.',
    effectiveAt: '2026-10-01T00:00:00.000Z',
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].url,
    '/v1/admin/privacy/documents/privacy_policy',
  );
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].url.includes(token), false);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    title: 'Política de Privacidade',
    content:
      'Conteúdo jurídico revisado com tamanho suficiente para publicação administrativa segura.',
    effectiveAt: '2026-10-01T00:00:00.000Z',
  });

  const requestId = '7d87b20a-15f7-4a15-bd73-b8e89e622f11';
  await api.updatePrivacyRequest(token, {
    requestId,
    status: 'completed',
    response: 'Solicitação atendida conforme registro interno.',
  });

  assert.equal(calls.length, 3);
  assert.equal(
    calls[2].url,
    `/v1/admin/privacy/requests/${requestId}`,
  );
  assert.equal(calls[2].options.method, 'PATCH');
  assert.equal(calls[2].url.includes(token), false);
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    status: 'completed',
    response: 'Solicitação atendida conforme registro interno.',
  });
});

test('ADM expõe Privacidade e LGPD com controles ligados e scopes próprios', () => {
  const index = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
  const privacy = readFileSync(
    new URL('../pages/privacy.html', import.meta.url),
    'utf8',
  );
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const api = readFileSync(
    new URL('../src/api.js', import.meta.url),
    'utf8',
  );

  assert.match(
    index,
    /href=["']\/admin\/privacidade["'][^>]*data-view=["']privacy["']/,
  );
  assert.match(app, /path:\s*'\/admin\/privacidade'/);
  assert.match(app, /page:\s*'privacy'/);
  assert.match(app, /hasScope\('privacy:read'\)/);
  assert.match(app, /hasScope\('privacy:write'\)/);
  assert.match(app, /loadPrivacy/);
  assert.match(app, /handlePrivacyDocumentSubmit/);
  assert.match(app, /handlePrivacyResponse/);

  for (const id of [
    'refresh-privacy-button',
    'privacy-policy-form',
    'privacy-policy-title',
    'privacy-policy-content',
    'privacy-policy-effective-at',
    'privacy-policy-submit',
    'terms-of-use-form',
    'terms-of-use-title',
    'terms-of-use-content',
    'terms-of-use-effective-at',
    'terms-of-use-submit',
    'privacy-filter-form',
    'privacy-status-filter',
    'privacy-request-list',
    'privacy-load-more',
    'privacy-response-form',
    'privacy-request-id',
    'privacy-request-status',
    'privacy-request-response',
    'privacy-response-button',
  ]) {
    assert.match(privacy, new RegExp(`id=["']${id}["']`));
  }

  assert.match(api, /privacy\(token/);
  assert.match(api, /publishPrivacyDocument/);
  assert.match(api, /updatePrivacyRequest/);
  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(app.includes('insertAdjacentHTML'), false);
});
