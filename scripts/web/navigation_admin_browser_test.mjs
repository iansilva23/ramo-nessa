import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {once} from 'node:events';
import {launchTestBrowser,browserName} from './browser_test_runtime.mjs';

test(`${browserName}: route economy is off until saved, persists, supports readonly and narrow screens`,{timeout:120000},async()=>{
 const root=resolve('apps/admin');let policy={enabled:false,revision:0,usage:{requests:0}},writes=0;
 const html=`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin-workspace.css"><link rel="stylesheet" href="/manual-refunds.css"></head><body><main style="padding:16px;max-width:1100px;margin:auto"><h1>Financeiro</h1><section data-manual-refunds></section></main><script type="module">
 import {createNavigationAdmin} from '/src/navigation-admin.js';
 createNavigationAdmin({root:document,getToken:()=> 'fixture-session',hasScope:()=>!location.search.includes('readonly'),api:{navigationRequest:async(token,method='GET',body)=>{
 const r=await fetch('/v1/admin/navigation-policy',{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.message);return d;}}});
 </script></body></html>`;
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/v1/admin/navigation-policy'){
   if(req.method==='PUT'){let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);assert.equal(b.revision,policy.revision);assert.equal(typeof b.enabled,'boolean');policy={...policy,enabled:b.enabled,revision:policy.revision+1};writes++;}
   res.setHeader('content-type','application/json');res.end(JSON.stringify(policy));return;
  }
  if(path==='/'){res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  try{res.setHeader('content-type',extname(file)==='.css'?'text/css':'text/javascript');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const browser=await launchTestBrowser();
 try{
  const page=await browser.newPage();const url=`http://127.0.0.1:${server.address().port}`;
  for(const width of [320,430,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(url);
   const panel=page.getByRole('region',{name:'Economia de rotas'}),check=panel.getByRole('checkbox');
   await panel.getByText('Desativado. Navegação atual preservada.',{exact:true}).waitFor();
   assert.equal(await check.isChecked(),false);const before=writes;
   await check.check();assert.equal(writes,before);await panel.getByRole('button',{name:'Salvar economia de rotas'}).click();
   await panel.getByText('Ativado. Proteção de consultas habilitada nos apps compatíveis.',{exact:true}).waitFor();assert.equal(policy.enabled,true);
   await page.reload();await panel.getByText('Ativado. Proteção de consultas habilitada nos apps compatíveis.',{exact:true}).waitFor();assert.equal(await check.isChecked(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await mkdir('artifacts/navigation-economy',{recursive:true});await page.screenshot({path:`artifacts/navigation-economy/${browserName}-${width}.png`,fullPage:true});
   await check.uncheck();await panel.getByRole('button',{name:'Salvar economia de rotas'}).click();await panel.getByText('Desativado. Navegação atual preservada.',{exact:true}).waitFor();
  }
  await page.goto(url+'?readonly');const panel=page.getByRole('region',{name:'Economia de rotas'});
  await panel.getByText('Desativado. Navegação atual preservada.',{exact:true}).waitFor();assert.equal(await panel.getByRole('checkbox').isDisabled(),true);
  assert.equal(await panel.getByRole('button',{name:'Salvar economia de rotas'}).isDisabled(),true);assert.equal(writes,6);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
