// Anonymous real-provider initialization only: never types card data, tokenizes or charges.
import assert from 'node:assert/strict';
import test from 'node:test';
import{readFile}from'node:fs/promises';
import{createServer}from'node:http';
import{once}from'node:events';
import{webSecurityPolicy}from'./web_security_policy.mjs';
import{secureFieldOrigins}from'../../deploy/staging/fix-web-card-csp.mjs';
import{launchTestBrowser,browserName}from'./browser_test_runtime.mjs';
const bridge=await readFile(new URL('../../apps/passenger/web/ramo_card_fields.js',import.meta.url));
let server,browser,origin;
const bootstrap=`import '/bridge.js';
globalThis.cardProbe={states:[]};
ramoCardFields.mount(JSON.stringify({containerId:'ramo-card-real-probe',publicKey:'TEST-public-key-real-sdk-probe-123456789',amountCents:4000}),s=>cardProbe.states.push(JSON.parse(s))).then(()=>cardProbe.result='ready',e=>{cardProbe.result='error';cardProbe.error=e.message;});`;
test.before(async()=>{
 server=createServer((req,res)=>{
  let policy=webSecurityPolicy('passenger',origin);
  if(req.url==='/broken')for(const host of secureFieldOrigins)policy=policy.replace(host+' ','');
  res.setHeader('Content-Security-Policy',policy);res.setHeader('Cache-Control','no-store');
  if(req.url==='/bridge.js'){res.setHeader('Content-Type','text/javascript');res.end(bridge);return;}
  if(req.url==='/probe.js'){res.setHeader('Content-Type','text/javascript');res.end(bootstrap);return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><script type="module" src="/probe.js"></script></head><body><div id="ramo-card-real-probe" style="width:390px;height:180px"></div></body></html>');
 });server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 browser=await launchTestBrowser();
});
test.after(async()=>{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
for(const mode of ['broken','fixed'])test(browserName+': real SDK '+(mode==='broken'?'reproduces denied preflight':'initializes all protected fields under the fixed policy'),{timeout:60000},async t=>{
 const page=await browser.newPage({viewport:{width:430,height:850}});t.after(()=>page.close());
 const forbidden=[];const requests=[];
 // A diagnostic must never submit tokens, order requests or real payment data.
 await page.route('**/*',route=>{
  const r=route.request(),url=new URL(r.url());requests.push(url.origin+url.pathname);
  if(url.origin===origin&&url.pathname.startsWith('/v1/')||/\/(?:card_tokens|orders|payments)(?:\/|$)/.test(url.pathname)&&r.method()!=='GET'){
   forbidden.push(url.origin+url.pathname);return route.abort();
  }
  return route.continue();
 });
 await page.addInitScript(()=>{globalThis.cardViolations=[];addEventListener('securitypolicyviolation',e=>cardViolations.push({directive:e.effectiveDirective,url:e.blockedURI}));});
 await page.goto(origin+'/'+mode,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.cardProbe?.result,undefined,{timeout:45000});
 const probe=await page.evaluate(()=>cardProbe),violations=await page.evaluate(()=>cardViolations);
 assert.deepEqual(forbidden,[]);
 if(mode==='broken'){
  assert.equal(probe.result,'error',JSON.stringify({probe,violations}));
  for(const host of secureFieldOrigins)assert(violations.some(v=>v.directive==='connect-src'&&v.url.startsWith(host)),JSON.stringify(violations));
  assert.equal(await page.locator('iframe').count(),0);
 }else{
  assert.equal(probe.result,'ready',JSON.stringify({probe,violations,requests}));
  assert.equal(probe.states.at(-1).ready,true);assert.equal(probe.states.at(-1).valid,false);
  assert.equal(await page.locator('iframe').count(),3);
  assert(!violations.some(v=>secureFieldOrigins.some(host=>v.url.startsWith(host))),JSON.stringify(violations));
  for(let i=0;i<3;i++){
   const input=page.frameLocator('iframe').nth(i).locator('input').first();await input.waitFor({state:'visible'});assert.equal(await input.isEditable(),true);
  }
  assert(requests.includes('https://sdk.mercadopago.com/js/v2'));
  assert(requests.some(url=>url.startsWith(secureFieldOrigins[0])));
  console.log('Real SDK initialized three editable provider-owned fields; no card data, tokenization or charge.');
 }
});
