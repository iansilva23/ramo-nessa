import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { launchTestBrowser, browserName } from './browser_test_runtime.mjs';

const web = new URL('../../apps/passenger/web/', import.meta.url);
const gateJs = await readFile(new URL('ramo_entry_gate.js', web));
const gateCss = await readFile(new URL('ramo_entry_gate.css', web));
for (const name of ['ramo_entry_gate.js', 'ramo_entry_gate.css']) {
  assert.deepEqual(await readFile(new URL('../../apps/driver/web/' + name, import.meta.url)), await readFile(new URL(name, web)));
}
for (const role of ['passenger', 'driver']) {
  const index = await readFile(new URL('../../apps/' + role + '/web/index.html', import.meta.url), 'utf8');
  assert.ok(index.indexOf('src="ramo_entry_gate.js"') < index.indexOf('src="flutter_bootstrap.js"'));
  assert.ok(index.includes('href="ramo_entry_gate.css"'));
}

test(browserName + ': installed entry gate, full-screen gestures and lifecycle', { timeout: 120000 }, async t => {
  const evidence = new URL('../../artifacts/pwa-entry-gate/' + browserName + '/', import.meta.url);
  await mkdir(evidence, { recursive: true });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="ramo_entry_gate.css"></head><body style="margin:0;background:#d7ded8;font-family:Arial"><main id="app"><button id="underlay" style="position:absolute;left:20px;top:160px;width:44px;height:44px">Perfil</button><h1 style="margin:0;padding:300px 30px">Escolha seu destino</h1></main><div id="pre-inert" inert>Estado anterior preservado</div><script src="ramo_entry_gate.js"></script></body></html>`;
  let setting=true;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    if(req.url==='/v1/public/web-entry-settings'){
      const captured=setting;
      if(captured==='slow')await new Promise(r=>setTimeout(r,2200));
      res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
      res.statusCode=captured==='error'?503:captured==='missing'?404:200;
      res.end(JSON.stringify({enabled:captured==='invalid'?'true':captured===true}));return;
    }
    if (req.url.endsWith('ramo_entry_gate.js')) { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(gateJs); }
    else if (req.url.endsWith('ramo_entry_gate.css')) { res.setHeader('Content-Type', 'text/css; charset=utf-8'); res.end(gateCss); }
    else if (req.url.endsWith('icons/Icon-192.png')) { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(new URL('icons/Icon-192.png', web))); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await launchTestBrowser(); t.after(() => browser.close());
  async function open(installed, engineMode = 'navigator', role = 'passageiro', reducedMotion = 'no-preference') {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, reducedMotion });
    const requests = [], errors = [];
    await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== origin) { requests.push(url.origin); return route.abort(); } return route.continue(); });
    if (installed) await context.addInitScript(mode => {
      if (mode === 'navigator') Object.defineProperty(navigator, 'standalone', { value: true });
      else { const original = matchMedia.bind(window); window.matchMedia = q => q === '(display-mode: standalone)' ? { matches: true } : original(q); }
    }, engineMode);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/' + role + '/');
    await page.evaluate(() => { window.underlayClicks = 0; document.getElementById('underlay').addEventListener('click', () => window.underlayClicks++); });
    return { context, page, requests, errors };
  }
  const visible = async page => page.locator('#ramo-entry-gate').waitFor({ state: 'visible' });
  const hidden = async page => page.locator('#ramo-entry-gate').waitFor({ state: 'hidden' });
  async function drag(page, x, y, dx, dy = 0) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 12 }); await page.mouse.up(); }
  async function background(page) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange'));
    });
  }
  for(const role of ['passageiro','motorista'])for(const mode of [false,'error','missing','invalid','slow']){
    await t.test('installed app opens directly when setting is '+mode+': '+role,async()=>{
      setting=mode;const s=await open(true,'navigator',role);
      await s.page.waitForTimeout(mode==='slow'?1700:150);
      await hidden(s.page);
      assert.equal(await s.page.locator('#app').evaluate(n=>n.inert),false);
      await s.page.locator('#underlay').click();assert.equal(await s.page.evaluate(()=>underlayClicks),1);
      assert.equal(await s.page.locator('#pre-inert').evaluate(n=>n.inert),true);
      assert.deepEqual(s.errors,[]);await s.context.close();
    });
  }
  setting=true;
  await t.test('ADM disables a locked gate and enables it on next entry without trapping controls',async()=>{
    const s=await open(true);await visible(s.page);
    setting=false;await background(s.page);await hidden(s.page);
    assert.equal(await s.page.locator('#app').evaluate(n=>n.inert),false);
    await s.page.locator('#underlay').click();assert.equal(await s.page.evaluate(()=>underlayClicks),1);
    setting=true;await background(s.page);await visible(s.page);
    await drag(s.page,100,300,160);await hidden(s.page);
    assert.deepEqual(s.errors,[]);await s.context.close();
  });
  for (const role of ['passageiro', 'motorista']) {
    await t.test('ordinary browser tab remains unchanged: ' + role, async () => {
      const s = await open(false, 'navigator', role);
      assert.equal(await s.page.locator('#ramo-entry-gate').count(), 0);
      await background(s.page);
      assert.equal(await s.page.locator('#ramo-entry-gate').count(), 0);
      assert.equal(await s.page.locator('#app').evaluate(n => n.inert), false);
      await s.page.locator('#underlay').click(); assert.equal(await s.page.evaluate(() => underlayClicks), 1);
      assert.deepEqual(s.requests, []); assert.deepEqual(s.errors, []); await s.context.close();
    });
  }
  for (const mode of ['navigator', 'display-mode']) {
    await t.test('installed mode via ' + mode, async () => {
      const s = await open(true, mode), page = s.page;
      await visible(page);
      assert.equal(await page.locator('.ramo-gate-subtitle').innerText(), 'Seu próximo destino\nestá a um deslize.');
      const box = await page.locator('#ramo-entry-gate').boundingBox(); assert.deepEqual(box, { x: 0, y: 0, width: 430, height: 932 });
      const colors = await page.evaluate(() => {
        const gate = document.getElementById('ramo-entry-gate');
        return { background: getComputedStyle(gate).backgroundColor,
          text: ['.ramo-gate-brand', '.ramo-gate-subtitle', '.ramo-gate-hint', '.ramo-gate-anywhere'].map(s => getComputedStyle(gate.querySelector(s)).color) };
      });
      const rgba = s => { const v = s.match(/[\d.]+/g).map(Number); return [v[0], v[1], v[2], v[3] ?? 1]; };
      const composite = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
      const luminance = rgb => rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
      const backgroundFill = rgba(colors.background); assert.ok(backgroundFill[3] < .8, 'Background must remain translucent');
      const brightest = composite(backgroundFill, [255, 255, 255]);
      for (const color of colors.text) {
        const foreground = composite(rgba(color), brightest);
        assert.ok((luminance(foreground) + .05) / (luminance(brightest) + .05) >= 4.5, 'Text must remain readable over white app cards');
      }
      assert.equal(await page.locator('#app').evaluate(n => n.inert), true);
      await page.screenshot({ path: new URL(mode + '-locked.png', evidence).pathname });
      await page.mouse.click(42, 182); await drag(page, 200, 400, 15); await drag(page, 200, 350, 5, 130);
      await visible(page); assert.equal(await page.evaluate(() => underlayClicks), 0);
      await page.mouse.move(100, 300); await page.mouse.down(); await page.mouse.move(260, 300);
      await page.locator('#ramo-entry-gate').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
      await visible(page);
      await page.mouse.move(100, 300); await page.mouse.down();
      await page.locator('#ramo-entry-gate').dispatchEvent('pointerdown', { pointerId: 99, pointerType: 'touch', isPrimary: false });
      await page.mouse.move(260, 300); await page.mouse.up(); await visible(page);
      await page.mouse.move(100, 300); await page.mouse.down(); await page.mouse.move(260, 300);
      await page.evaluate(() => dispatchEvent(new Event('resize'))); await page.mouse.up(); await visible(page);
      await page.evaluate(() => { const view = document.createElement('flutter-view'); view.id = 'late-flutter'; document.body.append(view); });
      assert.equal(await page.locator('#late-flutter').evaluate(n => n.inert), true);
      await drag(page, 110, 110, 160); await hidden(page);
      assert.equal(await page.evaluate(() => underlayClicks), 0);
      assert.equal(await page.locator('#late-flutter').evaluate(n => n.inert), false);
      assert.equal(await page.locator('#pre-inert').evaluate(n => n.inert), true);
      await page.locator('#underlay').click(); assert.equal(await page.evaluate(() => underlayClicks), 1);
      await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); });
      await hidden(page);
      await background(page); await visible(page);
      await page.screenshot({ path: new URL(mode + '-foreground.png', evidence).pathname });
      await drag(page, 300, 780, -160); await hidden(page);
      await page.screenshot({ path: new URL(mode + '-unlocked.png', evidence).pathname });
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await visible(page);
      await page.locator('#ramo-entry-gate').focus(); await page.keyboard.press('Enter'); await hidden(page);
      await background(page); await visible(page);
      await drag(page, 110, 400, 150); await background(page);
      await visible(page); await page.waitForTimeout(450);
      assert.equal(await page.locator('#app').evaluate(n => n.inert), true);
      await page.setViewportSize({ width: 932, height: 430 });
      assert.deepEqual(await page.locator('#ramo-entry-gate').boundingBox(), { x: 0, y: 0, width: 932, height: 430 });
      for (const selector of ['.ramo-gate-brand', '.ramo-gate-title', '.ramo-gate-hint', '.ramo-gate-anywhere']) {
        const b = await page.locator(selector).boundingBox(); assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 932 && b.y + b.height <= 430, selector);
      }
      await page.screenshot({ path: new URL(mode + '-landscape.png', evidence).pathname });
      assert.deepEqual(s.requests, []); assert.deepEqual(s.errors, []);
      await s.context.close();
    });
  }
  await t.test('reduced motion and accessible activation', async () => {
    const s = await open(true, 'navigator', 'passageiro', 'reduce');
    await visible(s.page);
    assert.equal(await s.page.locator('#ramo-entry-gate').evaluate(n => getComputedStyle(n).transitionDuration), '0s');
    await s.page.locator('#ramo-entry-gate').focus(); await s.page.keyboard.press('Enter'); await hidden(s.page);
    assert.deepEqual(s.errors, []); await s.context.close();
  });
});
