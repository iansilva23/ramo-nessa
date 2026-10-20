// Browser smoke on a loopback-only server with simulated API and no external traffic.
// No production database, providers, credentials, or payouts are contacted.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dummyToken = 'rn_admin_session_isolated_browser_smoke';
const versionId = '11111111-1111-4111-8111-111111111111';
const fixture = () => ({
  authority: 'core', catalogVersion: 'browser-smoke', mode: 'static', editable: false,
  commissionBps: 1000, categories: ['moto','car','comfort_black','buggy','delivery'],
  categoryPolicies: [], zones: ['prea','jijoca','jericoacoara','external'], zonePolicies: [],
  periodPolicy: {nightStartHour:22,dayStartHour:6},
  pickupPolicy: {freeKm:0,fuelPriceCentsPerLiter:700,motoReferenceKmPerLiter:30,carReferenceKmPerLiter:10},
  commercialPolicy: {
    revision:'browser-fixture', jijocaNightBps:3000,jijocaComfortCents:2000,
    preaBuggyAfter22Cents:500, buggyPerAdditionalPassengerCents:200,
    deliveryBaseCents:500,deliveryIncludedKm:5,deliveryPerExcessKmCents:200,
    jeriTransferDestinationIds:[],
  },
  sharedTransfers:{enabled:false,routes:[]},
  surcharges:{preaComfortCents:2000,preaLocalCarAfter22Cents:500,preaLocalCarAfter22LocalityIds:['cavalo-bravo']},
  jeri:{buggy:{dayBaseCents:4000,after22BaseCents:6000,minPassengers:1,maxPassengers:4,perPassengerCents:200},deliveryBands:[],deliveryAboveMaxCents:900},
  localityDisplayNames:{prea:{'cavalo-bravo':'Cavalo Bravo'},jijoca:{},external:{}},
  localities:{
    prea:[{localityId:'cavalo-bravo',prices:{car:{kind:'exact',amountCents:4200},moto:{kind:'exact',amountCents:1200},after22:{}},
      policy:{enabledCategories:['car','moto'],applyNightSurcharge:true}}],
    jijoca:[],
  },
  fixedRoutes:[{id:'prea-jijoca-car',a:'prea',b:'jijoca',category:'car',dayCents:13000,after22Cents:15000}],
  distanceFarePolicies:[],
});
const published = fixture();
let draft = null;
let draftCatalog = null;
let publishRequests = 0;
let updateRequests = 0;

function sendJson(response, status, value) {
  response.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  response.end(JSON.stringify(value));
}
async function receiveJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}
async function handleRequest(request, response) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname;
  const method = request.method ?? 'GET';
  if (pathname.startsWith('/v1/admin/')) {
    const data = method === 'GET' ? {} : await receiveJson(request);
    if (pathname === '/v1/admin/auth/login' && method === 'POST') {
      return sendJson(response, 200, {
        accessToken:dummyToken,
        expiresAt:'2030-01-01T00:00:00.000Z',
        user:{id:'qa-browser',name:'Auditoria fictícia',email:'auditoria@example.test',scopes:['pricing:read','pricing:write']},
      });
    }
    if (pathname === '/v1/admin/pricing/catalog' && method === 'GET') {
      return sendJson(response, 200, published);
    }
    if (pathname === '/v1/admin/pricing/versions') {
      if (method === 'GET') return sendJson(response, 200, {items:draft ? [draft] : [],effectiveVersionId:null});
      if (method === 'POST') {
        assert.equal(draft, null, 'Only one dummy draft is allowed');
        draft = {id:versionId,versionNumber:2,status:'draft',updatedAt:'2026-10-19T12:00:00.000Z',catalogVersion:'browser-smoke'};
        draftCatalog = structuredClone(published);
        return sendJson(response, 201, draft);
      }
    }
    if (pathname === '/v1/admin/pricing/versions/' + versionId) {
      if (method === 'GET' && draft) return sendJson(response, 200, {version:draft,catalog:draftCatalog});
      if (method === 'PATCH' && draft) {
        updateRequests++;
        if (data.expectedUpdatedAt !== draft.updatedAt) {
          return sendJson(response,409,{error:'VERSION_CONFLICT',message:'Conflito de rascunho'});
        }
        if (data.kind !== 'locality_price' || data.hub !== 'prea' ||
            data.localityId !== 'cavalo-bravo' || data.category !== 'car' ||
            data.period !== 'day' || data.price?.kind !== 'exact') {
          return sendJson(response,422,{error:'INVALID_PATCH',message:'Fora do cenário isolado'});
        }
        draftCatalog.localities.prea[0].prices.car = {...data.price};
        draft.updatedAt = '2026-10-19T12:01:00.000Z';
        return sendJson(response, 200, {version:draft,catalog:draftCatalog});
      }
    }
    if (pathname.endsWith('/publish')) publishRequests++;
    return sendJson(response, 403, {error:'SAFE_BROWSER_FIXTURE',message:'Operação bloqueada no teste'});
  }
  // Serve only local static ADM assets and the login page; never forward requests.
  let file = '';
  if (pathname === '/administrodo/operacao-tarifas' || pathname === '/administrodo/') {
    file = resolve(root, 'index.html');
  } else if (pathname.startsWith('/administrodo/')) {
    file = resolve(root, pathname.slice('/administrodo/'.length));
  } else {
    response.writeHead(404); response.end('Not found'); return;
  }
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  try {
    const bytes = await readFile(file);
    const ext = extname(file);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' :
      ext === '.css' ? 'text/css' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    response.writeHead(200, {'content-type':type+'; charset=utf-8','cache-control':'no-store'});
    response.end(bytes);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}
