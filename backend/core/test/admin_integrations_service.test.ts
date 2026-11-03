import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminIntegrationSetupView,
} from '../src/admin/admin-integrations-service.js';

test('integrações nunca devolvem a chave privada do Google Maps', () => {
  const secret = 'google-private-server-key-do-not-expose';
  const view = adminIntegrationSetupView({
    GOOGLE_MAPS_SERVER_API_KEY: secret,
    ROUTING_PROVIDER: 'google',
  });

  assert.equal(view.googleMaps.server.configured, true);
  assert.equal(view.googleMaps.server.routingProviderValid, true);
  assert.equal(
    JSON.stringify(view).includes(secret),
    false,
  );
});

test('integrações documentam credenciais separadas por app', () => {
  const view = adminIntegrationSetupView({});
  const names = [
    ...view.googleMaps.android.map((item) => item.githubSecretName),
    ...view.googleMaps.ios.map((item) => item.githubSecretName),
  ];

  assert.equal(new Set(names).size, 4);
  assert.equal(view.googleMaps.server.configured, false);
  assert.equal(
    view.googleMaps.android[0].packageName,
    'br.com.ramonessa.passenger',
  );
  assert.equal(
    view.googleMaps.ios[1].bundleId,
    'br.com.ramonessa.driver',
  );
});


test('Mercado Pago mostra prontidão sem vazar segredos', () => {
  const mercadoPagoToken = 'APP_USR-production-token-abcdefghijklmnopqrstuvwxyz';
  const webhookSecret = 'mercado-pago-webhook-secret-abcdefghijklmnopqrstuvwxyz';

  const view = adminIntegrationSetupView({
    NODE_ENV: 'production',
    MERCADO_PAGO_MODE: 'production',
    MERCADO_PAGO_ACCESS_TOKEN: mercadoPagoToken,
    MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
  });

  assert.equal(view.mercadoPago.mode, 'production');
  assert.equal(view.mercadoPago.accessTokenConfigured, true);
  assert.equal(view.mercadoPago.webhookSecretConfigured, true);
  assert.equal(view.mercadoPago.productionReady, true);

  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes(mercadoPagoToken), false);
  assert.equal(serialized.includes(webhookSecret), false);
});


test('Push FCM mostra prontidão pelo arquivo configurado', () => {
  const credentialPath = '/srv/ramo/firebase-config.json';
  const view = adminIntegrationSetupView({
    NODE_ENV: 'production',
    PUSH_PROVIDER: 'fcm',
    FIREBASE_SERVICE_ACCOUNT_FILE: credentialPath,
  });

  assert.equal(view.push.provider, 'fcm');
  assert.equal(view.push.firebaseCredentialConfigured, true);
  assert.equal(view.push.firebaseCredentialSource, 'file');
  assert.equal(view.push.productionReady, true);
  assert.equal(JSON.stringify(view).includes(credentialPath), false);
});

test('Push desativado aparece como não pronto', () => {
  const view = adminIntegrationSetupView({
    NODE_ENV: 'production',
    PUSH_PROVIDER: 'disabled',
  });

  assert.equal(view.push.provider, 'disabled');
  assert.equal(view.push.firebaseCredentialConfigured, false);
  assert.equal(view.push.firebaseCredentialSource, 'missing');
  assert.equal(view.push.productionReady, false);
});
