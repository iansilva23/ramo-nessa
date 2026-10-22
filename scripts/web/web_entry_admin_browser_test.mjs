// Real admin controller, API and authorization on loopback; no external providers.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {launchTestBrowser,browserName} from './browser_test_runtime.mjs';
import {MemoryWebEntrySettingsRepository,WebEntrySettingsError} from '../../backend/core/dist/src/config/web-entry-settings.js';
import {webEntrySettingsRoutes} from '../../backend/core/dist/src/config/web-entry-settings-routes.js';
import {InMemoryAdminRepository} from '../../backend/core/dist/src/admin/repositories/in-memory-admin-repository.js';
import {InMemoryAdminHumanAuthRepository} from '../../backend/core/dist/src/admin/repositories/in-memory-admin-human-auth-repository.js';
import {issueAdminApiKey,AdminAuthenticationError} from '../../backend/core/dist/src/admin/admin-auth.js';
test(browserName+': entry switch in Design dos Apps, persistence, reader, conflict and responsive layout',{timeout:90000},async t=>{
  const admin=new InMemoryAdminRepository(),humans=new InMemoryAdminHumanAuthRepository(),repository=new MemoryWebEntrySettingsRepository(admin);
  const writer=await issueAdminApiKey({repository:admin,name:'Synthetic design writer',scopes:['communications:read','communications:write']});
  const reader=await issueAdminApiKey({repository:admin,name:'Synthetic design reader',scopes:['communications:read']});
  const adminRoot=resolve('apps/admin'),evidence=resolve('artifacts/web-entry-settings/'+browserName);await mkdir(evidence,{recursive:true});
  const markup=(await readFile(resolve(adminRoot,'pages/design.html'),'utf8')).replace('class="view-panel" hidden','class="view-panel"');
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main style="padding:20px;max-width:1400px;margin:auto">'+markup+'</main><script type="module" src="/harness.js"></script></body></html>';
  const server=createServer(async(request,response)=>{
    const url=new URL(request.url,'http://localhost');
    const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
    try{
      if(await webEntrySettingsRoutes({request,response,url,repository,admin,humans,json,readJson:async req=>{const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString());}}))return;
      if(url.pathname==='/'){response.setHeader('content-type','text/html');response.end(html);return;}
      if(url.pathname==='/harness.js'){
        const isReader=request.headers.referer?.includes('reader=1'),token=isReader?reader.token:writer.token;
        response.setHeader('content-type','text/javascript');response.end("import{createWebEntryAdmin}from'/src/web-entry-admin.js';import{createAdminApi}from'/src/api.js';const c=createWebEntryAdmin({root:document.getElementById('web-entry-settings-card'),api:createAdminApi(),getToken:()=>"+JSON.stringify(token)+",canRead:()=>true,canWrite:()=>"+!isReader+"});document.getElementById('refresh-design-button').addEventListener('click',()=>c.load());c.load();");return;
      }
      const file=resolve(adminRoot,'.'+url.pathname);if(!file.startsWith(adminRoot+sep))throw Error('Invalid fixture path');
      response.setHeader('content-type',extname(file)==='.js'?'text/javascript':'text/css');response.end(await readFile(file));
    }catch(e){json(response,e instanceof WebEntrySettingsError?e.status:e instanceof AdminAuthenticationError?e.code==='ADMIN_SCOPE_REQUIRED'?403:401:500,{message:e.message});}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await launchTestBrowser();t.after(()=>browser.close());
  const context=await browser.newContext();const errors=[];
  await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  const card=page.locator('#web-entry-settings-card'),toggle=card.getByRole('checkbox'),save=card.getByRole('button');
  await page.waitForFunction(()=>!document.querySelector('[data-entry-enabled]').disabled);
  assert.equal(await toggle.isChecked(),false);assert.equal(await save.isDisabled(),true);
  await toggle.focus();await page.keyboard.press('Space');await save.click();
  await card.getByText('Ativada',{exact:true}).waitFor();assert.equal((await repository.get()).enabled,true);
  await page.reload();await card.getByText('Ativada',{exact:true}).waitFor();assert.equal(await toggle.isChecked(),true);
  // Another admin disables it after this view loaded. A stale save must be refused.
  await repository.save({enabled:false,expectedRevision:1,actor:{kind:'api_key',id:writer.key.id,name:writer.key.name}});
  await toggle.uncheck();await save.click();await card.getByText(/Outra pessoa alterou/).waitFor();assert.equal(await save.isDisabled(),true);
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();await card.getByText('Desativada',{exact:true}).waitFor();
  assert.equal(await toggle.isChecked(),false);
  for(const width of [1440,860,390]){
    await page.setViewportSize({width,height:1100});await card.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await toggle.isVisible());assert.ok(await save.isVisible());
    await page.screenshot({path:resolve(evidence,'design-'+width+'.png'),fullPage:true});
  }
  const readOnly=await context.newPage();await readOnly.goto(base+'/?reader=1');await readOnly.locator('[data-entry-status]').getByText('Desativada',{exact:true}).waitFor();
  assert.equal(await readOnly.locator('[data-entry-enabled]').isDisabled(),true);assert.equal(await readOnly.locator('[data-entry-save]').isDisabled(),true);
  assert.deepEqual(errors,[]);assert.equal((await admin.listAudit(10)).length,2);
});
