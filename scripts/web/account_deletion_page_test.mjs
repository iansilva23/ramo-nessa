import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {accountDeletionPage,accountDeletionScript} from '../../backend/core/dist/src/account-deletion/account-deletion-page.js';
import {launchTestBrowser} from './browser_test_runtime.mjs';

test('external page requires confirmation, preserves a pending balance and resumes its receipt', {timeout:90000},async()=>{
 let eligible=false,deleted=false,starts=0,logouts=0,loginBody,loginPath;
 const receipt='a'.repeat(64);
 const server=createServer(async(req,res)=>{
  const body=[];for await(const chunk of req)body.push(chunk);
  const data=body.length?JSON.parse(Buffer.concat(body).toString()):{};
  res.setHeader('cache-control','no-store');
  if(req.url==='/excluir-conta'){
   res.setHeader('content-type','text/html');res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");res.end(accountDeletionPage);return;
  }
  if(req.url==='/v1/account-deletion/app.js'){res.setHeader('content-type','text/javascript');res.end(accountDeletionScript);return;}
  res.setHeader('content-type','application/json');
  if(req.url.endsWith('/password/login')){loginPath=req.url;loginBody=data;res.end(JSON.stringify({accessToken:'synthetic-private-bearer-token'}));return;}
  if(req.url==='/v1/auth/session'){logouts++;res.writeHead(204);res.end();return;}
  if(req.url==='/v1/me/account-deletion'){
   assert.equal(req.headers.authorization,'Bearer synthetic-private-bearer-token');
   if(req.method==='GET'){res.end(JSON.stringify({available:true,eligible,reason:eligible?null:'Saldo pendente: R$ 12,34. Seu saldo será preservado.'}));return;}
   starts++;assert.equal(data.confirmed,true);res.writeHead(202);res.end(JSON.stringify({id:'synthetic-protocol',receipt,status:'processing'}));return;
  }
  if(req.url==='/v1/account-deletion/status'){assert.equal(data.receipt,receipt);res.end(JSON.stringify({id:'synthetic-protocol',status:deleted?'deleted':'processing'}));return;}
  res.writeHead(404);res.end('{}');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();const browser=await launchTestBrowser();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=async()=>{await page.fill('#identifier','person@example.test');await page.fill('#password','synthetic-password');await page.click('#login-button');await page.waitForSelector('#confirm:not([hidden])');};
  await page.goto(`http://127.0.0.1:${address.port}/excluir-conta`);await login();
  assert.equal(await page.isDisabled('#confirmation'),true);assert.equal(starts,0);
  assert.match(await page.textContent('#eligibility'),/12,34/);
  await page.click('#cancel-button');await page.waitForSelector('#login:not([hidden])');assert.equal(logouts,1);assert.equal(starts,0);
  eligible=true;await page.selectOption('#role','driver');await login();
  assert.equal(loginPath,'/v1/auth/driver/password/login');assert.equal(loginBody.identifier,'person@example.test');
  assert.equal(await page.inputValue('#password'),'');assert.equal(await page.isDisabled('#delete-button'),true);
  await page.check('#confirmation');assert.equal(starts,0);await page.click('#delete-button');
  await page.waitForSelector('#result:not([hidden])');assert.equal(starts,1);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ramo.deletion.receipt')),receipt);
  const values=await page.evaluate(()=>Object.values(sessionStorage));assert.equal(values.includes('synthetic-private-bearer-token'),false);
  await page.reload();await page.waitForSelector('#result:not([hidden])');assert.equal(starts,1);
  deleted=true;await page.waitForFunction(()=>document.getElementById('result-title').textContent==='Conta excluída');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ramo.deletion.receipt')),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
