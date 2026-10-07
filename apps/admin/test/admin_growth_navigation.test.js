import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const growth = await readFile(new URL('../src/growth-admin.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const router = app.slice(app.indexOf("document.addEventListener('click', (event) => {"), app.indexOf("document.addEventListener('keydown', (event) => {"));
const issueCard = growth.slice(growth.indexOf('  function issueCard('), growth.indexOf('  function renderIssues('));
class Element {
  constructor(tag, text = '', className = '') { this.tag = tag; this.textContent = text; this.className = className; this.dataset = {}; this.children = []; }
  append(...items) { this.children.push(...items); }
  closest() { return this.tag === 'a' && this.dataset.view ? this : null; }
}
function issueLinks(source, allowed = true) {
  const context = { node: (...args) => new Element(...args), labels: {}, formatDateTime: () => '', hasScope: () => allowed, listen: () => {} };
  vm.createContext(context);
  vm.runInContext(issueCard + `\nresult = issueCard({source: '${source}',severity:'warning',title:'Problema',evidence:'Evidência',causes:[],actions:[],at:'2026-10-06'}, true);`, context);
  return context.result.children.filter(n => n.tag === 'a');
}
function click(link, allowed) {
  let listener;
  const state = { token: 'session-kept-in-memory' }, destinations = [], messages = [];
  const context = { Element, state, adminRoutes: {rides: {}, support: {}, marketing: {}}, canAccessView: () => allowed, activateView: view => destinations.push(view), globalMessage: {}, setMessage: (_, message) => messages.push(message), document: {addEventListener: (_, handler) => {listener = handler;}} };
  vm.createContext(context); vm.runInContext(router, context);
  let prevented = false;
  listener({target: link, preventDefault: () => {prevented = true;}});
  // A document navigation would discard the in-memory session.
  if (!prevented) state.token = null;
  return {state, destinations, messages, prevented};
}
test('atalhos de problemas passam pelo roteador e preservam a sessão', () => {
  for (const [source, view, path] of [['ride','rides','viagens'],['support','support','suporte'],['marketing','marketing','marketing']]) {
    const links = issueLinks(source);
    assert.equal(links.length, 1);
    assert.equal(links[0].href, `/admin/${path}`);
    const result = click(links[0], true);
    assert.equal(result.prevented, true, `${source} não pode recarregar o documento`);
    assert.deepEqual(result.destinations, [view]);
    assert.equal(result.state.token, 'session-kept-in-memory');
    assert.equal(issueLinks(source, false).length, 0, 'sem permissão, o atalho não é exibido');
  }
});
test('permissão revogada bloqueia navegação sem descartar a sessão', () => {
  const result = click(issueLinks('support')[0], false);
  assert.equal(result.prevented, true);
  assert.equal(result.state.token, 'session-kept-in-memory');
  assert.deepEqual(result.destinations, []);
  assert.equal(result.messages.length, 1);
});
