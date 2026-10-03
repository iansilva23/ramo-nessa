import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('admin exposes secure production integration status center', async () => {
  const [html, app, api] = await Promise.all([
    Promise.all([
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
      readFile(new URL('../pages/integrations.html', import.meta.url), 'utf8'),
    ]).then((parts) => parts.join('\n')),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/api.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /data-view="integrations"/);
  assert.match(html, /id="view-integrations"/);
  assert.match(html, /Maps SDK for Android/);
  assert.match(html, /Places API \(New\)/);
  assert.match(html, /GOOGLE_MAPS_SERVER_API_KEY/);
  assert.match(html, /id="mercado-pago-status"/);
  assert.match(html, /id="otp-provider-status"/);
  assert.match(html, /id="push-provider-status"/);
  assert.match(html, /id="push-provider-detail"/);
  assert.match(html, /id="mercado-pago-public-key-form"/);
  assert.match(html, /id="mercado-pago-public-key"/);
  assert.match(html, /Nunca[\s\S]*Access Token[\s\S]*webhook secret/);

  assert.match(app, /loadIntegrations/);
  assert.match(app, /payload\?\.mercadoPago/);
  assert.match(app, /payload\?\.otp/);
  assert.match(app, /payload\?\.push/);
  assert.match(app, /mercadoPago\.productionReady/);
  assert.match(app, /otp\.productionReady/);
  assert.match(app, /push\.productionReady/);
  assert.match(app, /firebaseCredentialSource/);
  assert.match(app, /item\.githubSecretName/);
  assert.match(app, /google-credential-cards/);
  assert.match(app, /renderMercadoPagoPublicKey/);
  assert.match(app, /handleMercadoPagoPublicKeySubmit/);
  assert.match(app, /hasScope\('finance:write'\)/);
  assert.match(api, /\/v1\/admin\/integrations/);
  assert.match(api, /mercadoPagoPublicKey/);

  assert.doesNotMatch(
    html,
    /AIza[0-9A-Za-z_-]{20,}/,
    'o HTML não deve conter chave Google real',
  );
});

test('Public Key exige no formulário e no submit os mesmos scopes do Core', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const functions = app.slice(
    app.indexOf('function canManageMercadoPagoPublicKey('),
    app.indexOf('async function loadIntegrations('),
  );
  for (const scopes of [[], ['finance:write'], ['rides:write'], ['finance:write', 'rides:write']]) {
    const elements = new Map();
    const byId = (id) => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    };
    let updates = 0;
    const settings = { mercadoPagoPublicKey: 'TEST-public-key-for-integration' };
    const handlers = runInNewContext(
      `${functions}\n({ renderMercadoPagoPublicKey, handleMercadoPagoPublicKeySubmit })`,
      {
        byId,
        hasScope: (scope) => scopes.includes(scope),
        state: { token: 'admin-test-token' },
        window: { confirm: () => true },
        globalMessage: {},
        setMessage: () => {},
        api: { updateOperationalSettings: async () => { updates += 1; return settings; } },
        handleAuthenticatedError: (error) => { throw error; },
      },
    );
    handlers.renderMercadoPagoPublicKey(settings);
    const canWrite = scopes.length === 2;
    assert.equal(byId('mercado-pago-public-key').disabled, !canWrite);
    assert.equal(byId('save-mercado-pago-public-key-button').disabled, !canWrite);
    await handlers.handleMercadoPagoPublicKeySubmit({ preventDefault() {} });
    assert.equal(updates, canWrite ? 1 : 0);
    assert.equal(byId('save-mercado-pago-public-key-button').disabled, !canWrite);
  }
});
