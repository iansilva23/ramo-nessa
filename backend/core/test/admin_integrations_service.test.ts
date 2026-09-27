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


test('Mercado Pago e OTP mostram prontidão sem vazar segredos', () => {
  const mercadoPagoToken = 'APP_USR-production-token-abcdefghijklmnopqrstuvwxyz';
  const webhookSecret = 'mercado-pago-webhook-secret-abcdefghijklmnopqrstuvwxyz';
  const otpToken = 'otp-provider-token-abcdefghijklmnopqrstuvwxyz';
  const otpEndpoint = 'https://sms.example.com/v1/otp';

  const view = adminIntegrationSetupView({
    NODE_ENV: 'production',
    MERCADO_PAGO_MODE: 'production',
    MERCADO_PAGO_ACCESS_TOKEN: mercadoPagoToken,
    MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
    OTP_PROVIDER: 'webhook',
    OTP_WEBHOOK_URL: otpEndpoint,
    OTP_WEBHOOK_TOKEN: otpToken,
  });

  assert.equal(view.mercadoPago.mode, 'production');
  assert.equal(view.mercadoPago.accessTokenConfigured, true);
  assert.equal(view.mercadoPago.webhookSecretConfigured, true);
  assert.equal(view.mercadoPago.productionReady, true);
  assert.equal(view.otp.provider, 'webhook');
  assert.equal(view.otp.endpointConfigured, true);
  assert.equal(view.otp.tokenConfigured, true);
  assert.equal(view.otp.productionReady, true);

  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes(mercadoPagoToken), false);
  assert.equal(serialized.includes(webhookSecret), false);
  assert.equal(serialized.includes(otpToken), false);
  assert.equal(serialized.includes(otpEndpoint), false);
});