const server = createServer((req,res) => { void handleRequest(req,res).catch(error => {
  console.error('Mock server error:', error.message);
  if (!res.headersSent) sendJson(res,500,{error:'MOCK_ERROR'});
  else res.end();
}); });
await new Promise(resolveReady => server.listen(0,'127.0.0.1',resolveReady));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = 'http://127.0.0.1:' + address.port;
let browser;
try {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:800}});
  await context.route('**/*', route => {
    if (route.request().url().startsWith(base + '/')) return route.continue();
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base+'/administrodo/operacao-tarifas',{waitUntil:'domcontentloaded'});
  await page.locator('#login-email').fill('auditoria@example.test');
  await page.locator('#login-password').fill('fictitious-password-123');
  await page.locator('#login-totp').fill('123456');
  await page.locator('#login-form button[type="submit"]').click();
  await page.locator('#pricing-complete-body tr').first().waitFor({timeout:15000});
  assert.ok((await page.locator('#pricing-complete-body tr').count()) >= 2,'Pricing table not rendered');
  await page.locator('#pricing-rate-search').fill('Cavalo');
  await page.locator('#pricing-rate-category').selectOption('car');
  await page.waitForFunction(() =>
    document.querySelectorAll('#pricing-complete-body tr').length===1);
  const row = page.locator('#pricing-complete-body tr').first();
  assert.match(await row.innerText(),/Cavalo Bravo/);
  assert.match(await row.innerText(),/42,00/);
  await row.locator('button').filter({hasText:'Dia'}).click();
  assert.equal(updateRequests,0,'Read-only state cannot send price changes');

  await page.locator('#pricing-create-draft-button').click();
  await page.waitForFunction(() => document.querySelector('#pricing-editor-status')?.textContent === 'Rascunho', {timeout:15000});
  await row.locator('button').filter({hasText:'Dia'}).click();
  assert.equal(await page.locator('#pricing-edit-kind').inputValue(),'locality_price');
  assert.equal(await page.locator('#pricing-locality-period').inputValue(),'day');
  await page.locator('#pricing-locality-min').fill('47,00');
  await page.locator('#pricing-save-draft-button').click();
  await page.waitForFunction(() => document.querySelector('#pricing-complete-body')?.textContent?.includes('47,00'));
  assert.equal(updateRequests,1);
  assert.equal(draft?.status,'draft');
  assert.equal(draftCatalog.localities.prea[0].prices.car.amountCents,4700);
  assert.equal(published.localities.prea[0].prices.car.amountCents,4200,'Published fixture changed unexpectedly');
  assert.equal(publishRequests,0,'Saving a draft must never publish it');

  // Separate publication center: preview only; no accidental publish.
  await page.locator('.sidebar-nav [data-view="pricing-publications"]').click();
  await page.locator('#publication-drafts .publication-draft-button').first().waitFor({timeout:15000});
  await page.waitForFunction(() =>
    document.querySelector('#publication-selected-title')?.textContent?.includes('#2'));
  assert.match(await page.locator('#publication-active').innerText(),/Catálogo padrão/);
  assert.match(await page.locator('#publication-diff').innerText(),/Tarifas de localidades/);
  assert.equal(await page.locator('#publication-publish').isDisabled(),true,
    'Publication requires an explicit review confirmation');
  assert.equal(publishRequests,0,'Navigating to publication center never publishes');

  const evidenceDir = resolve(root, 'pricing-browser-artifacts');
  await mkdir(evidenceDir, {recursive:true});
  await page.screenshot({
    path:resolve(evidenceDir,'pricing-publications-desktop-1280.png'),
    fullPage:true, animations:'disabled',
  });
  await page.locator('.sidebar-nav [data-view="pricing"]').click();
  await page.locator('#pricing-complete-body tr').first().waitFor({timeout:15000});

  // Reload creates a fresh browser app session while preserving only mock draft state.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#login-email').fill('auditoria@example.test');
  await page.locator('#login-password').fill('fictitious-password-123');
  await page.locator('#login-totp').fill('123456');
  await page.locator('#login-form button[type="submit"]').click();
  await page.locator('#pricing-complete-body tr').first().waitFor({timeout:15000});
  await page.locator('#pricing-rate-search').fill('Cavalo');
  await page.locator('#pricing-rate-category').selectOption('car');
  await page.waitForFunction(() =>
    document.querySelector('#pricing-complete-body')?.textContent?.includes('47,00'));
  assert.equal(publishRequests,0);
  assert.deepEqual(errors,[],'Browser JavaScript errors');
  await page.screenshot({path:resolve(evidenceDir,'pricing-desktop-1280.png'), fullPage:true, animations:'disabled'});
  console.log('PASS Chromium localhost-only: login, price matrix, filters, draft gating, edit, reload, no publication');
  await context.close();

  // Independent browser sessions: mobile web is responsive, not a separate Flutter build.
  // Screenshots show synthetic data only and are saved exclusively in CI artifacts.
  for (const [width,height] of [[390,844],[320,720],[768,1024]]) {
    const mobileContext = await browser.newContext({
      viewport:{width,height}, isMobile:true, hasTouch:true, deviceScaleFactor:1,
    });
    try {
      await mobileContext.route('**/*', route => {
        if (route.request().url().startsWith(base + '/')) return route.continue();
        return route.abort('blockedbyclient');
      });
      const mobile = await mobileContext.newPage();
      const mobileErrors = [];
      mobile.on('pageerror',error => mobileErrors.push(error.message));
      await mobile.goto(base+'/administrodo/operacao-tarifas',{waitUntil:'domcontentloaded'});
      await mobile.locator('#login-email').fill('auditoria@example.test');
      await mobile.locator('#login-password').fill('fictitious-password-123');
      await mobile.locator('#login-totp').fill('123456');
      await mobile.locator('#login-form button[type="submit"]').click();
      await mobile.locator('#pricing-complete-body tr').first().waitFor({timeout:15000});
      await mobile.locator('#pricing-rate-search').fill('Cavalo');
      await mobile.locator('#pricing-rate-region').selectOption('prea');
      await mobile.locator('#pricing-rate-category').selectOption('car');
      await mobile.waitForFunction(() => document.querySelectorAll('#pricing-complete-body tr').length === 1);
      assert.match(await mobile.locator('#pricing-complete-body tr').first().innerText(),/47,00/);
      const sizes = await mobile.evaluate(() => {
        const wrap = document.querySelector('#pricing-all-rates .table-wrap');
        const filters = [...document.querySelectorAll('.pricing-complete-filters > .field')];
        const doc = document.documentElement;
        return {
          viewport:doc.clientWidth, content:doc.scrollWidth,
          wrapWidth:wrap?.clientWidth ?? 0, tableWidth:wrap?.scrollWidth ?? 0,
          filters:filters.map(el=>({
            left:el.getBoundingClientRect().left,
            right:el.getBoundingClientRect().right,
          })),
        };
      });
      await mobile.screenshot({
        path:resolve(evidenceDir,'pricing-mobile-'+width+'.png'),
        fullPage:true,animations:'disabled',
      });
      assert.ok(sizes.content <= sizes.viewport + 3,
        'Horizontal page overflow at ' + width + 'px: ' + JSON.stringify(sizes));
      assert.ok(sizes.tableWidth > sizes.wrapWidth,
        'Price table should scroll inside its container at ' + width + 'px');
      for (const rect of sizes.filters) {
        assert.ok(rect.left >= -1 && rect.right <= sizes.viewport + 1,
          'Pricing filter clipped at ' + width + 'px: ' + JSON.stringify(rect));
      }
      await mobile.locator('#pricing-complete-body tr').first().locator('button').filter({hasText:'Noite'}).click();
      assert.equal(await mobile.locator('#pricing-locality-period').inputValue(),'after_22');
      assert.equal(publishRequests,0,'Mobile interaction must not publish');
      // New independent draft center must fit narrow screens and stay read-only
      // until the operator explicitly approves the version.
      await mobile.locator('#mobile-menu-button').click();
      await mobile.locator('.sidebar-nav [data-view="pricing-publications"]').click();
      await mobile.locator('#publication-drafts .publication-draft-button')
        .first().waitFor({timeout:15000});
      await mobile.waitForFunction(() =>
        document.querySelector('#publication-selected-title')?.textContent?.includes('#2'));
      assert.equal(await mobile.locator('#publication-publish').isDisabled(),true);
      const publicationSizes = await mobile.evaluate(() => ({
        viewport:document.documentElement.clientWidth,
        content:document.documentElement.scrollWidth,
      }));
      assert.ok(publicationSizes.content <= publicationSizes.viewport + 3,
        'Draft center overflow at '+width+'px: '+JSON.stringify(publicationSizes));
      await mobile.screenshot({
        path:resolve(evidenceDir,'pricing-publications-mobile-'+width+'.png'),
        fullPage:true,animations:'disabled',
      });
      assert.equal(publishRequests,0,'Viewing draft center must never publish');
      assert.deepEqual(mobileErrors,[],'Mobile browser JS error at '+width+'px');
      console.log('PASS mobile Chromium '+width+'x'+height+
        ': filters, horizontal containment, night editor, screenshot');
    } finally {
      await mobileContext.close();
    }
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
