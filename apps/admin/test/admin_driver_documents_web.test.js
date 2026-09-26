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

function binaryResponse(status, bytes, contentType = 'application/pdf') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? contentType
          : null;
      },
    },
    async arrayBuffer() {
      return Uint8Array.from(bytes).buffer;
    },
    async json() {
      return null;
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

test('cliente Admin emite token e lê arquivo privado sem vazar sessão ou storage', async () => {
  const calls = [];
  const token = 'rn_admin_session_document_inspection_secret';
  const inspectionToken =
    'rn_doc_inspect_v1.iv.tag.ciphertextopaque';

  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/document-inspection/')) {
      return binaryResponse(
        200,
        [37, 80, 68, 70, 45, 49, 46, 52],
      );
    }
    return jsonResponse(201, {
      inspectionToken,
      expiresAt: '2026-09-24T03:00:00.000Z',
      mimeType: 'application/pdf',
      sizeBytes: 8,
    });
  };

  const api = createAdminApi(fakeFetch);
  const issued = await api.issueDriverDocumentInspection(
    token,
    'driver-documents-web',
    'driver_license',
  );
  const file = await api.readDriverDocumentInspection(
    token,
    issued.inspectionToken,
  );

  assert.equal(issued.inspectionToken, inspectionToken);
  assert.equal(file.contentType, 'application/pdf');
  assert.deepEqual([...file.bytes], [37, 80, 68, 70, 45, 49, 46, 52]);

  assert.equal(
    calls[0].url,
    '/v1/admin/drivers/driver-documents-web/documents/driver_license/inspection',
  );
  assert.equal(
    calls[1].url,
    `/v1/admin/document-inspection/${inspectionToken}`,
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
  assert.equal(
    JSON.stringify({ issued, calls }).includes('storageKey'),
    false,
  );
  assert.equal(
    JSON.stringify({ issued, calls }).includes('contentSha256'),
    false,
  );
});

test('frontend documental mantém metadados sanitizados e preview temporário', () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/drivers.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');
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
    'driver-document-inspection-panel',
    'driver-document-inspection-title',
    'driver-document-inspection-expiry',
    'driver-document-inspection-close',
    'driver-document-inspection-frame',
    'driver-document-inspection-image',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.equal(app.includes('storageKey'), false);
  assert.equal(app.includes('contentSha256'), false);
  assert.equal(html.includes('document-storage-key'), false);
  assert.equal(html.includes('document-content-sha256'), false);
  assert.match(app, /issueDriverDocumentInspection/);
  assert.match(app, /readDriverDocumentInspection/);
  assert.match(app, /URL\.createObjectURL/);
  assert.match(app, /URL\.revokeObjectURL/);
  assert.match(app, /closeDriverDocumentInspection/);
  assert.match(html, /token criptografado de curta duração/i);
  assert.match(
    html,
    /img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org/,
  );
  assert.match(html, /frame-src blob:/);
  assert.match(html, /object-src 'none'/);
});


test('ADM mantém decisão humana por padrão e expõe controles documentais', async () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/drivers.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  for (const id of [
    'driver-document-auto-enforcement',
    'driver-document-alerts-summary',
    'driver-document-alerts-decision-count',
    'driver-document-alerts-blocked-count',
    'driver-document-alerts-mode',
    'driver-document-alerts-list',
    'driver-document-alerts-empty',
    'driver-document-compliance-panel',
    'driver-document-compliance-status',
    'driver-document-compliance-message',
    'driver-document-compliance-issues',
    'driver-document-notify-button',
    'driver-document-keep-active-button',
    'driver-document-block-button',
    'driver-document-unblock-button',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(
    html,
    /Desligado por padrão.*você decide/s,
  );
  assert.match(app, /Aguardando sua decisão/);
  assert.match(app, /Bloqueado por você/);
  assert.match(app, /handleDriverDocumentComplianceNotify/);
  assert.match(app, /handleDriverDocumentComplianceAction/);
});

test('cliente Admin consulta, avisa e decide conformidade sem suspender login', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      driverId: 'driver-documents-web',
      mode: 'manual',
      documentsApproved: false,
      manualBlocked: false,
      effectiveBlocked: false,
      decisionRequired: true,
      issues: [],
    });
  };

  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_document_compliance_secret';
  const driverId = 'driver-documents-web';

  await api.getDriverDocumentCompliance(token, driverId);
  await api.notifyDriverDocumentCompliance(token, driverId);
  await api.decideDriverDocumentCompliance(token, {
    driverId,
    action: 'keep_active',
  });
  await api.decideDriverDocumentCompliance(token, {
    driverId,
    action: 'block',
  });

  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method]),
    [
      [
        '/v1/admin/drivers/driver-documents-web/document-compliance',
        'GET',
      ],
      [
        '/v1/admin/drivers/driver-documents-web/document-compliance/notify',
        'POST',
      ],
      [
        '/v1/admin/drivers/driver-documents-web/document-compliance',
        'PATCH',
      ],
      [
        '/v1/admin/drivers/driver-documents-web/document-compliance',
        'PATCH',
      ],
    ],
  );
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    action: 'keep_active',
  });
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    action: 'block',
  });

  for (const call of calls) {
    assert.equal(call.url.includes('/auth/status'), false);
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
  }
});


test('ADM carrega lista proativa de pendências documentais', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      mode: 'manual',
      total: 1,
      decisionRequired: 1,
      blocked: 0,
      items: [
        {
          driverId: 'driver-alert',
          phoneE164: '+5588999999999',
          documentsApproved: false,
          decisionRequired: true,
          effectiveBlocked: false,
          manualBlocked: false,
          automaticBlock: false,
          issues: [
            {
              documentType: 'driver_license',
              status: 'expired',
              label: 'CNH vencida',
            },
          ],
        },
      ],
    });
  };

  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_document_alerts_secret';
  const payload = await api.driverDocumentComplianceAlerts(token);

  assert.equal(payload.total, 1);
  assert.equal(payload.decisionRequired, 1);
  assert.equal(
    calls[0].url,
    '/v1/admin/driver-document-compliance-alerts',
  );
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
});
