import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from './browser-tests/node_modules/playwright/index.mjs';
const root=resolve('apps/admin'),output=resolve('artifacts/coupons-admin');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error();const body=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]??'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{for(const [engine,type]of Object.entries({chromium,webkit})){
 const browser=await type.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/pages/coupons.html');
 await page.evaluate(async()=>{
  const {createPromotionsAdmin}=await import('/src/promotions-admin.js');document.querySelector('section').hidden=false;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/styles.css';document.head.append(link);
  window.campaigns=[{id:'old-coupon',code:'ANTIGO',name:'Cupom existente',kind:'fixed_discount',valueCents:700,categories:[],maxRedemptions:10,perPassengerLimit:1,perDeviceLimit:1,enabled:true,updatedAt:'2026-10-28T00:00:00Z'}];window.calls=[];
  window.panel=createPromotionsAdmin({root:document,api:{listPromotions:async()=>({campaigns:structuredClone(window.campaigns)}),
   createPromotion:async(_token,campaign)=>{window.calls.push(campaign);window.campaigns.push({...campaign,id:'new-coupon',updatedAt:'2026-10-28T00:00:01Z'});},
   updatePromotionPresentation:async(_token,id,driverPresentation,expectedUpdatedAt)=>{window.calls.push({id,driverPresentation,expectedUpdatedAt});const campaign=window.campaigns.find(c=>c.id===id);if(campaign.updatedAt!==expectedUpdatedAt)throw Error('Versão desatualizada');campaign.driverPresentation=driverPresentation;campaign.updatedAt='2026-10-28T00:00:02Z';},
   setPromotionEnabled:async()=>{}},getToken:()=> 'synthetic',hasScope:()=>true});
 });
 await page.waitForFunction(()=>document.querySelector('#coupon-code')?.disabled===false);
 assert.equal(await page.locator('#coupon-kind option').count(),6);
 await page.locator('#coupon-code').fill('EMPRESA');await page.locator('#coupon-name').fill('Campanha empresa');
 await page.locator('#coupon-kind').selectOption('company_paid');await page.locator('#coupon-budget').fill('500');await page.locator('#coupon-company-cap').fill('20');
 const editor=page.locator('#coupon-presentation');await editor.locator('select').first().selectOption('influencer');await editor.locator('input').fill('Parceiro Jeri');await editor.locator('textarea').fill('📸 Obrigado por participar com {nome}!');
 await page.getByRole('button',{name:'Criar campanha desativada'}).click();await page.waitForFunction(()=>window.campaigns.length===2);
 await page.waitForFunction(()=>document.querySelector('#coupon-code')?.disabled===false);
 const created=await page.evaluate(()=>window.calls[0]);assert.equal(created.kind,'company_paid');assert.equal(created.enabled,false);assert.equal(created.budgetCents,50000);assert.equal(created.maxDiscountCents,2000);assert.equal(created.driverPresentation.partnerName,'Parceiro Jeri');
 const card=page.locator('#coupon-list article').filter({hasText:'EMPRESA'});await card.locator('summary').click();
 await card.locator('textarea').fill('<img src=x onerror=alert(1)> Mensagem editada');await card.getByRole('button',{name:'Salvar apresentação'}).click();
 await page.waitForFunction(()=>window.calls.length===2);assert.equal(await page.locator('#coupon-list img').count(),0);
 const old=await page.evaluate(()=>window.campaigns[0]);assert.equal(old.valueCents,700);assert.equal(old.enabled,true);assert.equal(old.driverPresentation,undefined);
 assert.deepEqual(errors,[]);await page.screenshot({path:output+'/'+engine+'-coupons.png',fullPage:true});
 console.log(engine+': old coupons preserved, company-paid added, disabled creation, bounded budget/cap, editable presentation, safe text preview passed');
 }finally{await browser.close();}
}}finally{server.close();}
