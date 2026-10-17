import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';

const { chromium } = await import(
  process.env.RAMO_BROWSER_TEST_MODULE ??
  new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href
);

const base = new URL('../../apps/admin/', import.meta.url);
let server;
let browser;
let origin;

test.before(async () => {
  const html = await readFile(new URL('pages/localities.html', base), 'utf8');
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
        html.replace('id="view-localities" class="view-panel" hidden', 'id="view-localities" class="view-panel"') +
        '</body></html>');
      return;
    }
    if (/^\/src\/[a-z0-9-]+\.js$/.test(pathname)) {
      try {
        const code = await readFile(new URL('.' + pathname, base), 'utf8');
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
        response.end(code);
      } catch {
        response.writeHead(404);
        response.end();
      }
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());

  await page.goto(origin);
  await page.evaluate(async (options) => {
    const catalog = {
      localities: {
        prea: [{
          localityId: 'prea',
          prices: { moto: { kind: 'exact', amountCents: 800 } },
          policy: { enabledCategories: ['moto'], applyNightSurcharge: false },
        }],
        jijoca: [],
      },
      externalLocalities: [],
      localityDisplayNames: { prea: { prea: 'Preá Centro' }, jijoca: {}, external: {} },
      localityGeofences: [{
        zoneId: 'prea', localityId: 'prea',
        centerLatitude: -2.820173, centerLongitude: -40.414671, radiusKm: 2,
      }],
      distanceFarePolicies: [],
    };
    const version = {
      id: 'review-draft', versionNumber: 2, status: 'draft',
      updatedAt: '2026-10-16T21:00:00.000Z',
    };
    let revision = 0;
    window.review = {
      catalog, version, patches: [], publishes: [], discarded: false,
      allowDiscard: false, failures: [],
    };
    window.confirm = () => window.review.allowDiscard;
    const api = {
      pricingVersions: async () => ({
        items: [{ ...version }], effectiveVersionId: null,
      }),
      getPricingVersion: async () => ({
        version: { ...version },
        catalog: structuredClone(catalog),
      }),
      pricingCatalog: async () => structuredClone(catalog),
      createPricingVersion: async () => ({ ...version }),
      updatePricingVersion: async (_token, { patch, expectedUpdatedAt }) => {
        if (expectedUpdatedAt !== version.updatedAt) {
          throw new Error('Conflito de versão');
        }
        if (
          window.review.failPatchKind === patch.kind &&
          window.review.failedOnce !== true
        ) {
          window.review.failedOnce = true;
          throw new Error('Falha de rede simulada');
        }
        window.review.patches.push(structuredClone(patch));
        if (patch.kind === 'locality_structure' && patch.operation === 'add') {
          catalog.localities[patch.scope].push({
            localityId: patch.localityId,
            prices: {},
            policy: { enabledCategories: [], applyNightSurcharge: false },
          });
        }
        if (patch.kind === 'locality_label') {
          catalog.localityDisplayNames[patch.scope][patch.localityId] = patch.label;
        }
        if (patch.kind === 'locality_geofence') {
          const match = (area) =>
            area.zoneId === patch.zoneId && area.localityId === patch.localityId;
          catalog.localityGeofences = catalog.localityGeofences.filter((area) => !match(area));
          catalog.localityGeofences.push({
            zoneId: patch.zoneId, localityId: patch.localityId,
            centerLatitude: patch.centerLatitude,
            centerLongitude: patch.centerLongitude,
            radiusKm: patch.radiusKm,
          });
        }
        if (patch.kind === 'locality_price') {
          const item = catalog.localities[patch.hub].find(
            (locality) => locality.localityId === patch.localityId,
          );
          if (item) item.prices[patch.category] = patch.price;
        }
        if (patch.kind === 'locality_policy') {
          const item = catalog.localities[patch.hub].find(
            (locality) => locality.localityId === patch.localityId,
          );
          if (item) item.policy = {
            enabledCategories: patch.enabledCategories,
            applyNightSurcharge: patch.applyNightSurcharge,
          };
        }
        revision += 1;
        version.updatedAt = new Date(Date.UTC(2026, 9, 16, 21, 0, revision)).toISOString();
        return { version: { ...version }, catalog: structuredClone(catalog) };
      },
      publishPricingVersion: async (_token, body) => {
        window.review.publishes.push(body);
        return { version: { ...version, status: 'published' } };
      },
    };
    const { createLocalitiesAdmin } = await import('/src/localities-admin.js');
    window.admin = createLocalitiesAdmin({
      api, getToken: () => 'test-only-token',
      hasScope: (scope) => scope === 'pricing:read' ||
        (scope === 'pricing:write' && options.canWrite !== false),
      onError: (error) => window.review.failures.push(error.message),
    });
  }, options);
  await page.waitForFunction(() => document.querySelector('#localities-total')?.textContent === '1');
  return page;
}

