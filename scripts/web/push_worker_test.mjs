import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../packages/ramo_push/web/ramo_push_worker.js', import.meta.url), 'utf8');
function worker(role, windows = []) {
  const origin = 'https://ramo.example/';
  const path = role === 'driver' ? 'motorista/' : 'passageiro/';
  const events = new Map(), displayed = [], opened = [], imports = [];
  let background;
  const self = { location: { href: origin + path + 'ramo_push_worker.js' }, ramoPushConfig: null,
    addEventListener: (name, callback) => events.set(name, callback), skipWaiting: async () => {},
    registration: { showNotification: async (...args) => displayed.push(args) },
    clients: { matchAll: async () => windows, openWindow: async url => opened.push(url) } };
  const firebase = { initializeApp: () => {}, messaging: () => ({ onBackgroundMessage: callback => { background = callback; } }) };
  vm.runInNewContext(source, { self, URL, String, firebase, importScripts: (...urls) => {
    imports.push(...urls);
    if (urls[0].endsWith('ramo_push_config.js')) self.ramoPushConfig = { appId: 'public-web-app' };
  } });
  return { self, events, displayed, opened, imports, background };
}
for (const role of ['passenger', 'driver']) {
  test('worker ' + role + ' exibe data-only uma vez e não duplica notification', async () => {
    const w = worker(role);
    await w.background({ data: { title: 'Nova corrida', body: 'Abra o app', url: 'https://evil.example' } });
    assert.equal(w.displayed.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(w.displayed[0][1].data)), { ramo: true });
    await w.background({ notification: { title: 'Automatic' }, data: { title: 'Title', body: 'Body' } });
    assert.equal(w.displayed.length, 1);
  });
  test('clique ' + role + ' ignora destino remoto e abre somente seu app', async () => {
    const w = worker(role); let task; let stopped = false;
    w.events.get('notificationclick')({ notification: { data: { url: 'https://evil.example?token=secret' }, close() {} },
      stopImmediatePropagation() { stopped = true; }, waitUntil(value) { task = value; } });
    await task;
    assert.equal(stopped, true);
    assert.deepEqual(w.opened, ['https://ramo.example/' + (role === 'driver' ? 'motorista/' : 'passageiro/')]);
  });
}
test('clique preserva a tela de corrida e foca só janela do próprio aplicativo', async () => {
  let focused = 0, wrong = 0;
  const w = worker('passenger', [
    { url: 'https://ramo.example/motorista/', focus: async () => wrong++ },
    { url: 'https://ramo.example/passageiro/ride', focus: async () => focused++, postMessage: () => {} },
  ]); let task;
  w.events.get('notificationclick')({ notification: { close() {} }, stopImmediatePropagation() {}, waitUntil(value) { task = value; } });
  await task; assert.equal(focused, 1); assert.equal(wrong, 0); assert.equal(w.opened.length, 0);
});
test('cópias entregues de bridge e worker correspondem ao código compartilhado', async () => {
  for (const role of ['passenger', 'driver']) for (const file of ['ramo_web_push.js', 'ramo_push_worker.js']) {
    const canonical = await readFile(new URL('../../packages/ramo_push/web/' + file, import.meta.url), 'utf8');
    assert.equal(await readFile(new URL('../../apps/' + role + '/web/' + file, import.meta.url), 'utf8'), canonical);
  }
});

for (const role of ['passenger', 'driver']) {
  test('clique ' + role + ' conserva corrida e tipo ao abrir o aplicativo fechado', async () => {
    const w = worker(role);
    const rideId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    let task;
    w.events.get('notificationclick')({notification: {data: {type: 'ride.chat.message', rideId, url: 'https://evil.example'}, close() {}},
      stopImmediatePropagation() {}, waitUntil(value) { task = value; }});
    await task;
    const target = new URL(w.opened[0]);
    assert.equal(target.origin, 'https://ramo.example');
    assert.equal(target.pathname, role === 'driver' ? '/motorista/' : '/passageiro/');
    assert.equal(target.searchParams.get('notificationType'), 'ride.chat.message');
    assert.equal(target.searchParams.get('notificationRide'), rideId);
  });
  test('clique ' + role + ' entrega intenção à janela existente sem trocar a URL', async () => {
    const received = [], rideId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const w = worker(role, [{url: 'https://ramo.example/' + (role === 'driver' ? 'motorista/' : 'passageiro/'),
      focus: async () => {}, postMessage: data => received.push(data)}]);
    let task;
    w.events.get('notificationclick')({notification: {data: {type: 'ride.chat.message', rideId}, close() {}},
      stopImmediatePropagation() {}, waitUntil(value) { task = value; }});
    await task;
    assert.deepEqual(JSON.parse(JSON.stringify(received)), [{ramoNotificationOpen: {type: 'ride.chat.message', rideId}}]);
    assert.equal(w.opened.length, 0);
  });
}
