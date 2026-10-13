import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { webSecurityPolicy } from './web_security_policy.mjs';
const moduleUrl = process.env.RAMO_BROWSER_TEST_MODULE ?? new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href;
const { chromium } = await import(moduleUrl);
const role = process.env.RAMO_WEB_TEST_ROLE;
if (!['passenger', 'driver'].includes(role)) throw new Error('Specify RAMO_WEB_TEST_ROLE');
const root = resolve(new URL('../../apps/' + role + '/build/web/', import.meta.url).pathname);
const prefix = role === 'passenger' ? '/passageiro/' : '/motorista/';
test(role + ': compiled Flutter bundle starts under the prepared CSP with local engine', { timeout: 90000 }, async t => {
  let origin;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!path.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    const file = resolve(root, decodeURIComponent(path.slice(prefix.length)) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(404); response.end(); return; }
    try {
      const content = await readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
        '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[extname(file)] ?? 'application/octet-stream';
      response.writeHead(200, { 'content-type': type, 'content-security-policy': webSecurityPolicy(role, origin), 'cache-control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking'],
    ...(process.env.RAMO_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.RAMO_CHROMIUM_EXECUTABLE_PATH } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // Login does not instantiate a map; prevent provider calls with CI placeholder.
    if (url.origin === 'https://maps.googleapis.com' && url.pathname === '/maps/api/js') {
      return route.fulfill({ contentType: 'text/javascript', body: 'globalThis.google = { maps: {} };' });
    }
    remote.push(url.origin); return route.abort();
  });
  await page.addInitScript(() => {
    globalThis.bundleViolations = [];
    addEventListener('securitypolicyviolation', event => bundleViolations.push({ directive: event.effectiveDirective, uri: event.blockedURI }));
  });
  await page.goto(origin + prefix);
  await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
  const semantics = page.locator('flt-semantics-placeholder');
  await semantics.waitFor({ state: 'attached', timeout: 30000 });
  await semantics.click({ force: true });
  await page.getByRole('button', { name: role === 'passenger' ? 'Entrar' : 'Continuar', exact: true }).waitFor({ timeout: 30000 });
  const violations = await page.evaluate(() => bundleViolations);
  assert.deepEqual(violations.filter(item => /script-src|worker-src|connect-src/.test(item.directive)), []);
  assert.deepEqual(errors, []);
  // No SDK/engine leaves loopback; Maps is an intercepted stub, not a real map test.
  assert.deepEqual([...new Set(remote)], []);
  const evidence = resolve('artifacts/web-csp'); await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: resolve(evidence, role + '-login.png') });
});
