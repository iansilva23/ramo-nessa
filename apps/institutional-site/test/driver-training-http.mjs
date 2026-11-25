import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync,rmSync,mkdirSync } from 'node:fs';
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
 assert.equal((await request('/api/driver-training')).status,401);assert.equal((await request('/api/driver-training/session')).status,401);
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
 console.log('HTTP: autenticação, publicação, isolamento por motorista, CSRF, sessão revogada e logout aprovados.');
}finally{await browser?.close();child.kill('SIGTERM');await exit;core.close();await once(core,'close');rmSync(dir,{recursive:true,force:true});}
