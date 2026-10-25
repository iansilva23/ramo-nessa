import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium, webkit} = await import(process.env.RAMO_GUIDE_PLAYWRIGHT_MODULE ?? new URL('../../../../scripts/web/browser-tests/node_modules/playwright/index.mjs', import.meta.url).href);
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const output = resolve(root, 'design-browser-artifacts'); await mkdir(output, {recursive:true});
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const path = resolve(root, url.pathname === '/' ? 'index.html' : '.' + url.pathname);
    if (!path.startsWith(root + sep)) throw Error('Invalid path');
    let bytes = await readFile(path);
    if (url.pathname === '/') bytes = bytes.toString().replace('<script type="module" src="src/app.js"></script>','');
    res.setHeader('content-type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)] || 'application/octet-stream'); res.end(bytes);
  } catch {res.writeHead(404); res.end();}
});
await new Promise(done => server.listen(0,'127.0.0.1',done));
const origin = 'http://127.0.0.1:' + server.address().port;
const results = [];
try {
 for (const engine of (process.env.RAMO_GUIDE_ENGINES ?? 'chromium,webkit').split(',')) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({headless:true});
  try {
   const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
   const errors=[]; page.on('pageerror',error => errors.push(error.message));
   await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
   await page.goto(origin);
   await page.evaluate(() => {document.getElementById('auth-view').hidden=true; document.getElementById('admin-view').hidden=false;});
   async function mount(view, writable=true, fail=false) {
    const markup = await readFile(resolve(root,'pages',view+'.html'),'utf8');
    await page.evaluate(async ({markup,view,writable,fail}) => {
      const outlet=document.getElementById('route-outlet');
      const parsed=new DOMParser().parseFromString(markup,'text/html');
      const panel=document.importNode(parsed.querySelector('.view-panel'),true); panel.hidden=false; outlet.replaceChildren(panel);
      const {organizeAdminWorkspace}=await import('/src/admin-workspace.js');
      const {createBoardingAdmin}=await import('/src/boarding-admin.js');
      const {createCancellationAdmin}=await import('/src/manual-refunds-admin.js');
      const {createOccurrencesAdmin}=await import('/src/ride-occurrences-admin.js');
      window.calls=[]; window.openedTicket=null; window.failSave=false;
      const categories={moto:true,car:true,buggy:true,delivery:true,comfort_black:true};
      const amounts={moto:300,car:300,buggy:300,delivery:0,comfort_black:300};
      const options={root:outlet,getToken:()=> 'ephemeral-test-session',hasScope:()=>writable,
       api:{manualRefundRequest:async(token,path,method='GET',body)=>{
        if(path.endsWith('cancellation-policy'))return {systemEnabled:false,revision:4,rules:Object.fromEntries(Object.keys(categories).map(k=>[k,{enabled:k!=='delivery',feeCents:k==='delivery'?null:1000,freeSeconds:40}]))};
        return {items:[]};
       },boardingRequest:async (token,path,method='GET',body)=>{
        window.calls.push({path,method,body}); if(fail || window.failSave) throw Error('Falha de conexão simulada.');
        if(method==='POST') return {ok:true}; return method==='PUT'?{...body,revision:body.revision+1}:{enabled:false,revision:0,categories};
       },occurrenceRequest:async(token,path,method='GET',body)=>{
        window.calls.push({path,method,body}); if(fail || window.failSave) throw Error('Falha de conexão simulada.');
        if(path.endsWith('occurrence-policy')) return method==='PUT'?{...body,revision:body.revision+1}:{enabled:false,bonusEnabled:false,bonusCents:amounts,revision:0};
        if(method==='POST') return {ok:true};
        const base={ride_id:'11111111-1111-4111-8111-111111111111',ticket_id:'existing-ticket-id',revision:3,ride_state:'INTERRUPTED',payment_status:'paid',occurrence_terms:{bonusEnabled:false}};
        return {items:[{...base,id:'22222222-2222-4222-8222-222222222222',status:'review',kind:'dispute',payment_method:'pix',driver_statement:'O passageiro solicitou o encerramento durante o trajeto.',passenger_statement:'O motorista não conseguiu chegar ao destino combinado.'},
         {...base,id:'33333333-3333-4333-8333-333333333333',ride_id:'44444444-4444-4444-8444-444444444444',status:'resolved',kind:'cash',payment_method:'cash',payment_status:'authorized',driver_statement:'Devolvi o valor recebido em dinheiro.',passenger_statement:'Confirmo que recebi a devolução integral.',cash_returned_at:'2026-10-25T12:00:00Z',cash_return_confirmed:true,decision:{action:'close',note:'Devolução física confirmada pelas duas partes.',penalty:false}}]};
       }}};
      if(view==='finance'){createCancellationAdmin(options);createBoardingAdmin(options);}
      createOccurrencesAdmin({...options,view,openTicket:id=>{window.openedTicket=id;}});
      organizeAdminWorkspace(panel,view);
      document.getElementById('page-title').textContent=panel.querySelector('h1')?.textContent ?? view;
      document.querySelectorAll('.nav-item').forEach(link=>link.classList.toggle('is-active',link.dataset.view===view));
    },{markup,view,writable,fail});
    await page.waitForFunction(()=>document.querySelector('[data-occurrence-admin] .admin-feedback')?.textContent !== 'Carregando…' && !document.querySelector('[data-occurrence-admin][aria-busy="true"]'));
   }
   await mount('finance');
   const boarding=page.locator('[data-boarding-admin]'), policy=page.locator('[data-occurrence-admin]');
   await page.waitForFunction(()=>document.querySelector('[data-boarding-admin] input')?.disabled===false);
   assert.equal(await boarding.getByRole('checkbox',{name:'Exigir código de embarque',exact:false}).isChecked(),false);
   assert.equal(await policy.getByRole('checkbox').count(),2);
   assert.equal(await policy.getByRole('checkbox').nth(0).isChecked(),false);
   assert.equal(await policy.getByRole('checkbox').nth(1).isChecked(),false);
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.method!=='GET')),false,'Opening settings must never write/activate');
   await boarding.getByRole('checkbox',{name:'Exigir código de embarque',exact:false}).check();
   await boarding.getByRole('button',{name:'Salvar configuração',exact:true}).click();
   await page.waitForFunction(()=>window.calls.some(c=>c.method==='PUT'&&c.path.endsWith('boarding-policy')));
   assert.equal(await page.evaluate(()=>window.calls.find(c=>c.method==='PUT').body.enabled),true);
   assert.equal(await policy.getByRole('checkbox').nth(0).isChecked(),false,'Independent flags preserved');
   await policy.getByLabel('Mototáxi',{exact:true}).fill('4.50');
   await policy.getByRole('button',{name:'Salvar configurações',exact:true}).click();
   await page.waitForFunction(()=>window.calls.some(c=>c.method==='PUT'&&c.path.endsWith('occurrence-policy')));
   assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.method==='PUT'&&c.path.endsWith('occurrence-policy')).body),{enabled:false,bonusEnabled:false,bonusCents:{moto:450,car:300,buggy:300,delivery:0,comfort_black:300},revision:0});
   await page.evaluate(()=>window.failSave=true);
   await policy.getByLabel('Mototáxi',{exact:true}).fill('5.50');
   await policy.getByRole('button',{name:'Salvar configurações',exact:true}).click();
   await policy.locator('.admin-feedback[data-state="error"]').waitFor();
   assert.equal(await policy.getByLabel('Mototáxi',{exact:true}).inputValue(),'5.50','Keep edits after an error');
   assert.equal(await policy.getByRole('button',{name:'Salvar configurações',exact:true}).isEnabled(),true);
   await mount('finance',false);
   assert.equal(await page.locator('[data-occurrence-admin] :is(input,button):enabled').count(),0,'Read-only cannot edit');
   assert.equal(await page.locator('[data-boarding-admin] :is(input,button,textarea):enabled').count(),0);
   await mount('finance',true,true);
   assert.equal(await page.locator('[data-occurrence-admin] form').isVisible(),false);
   assert.equal(await page.locator('[data-boarding-admin] form').first().isVisible(),false);
   await mount('finance');
   for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>window.scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Finance ${width} overflow`);
    await page.screenshot({path:resolve(output,`${engine}-finance-${width}.png`),fullPage:true,animations:'disabled'});
   }
   await mount('support');
   await page.locator('.admin-case').nth(1).waitFor();
   const ghostStyle=await page.locator('[data-occurrence-admin]').getByRole('button',{name:'Atualizar ocorrências'}).evaluate(button=>{const s=getComputedStyle(button);return {border:s.borderTopWidth,color:s.borderTopColor};});
   assert.equal(ghostStyle.border,'1px');
   assert.notEqual(ghostStyle.color,'rgba(0, 0, 0, 0)','Secondary actions need a visible outline');
   assert.equal(await page.locator('.admin-case').count(),2);
   await page.locator('[data-occurrence-admin]').getByRole('button',{name:'Abrir atendimento e evidências'}).first().click();
   assert.equal(await page.evaluate(()=>window.openedTicket),'existing-ticket-id');
   const filter=page.locator('[data-occurrence-admin]').getByLabel('Exibir',{exact:true});
   await filter.selectOption('resolved'); assert.equal(await page.locator('.admin-case').count(),1);
   assert.equal(await page.locator('.admin-case form').count(),0,'Resolved case has no new decision');
   await filter.selectOption('pending');
   assert.equal(await page.locator('.admin-case').count(),1);
   const form=page.locator('.admin-case form');
   assert.equal(await form.getByRole('checkbox').isDisabled(),true,'Bonus disabled by original ride terms');
   await form.getByLabel('Decisão administrativa').selectOption('refund');
   await form.getByLabel('Análise e justificativa').fill('As duas versões e os registros confirmam a necessidade de devolução.');
   page.once('dialog',dialog=>dialog.dismiss());
   await form.getByRole('button',{name:'Registrar decisão'}).click();
   assert.equal(await page.evaluate(()=>window.calls.some(c=>c.method==='POST')),false,'Cancel confirmation must not write');
   page.once('dialog',dialog=>dialog.accept());
   await form.getByRole('button',{name:'Registrar decisão'}).click();
   await page.waitForFunction(()=>window.calls.some(c=>c.method==='POST'));
   assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.method==='POST').body),{action:'refund',note:'As duas versões e os registros confirmam a necessidade de devolução.',penalty:false,revision:3});
   await page.waitForFunction(()=>document.querySelector('[data-occurrence-admin]')?.getAttribute('aria-busy')==='false');
   for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(()=>window.scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`Cases ${width} overflow`);
    await page.screenshot({path:resolve(output,`${engine}-support-${width}.png`),fullPage:true,animations:'disabled'});
   }
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.admin-workspace')).animationName),'none');
   await page.emulateMedia({reducedMotion:'no-preference'});
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.admin-workspace')).animationName),'admin-page-enter');
   assert.deepEqual(errors,[]);
   results.push({engine,ok:true,simulated:true,checks:['flags independent, initially off and no writes on open','revision and category values preserved','edit retention after server error','read-only and failed load protected','support uses existing ticket','filters and resolved cases','financial confirmation and exact decision payload','responsive 1440/390/320','reduced motion honored']});
  } finally {await browser.close();}
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)); console.log(JSON.stringify(results,null,2));
} finally {await new Promise(done=>server.close(done));}
