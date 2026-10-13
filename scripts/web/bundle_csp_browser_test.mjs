import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { webSecurityPolicy } from './web_security_policy.mjs';
import { prepareBrowserSessionRequest, browserAuthResponse, clearBrowserSessionCookie,
  BrowserSessionTransportError } from '../../backend/core/dist/src/auth/browser-session-transport.js';
const moduleUrl = process.env.RAMO_BROWSER_TEST_MODULE ?? new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href;
const { chromium } = await import(moduleUrl);
const role = process.env.RAMO_WEB_TEST_ROLE;
if (!['passenger', 'driver'].includes(role)) throw new Error('Specify RAMO_WEB_TEST_ROLE');
const root = resolve(new URL('../../apps/' + role + '/build/web/', import.meta.url).pathname);
const prefix = role === 'passenger' ? '/passageiro/' : '/motorista/';
test(role + ': release bundle logs in, restores cookie session and returns to login after logout', { timeout: 120000 }, async t => {
  let origin, session, publicHandle;
  let loginCalls = 0;
  const privateCredential = 'fixture-private-cookie-' + role + '-abcdefghijklmnopqrstuvwxyz';
  const certificates = await mkdtemp(resolve(tmpdir(), 'ramo-csp-tls-'));
  const keyFile = resolve(certificates, 'key.pem'), certFile = resolve(certificates, 'cert.pem');
  // Disposable loopback certificate only. Production TLS verification is unchanged.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  t.after(() => rm(certificates, { recursive: true, force: true }));
  const server = createServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/v1/')) {
      response.setHeader('content-type', 'application/json'); response.setHeader('cache-control', 'no-store');
      try {
        const authenticatedRole = prepareBrowserSessionRequest(request);
        if (path === '/v1/auth/otp/request') {
          response.writeHead(202); response.end(JSON.stringify({ challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            expiresAt: new Date(Date.now() + 60000).toISOString(), retryAfterSeconds: 0 })); return;
        }
        if (path === '/v1/auth/otp/verify' || path === '/v1/auth/passenger/password/login') {
          session = { accessToken: privateCredential, subjectType: role, subjectId: 'compiled-session-' + role,
            expiresAt: new Date(Date.now() + 600000).toISOString(), tokenType: 'Bearer' };
          const body = browserAuthResponse(request, response, session); publicHandle = body.accessToken; loginCalls++;
          response.writeHead(201); response.end(JSON.stringify(body)); return;
        }
        if (!session || authenticatedRole !== role || request.headers.authorization !== 'Bearer ' + privateCredential) {
          response.writeHead(401); response.end('{}'); return;
        }
        if (path === '/v1/auth/session' && request.method === 'DELETE') {
          session = null; clearBrowserSessionCookie(request, response); response.writeHead(204); response.end(); return;
        }
        if (path === '/v1/auth/me/check') {
          response.end(JSON.stringify({ subjectId: session.subjectId, subjectType: role, expiresAt: session.expiresAt })); return;
        }
        response.writeHead(404); response.end('{}'); return;
      } catch (error) {
        response.writeHead(error instanceof BrowserSessionTransportError ? error.status : 500);
        response.end('{}'); return;
      }
    }

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
  origin = 'https://127.0.0.1:' + server.address().port;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking'],
    ...(process.env.RAMO_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.RAMO_CHROMIUM_EXECUTABLE_PATH } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 900 } });
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
  try {
  await page.goto(origin + prefix);
  await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
  const semantics = page.locator('flt-semantics-placeholder');
  await semantics.waitFor({ state: 'attached', timeout: 30000 });
  // Flutter's offscreen accessibility placeholder handles a DOM click.
  // Activate semantics without requiring viewport geometry from the test runner.
  await semantics.dispatchEvent('click');
  await page.getByRole('button', { name: role === 'passenger' ? 'Entrar' : 'Continuar', exact: true }).waitFor({ timeout: 30000 });
  if (role === 'passenger') {
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByLabel('E-mail', { exact: true }).click(); await page.keyboard.insertText('fixture@example.test');
    await page.getByLabel('Senha', { exact: true }).click(); await page.keyboard.insertText('fixture-password-only');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  } else {
    await page.getByRole('textbox').first().click(); await page.keyboard.insertText('88999991234');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar e continuar', exact: true }).waitFor();
    await page.getByRole('textbox').first().click(); await page.keyboard.insertText('123456');
    await page.getByRole('button', { name: 'Confirmar e continuar', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Continuar para o Ramo Nessa', exact: true }).waitFor({ timeout: 30000 });
  assert.equal(loginCalls, 1);
  assert.match(publicHandle, new RegExp('^ramo_web_' + role + '_v1_[a-f0-9]{32}$'));
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(cookie => cookie.name === '__Host-ramo_' + role);
  assert.ok(authCookie?.httpOnly && authCookie.secure && authCookie.sameSite === 'Strict');
  assert.equal(await page.evaluate(() => document.cookie), '');
  assert.ok(!(await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes(privateCredential));
  await page.reload();
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await page.getByRole('button', { name: 'Continuar para o Ramo Nessa', exact: true }).waitFor({ timeout: 30000 });
  assert.equal(loginCalls, 1, 'Restoration must not perform another login');
  const logout = await page.evaluate(async handle => (await fetch('/v1/auth/session', { method: 'DELETE',
    credentials: 'same-origin', headers: { authorization: 'Bearer ' + handle } })).status, publicHandle);
  assert.equal(logout, 204);
  await page.reload();
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await page.getByRole('button', { name: role === 'passenger' ? 'Entrar' : 'Continuar', exact: true }).waitFor({ timeout: 30000 });
  const violations = await page.evaluate(() => bundleViolations);
  assert.deepEqual(violations.filter(item => /script-src|worker-src|connect-src/.test(item.directive)), []);
  assert.deepEqual(errors, []);
  // No SDK/engine leaves loopback; Maps is an intercepted stub, not a real map test.
  assert.deepEqual([...new Set(remote)], []);
  } finally {
    const evidence = resolve('artifacts/web-csp'); await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, role + '-login.png') });
  }
});
