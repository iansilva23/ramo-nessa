// CI-only fixture: real Financeiro markup, CSS, rendering/handler source and HTTP client.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from './browser-tests/node_modules/playwright/index.mjs';
const base=new URL('../../apps/admin/',import.meta.url);
const html=await readFile(new URL('pages/finance.html',base),'utf8');
const source=await readFile(new URL('src/app.js',base),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const code=slice('function renderFinancePayoutPolicy()', 'function selectedManualDriverIds()')+slice('async function handleFinancePayoutModeToggle()', 'async function handleManualFinancePayouts(');
const initial=()=>({mode:'manual',automaticEnabled:false,apiAvailable:false,anticipationMinimumCents:8000,anticipationFeeCents:1000,asaas:{status:'disabled',apiAvailable:false,environment:null}});
let policy=initial(),requests=[],browser,server,origin;
test.before(async()=>{
 await mkdir('artifacts/asaas-finance',{recursive:true});
 server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
   res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="fixture-message"></div><main style="padding:20px">'+html.replace('class="view-panel" hidden','class="view-panel"')+'<script type="module" src="/fixture.mjs"></script></main></body></html>');return;
  }
  if(u.pathname==='/fixture/policy'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(policy));return;}
  if(u.pathname==='/v1/admin/finance/payout-policy'){
   let raw='';for await(const chunk of req)raw+=chunk;
   assert.equal(req.method,'PATCH');assert.equal(req.headers.authorization,'Bearer fixture-owner');
   const payload=JSON.parse(raw);requests.push(payload);policy={...policy,...payload,automaticEnabled:payload.mode==='automatic'};
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(policy));return;
  }
  if(u.pathname==='/fixture.mjs'){
   const readonly=u.searchParams.get('reader')==='true';
   res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
   res.end(`import {createAdminApi} from '/src/api.js'; import {parsePayoutPolicyAmounts,asaasIntegrationMessage} from '/src/payout-policy.js';
    const reader=new URL(location.href).searchParams.get('reader')==='true';
    const state={token:'fixture-owner',finance:{payoutPolicy:null,payoutCandidates:[],payoutReconciliation:{canManage:!reader}}};
    const api=createAdminApi(),byId=id=>document.getElementById(id),globalMessage=byId('fixture-message');
    const financeWritesAvailable=()=>!reader,numericMetric=v=>Number(v)||0,formatCurrencyCents=v=>'R$ '+(v/100).toFixed(2).replace('.',',');
    const hasScope=()=>false,loadAudit=()=>{},setMessage=(node,message)=>{node.textContent=message;},handleAuthenticatedError=e=>{throw e;};
    async function loadFinance(){state.finance.payoutPolicy=await(await fetch('/fixture/policy')).json();renderFinancePayoutPolicy();}
    ${code}
    byId('finance-payout-mode-toggle').addEventListener('click',handleFinancePayoutModeToggle);
    window.fixtureReady=loadFinance();`);return;
  }
  if(u.pathname==='/styles.css'||/^\/src\/[a-z0-9-]+\.js$/.test(u.pathname)){
   const f=new URL('.'+u.pathname,base);res.writeHead(200,{'content-type':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});res.end(await readFile(f));return;
  }
  res.writeHead(404);res.end();
 });server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
for(const width of [390,1280])test('Financeiro owner edits and persists configured terms without enabling API at '+width,async()=>{
 policy=initial();requests=[];
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 try{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(origin);await page.evaluate(()=>window.fixtureReady);
  await page.locator('#finance-anticipation-minimum').fill('125,00');await page.locator('#finance-anticipation-fee').fill('12,50');
  await page.locator('#finance-payout-mode-toggle').click();await page.waitForFunction(()=>document.getElementById('fixture-message').textContent.includes('125,00'));
  assert.deepEqual(requests,[{mode:'manual',anticipationMinimumCents:12500,anticipationFeeCents:1250}]);
  assert.equal(await page.locator('#finance-anticipation-minimum').inputValue(),'125,00');
  assert.equal(await page.locator('#finance-payout-mode option[value="semi_automatic"]').isDisabled(),true);
  assert.equal(await page.locator('#finance-payout-mode option[value="automatic"]').isDisabled(),true);
  await page.locator('#finance-anticipation-fee').fill('125,00');await page.locator('#finance-payout-mode-toggle').click();
  await page.waitForFunction(()=>document.getElementById('fixture-message').textContent.includes('taxa menor'));
  assert.equal(requests.length,1);assert.deepEqual(errors,[]);
  const panel=page.locator('.panel-card').filter({has:page.getByRole('heading',{name:'Controle de repasses',exact:true})});
  await panel.scrollIntoViewIfNeeded();await panel.screenshot({path:`artifacts/asaas-finance/owner-${width}.png`});
  const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('main *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).slice(0,25).map(n=>({tag:n.tagName,id:n.id,class:n.className,right:n.getBoundingClientRect().right}))}));
  assert.ok(overflow.scrollWidth<=width,JSON.stringify(overflow));
 }finally{await context.close();}
});
test('Financeiro reader cannot edit policy or arm payouts',async()=>{
 policy=initial();requests=[];const page=await browser.newPage();
 try{await page.goto(origin+'/?reader=true');await page.evaluate(()=>window.fixtureReady);assert.equal(await page.locator('#finance-anticipation-minimum').isDisabled(),true);assert.equal(await page.locator('#finance-anticipation-fee').isDisabled(),true);assert.equal(await page.locator('#finance-payout-mode-toggle').isDisabled(),true);assert.equal(requests.length,0);}finally{await page.close();}
});
