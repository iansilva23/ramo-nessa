import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const moduleUrl = process.env.RAMO_BROWSER_TEST_MODULE ?? new URL('./browser-tests/node_modules/playwright/index.mjs', import.meta.url).href;
const { chromium } = await import(moduleUrl);
const source = await readFile(new URL('../../apps/passenger/web/ramo_card_fields.js', import.meta.url), 'utf8');
let browser;
let server;
let origin;
const requests = [];

test.before(async () => {
  server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="ramo-card-test-1" style="width:400px;height:176px"></div><div id="ramo-card-test-2"></div></body></html>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true,
    ...(process.env.RAMO_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.RAMO_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--disable-background-networking'],
  });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  assert.ok(!requests.some(path => path.startsWith('/v1/')), 'Tokenization must never call Core or charge a ride');
});

async function pageFixture(t, config = {}) {
  const page = await browser.newPage({ viewport: { width: 430, height: 800 } });
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin);
  await page.evaluate(config => {
    window.config = config;
    window.fields = [];
    window.tokenCalls = [];
    window.states = [];
    window.generated = 0;
    class FakeField {
      constructor(type) { this.type = type; this.listeners = new Map(); this.settings = []; }
      on(name, callback) { this.listeners.set(name, callback); }
      emit(name, data = {}) { this.listeners.get(name)?.(data); }
      mount(id) {
        const frame = document.createElement('iframe');
        frame.title = this.type + ' - mock secure field';
        frame.srcdoc = '<p>Campo seguro simulado para teste de contrato</p>';
        document.getElementById(id).append(frame);
        this.frame = frame;
        if (!config.deferReady) queueMicrotask(() => this.emit('ready'));
      }
      update(settings) { this.settings.push(settings); }
      unmount() { this.frame?.remove(); }
      get value() { throw new Error('Bridge may not read PCI values'); }
    }
    window.MercadoPago = class {
      constructor(key, options) {
        window.sdkOptions = options;
        this.fields = {
          create(type) { const field = new FakeField(type); window.fields.push(field); return field; },
          blur() {},
          async createCardToken(data) {
            window.tokenCalls.push(data);
            if (config.tokenError) throw { card_number: 'must-never-be-forwarded' };
            if (config.deferToken) await new Promise(resolve => { window.releaseToken = resolve; });
            window.generated++;
            if (config.storageError && window.generated > 1) throw new Error('storage_unavailable');
            return { id: 'test-token-created-' + String(config.sameToken ? 1 : window.generated).padStart(20, '0'),
              last_four_digits: '1234', card_number: 'must-never-be-forwarded', security_code: 'must-never-be-forwarded',
              expiration_month: 10, cardholder: { name: 'must-never-be-forwarded' } };
          },
        };
      }
      async getPaymentMethods({ bin }) {
        if (config.deferMethods) await new Promise(resolve => {
          window.methodResolvers ??= {};
          window.methodResolvers[bin] = resolve;
        });
        return { results: [{ id: bin.startsWith('5') ? 'master' : 'visa', payment_type_id: 'credit_card',
          settings: [{ card_number: { length: 16, validation: 'standard' }, security_code: { length: 3 } }] }] };
      }
      async getInstallments() { return [{ payer_costs: [{ installments: config.noSingle ? 2 : 1 }] }]; }
    };
  }, config);
  await page.addScriptTag({ type: 'module', content: source });
  await page.waitForFunction(() => window.ramoCardFields != null);
  t.after(() => page.close());
  return page;
}

const options = { containerId: 'ramo-card-test-1', publicKey: 'TEST-public-key-browser-contract-123456789', amountCents: 4000 };
const nonPCI = { containerId: options.containerId, holderName: 'Pessoa Teste', identificationNumber: '12345678909' };

async function mount(page, savedCard) {
  return page.evaluate(async options => window.ramoCardFields.mount(JSON.stringify(options), value => window.states.push(JSON.parse(value))),
    { ...options, ...(savedCard ? { savedCard } : {}) });
}
async function fill(page, bin = '41111111') {
  await page.evaluate(bin => {
    for (const field of window.fields) field.emit('validityChange', { errorMessages: [] });
    window.fields.find(field => field.type === 'cardNumber')?.emit('binChange', { bin });
  }, bin);
  await page.waitForFunction(() => window.states.at(-1)?.valid === true);
}
async function tokenize(page, data = {}) {
  return page.evaluate(async data => JSON.parse(await window.ramoCardFields.tokenize(JSON.stringify(data))), { ...nonPCI, ...data });
}

