import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { once } from 'node:events';
import { launchTestBrowser, browserName } from './browser_test_runtime.mjs';

test(`${browserName}: boarding settings persist explicit activation, category exclusions, conflicts and support release`, { timeout: 120000 }, async () => {
  const root = resolve('apps/admin');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin-workspace.css"><link rel="stylesheet" href="/manual-refunds.css"></head><body><main style="padding:24px;max-width:1100px;margin:auto"><h1>Financeiro</h1><section data-manual-refunds></section></main><script type="module">
    import {createBoardingAdmin} from '/src/boarding-admin.js'; import {createAdminApi} from '/src/api.js';
    createBoardingAdmin({root:document.querySelector('main'),api:createAdminApi(),getToken:()=> 'boarding-test-session',hasScope:()=> !location.search.includes('readonly')});
  </script></body></html>`;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '/')) { res.writeHead(404); res.end(); return; }
    try { res.setHeader('content-type', extname(file) === '.css' ? 'text/css' : 'text/javascript'); res.end(await readFile(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser;
  try {
    browser = await launchTestBrowser();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Fortaleza' });
    const errors = [], mutations = [], releases = [];
    let conflict = false;
    let policy = { enabled: false, revision: 0, categories: Object.fromEntries(['moto', 'car', 'buggy', 'delivery', 'comfort_black'].map(k => [k, true])) };
    await context.route('**/v1/admin/**', async route => {
      const request = route.request();
      assert.equal(request.headers().authorization, 'Bearer boarding-test-session');
      const path = new URL(request.url()).pathname;
      if (request.method() === 'PUT') {
        if (conflict) { await route.fulfill({ status: 409, json: { error: 'POLICY_CHANGED', message: 'Outro administrador alterou a configuração. Atualize antes de salvar.' } }); return; }
        const body = request.postDataJSON(); mutations.push(body);
        assert.equal(body.revision, policy.revision);
        policy = { ...body, revision: policy.revision + 1 };
      } else if (request.method() === 'POST') releases.push({ path, body: request.postDataJSON() });
      await route.fulfill({ status: 200, json: path.endsWith('/boarding-policy') ? policy : { released: true } });
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const origin = 'http://127.0.0.1:' + server.address().port;
    await page.goto(origin);
    const status = page.getByRole('status'), enabled = page.getByRole('checkbox', { name: /^Exigir código de embarque/ });
    await status.getByText('Desativado. Nenhum código será exigido', { exact: false }).waitFor();
    assert.equal(await enabled.isChecked(), false); assert.equal(mutations.length, 0);
    await page.getByLabel('Entregas', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    assert.equal(policy.enabled, false); assert.equal(policy.categories.delivery, false);
    await enabled.check(); await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
    await status.getByText('Configuração salva.', { exact: false }).waitFor();
    await page.reload(); await status.getByText('Ativado para novas corridas', { exact: false }).waitFor();
    assert.equal(await enabled.isChecked(), true); assert.equal(await page.getByLabel('Entregas', { exact: true }).isChecked(), false);
    conflict = true;
    await enabled.uncheck(); await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
    await status.getByText('Outro administrador', { exact: false }).waitFor(); assert.equal(policy.enabled, true);
    conflict = false;
    await page.getByText('Liberação excepcional pelo suporte', { exact: true }).click();
    await page.getByLabel('Identificador da corrida', { exact: true }).fill('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await page.getByLabel('Motivo da liberação', { exact: true }).fill('Encontro confirmado pelo suporte com as duas partes');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Registrar liberação', exact: true }).click();
    assert.equal(releases.length, 0);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Registrar liberação', exact: true }).click();
    await status.getByText('Liberação registrada.', { exact: false }).waitFor();
    assert.deepEqual(releases, [{ path: '/v1/admin/rides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/boarding-override', body: { reason: 'Encontro confirmado pelo suporte com as duas partes' } }]);
    await mkdir('artifacts/ride-recovery', { recursive: true });
    await page.screenshot({ path: `artifacts/ride-recovery/${browserName}-boarding-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `artifacts/ride-recovery/${browserName}-boarding-mobile.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(origin + '/?readonly');
    await status.getByText('Ativado para novas corridas', { exact: false }).waitFor();
    assert.equal(await enabled.isDisabled(), true);
    await page.getByText('Liberação excepcional pelo suporte', { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Registrar liberação', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
