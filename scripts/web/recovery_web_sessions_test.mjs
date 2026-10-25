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
import { browserName, launchTestBrowser } from './browser_test_runtime.mjs';
const role = process.env.RAMO_WEB_TEST_ROLE;
if (!['passenger', 'driver'].includes(role)) throw new Error('Specify RAMO_WEB_TEST_ROLE');
const root = resolve(new URL('../../apps/' + role + '/build/web/', import.meta.url).pathname);
const prefix = role === 'passenger' ? '/passageiro/' : '/motorista/';
test(browserName + '/' + role + ': installed app opens directly, logs in, recovers cookie and logs out', { timeout: 120000 }, async t => {
  let origin, session, publicHandle;
  let loginCalls = 0, recoverPayment=false, paymentWrites=0;
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
      if (path === '/v1/auth/web/session') response.setHeader('x-ramo-web-session', '1');
      response.setHeader('content-type', 'application/json'); response.setHeader('cache-control', 'no-store');
      try {
        const authenticatedRole = prepareBrowserSessionRequest(request, { cookieBootstrap: path === '/v1/auth/web/session' && request.method === 'GET' });
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
        if (path === '/v1/auth/web/session') {
          response.end(JSON.stringify(browserAuthResponse(request, response, session, { setCookie: false }))); return;
        }
        if (path === '/v1/auth/me/check') {
          response.end(JSON.stringify({ subjectId: session.subjectId, subjectType: role, expiresAt: session.expiresAt })); return;
        }
        if(path==='/v1/passenger/me/ride'){
          response.end(JSON.stringify(recoverPayment?{ride:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',state:'AWAITING_PAYMENT',paymentExpiresAt:new Date(Date.now()+600000).toISOString()},payment:{id:'same-payment',status:'pending',amountCents:100},pix:{payment:{id:'same-payment',status:'pending'},pix:{orderId:'same-order',paymentId:'same-gateway-payment',qrCode:'existing-pix-recovered',qrCodeBase64:''}}}:{ride:null}));return;
        }
        if(path==='/v1/rides/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/tracking'){
          response.end(JSON.stringify({ride:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',state:'AWAITING_PAYMENT',category:'car'}}));return;
        }
        if(path.includes('/payments')&&request.method==='POST')paymentWrites++;
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
      const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
        '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[extname(file)] ?? 'application/octet-stream';
      response.writeHead(200, { 'content-type': type, 'content-security-policy': webSecurityPolicy(role, origin), 'cache-control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = 'https://127.0.0.1:' + server.address().port;
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await launchTestBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 900 },
    ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' } : {}) });
  page.setDefaultTimeout(20000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const errors = [], remote = [];
  const completedMarkerLoads = new Map();
  const markerNames = ['passenger','destination','car','motorcycle','buggy','delivery','comfort'];
  const failedAssets = [];
  page.on('requestfinished', request => {
    const name = markerNames.find(name => request.url().endsWith('/assets/map_markers/'+name+'.png'));
    if(name) completedMarkerLoads.set(name,(completedMarkerLoads.get(name)??0)+1);
  });
  page.on('requestfailed', request => { if(request.url().startsWith(origin+prefix+'assets/')) failedAssets.push({url:request.url(),error:request.failure()?.errorText}); });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // Mount a local map fixture for dark/light home screens; never call Google.
    if (url.origin === 'https://maps.googleapis.com' && url.pathname === '/maps/api/js') {
      return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL('./maps_test_stub.js', import.meta.url), 'utf8') });
    }
    remote.push(url.origin); return route.abort();
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
    globalThis.bundleViolations = [];
    addEventListener('securitypolicyviolation', event => bundleViolations.push({ directive: event.effectiveDirective, uri: event.blockedURI }));
  });
  async function assertDirectEntry() {
    assert.equal(await page.locator('#ramo-entry-gate').count(), 0);
    assert.equal(await page.locator('script[src*="ramo_entry_gate"], link[href*="ramo_entry_gate"]').count(), 0);
    assert.equal(await page.locator('flutter-view').evaluate(n => n.inert), false);
    await page.evaluate(() => {
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });
    assert.equal(await page.locator('#ramo-entry-gate').count(), 0);
    assert.equal(await page.locator('flutter-view').evaluate(n => n.inert), false);
  }
  async function settledHomeAssets(before = new Map()) {
    // Nearby category markers load sequentially. Wait for every marker rather
    // than only the car before deliberately unloading the document in WebKit.
    if(role==='passenger'){
      const deadline=Date.now()+15000;
      while(markerNames.some(name=>(completedMarkerLoads.get(name)??0)<=(before.get(name)??0))){
        if(Date.now()>deadline)throw Error('Passenger markers did not complete before deliberate reload.');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    }
    await page.waitForLoadState('networkidle',{timeout:15000});
  }
  try {
  await page.goto(origin + prefix);
  await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
  await assertDirectEntry();
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
  await page.getByText(role === 'passenger' ? 'Perfil' : 'Cadastro de motorista', { exact: true }).first().waitFor({ timeout: 30000 });
  await settledHomeAssets();
  assert.equal(await page.getByText('Adicionar app à Tela de Início', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Ative sua localização', { exact: true }).count(), 0);
  const setupEvidence = resolve('artifacts/web-csp'); await mkdir(setupEvidence, { recursive: true });
  await page.screenshot({ path: resolve(setupEvidence, browserName + '-' + role + '-installed-after-login.png') });
  assert.equal(loginCalls, 1);
  assert.match(publicHandle, new RegExp('^ramo_web_' + role + '_v1_[a-f0-9]{32}$'));
  const cookies = await page.context().cookies();
  const authCookie = cookies.find(cookie => cookie.name === '__Host-ramo_' + role);
  assert.ok(authCookie?.httpOnly && authCookie.secure && authCookie.sameSite === 'Strict');
  assert.equal(await page.evaluate(() => document.cookie), '');
  assert.ok(!(await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes(privateCredential));
  await page.evaluate(() => localStorage.clear());
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  const beforeRestoreMarkerLoads=new Map(completedMarkerLoads);
  await page.reload();
  await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
  await assertDirectEntry();
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await page.getByText(role === 'passenger' ? 'Perfil' : 'Cadastro de motorista', { exact: true }).first().waitFor({ timeout: 30000 });
  await settledHomeAssets(beforeRestoreMarkerLoads);
  assert.equal(loginCalls, 1, 'Restoration must not perform another login');
  if(role==='passenger'){
    recoverPayment=true;
    for(let reopen=0;reopen<2;reopen++){
      await page.reload();await page.waitForSelector('flutter-view, flt-glass-pane',{timeout:60000});
      await page.locator('flt-semantics-placeholder').dispatchEvent('click');
      await page.getByRole('button',{name:'Copiar código Pix',exact:true}).waitFor({timeout:30000});
      await page.waitForLoadState('networkidle',{timeout:15000});
      await page.evaluate(()=>document.fonts.ready.then(()=>true));
      assert.equal(loginCalls,1);assert.equal(paymentWrites,0,'Recovery cannot create a new payment');
    }
    await page.screenshot({path:resolve(setupEvidence,browserName+'-passenger-recovered-pix.png')});
    recoverPayment=false;
  }
  const logout = await page.evaluate(async handle => (await fetch('/v1/auth/session', { method: 'DELETE',
    credentials: 'same-origin', headers: { authorization: 'Bearer ' + handle } })).status, publicHandle);
  assert.equal(logout, 204);
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await page.reload();
  await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
  await assertDirectEntry();
  await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  await page.getByRole('button', { name: role === 'passenger' ? 'Entrar' : 'Continuar', exact: true }).waitFor({ timeout: 30000 });
  const violations = await page.evaluate(() => bundleViolations);
  assert.deepEqual(violations.filter(item => /script-src|worker-src|connect-src/.test(item.directive)), []);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, []);
  // No SDK/engine leaves loopback; Maps is an intercepted stub, not a real map test.
  assert.deepEqual([...new Set(remote)], []);
  } finally {
    const evidence = resolve('artifacts/web-csp'); await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: resolve(evidence, browserName + '-' + role + '-login.png'), timeout: 10000 }).catch(() => {});
    await browser.close();
  }
});
