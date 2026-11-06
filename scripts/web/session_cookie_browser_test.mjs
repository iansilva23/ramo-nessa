import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:https';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { prepareBrowserSessionRequest, browserAuthResponse, clearBrowserSessionCookie,
  BrowserSessionTransportError } from '../../backend/core/dist/src/auth/browser-session-transport.js';
import { launchTestBrowser } from './browser_test_runtime.mjs';
let browser, server, origin, directory;
const sessions = new Map();
test.before(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'ramo-cookie-tls-'));
  const key = resolve(directory, 'key.pem'), cert = resolve(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key,
    '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  server = createServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
    const path = new URL(request.url, 'https://localhost').pathname;
    if (path === '/') { response.end('<!doctype html><p>Local cookie contract</p>'); return; }
    response.setHeader('cache-control', 'no-store'); response.setHeader('content-type', 'application/json');
    try {
      const role = prepareBrowserSessionRequest(request);
      if (path === '/login') {
        const requested = request.headers['x-ramo-web-role'];
        const token = randomBytes(32).toString('base64url');
        const body = { accessToken: token, subjectType: requested, subjectId: 'fixture-' + token.slice(0, 8),
          expiresAt: new Date(Date.now() + 60000).toISOString() };
        sessions.set(token, { ...body, revoked: false });
        response.end(JSON.stringify(browserAuthResponse(request, response, body))); return;
      }
      const token = request.headers.authorization?.slice(7), session = sessions.get(token);
      if (!role || !session || session.revoked || session.subjectType !== role) {
        response.writeHead(401); response.end('{}'); return;
      }
      if (path === '/logout') {
        session.revoked = true; clearBrowserSessionCookie(request, response);
        response.writeHead(204); response.end(); return;
      }
      response.end(JSON.stringify({ subjectType: role, subjectId: session.subjectId }));
    } catch (error) {
      response.writeHead(error instanceof BrowserSessionTransportError ? error.status : 500);
      response.end('{}');
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = 'https://127.0.0.1:' + server.address().port;
  browser = await launchTestBrowser();
});
test.after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
async function fixture(t) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true }); t.after(() => context.close());
  const page = await context.newPage(); await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin); return { context, page };
}
async function login(page, role) {
  return page.evaluate(async role => {
    const response = await fetch('/login', { method: 'POST', credentials: 'same-origin', headers: { 'x-ramo-web-role': role } });
    return response.json();
  }, role);
}
async function call(page, handle, path = '/me', method = 'GET', credentials = 'same-origin') {
  return page.evaluate(async args => (await fetch(args.path, { method: args.method, credentials: args.credentials,
    headers: { authorization: 'Bearer ' + args.handle } })).status, { handle, path, method, credentials });
}
test('real browser stores HttpOnly Secure Strict cookie and JavaScript sees only public handle', async t => {
  const { page, context } = await fixture(t); const session = await login(page, 'passenger');
  assert.match(session.accessToken, /^ramo_web_passenger_v1_[a-f0-9]{32}$/);
  const cookie = (await context.cookies())[0];
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'Strict');
  assert.ok(!JSON.stringify(session).includes(cookie.value));
  assert.equal(await page.evaluate(() => document.cookie), '');
  assert.equal(await call(page, session.accessToken), 200);
  await page.reload(); assert.equal(await call(page, session.accessToken), 200);
});
test('passenger and driver cookies remain independent when one logs out', async t => {
  const { page } = await fixture(t);
  const passenger = await login(page, 'passenger'), driver = await login(page, 'driver');
  assert.equal(await call(page, passenger.accessToken), 200); assert.equal(await call(page, driver.accessToken), 200);
  assert.equal(await call(page, driver.accessToken, '/logout', 'DELETE'), 204);
  assert.equal(await call(page, driver.accessToken), 401); assert.equal(await call(page, passenger.accessToken), 200);
});
test('old tab cannot clear or use the newer account session cookie', async t => {
  const { page, context } = await fixture(t); const first = await login(page, 'passenger');
  const next = await context.newPage(); await next.goto(origin); const second = await login(next, 'passenger');
  assert.notEqual(first.accessToken, second.accessToken);
  assert.equal(await call(page, first.accessToken, '/logout', 'DELETE'), 401);
  assert.equal(await call(next, second.accessToken), 200);
  assert.equal((await context.cookies()).length, 1);
});
test('public handle without cookie cannot authenticate and cookie alone is insufficient', async t => {
  const { page } = await fixture(t); const session = await login(page, 'passenger');
  assert.equal(await call(page, session.accessToken, '/me', 'GET', 'omit'), 401);
  assert.equal(await page.evaluate(async () => (await fetch('/me')).status), 401);
});

