// Loopback-only browser integration: real controller, API, auth/MFA and pricing
// services; in-memory repositories and synthetic places/route providers.
// Never connects to VPS, financial providers, production keys or real databases.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';
import {STATIC_PRICING_CATALOG_V1} from '../../../../backend/core/src/pricing/catalog-snapshot.ts';
import {prepareThreeRegionCatalog} from '../../../../backend/core/src/pricing/management-service.ts';
import {pricingManagementRoutes} from '../../../../backend/core/src/pricing/management-routes.ts';
import {ManagementError} from '../../../../backend/core/src/pricing/managed-operations.ts';
import {InMemoryPricingCatalogVersionRepository} from '../../../../backend/core/src/pricing/repositories/in-memory-pricing-catalog-version-repository.ts';
import {InMemoryAdminRepository} from '../../../../backend/core/src/admin/repositories/in-memory-admin-repository.ts';
import {InMemoryAdminHumanAuthRepository} from '../../../../backend/core/src/admin/repositories/in-memory-admin-human-auth-repository.ts';
import {createAdminHumanUser,hashAdminHumanSessionToken,AdminHumanAuthenticationError} from '../../../../backend/core/src/admin/admin-human-auth-service.ts';
import {totpCodeAt} from '../../../../backend/core/src/admin/admin-human-crypto.ts';

