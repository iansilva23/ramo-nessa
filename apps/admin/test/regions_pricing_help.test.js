import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pricingGuide, searchPricingGuide, helpTopicForLabel, helpTopicForCheck} from '../src/help/regions-pricing-guide.js';

test('manual chapters have a valid index, meaningful content and no dangling links', () => {
  const ids = new Set(pricingGuide.map(c => c.id));
  assert.equal(ids.size, pricingGuide.length);
  assert.ok(ids.has('start'));
  for (const c of pricingGuide) {
    assert.ok(c.title && c.summary && c.group && c.sources.length, c.id);
    assert.ok(c.sections.length >= 2, c.id);
    for (const s of c.sections) {
      assert.ok(s.title && s.paragraphs.length + s.rows.length + s.steps.length > 0, c.id);
      s.rows.forEach(row => assert.equal(row.length, 2));
    }
    c.related.forEach(id => assert.ok(ids.has(id) && id !== c.id, c.id + ' → ' + id));
  }
});
test('search finds explanations inside paragraphs, fields and steps without accents or case', () => {
  assert.ok(searchPricingGuide('largura inteira').some(c => c.id === 'map'));
  assert.ok(searchPricingGuide('QUILOMETRO').some(c => c.id === 'distance'));
  assert.ok(searchPricingGuide('municipio obrigatorio').some(c => c.id === 'region'));
  assert.ok(searchPricingGuide('codigo MFA').some(c => c.id === 'security'));
  assert.equal(searchPricingGuide('   ').length, pricingGuide.length);
  assert.deepEqual(searchPricingGuide('termo-inexistente-xyz'), []);
  assert.deepEqual(searchPricingGuide('<img src=x onerror=alert(1)>'), []);
  assert.equal(searchPricingGuide(null).length, pricingGuide.length);
});
test('every literal editor field and operational checkbox has a contextual explanation', async () => {
  const controller = await readFile(new URL('../src/regions-pricing-admin.js', import.meta.url), 'utf8');
  const ids = new Set(pricingGuide.map(c => c.id));
  for (const [, label] of controller.matchAll(/field\('([^']+)'/g)) {
    assert.ok(ids.has(helpTopicForLabel[label]), 'Campo sem ajuda: ' + label);
  }
  for (const [, label] of controller.matchAll(/check\('([^']+)'/g)) {
    assert.ok(ids.has(helpTopicForCheck[label]), 'Opção sem ajuda: ' + label);
  }
  const page = await readFile(new URL('../pages/regions-pricing.html', import.meta.url), 'utf8');
  for (const [, topic] of page.matchAll(/data-pricing-help="([^"]+)"/g)) assert.ok(ids.has(topic), topic);
});
