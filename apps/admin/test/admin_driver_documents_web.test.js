import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';
import {
  driverDocumentStatusPresentation,
  driverDocumentTypeLabel,
} from '../src/security.js';

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

test('helpers documentais apresentam tipos e estados sem inventar aprovação', () => {
  assert.equal(driverDocumentTypeLabel('driver_license'), 'CNH');
  assert.equal(driverDocumentTypeLabel('vehicle_registration'), 'CRLV');
  assert.equal(
    driverDocumentStatusPresentation('approved').tone,
    'success',
  );
  assert.equal(
    driverDocumentStatusPresentation('pending').tone,
    'warning',
  );
  assert.equal(
    driverDocumentStatusPresentation('rejected').tone,
    'danger',
  );
  assert.equal(
    driverDocumentStatusPresentation('expired').tone,
    'danger',
  );
});

test('cliente Admin consulta e revisa documentos sem vazar Bearer na URL', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      items: [],
      documentsApproved: false,
    });
  };

  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_driver_documents_secret';
  const driverId = 'driver-documents-web';

  await api.getDriverDocuments(token, driverId);
  await api.reviewDriverDocument(token, {
    driverId,
    documentType: 'driver_license',
    status: 'rejected',
    rejectionReason: 'Documento ilegível.',
  });

  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method]),
    [
      [
        '/v1/admin/drivers/driver-documents-web/documents',
        'GET',
      ],
      [
        '/v1/admin/drivers/driver-documents-web/documents/driver_license/review',
        'PATCH',
      ],
    ],
  );

  for (const call of calls) {
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.cache, 'no-store');
  }

  assert.deepEqual(JSON.parse(calls[1].options.body), {
    status: 'rejected',
    rejectionReason: 'Documento ilegível.',
  });
});

test('frontend documental expõe somente status sanitizado e decisão humana', () => {
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  for (const id of [
    'driver-documents-overall',
    'driver-documents-result',
    'driver-document-review-panel',
    'driver-document-review-form',
    'driver-document-review-type',
    'driver-document-review-status',
    'driver-document-rejection-reason',
    'driver-document-review-button',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.equal(app.includes('storageKey'), false);
  assert.equal(app.includes('contentSha256'), false);
  assert.equal(html.includes('document-storage-key'), false);
  assert.equal(html.includes('document-content-sha256'), false);
  assert.match(
    html,
    /visualização do arquivo ainda não é feita neste painel/i,
  );
});