const adminRoot=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const out=resolve(adminRoot,'regions-browser-artifacts');
await mkdir(out,{recursive:true});
const key=Buffer.alloc(32,17),rateLimitSecret='synthetic-browser-pricing-reauthentication-limit';
const tile=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eeece4"/><path d="M0 58L256 180M60 0L180 256M0 190L256 65" stroke="#fff" stroke-width="8"/><path d="M0 58L256 180M60 0L180 256M0 190L256 65" stroke="#d9d5c9" stroke-width="1"/><text x="12" y="242" fill="#777064" font-size="9">MAPA SINTÉTICO · TESTE</text></svg>');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
async function run(engine){
  const versions=new InMemoryPricingCatalogVersionRepository(),admin=new InMemoryAdminRepository(),humans=new InMemoryAdminHumanAuthRepository();
  const owner=await createAdminHumanUser({repository:humans,name:'Admin de teste',email:engine+'@example.invalid',scopes:['pricing:read','pricing:write'],encryptionKey:key});
  const reader=await createAdminHumanUser({repository:humans,name:'Leitor de teste',email:engine+'-reader@example.invalid',scopes:['pricing:read'],encryptionKey:key});
  const writerToken='rn_admin_session_'+randomBytes(32).toString('base64url'),readerToken='rn_admin_session_'+randomBytes(32).toString('base64url');
  for(const [user,token]of [[owner.user,writerToken],[reader.user,readerToken]])await humans.createSession({id:randomUUID(),userId:user.id,tokenHash:hashAdminHumanSessionToken(token),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7200000).toISOString()});
  const seedId=randomUUID(),instant=new Date(Date.now()-1000).toISOString(),actor={kind:'user',id:owner.user.id,name:owner.user.name};
  await versions.commitDirect({admin,expectedEffectiveId:null,record:{id:seedId,status:'published',snapshot:prepareThreeRegionCatalog(STATIC_PRICING_CATALOG_V1),createdBy:actor,publishedBy:actor,effectiveFrom:instant,createdAt:instant,updatedAt:instant,publishedAt:instant},
    audit:{id:randomUUID(),actor,action:'test.seed',targetType:'pricing_catalog_version',targetId:seedId,metadata:{},createdAt:instant}});
  const json=(response,status,body)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(body));};
  const readJson=async request=>{const chunks=[];for await(const chunk of request)chunks.push(chunk);const bytes=Buffer.concat(chunks);if(bytes.length>65536)throw Error('Test request too large');return JSON.parse(bytes.toString('utf8'));};
  const pageMarkup=await readFile(resolve(adminRoot,'pages/regions-pricing.html'),'utf8');
  let shell=(await readFile(resolve(adminRoot,'index.html'),'utf8'))
    .replace('<script type="module" src="src/app.js"></script>','<script type="module" src="/__harness.js"></script>')
    .replace('<div id="route-outlet" class="route-outlet" aria-live="polite"></div>','<div id="route-outlet" class="route-outlet" aria-live="polite">'+pageMarkup+'</div>');
  const server=createServer(async(request,response)=>{
    try{
      const url=new URL(request.url,'http://127.0.0.1');
      if(await pricingManagementRoutes({request,response,url,admin,humans,versions,json,readJson,encryptionKey:key,rateLimitSecret,
        places:{async searchText(){return [{id:'test-place',name:'Cobertura de teste',address:'Cruz · Ceará',latitude:-2.82,longitude:-40.40}];}},
        routing:{async routeDistanceKm(){return 5;}}}))return;
      if(url.pathname==='/__harness.js'){
        const readonly=url.searchParams.get('reader')==='1';
        const script=[
          "import {createRegionsPricingAdmin} from '/src/regions-pricing-admin.js';",
          "import {createAdminApi} from '/src/api.js';",
          "document.getElementById('auth-view').hidden=true;document.getElementById('admin-view').hidden=false;",
          "document.getElementById('page-title').textContent='Regiões e preços';document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('is-active',n.dataset.view==='pricing'));",
          "globalThis.__rp=createRegionsPricingAdmin({root:document.getElementById('route-outlet'),api:createAdminApi(),getToken:()=>"+JSON.stringify(readonly?readerToken:writerToken)+",hasScope:scope=>"+(readonly?"scope==='pricing:read'":"['pricing:read','pricing:write'].includes(scope)")+"});",
        ].join('\n');
        response.writeHead(200,{'content-type':'text/javascript'});response.end(script);return;
      }
      if(url.pathname==='/reader'){
        response.writeHead(200,{'content-type':'text/html'});response.end(shell.replace('src="/__harness.js"','src="/__harness.js?reader=1"'));return;
      }
      let path=url.pathname.replace(/^\/administrodo\//,'/'),file;
      if(path==='/'||path==='/regioes-precos'){response.writeHead(200,{'content-type':'text/html'});response.end(shell);return;}
      file=resolve(adminRoot,'.'+path);
      if(!file.startsWith(adminRoot+sep)){response.writeHead(404);response.end();return;}
      const bytes=await readFile(file);response.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream'});response.end(bytes);
    }catch(error){
      if(error.code==='ENOENT'){response.writeHead(404);response.end();return;}
      const status=error instanceof ManagementError?error.status:error instanceof AdminHumanAuthenticationError
        ? error.code==='ADMIN_SCOPE_REQUIRED'?403:error.code==='ADMIN_LOGIN_RATE_LIMITED'?429:401
        : ['PricingError','PricingLocationMismatchError','InvalidQuoteRequestError'].includes(error.name)?422:500;
      json(response,status,{error:error.code??error.name,message:error.message});
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('https://tile.openstreetmap.org/'))return route.fulfill({status:200,contentType:'image/svg+xml',body:tile});
    if(!url.startsWith(base))return route.abort();return route.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const expectText=async(locator,text)=>{await locator.filter({hasText:text}).first().waitFor();};
  try{
    await page.goto(base+'/administrodo/regioes-precos');
    await page.getByRole('heading',{name:'Suas regiões',exact:true}).waitFor();
    await page.locator('.rp-region-card').filter({hasText:'Preá'}).waitFor();
    assert.equal(await page.locator('.rp-region-card').count(),3);
    const contrast=await page.locator('.rp-region-card .button--ghost').first().evaluate(el=>{
      const style=getComputedStyle(el),rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
      const luminance=value=>rgb(value).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
      const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
    assert.ok(contrast>=4.5,'Action text must meet WCAG AA contrast');
    await page.getByRole('button',{name:/Adicionar região/}).click();
    let wizard=page.getByRole('dialog',{name:'Adicionar região',exact:true});
    await wizard.getByLabel('Nome da região',{exact:true}).fill('Cobertura de teste');
    await wizard.getByLabel('Município',{exact:true}).fill('Cruz');
    await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).fill('0.8');
    await wizard.getByLabel('Pesquisar no mapa',{exact:true}).fill('Cobertura de teste');
    await wizard.getByRole('button',{name:'Buscar',exact:true}).click();
    await wizard.getByRole('button',{name:/Cobertura de teste · Cruz/}).click();
    await wizard.getByRole('button',{name:'Continuar',exact:true}).click();
    await wizard.getByLabel('Mototáxi',{exact:true}).check();
    await wizard.getByRole('button',{name:'Continuar',exact:true}).click();
    await wizard.getByRole('button',{name:'Continuar',exact:true}).click();
    await wizard.getByRole('button',{name:'Salvar região',exact:true}).click();
    await wizard.waitFor({state:'detached'});
    assert.equal(await page.locator('.rp-region-card').count(),4);
    await page.getByRole('tab',{name:'Tarifas e rotas',exact:true}).click();
    await page.getByRole('button',{name:/Adicionar tarifa/}).click();
    let editor=page.getByRole('dialog',{name:'Adicionar tarifa',exact:true});
    await editor.getByLabel('Nome da tarifa',{exact:true}).fill('Tarifa sintética de teste');
    await editor.getByLabel('Categoria',{exact:true}).selectOption('moto');
    await editor.getByLabel('Origem',{exact:true}).selectOption('prea');
    await editor.getByLabel('Destino',{exact:true}).selectOption('prea');
    let day=editor.getByRole('group',{name:'Dia',exact:true});
    await day.getByLabel('Atender neste período',{exact:true}).check();
    await day.getByLabel('Preço (R$)',{exact:true}).fill('12.50');
    await editor.getByRole('button',{name:'Salvar tarifa',exact:true}).click();
    await editor.waitFor({state:'detached'});
    await expectText(page.locator('.rp-rate-card'),'12,50');
    await page.locator('.rp-rate-card').getByRole('button',{name:'Editar',exact:true}).click();
    editor=page.getByRole('dialog',{name:'Editar tarifa',exact:true});day=editor.getByRole('group',{name:'Dia',exact:true});
    await day.getByLabel('Preço (R$)',{exact:true}).fill('25.00');
    await editor.getByRole('button',{name:'Salvar tarifa',exact:true}).click();
    let confirmation=page.getByRole('dialog',{name:'Confirmar alteração',exact:true});
    await confirmation.getByLabel('Sua senha',{exact:true}).fill('incorrect-long-password');
    await confirmation.getByLabel('Código MFA',{exact:true}).fill('000000');
    await confirmation.getByRole('button',{name:'Confirmar e salvar',exact:true}).click();
    await confirmation.waitFor({state:'detached'});
    await expectText(editor.locator('.rp-dialog-message'),'inválido');
    await editor.getByRole('button',{name:'Salvar tarifa',exact:true}).click();
    confirmation=page.getByRole('dialog',{name:'Confirmar alteração',exact:true});
    await confirmation.getByLabel('Sua senha',{exact:true}).fill(owner.initialPassword);
    await confirmation.getByLabel('Código MFA',{exact:true}).fill(totpCodeAt(owner.totpSecretBase32,new Date()));
    await confirmation.getByRole('button',{name:'Confirmar e salvar',exact:true}).click();
    await editor.waitFor({state:'detached'});await expectText(page.locator('.rp-rate-card'),'25,00');
    const auditsBefore=(await admin.listAudit(100)).length;
    await page.getByRole('button',{name:'Simular corrida',exact:true}).click();
    const simulation=page.getByRole('dialog',{name:'Simular corrida',exact:true});
    await simulation.getByLabel('Origem',{exact:true}).selectOption('prea');
    await simulation.getByLabel('Destino',{exact:true}).selectOption('prea');
    await simulation.getByLabel('Categoria',{exact:true}).selectOption('moto');
    await simulation.getByRole('button',{name:'Calcular preço',exact:true}).click();
    await expectText(simulation.locator('.rp-simulation-result'),'25,00');
    assert.equal((await admin.listAudit(100)).length,auditsBefore);
    await simulation.getByLabel('Período',{exact:true}).selectOption('after_22');
    await simulation.getByRole('button',{name:'Calcular preço',exact:true}).click();
    await expectText(simulation.locator('.rp-dialog-message'),'indisponível');
    await simulation.getByRole('button',{name:'Fechar',exact:true}).click();
    await page.locator('.rp-rate-card').getByRole('button',{name:'Excluir',exact:true}).click();
    const archive=page.getByRole('dialog',{name:'Excluir tarifa',exact:true});
    await archive.getByRole('button',{name:'Excluir com segurança',exact:true}).click();
    confirmation=page.getByRole('dialog',{name:'Confirmar alteração',exact:true});
    await confirmation.getByLabel('Sua senha',{exact:true}).fill(owner.initialPassword);
    await confirmation.getByLabel('Código MFA',{exact:true}).fill(totpCodeAt(owner.totpSecretBase32,new Date(Date.now()+30000)));
    await confirmation.getByRole('button',{name:'Confirmar e salvar',exact:true}).click();
    await archive.waitFor({state:'detached'});assert.equal(await page.locator('.rp-rate-card').count(),0);
    await page.locator('.rp-archived summary').click();
    await page.getByRole('button',{name:'Restaurar',exact:true}).click();
    await expectText(page.locator('.rp-rate-card'),'Desativada');
    await page.getByRole('tab',{name:'Regiões',exact:true}).click();
    const prea=page.locator('.rp-region-card').filter({has:page.getByRole('heading',{name:'Preá',exact:true})});
    await prea.getByRole('button',{name:'Editar',exact:true}).click();
    wizard=page.getByRole('dialog',{name:'Editar região',exact:true});
    const coords=await wizard.locator('.rp-hint').filter({hasText:'Ponto selecionado:'}).textContent();
    const pin=wizard.locator('.pricing-geofence-map__pin'),box=await pin.boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+5,{steps:5});await page.mouse.up();
    assert.notEqual(await wizard.locator('.rp-hint').filter({hasText:'Ponto selecionado:'}).textContent(),coords);
    const radiusBefore=Number(await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).inputValue());
    await wizard.locator('.rp-radius-handle').focus();await page.keyboard.press('ArrowRight');
    assert.ok(Number(await wizard.getByLabel('Raio de cobertura (km)',{exact:true}).inputValue())>radiusBefore);
    await wizard.getByRole('button',{name:'Fechar',exact:true}).click();
    for(const width of [1440,860,390]){
      await page.evaluate(()=>{document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});window.scrollTo(0,0);});
      await page.setViewportSize({width,height:width===390?844:1000});
      await page.screenshot({path:resolve(out,engine+'-regions-'+width+'.png'),fullPage:true});
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false,'Horizontal overflow at '+width);
      if(engine==='chromium'&&width!==1440){
        const capture=await page.screenshot({type:'jpeg',quality:55});
        console.log('RP_PREVIEW_'+width+':'+capture.toString('base64'));
      }
    }
    if(engine==='chromium'){
      await page.setViewportSize({width:1200,height:900});
      await page.evaluate(()=>window.scrollTo(0,0));
      const preview=await page.screenshot({type:'jpeg',quality:48});
      await writeFile(resolve(out,'preview.jpg'),preview);
      console.log('RP_PREVIEW_BASE64:'+preview.toString('base64'));
    }
    await page.goto(base+'/reader');
    await page.locator('.rp-region-card').filter({hasText:'Preá'}).waitFor();
    assert.equal(await page.getByRole('button',{name:/Adicionar região/}).isDisabled(),true);
    const denied=await fetch(base+'/v1/admin/pricing/management',{method:'PUT',headers:{authorization:'Bearer '+readerToken,'content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),mutation:{kind:'region.archive',id:'prea'}})});
    assert.equal(denied.status,403);
    assert.deepEqual(errors,[]);
    console.log('PASS '+engine+': real management HTTP/auth/MFA; region wizard; tariff save/edit/archive/restore; fixed simulation; missing night; map drag/keyboard; readonly; desktop/tablet/mobile overflow.');
  }catch(error){console.log('BROWSER_DIAGNOSTIC '+JSON.stringify({engine,errors,message:await page.locator('[data-rp="message"]').textContent().catch(()=>null)}));await page.screenshot({path:resolve(out,engine+'-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
}
for(const engine of ['chromium','webkit'])await run(engine);
