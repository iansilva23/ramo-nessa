import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createDriverBenefitsAdmin } from '../src/driver-benefits-admin.js';

// Minimal DOM adapter exercises the controller's actual asynchronous handlers.
// HTTP/session/database authorization is separately exercised by the stack smoke.
async function controlsFixture(t, write = true) {
  const source = await readFile(new URL('../pages/benefits.html', import.meta.url), 'utf8');
  const nodes = [];
  const ids = new Map();
  class Element {
    constructor(tag, id = '') {
      this.tag = tag; this.id = id; this.dataset = {}; this.children = [];
      this.listeners = new Map(); this.value = ''; this.textContent = ''; this.disabled = false;
      nodes.push(this);
    }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.append(...children); }
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
    removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item !== listener)); }
    click() { if (!this.disabled) for (const listener of this.listeners.get('click') ?? []) listener({ preventDefault() {} }); }
    closest(selector) {
      for (let node = this; node; node = node.parent) if (`#${node.id}` === selector) return node;
      return null;
    }
    get options() { return this.children.filter(node => node.tag === 'option'); }
    get selectedOptions() { return this.options.filter(node => node.selected); }
    reset() {}
    scrollIntoView() {}
  }
  const root = new Element('section', 'view-benefits');
  for (const match of source.matchAll(/<([a-z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    if (match[2] === 'view-benefits') continue;
    const node = new Element(match[1], match[2]); ids.set(node.id, node); root.append(node);
  }
  for (const form of source.matchAll(/<form\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)) {
    for (const field of form[2].matchAll(/\bid="([^"]+)"/g)) {
      const node = ids.get(field[1]); node.parent = ids.get(form[1]);
    }
  }
  root.querySelector = selector => ids.get(selector.slice(1));
  root.querySelectorAll = selector => nodes.filter(node => selector.split(',').includes(node.tag) && node.closest('#view-benefits'));
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  const instant = Date.now();
  let campaign = { id: 'campaign-controls', name: 'Campanha de controle', category: 'moto',
    status: 'draft', effectiveStatus: 'draft', startsAt: new Date(instant - 60000).toISOString(),
    endsAt: new Date(instant + 3600000).toISOString(), topCount: 1, minParticipants: 2,
    participantMode: 'eligible', regions: [], missions: [], prizes: [], updatedAt: new Date(instant).toISOString() };
  const calls = [];
  const controller = createDriverBenefitsAdmin({ root, getToken: () => 'session',
    hasScope: scope => scope === 'drivers:benefits:read' || (write && scope === 'drivers:benefits:write'),
    api: {
      driverBenefits: async () => ({ settings: { enabled: false }, campaigns: [structuredClone(campaign)] }),
      setDriverBenefitCampaignStatus: async (token, id, status, revision) => {
        assert.equal(token, 'session'); assert.equal(id, campaign.id); assert.equal(revision, campaign.updatedAt);
        calls.push(status);
        campaign = { ...campaign, status, effectiveStatus: status, updatedAt: new Date(Date.parse(campaign.updatedAt) + 1).toISOString() };
      },
    },
  });
  t.after(() => { controller.destroy(); globalThis.document = previous; });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  const button = label => root.querySelectorAll('button').find(node => node.textContent === label);
  return { root, ids, button, calls, settle };
}

test('ações do ADM são reabilitadas após atualizar status e recarregar campanhas', async t => {
  const { button, calls, settle } = await controlsFixture(t);
  assert.equal(button('Ativar').disabled, false);
  button('Ativar').click(); await settle();
  assert.deepEqual(calls, ['active']);
  assert.equal(button('Pausar').disabled, false, 'ação seguinte continua disponível após reload');
  button('Pausar').click(); await settle();
  assert.deepEqual(calls, ['active', 'paused']);
  assert.equal(button('Retomar').disabled, false);
});

test('consulta permanece disponível sem habilitar controles de escrita', async t => {
  const { ids, button } = await controlsFixture(t, false);
  assert.equal(button('Ver ranking').disabled, false);
  assert.equal(button('Ativar'), undefined);
  assert.equal(ids.get('benefits-global-toggle').disabled, true);
  assert.equal(ids.get('benefit-save').disabled, true);
});
