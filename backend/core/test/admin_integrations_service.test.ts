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
