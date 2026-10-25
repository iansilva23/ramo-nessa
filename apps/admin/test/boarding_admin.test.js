import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoardingAdmin } from '../src/boarding-admin.js';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.value = ''; this.dataset = {}; }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  addEventListener(event, listener) { this.listeners[event] = listener; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t, writable = true) {
  const previous = { document: globalThis.document, confirm: globalThis.confirm };
  t.after(() => Object.assign(globalThis, previous));
  globalThis.document = { createElement: tag => new Element(tag) };
  globalThis.confirm = () => true;
  let section;
  const anchor = { before: node => { section = node; } };
  const root = { querySelector: selector => selector === '[data-manual-refunds]' ? anchor : null };
  const calls = [];
  const policy = { enabled: false, revision: 0, categories: { moto: true, car: true, buggy: true, delivery: true, comfort_black: true } };
  createBoardingAdmin({ root, getToken: () => 'memory-session', hasScope: () => writable,
    api: { boardingRequest: async (token, path, method = 'GET', body) => {
      calls.push({ token, path, method, body });
      return method === 'PUT' ? { ...body, revision: 1 } : structuredClone(policy);
    } },
  });
  await tick();
  const nodes = node => [node, ...node.children.flatMap(nodes)];
  return { calls, nodes: nodes(section) };
}

test('opening boarding settings never activates it; explicit save preserves category selection and revision', async t => {
  const { calls, nodes } = await fixture(t);
  const [enabled, ...categories] = nodes.filter(node => node.type === 'checkbox');
  assert.equal(enabled.checked, false);
  assert.deepEqual(calls.map(call => call.method), ['GET']);
  enabled.checked = true;
  categories[3].checked = false;
  nodes.find(node => node.tag === 'form').listeners.submit({ preventDefault() {} });
  await tick();
  assert.deepEqual(calls[1], { token: 'memory-session', path: '/v1/admin/boarding-policy', method: 'PUT', body: {
    enabled: true, revision: 0, categories: { moto: true, car: true, buggy: true, delivery: false, comfort_black: true },
  } });
  assert.equal(enabled.checked, true);
});

test('read-only staff cannot edit boarding settings or release a ride', async t => {
  const { nodes, calls } = await fixture(t, false);
  for (const node of nodes.filter(node => ['input', 'button', 'textarea'].includes(node.tag))) assert.equal(node.disabled, true);
  assert.equal(calls.length, 1);
});

test('support release sends the verified ride and reason to the audited endpoint', async t => {
  const { nodes, calls } = await fixture(t);
  const rideId = '11111111-1111-4111-8111-111111111111';
  nodes.find(node => node.tag === 'input' && node.required).value = rideId;
  nodes.find(node => node.tag === 'textarea').value = 'Suporte confirmou o encontro pessoalmente';
  nodes.filter(node => node.tag === 'form')[1].listeners.submit({ preventDefault() {} });
  await tick();
  assert.equal(calls[1].path, `/v1/admin/rides/${rideId}/boarding-override`);
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].body.reason, 'Suporte confirmou o encontro pessoalmente');
});
