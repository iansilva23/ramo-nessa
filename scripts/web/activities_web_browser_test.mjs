import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve, extname, sep, dirname} from 'node:path';
import {createServer} from 'node:https';
import {once} from 'node:events';
import {browserName, launchTestBrowser} from './browser_test_runtime.mjs';

const role=process.env.RAMO_WEB_TEST_ROLE;
if(!['passenger','driver'].includes(role))throw Error('Specify RAMO_WEB_TEST_ROLE');
const fontFile=process.env.RAMO_TEST_FONT || resolve(process.env.FLUTTER_ROOT || dirname(dirname(execFileSync('which',['flutter'],{encoding:'utf8'}).trim())),'bin/cache/artifacts/material_fonts/Roboto-Regular.ttf');
const root=resolve(new URL('../../apps/'+role+'/build/web/',import.meta.url).pathname);
const basePath=(await readFile(resolve(root,'index.html'),'utf8')).match(/<base\s+href=["']([^"']+)["']/i)?.[1]??'/';
if(!['/','/passageiro/','/motorista/'].includes(basePath))throw Error('Unexpected test bundle base path');
const rideId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const instant='2026-10-25T14:38:00.000Z';
const baseRide={id:rideId,state:role==='passenger'?'AWAITING_PAYMENT':'DRIVER_ARRIVED',category:'moto',passengers:1,
 origin:{zoneId:'prea'},destination:{zoneId:'jijoca'},totalAmountCents:1250,driverEarningsCents:1000,pickupCompensationCents:0,
 paymentMethod:'pix',paymentStatus:role==='passenger'?'pending':'paid',createdAt:instant,updatedAt:instant,
 paymentExpiresAt:new Date(Date.now()+3600000).toISOString(),pickupLatitude:-2.8,pickupLongitude:-40.5,dropoffLatitude:-2.79,dropoffLongitude:-40.51};