test('switching from edit to new does not discard unsaved locality data without confirmation', async (t) => {
  const page = await fixture(t);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  assert.equal(await page.locator('#locality-wizard-title').textContent(), 'Editar localidade');
  await page.locator('#locality-name').fill('Preá Nome em Edição');
  await page.locator('#localities-new-button').click();
  assert.equal(await page.locator('#locality-name').inputValue(), 'Preá Nome em Edição');
  assert.equal(await page.locator('#locality-wizard-title').textContent(), 'Editar localidade');
  await page.evaluate(() => { window.review.allowDiscard = true; });
  await page.locator('#localities-new-button').click();
  assert.equal(await page.locator('#locality-wizard-title').textContent(), 'Nova localidade');
  assert.equal(await page.locator('#locality-name').inputValue(), '');
});

test('editing name and six-decimal coordinates persists into a draft, not into published prices', async (t) => {
  const page = await fixture(t);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#locality-name').fill('Preá Atualizado');
  await page.locator('#locality-wizard-next').click();
  await page.locator('#locality-latitude').fill('-2,820179');
  await page.locator('#locality-longitude').fill('-40,414678');
  await page.locator('#locality-wizard-next').click();
  for (let i = 0; i < 3; i += 1) {
    await page.locator('#locality-wizard-next').click();
  }
  assert.equal(await page.locator('#locality-wizard-save').isVisible(), true);
  await page.locator('#locality-wizard-save').click();
  await page.waitForFunction(() =>
    document.querySelector('#localities-message')?.textContent?.includes('atualizada no rascunho'),
  );
  const state = await page.evaluate(() => ({
    name: review.catalog.localityDisplayNames.prea.prea,
    coords: review.catalog.localityGeofences.find((area) => area.localityId === 'prea'),
    changed: review.patches.map((patch) => patch.kind),
    publishes: review.publishes.length,
    failures: review.failures,
  }));
  assert.equal(state.name, 'Preá Atualizado');
  assert.equal(state.coords.centerLatitude, -2.820179);
  assert.equal(state.coords.centerLongitude, -40.414678);
  assert.equal(state.publishes, 0);
  assert.deepEqual(state.failures, []);
  assert.ok(state.changed.includes('locality_label'));
  assert.ok(state.changed.includes('locality_geofence'));
});

test('draft publication is blocked when locality form contains unsaved changes', async (t) => {
  const page = await fixture(t);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#locality-name').fill('Ainda Não Salvo');
  await page.locator('#localities-publish-draft-button').click();
  const message = await page.locator('#localities-message').textContent();
  assert.match(message, /Salve ou descarte as alterações/);
  assert.equal(await page.evaluate(() => review.publishes.length), 0);
});


test('creating a new locality saves name, coordinates and fare only in the draft', async (t) => {
  const page = await fixture(t);
  await page.locator('#localities-new-button').click();
  await page.locator('#locality-name').fill('Lagoa Nova');
  assert.equal(await page.locator('#locality-id').inputValue(), 'lagoa-nova');
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
  await page.waitForFunction(() =>
    document.querySelector('#localities-message')?.textContent?.includes('adicionada ao rascunho'),
  );
  const state = await page.evaluate(() => ({
    entry: review.catalog.localities.prea.find((item) => item.localityId === 'lagoa-nova'),
    label: review.catalog.localityDisplayNames.prea['lagoa-nova'],
    area: review.catalog.localityGeofences.find((item) => item.localityId === 'lagoa-nova'),
    publishes: review.publishes.length,
    errors: review.failures,
  }));
  assert.equal(state.label, 'Lagoa Nova');
  assert.equal(state.entry.prices.moto.kind, 'exact');
  assert.equal(state.entry.prices.moto.amountCents, 1200);
  assert.equal(state.area.centerLatitude, -2.835123);
  assert.equal(state.area.centerLongitude, -40.452345);
  assert.deepEqual(state.entry.policy.enabledCategories, ['moto']);
  assert.equal(state.publishes, 0);
  assert.deepEqual(state.errors, []);
});