test('new card: protected frames, separate payment/storage tokens and whitelist without PCI', async t => {
  const page = await pageFixture(t);
  await mount(page);
  assert.equal(await page.locator('iframe').count(), 3);
  await fill(page);
  const result = await tokenize(page, { requestStorageToken: true, cardNumber: 'ignored-forbidden-data', cvv: 'ignored' });
  assert.deepEqual(Object.keys(result).sort(), ['lastFourDigits', 'paymentMethodId', 'paymentMethodType', 'storageToken', 'token']);
  assert.notEqual(result.token, result.storageToken);
  assert.equal(result.lastFourDigits, '1234');
  assert.equal(JSON.stringify(result).includes('must-never-be-forwarded'), false);
  const args = await page.evaluate(() => window.tokenCalls);
  assert.equal(args.length, 2);
  assert.deepEqual(Object.keys(args[0]).sort(), ['cardholderName', 'identificationNumber', 'identificationType']);
  assert.deepEqual(await page.evaluate(() => window.sdkOptions), { locale: 'pt-BR', advancedFraudPrevention: true, trackingDisabled: true });
  await page.evaluate(() => window.ramoCardFields.dispose('ramo-card-test-1'));
  assert.equal(await page.locator('iframe').count(), 0);
});

test('saved card requests only fresh CVV token, never asks for full card number again', async t => {
  const page = await pageFixture(t);
  await mount(page, { id: 'saved-card-123', lastFourDigits: '5678', paymentMethodId: 'amex', paymentMethodType: 'credit_card' });
  assert.equal(await page.locator('iframe').count(), 1);
  await fill(page);
  const result = await tokenize(page);
  assert.equal(result.paymentMethodId, 'amex');
  assert.equal(result.lastFourDigits, '5678');
  assert.deepEqual(await page.evaluate(() => window.tokenCalls), [{ cardId: 'saved-card-123' }]);
  assert.equal(await page.evaluate(() => window.fields[0].settings[0].settings.length), 4);
});

test('saving is optional, failed storage token preserves payment and never reuses same token', async t => {
  for (const config of [{ storageError: true }, { sameToken: true }]) {
    const page = await pageFixture(t, config);
    await mount(page); await fill(page);
    const result = await tokenize(page, { requestStorageToken: true });
    assert.ok(result.token);
    assert.equal(result.storageToken, undefined);
  }
});

test('cards without one-installment support cannot be tokenized', async t => {
  const page = await pageFixture(t, { noSingle: true });
  await mount(page);
  await page.evaluate(() => {
    for (const field of window.fields) field.emit('validityChange', { errorMessages: [] });
    window.fields[0].emit('binChange', { bin: '41111111' });
  });
  await page.waitForFunction(() => window.states.at(-1)?.error != null);
  assert.equal(await page.evaluate(() => window.states.at(-1).valid), false);
  await assert.rejects(tokenize(page), /Confira os dados/);
  assert.equal(await page.evaluate(() => window.tokenCalls.length), 0);
});

test('cancel during tokenization disposes frames and never returns a pending token', async t => {
  const page = await pageFixture(t, { deferToken: true });
  await mount(page); await fill(page);
  const result = tokenize(page).then(() => 'unexpected-token', () => 'cancelled');
  await page.waitForFunction(() => window.releaseToken != null);
  await page.evaluate(() => { window.ramoCardFields.dispose('ramo-card-test-1'); window.releaseToken(); });
  assert.equal(await result, 'cancelled');
  assert.equal(await page.locator('iframe').count(), 0);
});

test('cancel while fields initialize removes frames and releases form for retry', async t => {
  const page = await pageFixture(t, { deferReady: true });
  const first = mount(page).then(() => 'unexpected-ready', () => 'cancelled');
  await page.waitForFunction(() => window.fields.length === 3);
  await page.evaluate(() => window.ramoCardFields.dispose('ramo-card-test-1'));
  assert.equal(await first, 'cancelled');
  assert.equal(await page.locator('iframe').count(), 0);
});

test('late BIN response cannot overwrite the latest chosen card method', async t => {
  const page = await pageFixture(t, { deferMethods: true });
  await mount(page);
  await page.evaluate(() => {
    for (const field of window.fields) field.emit('validityChange', { errorMessages: [] });
    window.fields[0].emit('binChange', { bin: '41111111' });
    window.fields[0].emit('binChange', { bin: '55555555' });
  });
  await page.waitForFunction(() => window.methodResolvers?.['55555555'] != null);
  await page.evaluate(() => window.methodResolvers['55555555']());
  await page.waitForFunction(() => window.states.at(-1)?.valid === true);
  await page.evaluate(() => window.methodResolvers['41111111']());
  assert.equal((await tokenize(page)).paymentMethodId, 'master');
});

test('provider diagnostics never become a token or expose raw card details', async t => {
  const page = await pageFixture(t, { tokenError: true });
  await mount(page); await fill(page);
  const result = await tokenize(page).then(() => 'unexpected', error => String(error));
  assert.ok(!result.includes('must-never-be-forwarded'));
  assert.ok(result.includes('Confira os dados'));
});

test('missing configuration and overlapping forms fail without adding provider fields', async t => {
  const page = await pageFixture(t);
  await assert.rejects(page.evaluate(options => window.ramoCardFields.mount(JSON.stringify(options), () => {}), { ...options, publicKey: '' }));
  assert.equal(await page.locator('iframe').count(), 0);
  await mount(page);
  await assert.rejects(page.evaluate(options => window.ramoCardFields.mount(JSON.stringify(options), () => {}), { ...options, containerId: 'ramo-card-test-2' }));
  assert.equal(await page.locator('iframe').count(), 3);
});
