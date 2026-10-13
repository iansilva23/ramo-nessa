import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
const moduleUrl = process.env.RAMO_BROWSER_TEST_MODULE ?? new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href;
const { chromium } = await import(moduleUrl);
const bridge = await readFile(new URL('../../packages/ramo_push/web/ramo_web_push.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../../packages/ramo_push/web/ramo_push_worker.js', import.meta.url), 'utf8');
let server, browser, origin;
const calls = [];
const appModule = `export function getApps(){ return []; }
export function initializeApp(options,name){ globalThis.fixture.apps.push({options,name}); return {name}; }`;
const messagingModule = `
export async function isSupported(){ return true; }
export function getMessaging(app){ return app; }
export async function getToken(messaging,options){
  fixture.tokens.push({name:messaging.name,vapidKey:options.vapidKey,scope:options.serviceWorkerRegistration.scope});
  if(fixture.blockToken) await new Promise(resolve => fixture.releaseToken = resolve);
  return 'web-push-token-'+messaging.name+'-'+fixture.tokens.length;
}
export async function deleteToken(messaging){ fixture.deleted.push(messaging.name); return true; }
export function onMessage(messaging, callback){ fixture.onMessage = callback; return () => { fixture.onMessage = null; }; }
`;

test.before(async () => {
  server = createServer(async (request, response) => {
    if (request.url.endsWith('/ramo_web_push.js')) {
      response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(bridge); return;
    }
    if (request.url.endsWith('/ramo_push_worker.js') || request.url.endsWith('/ramo_push_config.js') || request.url.endsWith('/flutter_service_worker.js')) {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end(request.url.endsWith('/ramo_push_worker.js') ? workerSource : request.url.endsWith('/ramo_push_config.js') ? 'self.ramoPushConfig = null;' : "self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));");
      return;
    }
    if (request.url === '/v1/notifications/device') {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      calls.push({ url: request.url, method: request.method, authorization: request.headers.authorization, body });
      if (request.headers.authorization?.includes('reject-core')) { response.writeHead(503); response.end(); return; }
      response.writeHead(request.method === 'DELETE' ? 204 : 200, { 'content-type': 'application/json' });
      response.end(request.method === 'DELETE' ? '' : JSON.stringify({ device: { enabled: true, platform: 'web', provider: 'fcm', notificationPreference: body.notificationPreference } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><button id="activate">Ativar</button><script type="module" src="ramo_web_push.js"></script>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, args: ['--disable-background-networking'],
    ...(process.env.RAMO_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.RAMO_CHROMIUM_EXECUTABLE_PATH } : {}) });
});
test.after(async () => {
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
  assert.ok(calls.every(call => call.url === '/v1/notifications/device'), 'Credentials must never occur in URL');
});
async function fixture(t, config = {}, context) {
  const ctx = context ?? await browser.newContext();
  if (!context) t.after(() => ctx.close());
  const page = await ctx.newPage();
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    const headers = { 'access-control-allow-origin': '*' };
    if (url === 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js') return route.fulfill({ contentType: 'text/javascript', headers, body: appModule });
    if (url === 'https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging.js') return route.fulfill({ contentType: 'text/javascript', headers, body: messagingModule });
    return route.abort();
  });
  await page.addInitScript(config => {
    window.fixture = { apps: [], tokens: [], deleted: [], workers: [], displayed: [], prompts: [], permission: config.permission ?? 'granted', blockToken: !!config.blockToken };
    window.ramoPushConfig = config.disabled ? null : { apiKey: 'public-test-key', appId: config.appId ?? ('1:123456:web:fixture-' + (config.role ?? 'passenger')), projectId: 'fixture', messagingSenderId: '123456', vapidKey: 'B' + 'A'.repeat(86) };
    Object.defineProperty(window, 'Notification', { value: {
      get permission() { return fixture.permission; },
      requestPermission() { fixture.prompts.push(navigator.userActivation.isActive); fixture.permission = config.grant ?? 'granted'; return Promise.resolve(fixture.permission); },
    } });
    if (config.ios) {
      Object.defineProperty(navigator, 'userAgent', { value: 'iPhone' });
      Object.defineProperty(navigator, 'standalone', { value: !!config.installed });
    }
    if (config.unsupported) Object.defineProperty(navigator, 'locks', { value: null });
    if (!config.realWorker) Object.defineProperty(navigator, 'serviceWorker', { value: { register: async (url, options) => {
      fixture.workers.push({ url: String(url), scope: options.scope });
      return { active: {}, scope: options.scope,
        showNotification: async (title, data) => fixture.displayed.push({ title, data }),
        getNotifications: async () => [{ close() { fixture.closed = true; } }],
      };
    } } });
  }, config);
  await page.goto(origin + (config.role === 'driver' ? '/motorista/' : '/passageiro/'));
  await page.waitForFunction(() => !!window.ramoWebPush);
  return page;
}
const bearer = 'session-aaaaaaaaaaaaaaaaaaaaaaaa';
async function start(page, changes = {}) {
  return page.evaluate(args => ramoWebPush.start({ baseUrl: location.origin, accessToken: args.bearer,
    preference: 'important', requestPermission: false, ...args.changes }), { bearer, changes });
}

test('sem configuração: não solicita permissão nem carrega Firebase', async t => {
  const page = await fixture(t, { disabled: true, permission: 'default' });
  assert.equal(await start(page, { requestPermission: true }), false);
  assert.deepEqual(await page.evaluate(() => [ramoWebPush.status(), fixture.prompts.length, fixture.apps.length]), ['unconfigured', 0, 0]);
});
test('login automático não apresenta prompt de notificação', async t => {
  const page = await fixture(t, { permission: 'default' });
  assert.equal(await start(page), false);
  assert.deepEqual(await page.evaluate(() => [fixture.prompts.length, fixture.tokens.length]), [0, 0]);
});
test('prompt mantém gesto de usuário e só confirma após cadastro no Core', async t => {
  const page = await fixture(t, { permission: 'default' });
  await page.evaluate(bearer => {
    document.querySelector('#activate').onclick = () => {
      window.result = ramoWebPush.start({ baseUrl: location.origin, accessToken: bearer, preference: 'important', requestPermission: true });
    };
  }, bearer);
  await page.click('#activate');
  assert.equal(await page.evaluate(() => window.result), true);
  assert.deepEqual(await page.evaluate(() => [fixture.prompts, ramoWebPush.status()]), [[true], 'ready']);
});
test('permissão negada não repete prompts', async t => {
  const page = await fixture(t, { permission: 'denied' });
  assert.equal(await start(page, { requestPermission: true }), false);
  assert.deepEqual(await page.evaluate(() => [ramoWebPush.status(), fixture.prompts.length]), ['denied', 0]);
});
test('iPhone fora da Tela de Início recebe orientação, sem prompt', async t => {
  const page = await fixture(t, { ios: true, permission: 'default' });
  assert.equal(await start(page, { requestPermission: true }), false);
  assert.deepEqual(await page.evaluate(() => [ramoWebPush.status(), fixture.prompts.length]), ['install', 0]);
});
test('iPhone instalado segue caminho de permissão e cadastro', async t => {
  const page = await fixture(t, { ios: true, installed: true });
  assert.equal(await start(page), true);
  assert.equal(await page.evaluate(() => ramoWebPush.status()), 'ready');
});
test('origem externa e browser incompatível falham fechados', async t => {
  const page = await fixture(t);
  assert.equal(await start(page, { baseUrl: 'https://evil.example/' }), false);
  assert.equal(await page.evaluate(() => fixture.apps.length), 0);
  const incompatible = await fixture(t, { unsupported: true });
  assert.equal(await start(incompatible, { requestPermission: true }), false);
  assert.equal(await incompatible.evaluate(() => ramoWebPush.status()), 'unsupported');
});
test('permissão concedida com Core indisponível não é sucesso', async t => {
  const page = await fixture(t);
  assert.equal(await start(page, { accessToken: 'reject-core-aaaaaaaaaaaaaaaaaaaa' }), false);
  assert.equal(await page.evaluate(() => ramoWebPush.status()), 'granted');
});
test('preferência chega ao envio por registro autenticado, sem credenciais persistidas', async t => {
  const page = await fixture(t);
  assert.equal(await start(page), true);
  assert.equal(await page.evaluate(() => ramoWebPush.setPreference('all')), true);
  const put = calls.at(-1);
  assert.equal(put.body.notificationPreference, 'all');
  assert.equal(put.authorization, 'Bearer ' + bearer);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.ok(!stored.includes(bearer)); assert.ok(!stored.includes('web-push-token'));
  assert.equal(await page.evaluate(() => ramoWebPush.setPreference('invalid')), false);
});
test('logout remove assinatura, fecha avisos e ignora novas mensagens', async t => {
  const page = await fixture(t);
  await start(page);
  await page.evaluate(() => ramoWebPush.stop());
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.deepEqual(await page.evaluate(() => [fixture.deleted.length, fixture.closed, fixture.onMessage, ramoWebPush.status()]), [1, true, null, 'granted']);
  assert.equal(await page.evaluate(() => ramoWebPush.setPreference('all')), false);
});
test('logout durante getToken não registra sessão encerrada', async t => {
  const page = await fixture(t, { blockToken: true });
  const before = calls.length;
  await page.evaluate(bearer => { window.pending = ramoWebPush.start({ baseUrl: location.origin, accessToken: bearer, preference: 'important' }); }, bearer);
  await page.waitForFunction(() => !!fixture.releaseToken);
  await page.evaluate(() => { window.stopped = ramoWebPush.stop(); fixture.releaseToken(); });
  assert.equal(await page.evaluate(() => window.pending), false);
  await page.evaluate(() => window.stopped);
  assert.ok(!calls.slice(before).some(call => call.method === 'PUT'));
  assert.equal(await page.evaluate(() => fixture.deleted.length), 1);
});
test('troca de conta descarta operação anterior e rotaciona token antes do cadastro', async t => {
  const page = await fixture(t, { blockToken: true });
  const before = calls.length;
  await page.evaluate(bearer => { window.first = ramoWebPush.start({ baseUrl: location.origin, accessToken: bearer, preference: 'important' }); }, bearer);
  await page.waitForFunction(() => !!fixture.releaseToken);
  await page.evaluate(() => {
    window.second = ramoWebPush.start({ baseUrl: location.origin, accessToken: 'session-bbbbbbbbbbbbbbbbbbbbbbbb', preference: 'important' });
    fixture.blockToken = false; fixture.releaseToken();
  });
  assert.equal(await page.evaluate(() => window.first), false);
  assert.equal(await page.evaluate(() => window.second), true);
  const writes = calls.slice(before).filter(call => call.method === 'PUT');
  assert.equal(writes.length, 1); assert.ok(writes[0].authorization.includes('session-bbbbb'));
  assert.equal(await page.evaluate(() => fixture.deleted.length), 1);
});
test('worker e VAPID são explícitos e isolados de Flutter e do outro aplicativo', async t => {
  const ctx = await browser.newContext(); t.after(() => ctx.close());
  const passenger = await fixture(t, {}, ctx), driver = await fixture(t, { role: 'driver' }, ctx);
  await start(passenger); await start(driver);
  const p = await passenger.evaluate(() => fixture.workers[0]), d = await driver.evaluate(() => fixture.workers[0]);
  assert.equal(p.scope, origin + '/passageiro/push-scope/');
  assert.equal(d.scope, origin + '/motorista/push-scope/');
  assert.ok(p.url.endsWith('/passageiro/ramo_push_worker.js'));
  assert.equal(await driver.evaluate(() => fixture.tokens[0].vapidKey.length), 87);
  await passenger.evaluate(() => ramoWebPush.stop());
  assert.equal(await driver.evaluate(() => [fixture.deleted.length, ramoWebPush.status()].join(':')), '0:ready');
});
test('nova aba assume push; logout na aba antiga não apaga assinatura atual', async t => {
  const ctx = await browser.newContext(); t.after(() => ctx.close());
  const first = await fixture(t, {}, ctx); await start(first);
  const second = await fixture(t, {}, ctx); await start(second, { accessToken: 'session-bbbbbbbbbbbbbbbbbbbbbbbb' });
  await first.waitForFunction(() => fixture.onMessage === null);
  await first.evaluate(() => ramoWebPush.stop());
  assert.equal(await first.evaluate(() => fixture.deleted.length), 0);
  assert.deepEqual(await second.evaluate(() => [fixture.deleted.length, ramoWebPush.status()]), [1, 'ready']);
});
test('avisos em primeiro plano exibem só texto, sem URLs/ações do payload', async t => {
  const page = await fixture(t); await start(page);
  await page.evaluate(() => fixture.onMessage({ data: { title: 'Nova corrida', body: 'Abra o app', url: 'https://evil.example' } }));
  const shown = await page.evaluate(() => fixture.displayed);
  assert.equal(shown.length, 1); assert.deepEqual(shown[0].data.data, { ramo: true });
  assert.ok(!JSON.stringify(shown).includes('evil.example'));
});

test('registro real de Service Worker mantém o worker Flutter e o worker push separados', async t => {
  const page = await fixture(t, { realWorker: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('flutter_service_worker.js', { scope: '/passageiro/' });
  });
  assert.equal(await start(page), true);
  const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope));
  assert.ok(scopes.includes(origin + '/passageiro/'));
  assert.ok(scopes.includes(origin + '/passageiro/push-scope/'));
  await page.evaluate(() => ramoWebPush.stop());
  assert.ok((await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope))).includes(origin + '/passageiro/'));
});

test('appId Firebase repetido entre apps falha fechado antes de obter outro token', async t => {
  const ctx = await browser.newContext(); t.after(() => ctx.close());
  const passenger = await fixture(t, { appId: '1:123456:web:repeated' }, ctx); await start(passenger);
  const driver = await fixture(t, { role: 'driver', appId: '1:123456:web:repeated' }, ctx);
  assert.equal(await start(driver), false);
  assert.equal(await driver.evaluate(() => ramoWebPush.status()), 'configuration-conflict');
  assert.equal(await driver.evaluate(() => fixture.tokens.length), 0);
  assert.equal(await passenger.evaluate(() => fixture.deleted.length), 0);
});
