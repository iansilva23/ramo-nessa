import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {once} from 'node:events';import {launchTestBrowser,browserName} from './browser_test_runtime.mjs';
test(`${browserName}: independent occurrence controls stay off on load and preserve read-only permissions`,{timeout:120000},async()=>{
 const root=resolve('apps/admin');
 const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('content-type','text/html');res.end(`<main><section data-manual-refunds></section></main><script type="module">import {createOccurrencesAdmin} from '/src/ride-occurrences-admin.js';import {createAdminApi} from '/src/api.js';createOccurrencesAdmin({root:document.querySelector('main'),api:createAdminApi(),getToken:()=> 'test-session',hasScope:()=>!location.search.includes('readonly'),view:'finance'});</script>`);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')){res.writeHead(404);res.end();return;}
  try{res.setHeader('content-type',extname(file)==='.css'?'text/css':'text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
 try{browser=await launchTestBrowser();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let mutations=0;
  let policy={enabled:false,bonusEnabled:false,bonusCents:{moto:0,car:0,buggy:0,delivery:0,comfort_black:0},revision:0};
  await page.route('**/v1/admin/occurrence-policy',async route=>{const req=route.request();assert.equal(req.headers().authorization,'Bearer test-session');if(req.method()==='PUT'){mutations++;const body=req.postDataJSON();assert.equal(body.revision,policy.revision);policy={...body,revision:policy.revision+1};}await route.fulfill({json:policy});});
  const url='http://127.0.0.1:'+server.address().port;await page.goto(url);await page.getByRole('status').filter({hasText:'Ocorrências:'}).waitFor();
  const b=page.getByLabel('Novos cancelamentos e ocorrências',{exact:true}),c=page.getByLabel('Adicional e bônus na próxima corrida',{exact:true});assert.equal(await b.isChecked(),false);assert.equal(await c.isChecked(),false);assert.equal(mutations,0);
  await b.check();await page.getByRole('button',{name:'Salvar configurações'}).click();await page.getByRole('status').filter({hasText:'Configurações salvas.'}).waitFor();assert.equal(policy.enabled,true);assert.equal(policy.bonusEnabled,false);
  await page.reload();await page.getByRole('status').filter({hasText:'Ocorrências:'}).waitFor();assert.equal(await b.isChecked(),true);assert.equal(await c.isChecked(),false);
  await page.goto(url+'/?readonly');await page.getByRole('status').filter({hasText:'Ocorrências:'}).waitFor();assert.equal(await b.isDisabled(),true);assert.equal(await c.isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Salvar configurações'}).isDisabled(),true);assert.equal(mutations,1);assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
