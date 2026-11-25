import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync,rmSync,mkdirSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'rn-training-http-')),origin='http://127.0.0.1:4401';
const owner='rn_admin_session_'+'a'.repeat(43),tokens={alice:'a'.repeat(43),bob:'b'.repeat(43),passenger:'p'.repeat(43)};let revoked=false;const loginCalls=[];
const core=createServer(async(req,res)=>{
 const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 const token=req.headers.authorization?.slice(7);
 if(req.url==='/v1/admin/auth/me')return json({user:{id:'editor',name:'Editor',scopes:token===owner?['communications:read','communications:write']:[]}});
 if(req.url==='/v1/auth/driver/password/login'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=JSON.parse(Buffer.concat(chunks));loginCalls.push({data,forwarded:req.headers['x-forwarded-for']});
  if(data.identifier==='rate-limit')return json({},429);
  if(data.password!=='test-password'||!['alice','bob'].includes(data.identifier))return json({},401);
  return json({accessToken:tokens[data.identifier],subjectId:data.identifier,subjectType:'driver',expiresAt:new Date(Date.now()+3600000).toISOString()},201);
 }
 if(req.url==='/v1/auth/me/check'){
  const id=Object.keys(tokens).find(id=>tokens[id]===token);if(!id||revoked)return json({},401);return json({subjectId:id,subjectType:id==='passenger'?'passenger':'driver'});
 }
 if(req.url==='/v1/auth/session'&&req.method==='DELETE')return json({ok:true});
 return json({},404);
});
core.listen(0,'127.0.0.1');await once(core,'listening');
const child=spawn(process.execPath,[process.env.RAMO_SITE_SERVER_ENTRY??'.next/standalone/server.js'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'4401',PUBLIC_SITE_ORIGIN:origin,ADMIN_SITE_ORIGIN:origin,CORE_INTERNAL_URL:'http://127.0.0.1:'+core.address().port,INTERESTS_DB_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);const exit=once(child,'exit');
let browser;
try{
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 const request=(path,{method='GET',body,token,cookie,foreign=false,headers={}}={})=>fetch(origin+path,{method,headers:{origin:foreign?'https://evil.test':origin,...(token?{authorization:'Bearer '+token}:{}),...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const admin=(path,options={})=>request('/site-management/'+path,{...options,token:owner});
 assert.equal((await request('/api/driver-training')).status,401);assert.equal((await request('/api/driver-training/session')).status,200);
 const shell=await(await request('/motoristas')).text();assert.ok(!shell.includes(tokens.alice));
 assert.equal((await request('/api/driver-training/session',{method:'POST',foreign:true,body:{identifier:'alice',password:'test-password'}})).status,403);assert.equal(loginCalls.length,0);
 assert.equal((await request('/api/driver-training/session',{method:'POST',body:{identifier:'wrong',password:'wrong'}})).status,401);
 assert.equal((await request('/api/driver-training/session',{method:'POST',body:{identifier:'rate-limit',password:'wrong'}})).status,429);
 const login=await request('/api/driver-training/session',{method:'POST',body:{identifier:'alice',password:'test-password'},headers:{'x-forwarded-for':'203.0.113.10, 10.0.0.1'}});assert.equal(login.status,200);
 assert.equal(loginCalls.at(-1).forwarded,'203.0.113.10');assert.deepEqual(await login.json(),{ok:true});assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const alice=login.headers.get('set-cookie').split(';')[0],bob='__Host-rn_training='+tokens.bob;
 const training=await(await admin('training')).json();assert.equal(training.draft.lessons.length,0);
 const titles=['Como acessar o aplicativo','Fique online e receba corridas','Da aceitação ao desembarque'];
 training.draft.lessons=titles.map((title,i)=>({id:'lesson-'+i,moduleId:['primeiros-passos','primeiros-passos','corridas'][i],title,description:'Conteúdo de teste. Confira as orientações da aula.\nAtenção às informações do aplicativo.',youtubeUrl:'https://www.youtube.com/watch?v=M7lc1UVf-VE',duration:(i+2)+' min',cover:'',visible:true}));
 training.draft.lessons.push({...training.draft.lessons[0],id:'hidden',title:'Ainda não publicar',visible:false});
 training.draft.noticeTitle='Atenção aos pagamentos';training.draft.notice='Orientações de teste sobre pagamentos e conclusão das corridas.';
 assert.equal((await admin('training/draft',{method:'PUT',body:{content:training.draft,expectedRevision:0}})).status,200);
 assert.equal((await(await request('/api/driver-training',{cookie:alice})).json()).content.lessons.length,0);
 assert.equal((await admin('training/publish',{method:'POST',body:{expectedRevision:0}})).status,409);
 assert.equal((await admin('training/publish',{method:'POST',body:{expectedRevision:1}})).status,200);
 const catalog=await(await request('/api/driver-training',{cookie:alice})).json();assert.equal(catalog.content.lessons.length,3);assert.ok(!JSON.stringify(catalog).includes('Ainda não publicar'));
 assert.ok(!(await(await request('/api/site-content')).text()).includes('Ainda não publicar'));
 assert.equal((await request('/api/driver-training',{cookie:'__Host-rn_training='+tokens.passenger})).status,403);
 const complete=(cookie,lessonId,extra={})=>request('/api/driver-training',{method:'PUT',cookie,body:{lessonId,completed:true,...extra}});
 assert.equal((await complete(alice,'lesson-0',{driverId:'bob'})).status,400);
 assert.equal((await complete(alice,'lesson-0')).status,200);assert.equal((await complete(alice,'hidden')).status,404);
 assert.equal((await request('/api/driver-training',{method:'PUT',cookie:alice,foreign:true,body:{lessonId:'lesson-1',completed:true}})).status,403);
 assert.deepEqual((await(await request('/api/driver-training',{cookie:alice})).json()).completed,['lesson-0']);assert.deepEqual((await(await request('/api/driver-training',{cookie:bob})).json()).completed,[]);
 revoked=true;assert.equal((await request('/api/driver-training',{cookie:alice})).status,401);revoked=false;
 if(process.env.RN_PREVIEW==='1'){console.log('Prévia isolada pronta em '+origin+'/motoristas');await new Promise(()=>{});}
 if(process.env.PLAYWRIGHT_MODULE){
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/motoristas');await page.getByRole('heading',{name:'Aprender também faz parte do caminho.'}).waitFor();
  const screenshots=process.env.RN_SCREENSHOTS_DIR;if(screenshots){mkdirSync(screenshots,{recursive:true});await page.screenshot({path:join(screenshots,'central-login-desktop.png'),fullPage:true});}
  await page.getByLabel('Usuário ou e-mail').fill('alice');await page.getByLabel('Senha',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Entrar na Central'}).click();
  await page.getByRole('heading',{name:'Aprenda. Pratique. Ramo nessa.'}).waitFor();await page.getByText('1 de 3 aulas concluídas',{exact:true}).waitFor();
  if(screenshots)await page.screenshot({path:join(screenshots,'central-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Continuar aprendendo',exact:true}).click();await page.locator('iframe[title="Fique online e receba corridas"]').waitFor();
  assert.match(await page.locator('iframe').getAttribute('src'),/^https:\/\/www.youtube-nocookie.com\/embed\/M7lc1UVf-VE/);
  await page.getByRole('button',{name:'Concluir aula',exact:true}).click();await page.getByRole('button',{name:'Marcar como não concluída'}).waitFor();
  await page.getByRole('button',{name:'Fechar aula'}).click();await page.getByText('2 de 3 aulas concluídas',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Pagamentos',exact:true}).click();await page.getByRole('heading',{name:'Nenhuma aula encontrada'}).waitFor();
  await page.getByRole('button',{name:'Todas',exact:true}).click();await page.getByRole('textbox',{name:'Buscar aula'}).fill('inexistente');await page.getByRole('heading',{name:'Nenhuma aula encontrada'}).waitFor();await page.getByRole('textbox',{name:'Buscar aula'}).fill('');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(screenshots)await page.screenshot({path:join(screenshots,'central-celular.png'),fullPage:true});
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Avisos importantes',exact:true}).click();await page.getByRole('heading',{name:'Atenção aos pagamentos'}).waitFor();
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Sair da Central'}).click();await page.getByRole('button',{name:'Entrar na Central'}).waitFor();
  await page.setViewportSize({width:320,height:700});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await context.close();console.log('Navegador: login, progresso, player, busca, filtros, menu móvel e logout aprovados.');
 }
 const logout=await request('/api/driver-training/session',{method:'DELETE',cookie:alice});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);

 const initialSite=await(await request('/api/site-content')).json();
 const accessBody={mode:'shared',username:'motoristas',password:'SenhaDoGrupo123!',expectedRevision:0};
 assert.equal((await request('/site-management/training/access',{method:'PUT',body:accessBody})).status,401);
 assert.equal((await admin('training/access',{method:'PUT',body:accessBody,foreign:true})).status,403);
 assert.equal((await admin('training/access',{method:'PUT',body:accessBody})).status,200);
 assert.equal((await admin('training/access',{method:'PUT',body:accessBody})).status,409);
 assert.equal((await request('/api/driver-training',{cookie:alice})).status,401);
 const coreCalls=loginCalls.length;
 assert.equal((await request('/api/driver-training/session',{method:'POST',body:{identifier:'motoristas',password:'errada'}})).status,401);
 const sharedLogin=await request('/api/driver-training/session',{method:'POST',body:{identifier:'motoristas',password:'SenhaDoGrupo123!'}});assert.equal(sharedLogin.status,200);
 const shared=sharedLogin.headers.get('set-cookie').split(';')[0];
 assert.equal(loginCalls.length,coreCalls);
 let publicCatalog=await(await request('/api/driver-training',{cookie:shared})).json();assert.equal(publicCatalog.accessMode,'shared');assert.deepEqual(publicCatalog.completed,[]);
 assert.equal((await complete(shared,'lesson-0')).status,403);
 const privateAccess=await(await admin('training')).json();assert.equal(privateAccess.access.hasPassword,true);assert.ok(!JSON.stringify(privateAccess).includes('SenhaDoGrupo123!'));assert.ok(!JSON.stringify(privateAccess).includes('password_hash'));
 assert.equal((await admin('training/access',{method:'PUT',body:{...accessBody,mode:'public',password:'',expectedRevision:1}})).status,200);
 publicCatalog=await(await request('/api/driver-training')).json();assert.equal(publicCatalog.accessMode,'public');assert.equal(publicCatalog.content.lessons.length,3);assert.deepEqual(publicCatalog.completed,[]);
 assert.ok(!JSON.stringify(publicCatalog).includes('motoristas'));assert.equal((await complete(null,'lesson-0')).status,403);
 assert.equal((await admin('training/access',{method:'PUT',body:{...accessBody,password:'NovaSenhaGrupo456!',expectedRevision:2}})).status,200);
 assert.equal((await request('/api/driver-training',{cookie:shared})).status,401);
 assert.equal((await request('/api/driver-training/session',{method:'POST',body:{identifier:'motoristas',password:'SenhaDoGrupo123!'}})).status,401);
 const fresh=await request('/api/driver-training/session',{method:'POST',body:{identifier:'motoristas',password:'NovaSenhaGrupo456!'}});const freshCookie=fresh.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/driver-training/session',{method:'DELETE',cookie:freshCookie})).status,200);assert.equal((await request('/api/driver-training',{cookie:freshCookie})).status,401);
 assert.equal((await admin('training/access',{method:'PUT',body:{...accessBody,mode:'individual',password:'',expectedRevision:3}})).status,200);
 assert.deepEqual((await(await request('/api/driver-training',{cookie:alice})).json()).completed,browser?['lesson-0','lesson-1']:['lesson-0']);
 assert.deepEqual(await(await request('/api/site-content')).json(),initialSite);

 if(browser){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await page.route('**/access-admin.js',route=>route.fulfill({contentType:'text/javascript',body:readFileSync('../admin/src/site-admin.js','utf8')}));
  await page.route('**/api.js',route=>route.fulfill({contentType:'text/javascript',body:'export class AdminApiError extends Error { constructor(message,options){super(message);Object.assign(this,options);} }'}));
  await page.goto(origin+'/motoristas');
  await page.evaluate(async(token)=>{document.body.innerHTML='<div id="admin-test"><div id="site-tabs"></div><p id="site-status"></p><div id="site-workspace"></div></div>';const {createSiteAdmin}=await import('/access-admin.js');createSiteAdmin({root:document.querySelector('#admin-test'),getToken:()=>token,hasScope:scope=>scope.startsWith('communications:'),onError:()=>{}});},owner);
  await page.getByRole('button',{name:'Central do Motorista',exact:true}).click();await page.getByRole('heading',{name:'Acesso à Central',exact:true}).waitFor();
  await page.getByLabel('Modo de acesso').selectOption('public');await page.getByRole('button',{name:'Salvar acesso à Central',exact:true}).click();await page.getByText('Acesso atualizado. A mudança já está valendo.',{exact:true}).waitFor();
  assert.equal((await(await request('/api/driver-training/session')).json()).accessMode,'public');
  const visitor=await browser.newContext({viewport:{width:390,height:844}}),visitorPage=await visitor.newPage();await visitorPage.goto(origin+'/motoristas');await visitorPage.getByRole('heading',{name:'Aprenda. Pratique. Ramo nessa.'}).waitFor();
  assert.equal(await visitorPage.getByRole('button',{name:'Entrar na Central'}).count(),0);
  await visitorPage.getByRole('button',{name:'Assistir à primeira aula',exact:true}).click();await visitorPage.getByRole('button',{name:'Concluir aula',exact:true}).click();await visitorPage.getByRole('button',{name:'Marcar como não concluída'}).waitFor();await visitorPage.reload();await visitorPage.getByText('1 de 3 aulas concluídas',{exact:true}).waitFor();
  const other=await browser.newContext(),otherPage=await other.newPage();await otherPage.goto(origin+'/motoristas');await otherPage.getByText('0 de 3 aulas concluídas',{exact:true}).waitFor();await other.close();
  await page.getByLabel('Modo de acesso').selectOption('shared');await page.getByLabel('Usuário compartilhado').fill('equipe');await page.getByLabel('Nova senha (vazio mantém a atual)').fill('SenhaNovaEquipe123!');
  await page.getByRole('button',{name:'Adicionar módulo',exact:true}).click();assert.equal(await page.getByLabel('Usuário compartilhado').inputValue(),'equipe');assert.equal(await page.getByLabel('Nova senha (vazio mantém a atual)').inputValue(),'SenhaNovaEquipe123!');
  await page.getByRole('button',{name:'Salvar acesso à Central',exact:true}).click();await page.getByText('Acesso atualizado. A mudança já está valendo.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Nova senha (vazio mantém a atual)').inputValue(),'');
  await visitorPage.reload();await visitorPage.getByRole('button',{name:'Entrar na Central'}).waitFor();await visitorPage.getByLabel('Usuário ou e-mail').fill('equipe');await visitorPage.getByLabel('Senha',{exact:true}).fill('SenhaNovaEquipe123!');await visitorPage.getByRole('button',{name:'Entrar na Central'}).click();await visitorPage.getByRole('heading',{name:'Aprenda. Pratique. Ramo nessa.'}).waitFor();
  await visitorPage.getByRole('button',{name:'Abrir menu',exact:true}).click();await visitorPage.getByRole('button',{name:'Sair da Central'}).click();await visitorPage.getByRole('button',{name:'Entrar na Central'}).waitFor();
  await visitor.close();await context.close();
  console.log('Navegador: controles do ADM, acesso livre, progresso por navegador e login compartilhado aprovados.');
 }
 console.log('HTTP: login compartilhado, acesso livre, rotação de senha, logout, proteção do ADM e retorno ao individual aprovados.');
 console.log('HTTP: autenticação, publicação, isolamento por motorista, CSRF, sessão revogada e logout aprovados.');
}finally{await browser?.close();child.kill('SIGTERM');await exit;core.close();await once(core,'close');rmSync(dir,{recursive:true,force:true});}
