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
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );

  assert.equal(app.includes('localStorage'), false);
  assert.equal(app.includes('sessionStorage'), false);
  assert.equal(app.includes('.innerHTML'), false);
  assert.equal(app.includes('document.write'), false);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /script-src 'self'/);
});
