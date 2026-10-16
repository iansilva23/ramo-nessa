import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { webSecurityPolicy } from './web_security_policy.mjs';
import { prepareBrowserSessionRequest, browserAuthResponse, clearBrowserSessionCookie,
  BrowserSessionTransportError } from '../../backend/core/dist/src/auth/browser-session-transport.js';
import { browserName, launchTestBrowser } from './browser_test_runtime.mjs';
const role = process.env.RAMO_WEB_TEST_ROLE;
const installed = process.env.RAMO_TOUCH_MODE === 'standalone';
if (!['passenger', 'driver'].includes(role)) throw new Error('Specify RAMO_WEB_TEST_ROLE');
const root = resolve(new URL('../../apps/' + role + '/build/web/', import.meta.url).pathname);
const prefix = role === 'passenger' ? '/passageiro/' : '/motorista/';
test(browserName + '/' + role + ': mobile coordinate audit (simulated standalone=' + installed + ')', { timeout: 120000 }, async t => {
  let origin, session, publicHandle;
  let loginCalls = 0;
  const privateCredential = 'fixture-private-cookie-' + role + '-abcdefghijklmnopqrstuvwxyz';
  const certificates = await mkdtemp(resolve(tmpdir(), 'ramo-csp-tls-'));
  const keyFile = resolve(certificates, 'key.pem'), certFile = resolve(certificates, 'cert.pem');
  // Disposable loopback certificate only. Production TLS verification is unchanged.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  t.after(() => rm(certificates, { recursive: true, force: true }));
  const server = createServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/v1/')) {
      if (path === '/v1/auth/web/session') response.setHeader('x-ramo-web-session', '1');
      response.setHeader('content-type', 'application/json'); response.setHeader('cache-control', 'no-store');
      try {
        const authenticatedRole = prepareBrowserSessionRequest(request, { cookieBootstrap: path === '/v1/auth/web/session' && request.method === 'GET' });
        if (path === '/v1/auth/otp/request') {
          response.writeHead(202); response.end(JSON.stringify({ challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            expiresAt: new Date(Date.now() + 60000).toISOString(), retryAfterSeconds: 0 })); return;
        }
        if (path === '/v1/auth/otp/verify' || path === '/v1/auth/passenger/password/login') {
          session = { accessToken: privateCredential, subjectType: role, subjectId: 'compiled-session-' + role,
            expiresAt: new Date(Date.now() + 600000).toISOString(), tokenType: 'Bearer' };
          const body = browserAuthResponse(request, response, session); publicHandle = body.accessToken; loginCalls++;
          response.writeHead(201); response.end(JSON.stringify(body)); return;
        }
        if (!session || authenticatedRole !== role || request.headers.authorization !== 'Bearer ' + privateCredential) {
          response.writeHead(401); response.end('{}'); return;
        }
        if (path === '/v1/auth/session' && request.method === 'DELETE') {
          session = null; clearBrowserSessionCookie(request, response); response.writeHead(204); response.end(); return;
        }
        if (path === '/v1/auth/web/session') {
          response.end(JSON.stringify(browserAuthResponse(request, response, session, { setCookie: false }))); return;
        }
        if (path === '/v1/auth/me/check') {
          response.end(JSON.stringify({ subjectId: session.subjectId, subjectType: role, expiresAt: session.expiresAt })); return;
        }
        response.writeHead(404); response.end('{}'); return;
      } catch (error) {
        response.writeHead(error instanceof BrowserSessionTransportError ? error.status : 500);
        response.end('{}'); return;
      }
    }

    if (!path.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    const file = resolve(root, decodeURIComponent(path.slice(prefix.length)) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(404); response.end(); return; }
    try {
      const content = await readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
        '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[extname(file)] ?? 'application/octet-stream';
      response.writeHead(200, { 'content-type': type, 'content-security-policy': webSecurityPolicy(role, origin), 'cache-control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  origin = 'https://127.0.0.1:' + server.address().port;
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await launchTestBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    // Login does not instantiate a map; prevent provider calls with CI placeholder.
    if (url.origin === 'https://maps.googleapis.com' && url.pathname === '/maps/api/js') {
      return route.fulfill({ contentType: 'text/javascript', body: 'globalThis.google = { maps: {} };' });
    }
    remote.push(url.origin); return route.abort();
  });
  await page.addInitScript(() => {
    globalThis.bundleViolations = [];
    addEventListener('securitypolicyviolation', event => bundleViolations.push({ directive: event.effectiveDirective, uri: event.blockedURI }));
  });
  await page.addInitScript(installed => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: installed });
    window.touchFixture = { calls: 0, permission: 'prompt' };
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({state: touchFixture.permission}) } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success) { touchFixture.calls++;touchFixture.permission='granted';success({coords:{latitude:0,longitude:0}}); },
    } });
  }, installed);
  const login = await page.request.post(origin + (role === 'passenger' ? '/v1/auth/passenger/password/login' : '/v1/auth/otp/verify'), {
    headers: { origin, 'sec-fetch-site': 'same-origin', 'x-ramo-web-role': role, 'x-ramo-web-session': '1' }, data: {},
  });
  assert.equal(login.status(), 201);
  const evidence = resolve('artifacts/touch-audit'); await mkdir(evidence, { recursive: true });
  const label = browserName + '-' + role + '-' + (installed ? 'standalone' : 'safari');
  const reports = [];
  async function settlePaint() {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(300);
  }
  async function canvasButton(name) {
    await settlePaint();
    const file = resolve(evidence, label + '-' + name + '.png');
    await page.screenshot({path:file});
    const coordinates = JSON.parse(execFileSync('python3', ['-c', `
from PIL import Image
import json,sys
im=Image.open(sys.argv[1]).convert('RGB'); w,h=im.size
rows=[]
for y in range(h):
 count=sum(1 for r,g,b in [im.getpixel((x,y)) for x in range(w)] if r>235 and 175<g<225 and b<45)
 if count>w*.55: rows.append(y)
groups=[]
for y in rows:
 if not groups or y>groups[-1][-1]+1:groups.append([y])
 else:groups[-1].append(y)
groups=[g for g in groups if len(g)>w/430*24]
if len(groups)!=1:raise Exception('Expected one visible primary button, found '+str(len(groups)))
g=groups[0];ratio=w/430
print(json.dumps({'x':215,'y':(g[0]+g[-1])/2/ratio,'top':g[0]/ratio,'bottom':g[-1]/ratio}))
`, file], {encoding:'utf8'}));
    return coordinates;
  }
  try {
    for (const anchor of [false,true]) {
      await page.goto(origin + prefix);
      await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
      if(anchor)await page.addStyleTag({content:'flutter-view > flt-semantics-host {left:0 !important;top:0 !important;}'});
      await page.locator('flt-semantics-placeholder').dispatchEvent('click');
      if(!installed){
        const skip=page.getByRole('button',{name:'Continuar no navegador por enquanto',exact:true});
        await skip.waitFor({timeout:30000});await skip.click();
      }
      const button=page.getByRole('button',{name:'Ativar localização',exact:true});await button.waitFor({timeout:30000});
      const position=await canvasButton(anchor?'anchored-before':'baseline-before');
      const dom=await button.boundingBox();
      const metrics=await page.evaluate(()=>{
        const box=document.querySelector('flutter-view').getBoundingClientRect();
        const host=document.querySelector('flt-semantics-host').getBoundingClientRect();
        return {viewport:{width:innerWidth,height:innerHeight,scale:visualViewport?.scale,offsetTop:visualViewport?.offsetTop,offsetLeft:visualViewport?.offsetLeft},scrollY,view:{x:box.x,y:box.y,width:box.width,height:box.height},semantics:{x:host.x,y:host.y,width:host.width,height:host.height}};
      });
      await page.touchscreen.tap(position.x,position.y);
      await page.waitForTimeout(600);
      const calls=await page.evaluate(()=>touchFixture.calls);
      const confirmed=await page.getByRole('button',{name:'Continuar',exact:true}).isVisible();
      await settlePaint();await page.screenshot({path:resolve(evidence,label+'-'+(anchor?'anchored':'baseline')+'-after.png')});
      reports.push({anchor,drawn:position,interactive:dom,centerDelta:dom?{x:dom.x+dom.width/2-position.x,y:dom.y+dom.height/2-position.y}:null,metrics,locationCalls:calls,permissionConfirmed:confirmed});
    }
    await writeFile(resolve(evidence,label+'.json'),JSON.stringify({role,installedSimulation:installed,physicalIos:false,reports},null,2));
    console.log(JSON.stringify({role,installedSimulation:installed,physicalIos:false,reports}));
    assert.equal(loginCalls,1,'App must recover the existing session without a second login');
    assert.deepEqual(errors,[]);assert.deepEqual([...new Set(remote)],[]);
    assert.equal(reports[1].locationCalls,1,'Anchored control: a physical tap on the painted GPS button should request GPS exactly once');
    assert.equal(reports[1].permissionConfirmed,true);
  } finally {
    await page.screenshot({path:resolve(evidence,label+'-final.png')});
  }
});
