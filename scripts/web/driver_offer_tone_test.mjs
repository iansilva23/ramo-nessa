import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../../apps/driver/web/ramo_offer_tone.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function fixture({slow = false, failure = false} = {}) {
  let active = 0, starts = 0, stopped = 0, fetches = 0, url;
  let release;
  const handlers = new Map();
  const document = {
    baseURI: 'https://app.example/motorista/',
    addEventListener(name, fn) { handlers.set(name, fn); },
    removeEventListener(name) { handlers.delete(name); },
  };
  let context;
  class AudioContext {
    constructor() { context = this; this.state = 'suspended'; }
    addEventListener() {}
    removeEventListener() {}
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    async decodeAudioData() { return {}; }
    createBufferSource() {
      return {connect() {}, disconnect() {}, start() { starts++; active++; }, stop() { stopped++; active--; }};
    }
  }
  const sandbox = {window: {AudioContext}, document, URL,
    fetch: async value => {
      fetches++; url = value.href;
      if (slow) await new Promise(resolve => { release = resolve; });
      return {ok: !failure, status: failure ? 503 : 200, arrayBuffer: async () => new ArrayBuffer(1)};
    },
  };
  vm.runInNewContext(script, sandbox);
  const player = sandbox.window.RamoOfferTone.create();
  return {player, handlers, gesture: () => handlers.get('pointerdown')?.(),
    release: () => release?.(), recover: () => { failure = false; },
    stats: () => ({active, starts, stopped, fetches, url, state: context.state})};
}

test('blocked autoplay retries same active offer on a gesture', async () => {
  const f = fixture();
  await f.player.start(); await flush();
  assert.equal(f.stats().active, 0);
  f.gesture(); await flush();
  assert.equal(f.stats().active, 1);
  f.gesture(); await flush();
  assert.equal(f.stats().starts, 1);
  f.player.stop(); assert.equal(f.stats().active, 0);
  await f.player.dispose();
});
test('online gesture unlocks before later GPS/API result and original asset uses route base', async () => {
  const f = fixture(); f.gesture(); await flush();
  assert.equal(f.stats().active, 0);
  await f.player.start(); await flush();
  assert.equal(f.stats().active, 1);
  assert.equal(f.stats().url, 'https://app.example/motorista/assets/assets/audio/nova_corrida.mp3');
  await f.player.dispose();
});
test('accept, reject, offline, expiry and remote cancellation never replay on later gesture', async () => {
  for (const reason of ['accept', 'reject', 'offline', 'expiry', 'remote cancel']) {
    const f = fixture(); f.gesture(); await flush();
    await f.player.start(); await flush();
    f.player.stop(); f.gesture(); await flush();
    assert.equal(f.stats().active, 0, reason);
    await f.player.dispose();
  }
});
test('accept during slow asset load prevents late playback', async () => {
  const f = fixture({slow: true}); f.gesture();
  await f.player.start(); f.player.stop();
  f.release(); await flush();
  assert.equal(f.stats().starts, 0);
  await f.player.dispose();
});
test('failed asset fetch can recover without changing offer id', async () => {
  const f = fixture({failure: true}); f.gesture();
  await f.player.start(); await flush();
  assert.equal(f.stats().starts, 0);
  f.recover(); f.gesture(); await flush();
  assert.equal(f.stats().starts, 1);
  await f.player.dispose();
});
test('dispose removes event listeners and stops sound', async () => {
  const f = fixture(); f.gesture(); await flush();
  await f.player.start(); await flush();
  await f.player.dispose(); await f.player.start(); f.gesture(); await flush();
  assert.equal(f.stats().active, 0);
  assert.equal(f.handlers.size, 0);
  assert.equal(f.stats().state, 'closed');
});
