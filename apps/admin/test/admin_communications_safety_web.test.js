import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
