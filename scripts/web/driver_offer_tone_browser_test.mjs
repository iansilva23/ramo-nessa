import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from './browser-tests/node_modules/playwright/index.mjs';

test('real Chromium: blocked offer, gesture unlock, original MP3 decoding and cancellation', async () => {
  const script = await readFile(new URL('../../apps/driver/web/ramo_offer_tone.js', import.meta.url));
  const audio = await readFile(new URL('../../apps/driver/assets/audio/nova_corrida.mp3', import.meta.url));
  const server = createServer((req, res) => {
    if (req.url.endsWith('.mp3')) { res.setHeader('Content-Type', 'audio/mpeg'); res.end(audio); }
    else if (req.url.endsWith('.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
    else res.end(`<!doctype html><base href="/motorista/"><button>Ficar online</button>
      <script>
      window.stats = {active: 0, starts: 0};
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        constructor() {
          super(); window.audioContext = this;
          const create = this.createBufferSource.bind(this);
          this.createBufferSource = () => {
            const source = create(), start = source.start.bind(source), stop = source.stop.bind(source);
            source.start = () => { start(); stats.active++; stats.starts++; };
            source.stop = () => { stop(); stats.active--; };
            return source;
          };
        }
      };
      </script><script src="ramo_offer_tone.js"></script>
      <script>window.player = RamoOfferTone.create();</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless: true, args: ['--autoplay-policy=document-user-activation-required']});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/motorista/`);
    assert.equal(await page.evaluate(() => audioContext.state), 'suspended');
    await page.evaluate(() => player.start());
    await page.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.endsWith('.mp3')));
    assert.equal(await page.evaluate(() => stats.active), 0);
    await page.getByRole('button').click();
    await page.waitForFunction(() => stats.active === 1);
    assert.equal(await page.evaluate(() => audioContext.state), 'running');
    await page.evaluate(() => player.stop());
    await page.getByRole('button').click();
    assert.equal(await page.evaluate(() => stats.active), 0);
    // Already unlocked session: next offer starts without another gesture.
    await page.evaluate(() => player.start());
    await page.waitForFunction(() => stats.active === 1);
    assert.equal(await page.evaluate(() => stats.starts), 2);
    await page.evaluate(() => player.dispose());
    assert.equal(await page.evaluate(() => stats.active), 0);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
