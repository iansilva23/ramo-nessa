import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {pricingPublicationSummary, pricingPublicationPriceChanges} from '../src/pricing-publications-admin.js';

test('resumo compara alterações relevantes sem mutar o catálogo efetivo', () => {
  const current = {
    fixedRoutes: [{id:'prea-jijoca-car', dayCents:13000, after22Cents:15000}],
    localities: {prea:[{localityId:'cavalo-bravo',prices:{car:{kind:'exact',amountCents:4200}}}],jijoca:[]},
    localityPolicies: {prea:[],jijoca:[]},
    commissionBps: 1000,
  };
  const original = structuredClone(current);
  const draft = structuredClone(current);
  draft.fixedRoutes[0].dayCents = 14000;
  draft.localities.prea[0].prices.car.amountCents = 4700;
  const summary = pricingPublicationSummary(current, draft);
  assert.deepEqual(summary, ['Rotas fixas','Tarifas de localidades']);
  const priceChanges = pricingPublicationPriceChanges(current, draft);
  assert.equal(priceChanges.length, 2);
  assert.ok(priceChanges.some(row =>
    row.key === 'route:prea-jijoca-car' && row.after.includes('140,00')));
  assert.ok(priceChanges.some(row =>
    row.key === 'prea:cavalo-bravo:car' && row.after.includes('47,00')));
  assert.deepEqual(current, original);
  assert.deepEqual(pricingPublicationSummary(current, current), []);

});

test('nova central publica só por ação explícita, com permissão e revisão', () => {
  const app = readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const html = readFileSync(new URL('../pages/pricing-publications.html',import.meta.url),'utf8');
  const code = readFileSync(new URL('../src/pricing-publications-admin.js',import.meta.url),'utf8');
  const pricing = readFileSync(new URL('../pages/pricing.html',import.meta.url),'utf8');
  const localities = readFileSync(new URL('../pages/localities.html',import.meta.url),'utf8');

  assert.match(app, /createPricingPublicationsAdmin/);
  assert.match(app, /\/administrodo\/rascunhos-publicacoes/);
  for (const id of [
    'publication-drafts','publication-history','publication-diff',
    'publication-confirm-review','publication-publish','publication-discard',
    'publication-message',
  ]) assert.ok(html.includes('id="'+id+'"'));
  assert.match(html, /id="publication-publish"[^>]*disabled/);
  assert.match(code, /hasScope\('pricing:write'\)/);
  assert.match(code, /getPricingVersion\(getToken\(\), versionId\)/);
  assert.match(code, /fresh\.version\.updatedAt !== original\.updatedAt/);
  assert.match(code, /window\.confirm/);
  assert.match(code, /expectedUpdatedAt: original\.updatedAt/);
  assert.match(code, /api\.publishPricingVersion/);
  assert.match(code, /api\.deletePricingVersion/);
  assert.ok(!code.includes('localStorage'));
  assert.ok(!code.includes('sessionStorage'));
  assert.ok(!code.includes('.innerHTML'));
  assert.match(pricing, /href="\/administrodo\/rascunhos-publicacoes"[^>]*data-view="pricing-publications"/);
  assert.match(localities, /href="\/administrodo\/rascunhos-publicacoes"[^>]*data-view="pricing-publications"/);
  assert.match(localities, /class="publication-legacy-controls" hidden/);
});

test('originais ficam protegidos: não muda motor e mantém rotas prévias', () => {
  const index = readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index, /data-view="pricing"/);
  assert.match(index, /data-view="localities"/);
  assert.match(index, /data-view="pricing-publications"/);
  const code = readFileSync(new URL('../src/pricing-publications-admin.js',import.meta.url),'utf8');
  assert.ok(!code.includes('fetch('), 'Todas as operações devem usar o cliente API com MFA');
  assert.ok(!code.includes('setInterval('));
});
