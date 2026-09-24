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

test('cliente Admin filtra auditoria sem vazar Bearer na URL', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      entries: [],
      nextCursor: 'cursor-page-2',
    });
  });

  const token = 'rn_admin_session_audit_secret';
  const payload = await api.audit(token, {
    limit: 25,
    actorKind: 'user',
    action: 'passenger.auth.status_changed',
    targetType: 'passenger',
    query: 'passenger-a',
    cursor: 'cursor-page-1',
  });

  assert.equal(payload.nextCursor, 'cursor-page-2');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes(token), false);

  const url = new URL(calls[0].url, 'https://admin.local');
  assert.equal(url.pathname, '/v1/admin/audit');
  assert.equal(url.searchParams.get('limit'), '25');
  assert.equal(url.searchParams.get('actorKind'), 'user');
  assert.equal(
    url.searchParams.get('action'),
    'passenger.auth.status_changed',
  );
  assert.equal(url.searchParams.get('targetType'), 'passenger');
  assert.equal(url.searchParams.get('query'), 'passenger-a');
  assert.equal(url.searchParams.get('cursor'), 'cursor-page-1');

  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('frontend expõe diretório paginado e auditoria continua somente leitura', () => {
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
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

  for (const id of [
    'audit-filter-form',
    'audit-query',
    'audit-actor-kind',
    'audit-action',
    'audit-target-type',
    'audit-directory-count',
    'audit-load-more',
    'audit-table-body',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(app, /auditDirectory/);
  assert.match(app, /nextCursor/);
  assert.match(app, /handleAuditFilter/);
  assert.match(app, /loadAudit\(\{ reset: false, announce: false \}\)/);
  assert.match(app, /hasScope\('audit:read'\)/);

  assert.equal(api.includes('deleteAudit('), false);
  assert.equal(api.includes('updateAudit('), false);
  assert.equal(api.includes('clearAudit('), false);
  assert.equal(app.includes('.innerHTML'), false);
});