test(`${browserName}/${role}: Activities survives reopen and help stays bound to the ride`,{timeout:180000},async t=>{
 const certs=await mkdtemp(resolve(tmpdir(),'ramo-activities-tls-'));
 t.after(()=>rm(certs,{recursive:true,force:true}));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',resolve(certs,'key.pem'),'-out',resolve(certs,'cert.pem'),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const handle=`ramo_web_${role}_v1_${'a'.repeat(32)}`;
 let paymentWrites=0,rideWrites=0,resumeCalls=0;
 const tickets=[],requests=[];
 const server=createServer({key:await readFile(resolve(certs,'key.pem')),cert:await readFile(resolve(certs,'cert.pem'))},async(req,res)=>{
  const url=new URL(req.url,'https://localhost'),path=url.pathname;
  const json=(code,data)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  if(path.startsWith('/v1/')){
   requests.push({path,method:req.method});
   if(path==='/v1/auth/web/session'){res.setHeader('x-ramo-web-session','1');return json(200,{accessToken:handle,subjectType:role,subjectId:role+'-test',expiresAt:new Date(Date.now()+3600000).toISOString(),tokenType:'Bearer'});}
   if(req.headers.authorization!=='Bearer '+handle)return json(401,{});
   if(path==='/v1/auth/me/check')return json(200,{subjectId:role+'-test',subjectType:role,expiresAt:new Date(Date.now()+3600000).toISOString()});
   if(path.includes('/payment')&&req.method==='POST')paymentWrites++;
   if(/\/(start|arrive|complete|cancel)$/.test(path)&&req.method==='POST')rideWrites++;
   if(path===`/v1/${role}/me/support`){
    if(req.method==='GET')return json(200,{tickets});
    let body='';for await(const chunk of req)body+=chunk;
    const value=JSON.parse(body);assert.equal(value.rideId,rideId);assert.ok(!('rideContext' in value));
    const ticket={id:'support-fixture',rideId,subject:value.subject,message:value.message,category:'ride',status:'open',createdAt:instant,updatedAt:instant};tickets.push(ticket);return json(201,ticket);
   }
   if(path===`/v1/${role}/me/activity`){return json(200,{summary:{total:1,active:1},rides:[baseRide]});}
   if(path==='/v1/passenger/me/ride'){resumeCalls++;assert.equal(url.searchParams.get('rideId'),rideId);return json(200,{ride:baseRide,payment:{id:'same-payment',method:'pix',status:'pending',amountCents:1250},pix:{payment:{id:'same-payment',status:'pending'},pix:{orderId:'same-order',paymentId:'same-provider-payment',qrCode:'same-pix-existing-code',qrCodeBase64:''}}});}
   if(path===`/v1/rides/${rideId}/tracking`)return json(200,{ride:baseRide,driver:null,driverLocation:null});
   if(path.endsWith('/boarding'))return json(200,{required:false});
   if(path==='/v1/driver/me/registration')return json(200,{status:'approved',needsCpf:false});
   if(path==='/v1/driver/me/supply')return json(200,{driverId:'driver-test',vehicleId:'vehicle-test',categories:['moto'],fourByFour:false,seatCapacity:1,online:false,busy:false,latitude:-2.8,longitude:-40.5,locationUpdatedAt:instant});
   if(path==='/v1/driver/me/ride')return json(200,{ride:baseRide});
   if(path.endsWith('/identification'))return json(200,{passengerName:'Ana Costa',terms:{systemEnabled:false}});
   if(path.endsWith('/messages/status'))return json(200,{unreadCount:0});
   if(path==='/v1/driver/me/finance')return json(200,{availableBalanceCents:0,payoutPendingCents:0});
   return json(404,{});
  }
  const assetPath=basePath!=='/'&&path.startsWith(basePath)?path.slice(basePath.length):path.slice(1);
  let file=resolve(root,decodeURIComponent(assetPath)||'index.html');
  if(!file.startsWith(root+sep)){res.writeHead(404);res.end();return;}
  try{let body=await readFile(file);if(file.endsWith('flutter_bootstrap.js')){const source=body.toString();body=Buffer.from(source.slice(0,source.lastIndexOf('_flutter.loader.load('))+"_flutter.loader.load({config:{canvasKitBaseUrl:'"+basePath+"canvaskit/'}});");}res.writeHead(200,{'content-type':({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2'})[extname(file)]??'application/octet-stream','cache-control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const origin='https://127.0.0.1:'+server.address().port;
 const browser=await launchTestBrowser();t.after(()=>browser.close());
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
 const errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
  if(url.hostname==='fonts.gstatic.com')return route.fulfill({contentType:'font/ttf',body:await readFile(fontFile)});
  if(url.origin==='https://maps.googleapis.com'&&url.pathname==='/maps/api/js')return route.fulfill({contentType:'application/javascript',body:await readFile(new URL('./maps_test_stub.js',import.meta.url),'utf8')});
  return route.abort();
 });
 await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 async function open(){
  const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('EXCEPTION'))console.error(m.text());});await page.goto(origin+basePath);
  await page.waitForSelector('flutter-view',{timeout:60000});await page.locator('flt-semantics-placeholder').dispatchEvent('click');
  try{await page.getByText('Perfil',{exact:true}).first().waitFor();}catch(e){console.error('REQUESTS',requests);console.error(await page.locator('body').ariaSnapshot());await page.screenshot({path:resolve(tmpdir(),'ramo-'+role+'-browser-failed.png')});throw e;}return page;
 }
 let page=await open();
 if(role==='passenger'){
  assert.equal(await page.getByRole('button',{name:'Copiar código Pix',exact:true}).count(),0);assert.equal(resumeCalls,0,'Home cannot force pending checkout');
 }
 async function activities(){await page.getByRole('tab',{name:'Atividades',exact:true}).click();await page.getByRole('button',{name:role==='passenger'?'Ver pagamento':'Retomar corrida',exact:true}).waitFor();}
 await activities();await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready.then(()=>true));await page.mouse.move(1,1);
 const output=resolve('artifacts/ride-activities');await mkdir(output,{recursive:true});
 await page.screenshot({path:resolve(output,`${browserName}-${role}-activities.png`)});
 await page.getByRole('button',{name:role==='passenger'?'Ver pagamento':'Retomar corrida',exact:true}).click();
 if(role==='passenger'){
  await page.getByRole('button',{name:'Copiar código Pix',exact:true}).waitFor();assert.equal(resumeCalls,1);
  // The recovered payment can be left without cancelling or charging again.
  await page.getByRole('button',{name:/Voltar|Back/}).first().click();
 }else {await page.getByRole('tab',{name:'Atividades',exact:true}).click();}
 await page.close();page=await open();
 if(role==='passenger')assert.equal(await page.getByRole('button',{name:'Copiar código Pix',exact:true}).count(),0);
 await activities();
 await page.getByRole('button',{name:'Ajuda',exact:true}).click();await page.getByText('O que aconteceu?',{exact:true}).waitFor();
 await page.getByRole('radio',{name:role==='passenger'?'Motorista não está no embarque':'Não encontrei o passageiro',exact:true}).click();
 const send=page.getByRole('button',{name:'Enviar para moderação',exact:true});await send.scrollIntoViewIfNeeded();await send.click();
 await page.getByText('Pedido enviado à moderação e vinculado à corrida.',{exact:true}).last().waitFor();assert.equal(tickets.length,1);assert.equal(tickets[0].rideId,rideId);
 await page.screenshot({path:resolve(output,`${browserName}-${role}-help.png`)});
 await page.close();page=await open();await activities();
 await page.getByRole('button',{name:'Ajuda',exact:true}).click();await page.getByText('Atendimentos desta corrida',{exact:true}).scrollIntoViewIfNeeded();
 await page.getByText('Aberto',{exact:false}).last().waitFor();
 assert.equal(paymentWrites,0);assert.equal(rideWrites,0,'retaking a trip cannot start, cancel or settle it');assert.deepEqual(errors,[]);
 assert.ok(requests.some(r=>r.path===`/v1/${role}/me/activity`));
});
