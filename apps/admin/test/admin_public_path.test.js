import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const routing = app.slice(app.indexOf('const adminRoutes = Object.freeze({'), app.indexOf('function setMobileNavOpen('));
const loader = app.slice(app.indexOf('async function loadRouteMarkup('), app.indexOf('function syncRouteNavigation('));
const navigation = app.slice(app.indexOf('async function activateView('), app.indexOf('async function openSession('));

function harness() {
  const calls = [];
  const window = {
    location: { pathname: '/administrodo/' },
    scrollTo() {},
    history: Object.fromEntries(['pushState', 'replaceState'].map(method => [method, (_state, _title, path) => {
      calls.push({ method, path });
      window.location.pathname = path;
    }])),
  };
  let requestedView = 'overview';
  const context = vm.createContext({
    window,
    fetch: async (path, options) => {
      calls.push({ method: 'fetch', path, options });
      return { ok: true, text: async () => '<section></section>' };
    },
    DOMParser: class {
      parseFromString() { return { querySelector: () => ({ id: 'view-' + requestedView }) }; }
    },
    document: { importNode: panel => panel },
    routeLoading: { hidden: true },
    routeOutlet: { setAttribute() {}, removeAttribute() {}, replaceChildren() {} },
    canAccessView: () => true,
    stopFleetPolling() {}, closeDriverDocumentInspection() {}, destroyFleetMap() {},
    destroyLocalitiesAdmin() {}, destroyPricingGeofenceMap() {}, setMessage() {},
    syncRouteNavigation() {}, bindRouteEvents() {}, renderIdentity() {},
    updateSessionClock() {}, initializeRouteView() {}, errorMessage: String,
    globalMessage: {}, state: { staff: {} },
  });
  vm.runInContext(`let routeLoadSequence = 0, currentView = null;
    let siteAdmin = null, growthAdmin = null, companyCostsAdmin = null, geoAdmin = null;
    let promotionsAdmin = null, driverBenefitsAdmin = null;
    ${routing}\n${loader}\n${navigation}
    globalThis.router = { routes: adminRoutes, requestedViewFromLocation, routePath, loadRouteMarkup, activateView };`, context);
  return { calls, window, router: context.router, context, select: view => { requestedView = view; } };
}

test('all menu deep links resolve under administrodo, including trailing slashes', () => {
  const { router, window } = harness();
  for (const [view, route] of Object.entries(router.routes)) {
    assert.ok(route.path.startsWith('/administrodo/'));
    for (const path of [route.path, route.path + '/']) {
      window.location.pathname = path;
      assert.equal(router.requestedViewFromLocation(), view);
    }
  }
  window.location.pathname = '/administrodo/precos';
  assert.equal(router.requestedViewFromLocation(), 'pricing');
});

test('page loader requests every module under the new path', async () => {
  const { router, calls, select } = harness();
  for (const [view, route] of Object.entries(router.routes)) {
    select(view);
    assert.equal(await router.loadRouteMarkup(view), true);
    assert.equal(calls.at(-1).path, `/administrodo/pages/${route.page}.html`);
    assert.equal(calls.at(-1).options.redirect, 'error');
  }
});

test('navigation and session restoration keep new URLs and preserve permission fallback', async () => {
  const { router, calls, select, window, context } = harness();
  select('fleet');
  await router.activateView('fleet');
  assert.equal(calls.at(-1).method, 'pushState');
  assert.equal(window.location.pathname, '/administrodo/frota');
  select('pricing');
  await router.activateView('pricing', { historyMode: 'replace' });
  assert.equal(calls.at(-1).method, 'replaceState');
  assert.equal(window.location.pathname, '/administrodo/operacao-tarifas');
  context.canAccessView = () => false;
  select('overview');
  await router.activateView('finance');
  assert.equal(window.location.pathname, '/administrodo/visao-geral');
});

test('gateways do not serve old UI routes or redirect root to the new address', async () => {
  for (const path of ['../Caddyfile', '../../../deploy/staging/Caddyfile', '../../../deploy/prod/Caddyfile']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /handle_path \/administrodo\/\*/);
    assert.match(source, /redir \/administrodo \/administrodo\/ 308/);
    assert.doesNotMatch(source, /(?:handle_path|redir) \/admin(?:\/|\s)/);
    assert.doesNotMatch(source, /redir \/\s/);
    assert.match(source, /respond "Not Found" 404/);
    assert.match(source, /@api path \/v1\/\* \/health \/ready/);
  }
});