test('a partial network failure preserves form data, reloads the draft and safely retries without duplicate labels', async (t) => {
  const page = await fixture(t);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#locality-name').fill('Preá Recuperado');
  for (let i = 0; i < 5; i += 1) {
    await page.locator('#locality-wizard-next').click();
  }
  assert.equal(await page.locator('#locality-wizard-save').isVisible(), true);
  await page.evaluate(() => { review.failPatchKind = 'locality_geofence'; });
  await page.locator('#locality-wizard-save').click();
  await page.waitForFunction(() =>
    document.querySelector('#localities-message')?.textContent?.includes('Algumas mudanças podem ter ficado no rascunho'),
  );
  assert.equal(await page.locator('#locality-wizard').isVisible(), true);
  assert.equal(await page.locator('#locality-name').inputValue(), 'Preá Recuperado');
  assert.equal(await page.evaluate(() => review.catalog.localityDisplayNames.prea.prea), 'Preá Recuperado');
  assert.equal(await page.evaluate(() => review.publishes.length), 0);
  assert.equal(
    await page.evaluate(() => review.patches.filter((p) => p.kind === 'locality_label').length),
    1,
  );

  await page.locator('#locality-wizard-save').click();
  await page.waitForFunction(() =>
    document.querySelector('#localities-message')?.textContent?.includes('atualizada no rascunho'),
  );
  const final = await page.evaluate(() => ({
    label: review.catalog.localityDisplayNames.prea.prea,
    labelWrites: review.patches.filter((p) => p.kind === 'locality_label').length,
    geofenceWrites: review.patches.filter((p) => p.kind === 'locality_geofence').length,
    publishCount: review.publishes.length,
    failures: review.failures,
  }));
  assert.equal(final.label, 'Preá Recuperado');
  assert.equal(final.labelWrites, 1);
  assert.equal(final.geofenceWrites, 1);
  assert.equal(final.publishCount, 0);
  assert.equal(final.failures.length, 1);
  assert.match(final.failures[0], /Falha de rede simulada/);
  assert.equal(await page.locator('#locality-wizard').isVisible(), false);
});

test('invalid coordinates block navigation and never create a pricing draft patch', async (t) => {
  const page = await fixture(t);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#locality-wizard-next').click();
  await page.locator('#locality-latitude').fill('-999');
  await page.locator('#locality-wizard-next').click();
  assert.equal(await page.locator('#locality-step-2').isVisible(), true);
  assert.match(await page.locator('#localities-message').textContent(), /latitude entre/i);
  assert.equal(await page.evaluate(() => review.patches.length), 0);
});


test('read-only administrator cannot save, create, delete or publish fare changes', async (t) => {
  const page = await fixture(t, { canWrite: false });
  assert.equal(await page.locator('#localities-new-button').isVisible(), false);
  assert.equal(await page.locator('#localities-publish-draft-button').isVisible(), false);
  assert.equal(await page.locator('#localities-discard-draft-button').isVisible(), false);
  assert.equal(await page.getByRole('button', { name: 'Excluir', exact: true }).count(), 0);

  // A reader can consult details without seeing editable controls.
  assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Visualizar', exact: true }).click();
  assert.equal(await page.locator('#locality-wizard-title').textContent(), 'Visualizar localidade');
  assert.equal(await page.locator('#locality-name').inputValue(), 'Preá Centro');
  assert.equal(await page.locator('#locality-name').isDisabled(), true);
  assert.equal(await page.locator('#locality-latitude').isDisabled(), true);
  assert.equal(await page.locator('#locality-category-moto').isDisabled(), true);
  assert.equal(await page.locator('#locality-apply-coordinates').isDisabled(), true);
  for (let i = 0; i < 5; i += 1) {
    await page.locator('#locality-wizard-next').click();
  }
  assert.equal(await page.locator('#locality-wizard-save').isVisible(), false);
  // Defense in depth: even a synthetic click cannot bypass permission checks.
  await page.locator('#locality-wizard-save').evaluate((node) => node.click());
  await page.waitForFunction(() =>
    document.querySelector('#localities-message')?.textContent?.includes('não pode editar localidades'),
  );
  const writes = await page.evaluate(() => ({
    patches: review.patches.length, publishes: review.publishes.length,
    name: review.catalog.localityDisplayNames.prea.prea,
  }));
  assert.deepEqual(writes, { patches: 0, publishes: 0, name: 'Preá Centro' });
});
