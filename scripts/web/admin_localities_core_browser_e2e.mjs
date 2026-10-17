import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { chromium } from './browser-tests/node_modules/playwright/index.mjs';

const coreUrl = process.env.RAMO_V5_LOCAL_CORE_URL;
const writer = process.env.RAMO_V5_WRITE_TOKEN;
const reader = process.env.RAMO_V5_READ_TOKEN;
const newLocalityId = process.env.RAMO_V5_LOCALITY_ID;
if (!coreUrl || !writer || !reader || !newLocalityId ||
    process.env.RAMO_V5_EPHEMERAL_PG !== 'true' ||
    new URL(coreUrl).hostname !== '127.0.0.1' ||
    new URL(coreUrl).port !== '18765' ||
    !/^ci-browser-[a-f0-9]{8}$/.test(newLocalityId)) {
  throw new Error('Refusing Chromium write tests outside disposable localhost Core.');
}

const base = new URL('../../apps/admin/', import.meta.url);
const template = await readFile(new URL('pages/localities.html', base), 'utf8');
const frontend = createServer(async (request, response) => {
  const address = new URL(request.url, 'http://127.0.0.1');
  const path = address.pathname;
  if (path === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body>' + template.replace(
      'id="view-localities" class="view-panel" hidden',
      'id="view-localities" class="view-panel"',
    ) + '</body></html>');
    return;
  }
  if (/^\/src\/[a-z0-9-]+\.js$/.test(path)) {
    try {
      const source = await readFile(new URL('.' + path, base));
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(source);
    } catch {
      response.writeHead(404);
      response.end();
    }
    return;
  }
  if (path.startsWith('/v1/admin/')) {
    try {
      const pieces = [];
      for await (const chunk of request) pieces.push(chunk);
      const body = Buffer.concat(pieces);
      const headers = {};
      for (const name of ['authorization', 'accept', 'content-type']) {
        if (request.headers[name]) headers[name] = request.headers[name];
      }
      const upstream = await fetch(new URL(path + address.search, coreUrl), {
        method: request.method,
        headers,
        ...(body.length ? { body } : {}),
        signal: AbortSignal.timeout(8_000),
      });
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json',
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      response.writeHead(502, { 'content-type': 'text/plain' });
      response.end('Test-only Core unavailable: ' + String(error));
    }
    return;
  }
  response.writeHead(404);
  response.end();
});

let browser;
try {
  frontend.listen(0, '127.0.0.1');
  await once(frontend, 'listening');
  const appOrigin = 'http://127.0.0.1:' + frontend.address().port;
  browser = await chromium.launch({ headless: true });

  async function openLocalities(token, canWrite) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
    const page = await context.newPage();
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(appOrigin);
    await page.evaluate(async ({ token, canWrite }) => {
      const [{ createAdminApi }, { createLocalitiesAdmin }] = await Promise.all([
        import('/src/api.js'), import('/src/localities-admin.js'),
      ]);
      window.v5TestErrors = [];
      window.confirm = () => false;
      window.v5Localities = createLocalitiesAdmin({
        api: createAdminApi(window.fetch.bind(window)),
        getToken: () => token,
        hasScope: scope => scope === 'pricing:read' ||
          (scope === 'pricing:write' && canWrite),
        onError: error => window.v5TestErrors.push(error.message),
      });
    }, { token, canWrite });
    await page.waitForFunction(() => document.querySelector('#localities-draft-status')
      ?.textContent?.includes('Rascunho'), { timeout: 15_000 });
    return { context, page };
  }

  const writable = await openLocalities(writer, true);
  try {
    const page = writable.page;
    await page.locator('#localities-new-button').click();
    const name = 'CI Browser ' + newLocalityId.slice(-8);
    await page.locator('#locality-name').fill(name);
    assert.equal(await page.locator('#locality-id').inputValue(), newLocalityId);
    await page.locator('#locality-wizard-next').click();
    await page.locator('#locality-latitude').fill('-2,835123');
    await page.locator('#locality-longitude').fill('-40,452345');
    await page.locator('#locality-wizard-next').click();
    await page.locator('#locality-category-moto').check();
    await page.locator('#locality-wizard-next').click();
    await page.locator('#locality-price-moto-min').fill('12,00');
    await page.locator('#locality-wizard-next').click();
    await page.locator('#locality-wizard-next').click();
    assert.equal(await page.locator('#locality-wizard-save').isVisible(), true);
    await page.locator('#locality-wizard-save').click();
    await page.waitForFunction(() => document.querySelector('#localities-message')
      ?.textContent?.includes('adicionada ao rascunho'), { timeout: 15_000 });
    assert.equal(await page.evaluate(() => window.v5TestErrors.length), 0);
    assert.equal(await page.locator('#localities-draft-status').textContent()
      .then(x => x.includes('ainda não publicado')), true);

    // The browser is using the real frontend API adapter and the Core's
    // actual PostgreSQL repository through a loopback-only HTTP proxy.
    const persisted = await fetch(new URL('/v1/admin/pricing/versions', coreUrl), {
      headers: { authorization: 'Bearer ' + writer },
    });
    assert.equal(persisted.status, 200);
    const records = await persisted.json();
    const draft = records.items.find(item => item.status === 'draft');
    assert.ok(draft, 'New locality must remain in draft');
    const saved = await fetch(new URL('/v1/admin/pricing/versions/' + draft.id, coreUrl), {
      headers: { authorization: 'Bearer ' + reader },
    });
    assert.equal(saved.status, 200);
    const json = await saved.json();
    const row = json.catalog.localities.prea.find(
      value => value.localityId === newLocalityId,
    );
    assert.ok(row);
    assert.equal(row.prices.moto.amountCents, 1200);
    assert.equal(json.catalog.localityDisplayNames.prea[newLocalityId], name);
    const point = json.catalog.localityGeofences.find(
      area => area.localityId === newLocalityId,
    );
    assert.equal(point.centerLatitude, -2.835123);
    assert.equal(point.centerLongitude, -40.452345);
    assert.equal(json.version.status, 'draft');
  } finally {
    await writable.context.close();
  }

  const readOnly = await openLocalities(reader, false);
  try {
    const page = readOnly.page;
    assert.equal(await page.locator('#localities-new-button').isVisible(), false);
    const entry = page.locator('.locality-directory-item').filter({
      has: page.locator('small', { hasText: newLocalityId }),
    });
    assert.equal(await entry.count(), 1);
    await entry.getByRole('button', { name: 'Visualizar', exact: true }).click();
    assert.equal(await page.locator('#locality-wizard-title').textContent(),
      'Visualizar localidade');
    assert.equal(await page.locator('#locality-name').isDisabled(), true);
    assert.equal(await page.locator('#locality-wizard-save').isVisible(), false);
    assert.equal(await page.evaluate(() => window.v5TestErrors.length), 0);
  } finally {
    await readOnly.context.close();
  }

  console.log('Chromium Admin UI → Core HTTP → PostgreSQL: created draft, read-only viewing confirmed.');
} finally {
  await browser?.close();
  if (frontend.listening) await new Promise(resolve => frontend.close(resolve));
}
