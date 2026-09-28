import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';

function supportJsonResponse(status, payload) {
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

test('ações de comunicação de amplo impacto exigem confirmação', () => {
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  assert.match(app, /Confirmar envio da notificação/);
  assert.match(app, /Confirmar política de versão/);
  assert.match(app, /Aparelhos desatualizados podem receber aviso automaticamente/);
  assert.match(app, /Confirmar publicação da divulgação/);
  assert.match(app, /Confirmar desativação da divulgação/);
  assert.match(app, /Confirmar publicação do passeio/);
  assert.match(app, /Confirmar retirada do passeio/);
  assert.match(app, /Confirmar publicação da nova imagem de login/);
});

test('política de versão é validada antes de salvar', () => {
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  assert.match(app, /!Number\.isInteger\(latestBuild\)/);
  assert.match(app, /!Number\.isInteger\(minimumBuild\)/);
  assert.match(app, /minimumBuild > latestBuild/);
  assert.match(
    app,
    /o mínimo não pode superar o mais recente/,
  );
});

test('publicação continua separada de configuração de credenciais', () => {
  const notifications = readFileSync(
    new URL('../pages/notifications.html', import.meta.url),
    'utf8',
  );
  const agency = readFileSync(
    new URL('../pages/agency.html', import.meta.url),
    'utf8',
  );

  assert.match(notifications, /id=["']notification-form["']/);
  assert.match(notifications, /id=["']release-policy-form["']/);
  assert.match(agency, /id=["']agency-form["']/);
  assert.match(agency, /id=["']tour-form["']/);

  assert.equal(
    /MERCADO_PAGO_ACCESS_TOKEN|GOOGLE_MAPS_SERVER_API_KEY|FIREBASE_SERVICE_ACCOUNT_JSON/.test(
      notifications + agency,
    ),
    false,
  );
});

test('Comunicação permanece bloqueada até o Core carregar', () => {
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const notifications = readFileSync(
    new URL('../pages/notifications.html', import.meta.url),
    'utf8',
  );
  const agency = readFileSync(
    new URL('../pages/agency.html', import.meta.url),
    'utf8',
  );

  for (const id of [
    'send-notification-button',
    'save-release-policy-button',
  ]) {
    const tag = notifications.match(
      new RegExp(
        `<button[^>]*id=["']${id}["'][^>]*>`,
      ),
    )?.[0];
    assert.ok(tag, `botão ${id} não encontrado`);
    assert.match(tag, /\bdisabled\b/);
  }

  for (const id of [
    'save-agency-button',
    'save-social-links-button',
    'tour-new-button',
    'save-tour-button',
    'upload-tour-cover-button',
  ]) {
    const tag = agency.match(
      new RegExp(
        `<button[^>]*id=["']${id}["'][^>]*>`,
      ),
    )?.[0];
    assert.ok(tag, `botão ${id} não encontrado`);
    assert.match(tag, /\bdisabled\b/);
  }

  assert.match(app, /communications:\s*\{\s*loaded: false/);
  assert.match(app, /state\.communications = \{\s*loaded: true/);
  assert.match(
    app,
    /const canWrite =\s*loaded && hasScope\('communications:write'\)/,
  );
  assert.match(
    app,
    /state\.communications\.loaded === true &&\s*hasScope\('communications:write'\)/,
  );
  assert.match(app, /Aguardando dados do Core/);
  assert.match(
    app,
    /state\.communications\.loaded !== true \|\|\s*!hasScope\('communications:write'\)/,
  );
});

test('Suporte não depende do carregamento de Comunicação', () => {
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  const start = app.indexOf(
    'async function handleSupportResponse',
  );
  const end = app.indexOf(
    '\nfunction bindRouteEvent',
    start,
  );
  assert.ok(start >= 0 && end > start);
  const support = app.slice(start, end);

  assert.equal(
    support.includes('state.communications.loaded'),
    false,
  );
  assert.match(
    support,
    /button\.disabled = !hasScope\('communications:write'\)/,
  );
  assert.match(app, /supportRequesterLabel/);
  assert.match(app, /requesterType === 'passenger'/);
  assert.match(app, /Resposta registrada no chamado/);
  assert.doesNotMatch(app, /Resposta registrada e solicitante avisado/);
});



test('Suporte pagina e filtra a fila sem vazar a sessão', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return supportJsonResponse(200, {
      tickets: [],
      nextCursor: null,
    });
  });
  const token = 'rn_admin_support_paging_secret';

  await api.support(token, {
    limit: 25,
    status: 'open',
    cursor: {
      createdAt: '2026-09-27T01:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
    },
  });

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url, 'https://admin.local');
  assert.equal(url.pathname, '/v1/admin/support');
  assert.equal(url.searchParams.get('limit'), '25');
  assert.equal(url.searchParams.get('status'), 'open');
  assert.equal(
    url.searchParams.get('cursorCreatedAt'),
    '2026-09-27T01:00:00.000Z',
  );
  assert.equal(
    url.searchParams.get('cursorId'),
    '11111111-1111-4111-8111-111111111111',
  );
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
});

test('ADM de Suporte expõe filtro, cursor e Carregar mais', () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/support.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');

  assert.match(html, /Chamados de suporte/);
  assert.match(html, /passageiros e motoristas/);
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  for (const id of [
    'support-filter-form',
    'support-status-filter',
    'support-loaded-count',
    'support-load-more',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(app, /state\.support\.nextCursor/);
  assert.match(app, /status: state\.support\.status/);
  assert.match(app, /cursor: reset \? null : state\.support\.nextCursor/);
  assert.match(
    app,
    /bindRouteEvent\('support-filter-form', 'submit'/,
  );
  assert.match(
    app,
    /bindRouteEvent\('support-load-more', 'click'/,
  );
  assert.match(
    app,
    /loadSupport\(\{ reset: false, announce: false \}\)/,
  );
});
