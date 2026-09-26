import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AdminApiError,
  createAdminApi,
} from '../src/api.js';
import {
  formatSessionRemaining,
  statusPresentation,
  validateDriverId,
  validateDriverStatus,
  validatePhone,
} from '../src/security.js';

function jsonResponse(status, payload, extraHeaders = {}) {
  const headers = new Map([
    ['content-type', 'application/json; charset=utf-8'],
    ...Object.entries(extraHeaders),
  ]);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers.get(name.toLowerCase()) ?? null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test('valida identificador, telefone e status antes de montar rotas administrativas', () => {
  assert.equal(validateDriverId('driver-001:jeri'), 'driver-001:jeri');
  assert.throws(() => validateDriverId('../driver'));
  assert.throws(() => validateDriverId('driver/001'));
  assert.equal(validatePhone('(88) 99999-9999'), '(88) 99999-9999');
  assert.throws(() => validatePhone('123'));
  assert.equal(validateDriverStatus('suspended'), 'suspended');
  assert.throws(() => validateDriverStatus('pending'));
});

test('apresentação de status e expiração não inventa estado operacional', () => {
  assert.equal(statusPresentation('active').label, 'Aprovado');
  assert.equal(statusPresentation('suspended').label, 'Suspenso');
  assert.equal(statusPresentation('other').label, 'Desconhecido');
  assert.equal(formatSessionRemaining(0), 'Sessão expirada');
  assert.equal(formatSessionRemaining(61), '2min restantes');
});

test('cliente Admin consulta passageiros em modo somente leitura sem vazar token', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      items: [],
      summary: { total: 0, active: 0, suspended: 0 },
      nextCursor: null,
    });
  };
  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_passenger-directory-test';

  await api.passengers(token, {
    query: '91278',
    status: 'active',
    limit: 25,
    cursor: 'opaque_passenger_cursor',
  });

  assert.equal(calls.length, 1);
  const requestUrl = new URL(calls[0].url, 'https://admin.local');
  assert.equal(requestUrl.pathname, '/v1/admin/passengers');
  assert.equal(requestUrl.searchParams.get('query'), '91278');
  assert.equal(requestUrl.searchParams.get('status'), 'active');
  assert.equal(requestUrl.searchParams.get('limit'), '25');
  assert.equal(
    requestUrl.searchParams.get('cursor'),
    'opaque_passenger_cursor',
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.method, 'GET');
});

test('cliente Admin monta diretório com filtros e cursor sem vazar token', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      items: [],
      summary: { total: 0, active: 0, suspended: 0 },
      nextCursor: null,
    });
  };
  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_directory-test';

  await api.drivers(token, {
    query: 'driver 001',
    status: 'active',
    limit: 25,
    cursor: 'opaque_cursor_123',
  });

  assert.equal(calls.length, 1);
  const requestUrl = new URL(calls[0].url, 'https://admin.local');
  assert.equal(requestUrl.pathname, '/v1/admin/drivers');
  assert.equal(requestUrl.searchParams.get('query'), 'driver 001');
  assert.equal(requestUrl.searchParams.get('status'), 'active');
  assert.equal(requestUrl.searchParams.get('limit'), '25');
  assert.equal(
    requestUrl.searchParams.get('cursor'),
    'opaque_cursor_123',
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
});

test('cliente Admin envia Bearer somente no header e nunca na URL', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      driverId: 'driver-001',
      status: 'suspended',
    });
  };
  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_super-secret-test-token';

  await api.getDriver(token, 'driver-001');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/admin/drivers/driver-001/auth');
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.credentials, 'omit');
});

test('login não envia Authorization e serializa apenas as credenciais esperadas', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      accessToken: 'rn_admin_session_test',
      expiresAt: '2026-09-24T00:00:00.000Z',
      user: {
        id: '1',
        name: 'Admin',
        email: 'admin@example.com',
        scopes: [],
      },
    });
  };
  const api = createAdminApi(fakeFetch);

  await api.login({
    email: 'admin@example.com',
    password: 'senha-super-segura',
    totpCode: '123456',
  });

  assert.equal(calls[0].url, '/v1/admin/auth/login');
  assert.equal('authorization' in calls[0].options.headers, false);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: 'admin@example.com',
    password: 'senha-super-segura',
    totpCode: '123456',
  });
});

test('cliente preserva rate-limit retornado pelo Core', async () => {
  const api = createAdminApi(async () =>
    jsonResponse(
      429,
      {
        error: 'ADMIN_LOGIN_RATE_LIMITED',
        message: 'Muitas tentativas.',
        retryAfterSeconds: 120,
      },
      { 'retry-after': '120' },
    ),
  );

  await assert.rejects(
    () =>
      api.login({
        email: 'admin@example.com',
        password: 'senha-super-segura',
        totpCode: '123456',
      }),
    (error) =>
      error instanceof AdminApiError &&
      error.status === 429 &&
      error.retryAfterSeconds === 120,
  );
});

test('frontend não persiste sessão e evita sinks HTML inseguros', () => {
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/overview.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/drivers.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/passengers.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');

  assert.equal(app.includes('localStorage'), false);
  assert.equal(app.includes('sessionStorage'), false);
  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(app.includes('document.write'), false);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /id="driver-directory-body"/);
  assert.match(html, /id="drivers-total"/);
  assert.match(html, /id="drivers-active"/);
  assert.match(html, /id="drivers-suspended"/);
  assert.match(html, /id="view-passengers"/);
  assert.match(html, /id="passenger-directory-body"/);
  assert.match(html, /id="passengers-total"/);
  assert.match(html, /id="passengers-active"/);
  assert.match(html, /id="passengers-suspended"/);
});


test('cliente Admin salva Instagram oficial sem vazar token', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      socialLinks: {
        instagramHandle: '@ramonessa',
        instagramUrl: 'https://www.instagram.com/ramonessa/',
        updatedAt: '2026-09-26T13:45:00.000Z',
      },
    });
  };
  const api = createAdminApi(fakeFetch);
  const token = 'rn_admin_session_social_links_test';

  await api.updateSocialLinks(token, {
    instagramHandle: '@ramonessa',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/admin/social-links');
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    instagramHandle: '@ramonessa',
  });
});

test('Admin expõe campo de Instagram controlado por comunicações', () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/agency.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  for (const id of [
    'social-links-form',
    'social-instagram-handle',
    'social-instagram-preview',
    'social-links-updated-at',
    'save-social-links-button',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(app, /renderSocialLinks/);
  assert.match(app, /api\.updateSocialLinks/);
  assert.match(app, /payload\?\.socialLinks/);
});
