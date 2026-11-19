import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {once} from 'node:events';
import {launchTestBrowser,browserName} from './browser_test_runtime.mjs';
const root=resolve('apps/admin');
test(browserName+': manual refund admin edits policy, reviews without reducing driver credit, records proof and shows completed case',{timeout:120000},async()=>{
 const errors=[];
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin-workspace.css"><link rel="stylesheet" href="/manual-refunds.css"></head><body><main style="padding:24px;max-width:1100px;margin:auto"><div class="page-heading"><h1>Financeiro</h1></div><section class="panel-card" data-manual-refunds></section></main><script type="module">import {createCancellationAdmin} from "/src/manual-refunds-admin.js";import {createAdminApi} from "/src/api.js";createCancellationAdmin({root:document.querySelector("main"),api:createAdminApi(),getToken:()=>"fixture-token",hasScope:()=>true});</script></body></html>';
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('content-type','text/html');res.end(html);return;}
  const file=resolve(root,'.'+path);if(!file.startsWith(root+'/')){res.writeHead(404);res.end();return;}
  try{res.setHeader('content-type',extname(file)==='.css'?'text/css':extname(file)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const browser=await launchTestBrowser();
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},timezoneId:'America/Fortaleza'});page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  let policy={revision:0,systemEnabled:false,rules:Object.fromEntries(['moto','car','buggy','delivery','comfort_black'].map(k=>[k,{enabled:false,feeCents:null,freeSeconds:40}]))};
  let c={rideId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',passengerId:'fixture-passenger',passengerName:'Ian Silva',driverName:'João Silva',driverId:'fixture-driver',
   category:'car',paidCents:10000,creditedFeeCents:500,feeCents:500,status:'review',reason:'Passageiro solicitou cancelamento ao suporte',
   pix:{type:'email',key:'fixture@example.test',holder:'Ian Silva'},receipt:null,bankReference:null,revision:0,createdAt:'2026-10-24T01:01:00Z',updatedAt:'2026-10-24T01:01:00Z'};
  await page.route('**/v1/admin/**',async route=>{
   const r=route.request(),path=new URL(r.url()).pathname;assert.equal(r.headers().authorization,'Bearer fixture-token');
   const b=r.method()==='GET'?null:r.postDataJSON();let value;
   if(path.endsWith('/cancellation-policy')){
    if(b){assert.equal(b.rules.car.feeCents,500);assert.equal(b.rules.car.freeSeconds,40);assert.equal(typeof b.systemEnabled,'boolean');policy={revision:policy.revision+1,rules:b.rules,systemEnabled:b.systemEnabled};}value=policy;
   }else if(path==='/v1/admin/manual-refunds')value={items:[c]};
   else if(path.endsWith('/review')){
    assert.equal(b.feeCents,200);assert.equal(b.revision,c.revision);c={...c,status:'approved',feeCents:200,revision:c.revision+1};value=c;
   }else if(path.endsWith('/paid')){
    assert.equal(b.revision,c.revision);assert.equal(b.bankReference,'BANK-FIXTURE-12345');assert.ok(b.receipt.base64);
    c={...c,status:'refunded',revision:c.revision+1,bankReference:b.bankReference,receipt:b.receipt};value=c;
   }else value={...c,terms:{acceptedAt:'2026-10-24T01:00:00Z',rule:{freeSeconds:40}}};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByText('Casos atualizados.',{exact:true}).waitFor();
  await page.getByText('Sistema desativado',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Ativar sistema de cancelamento',{exact:true}).isChecked(),false);
  await page.getByText('Regras por categoria',{exact:true}).click();
  await page.getByLabel('Categoria',{exact:true}).selectOption('car');
  await page.getByLabel('Cobrar taxa após o prazo gratuito').check();
  await page.getByLabel('Taxa de cancelamento (R$)',{exact:true}).fill('5.00');
  await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();
  await page.getByText('Categoria salva. Novas corridas usarão esta regra.',{exact:true}).waitFor();
  assert.equal(policy.systemEnabled,false,'preparing fees must not activate the system');
  await page.getByLabel('Ativar sistema de cancelamento',{exact:true}).check();
  await page.getByRole('button',{name:'Salvar ativação',exact:true}).click();
  await page.getByText('Sistema ativado',{exact:true}).waitFor();
  assert.equal(policy.systemEnabled,true);
  await page.getByLabel('Ativar sistema de cancelamento',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Salvar ativação',exact:true}).click();
  await page.getByText('Sistema desativado',{exact:true}).waitFor();
  assert.equal(policy.rules.car.feeCents,500,'deactivation must preserve configured rules');
  await page.getByRole('button',{name:'Abrir ficha',exact:true}).click();
  await page.getByText('Devolução de Ian Silva',{exact:true}).waitFor();
  await mkdir('artifacts/manual-refunds',{recursive:true});
  await page.screenshot({path:'artifacts/manual-refunds/'+browserName+'-desktop-review.png',fullPage:true});
  await page.getByLabel('Taxa final a descontar do passageiro (R$)').fill('2.00');
  await page.getByLabel('Justificativa da análise').fill('Isenção parcial coberta pela empresa');
  await page.getByRole('button',{name:'Aprovar devolução manual',exact:true}).click();
  await page.getByText('Análise salva. A aprovação não envia o Pix.',{exact:true}).waitFor();
  assert.equal(c.creditedFeeCents,500);assert.equal(c.feeCents,200);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/manual-refunds/'+browserName+'-mobile-approved.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByLabel('Identificador da transferência (banco)').fill('BANK-FIXTURE-12345');
  await page.getByLabel('Comprovante (PNG, JPEG ou PDF, até 500 KB)').setInputFiles({name:'comprovante.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fixture')});
  await page.getByRole('button',{name:'Confirmar devolução realizada',exact:true}).click();
  await page.getByText('Devolução registrada. O saldo do motorista foi preservado.',{exact:true}).waitFor();
  await page.screenshot({path:'artifacts/manual-refunds/'+browserName+'-mobile-completed.png',fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
