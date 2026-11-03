import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
const { chromium, webkit } = await import(process.env.RAMO_BROWSER_TEST_MODULE ?? new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href);
const bridge = await readFile(new URL('../../packages/ramo_push/web/ramo_web_push.js', import.meta.url), 'utf8');
let server, browser, origin;
test.before(async () => {
  server = createServer((request, response) => {
    if (request.url.endsWith('.js')) { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bridge); }
    else response.end('<!doctype html><button id="location">GPS</button><button id="install">Instalar</button><script type="module" src="ramo_web_push.js"></script>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  const engine = process.env.RAMO_BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  browser = await engine.launch({ headless: true,
    ...(engine === chromium && process.env.RAMO_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.RAMO_CHROMIUM_EXECUTABLE_PATH } : {}) });
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function fixture(t, options = {}) {
  const context = await browser.newContext(); t.after(() => context.close());
  const page = await context.newPage();
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.addInitScript(options => {
    window.fixture = { calls: [], prompts: [], permission: options.permission ?? 'prompt' };
    if (options.ios) {
      Object.defineProperty(navigator, 'userAgent', { value: 'iPhone' });
      Object.defineProperty(navigator, 'standalone', { value: !!options.installed });
    }
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => {
      if (options.noQuery) throw Error('unsupported');
      return { state: fixture.permission };
    } } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, error, args) {
      fixture.calls.push({ gesture: navigator.userActivation.isActive, args });
      fixture.succeed = () => { fixture.permission = 'granted'; success({ coords: { latitude: 0, longitude: 0 } }); };
      if (options.pending) return;
      if (options.error) error({ code: options.error }); else fixture.succeed();
    } } });
    const timer = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 14000) { fixture.timeout = callback; return timer(() => {}, 60000); }
      return timer(callback, delay, ...args);
    };
  }, options);
  await page.goto(origin + '/passageiro/');
  await page.waitForFunction(() => !!window.ramoWebSetup);
  await page.evaluate(() => {
    document.querySelector('#location').onclick = () => { window.result = ramoWebSetup.requestLocation(); };
    document.querySelector('#install').onclick = () => { window.installResult = ramoWebSetup.install(); };
  });
  return page;
}
test('passive inspection never requests GPS; unsupported permission query does not prevent direct request', async t => {
  const page = await fixture(t, { noQuery: true });
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).location, 'unknown');
  assert.equal(await page.evaluate(() => fixture.calls.length), 0);
  await page.click('#location');
  assert.equal(await page.evaluate(() => window.result), 'granted');
  assert.equal(await page.evaluate(() => fixture.calls[0].gesture), true);
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).location, 'granted');
});
test('GPS refusal, unavailable signal and timeout are distinct outcomes', async t => {
  for (const [error, expected] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout']]) {
    const page = await fixture(t, { error }); await page.click('#location');
    assert.equal(await page.evaluate(() => window.result), expected);
  }
});
test('a pending GPS request is shared and late success cannot overwrite timeout', async t => {
  const page = await fixture(t, { pending: true, noQuery: true });
  await page.click('#location');
  assert.equal(await page.evaluate(() => { window.second = ramoWebSetup.requestLocation(); return window.result === window.second; }), true);
  assert.equal(await page.evaluate(() => fixture.calls.length), 1);
  await page.evaluate(() => fixture.timeout());
  assert.equal(await page.evaluate(() => window.result), 'timeout');
  await page.evaluate(() => fixture.succeed());
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).location, 'timeout');
});
test('iPhone installation is manual and not falsely confirmed', async t => {
  const page = await fixture(t, { ios: true }); await page.click('#install');
  assert.equal(await page.evaluate(() => window.installResult), 'manual');
  const snapshot = await page.evaluate(() => ramoWebSetup.snapshot());
  assert.equal(snapshot.ios, true); assert.equal(snapshot.installed, false);
  const installed = await fixture(t, { ios: true, installed: true });
  assert.equal((await installed.evaluate(() => ramoWebSetup.snapshot())).installed, true);
});
test('browser install prompt is called during tap and consumed once; installation needs confirmation', async t => {
  const page = await fixture(t);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = () => { fixture.prompts.push(navigator.userActivation.isActive); return Promise.resolve(); };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    dispatchEvent(event);
  });
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).installAvailable, true);
  await page.click('#install');
  assert.equal(await page.evaluate(() => window.installResult), 'accepted');
  assert.deepEqual(await page.evaluate(() => fixture.prompts), [true]);
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).installed, false);
  assert.equal(await page.evaluate(() => ramoWebSetup.install()), 'manual');
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).installed, true);
});
test('returning from settings rechecks denied and granted permission without opening a new prompt', async t => {
  const page = await fixture(t, { permission: 'denied' });
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).location, 'denied');
  await page.evaluate(() => { fixture.permission = 'granted'; });
  assert.equal((await page.evaluate(() => ramoWebSetup.snapshot())).location, 'granted');
  assert.equal(await page.evaluate(() => fixture.calls.length), 0);
});
