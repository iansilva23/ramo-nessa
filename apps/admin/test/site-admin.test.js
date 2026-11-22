import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteAdmin } from '../src/site-admin.js';
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.textContent='';this.value='';}
  append(...items){this.children.push(...items);} replaceChildren(...items){this.children=items;}
  setAttribute(){} removeAttribute(){}
  addEventListener(event,fn){this.listeners[event]=fn;}
}
test('site module fetches leads using the in-memory session, renders submitted text safely and cleans up',async()=>{
 const previous={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const targets=Object.fromEntries(['#site-workspace','#site-status','#site-tabs'].map(k=>[k,new Element()]));
 const root={querySelector:k=>targets[k],setAttribute(){},removeAttribute(){}};const calls=[];
 globalThis.document={createElement:tag=>new Element(tag)};globalThis.window={addEventListener(){}};
 globalThis.fetch=async(path,options)=>{calls.push({path,options});return Response.json({items:[{id:'abc',name:'<script>no execution</script>',phone:'88999999999',region:'Preá',vehicle:'Mototáxi',created_at:0,status:'new',notes:'',revision:0}],total:1,page:1});};
 try{const module=createSiteAdmin({root,getToken:()=> 'rn_admin_session_memory',hasScope:s=>s==='drivers:profile:read'});await new Promise(r=>setTimeout(r,20));assert.equal(calls.length,1);assert.ok(calls[0].path.startsWith('/site-management/leads?'));assert.ok(!calls[0].path.includes('rn_admin'));assert.equal(calls[0].options.headers.authorization,'Bearer rn_admin_session_memory');assert.equal(calls[0].options.credentials,'omit');
 const flat=n=>[n,...n.children.flatMap(c=>typeof c==='object'?flat(c):[])];const nodes=flat(targets['#site-workspace']);assert.ok(nodes.some(n=>n.tag==='h2'&&n.textContent==='<script>no execution</script>'));assert.ok(nodes.some(n=>n.tag==='button'&&n.textContent==='Salvar acompanhamento'&&n.disabled));module.destroy();assert.equal(calls[0].options.signal.aborted,true);
 }finally{Object.assign(globalThis,previous);}
});
test('site editor has an isolated route and uses no HTML injection or persistent browser credentials',async()=>{
 const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');const source=await readFile(new URL('../src/site-admin.js',import.meta.url),'utf8');assert.match(app,/\/administrodo\/site-aplicativos/);assert.match(app,/siteAdmin\.destroy\(\)/);assert.doesNotMatch(source,/\.innerHTML|localStorage|sessionStorage/);
});
test('footer editor saves hidden edited contact as draft before explicit publication',async()=>{
 const previous={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const targets=Object.fromEntries(['#site-workspace','#site-status','#site-tabs'].map(k=>[k,new Element()]));
 const root={querySelector:k=>targets[k],setAttribute(){},removeAttribute(){}};
 const draft={heroTitle:'Título',heroAccent:'Destaque',heroDescription:'Descrição',driverTitle:'Motorista',driverAccent:'Destaque',driverDescription:'Descrição',downloadTitle:'Download',downloadAccent:'Aqui',heroImage:'/jericoacoara.webp',heroImageAlt:'Foto',appIcon:'/app-icon.webp',driverIcon:'/driver-icon.webp',photoCredit:'Crédito',photoCreditUrl:'',apps:[],footer:{enabled:true,companyName:'Ramo Nessa',cnpj:'69.495.337/0001-13',email:'suporteramonessa@gmail.com'}};
 let model={draft,revision:0,releases:[],audit:[]};const calls=[];
 globalThis.document={createElement:tag=>new Element(tag)};globalThis.window={addEventListener(){},confirm:()=>true};
 globalThis.fetch=async(path,options)=>{calls.push({path,options});if(options.method==='PUT'){model={...model,draft:JSON.parse(options.body).content,revision:1};}return Response.json(model);};
 const flat=n=>[n,...n.children.flatMap(c=>typeof c==='object'?flat(c):[])];
 try{const module=createSiteAdmin({root,getToken:()=> 'session',hasScope:s=>s.startsWith('communications:')});await new Promise(r=>setTimeout(r,20));
 let nodes=flat(targets['#site-workspace']);const toggle=nodes.find(n=>n.tag==='input'&&n.type==='checkbox');assert.equal(toggle.checked,true);toggle.checked=false;toggle.listeners.change();
 const email=nodes.find(n=>n.tag==='input'&&n.type==='email');email.value='novo@example.com';email.listeners.input();
 assert.equal(calls.length,1);nodes.find(n=>n.tag==='button'&&n.textContent==='Salvar rascunho').listeners.click();await new Promise(r=>setTimeout(r,20));
 const saved=JSON.parse(calls.find(c=>c.options.method==='PUT').options.body);assert.equal(saved.content.footer.enabled,false);assert.equal(saved.content.footer.email,'novo@example.com');assert.ok(!calls.some(c=>c.path.endsWith('/publish')));
 nodes=flat(targets['#site-workspace']);nodes.find(n=>n.tag==='button'&&n.textContent==='Publicar rascunho').listeners.click();await new Promise(r=>setTimeout(r,20));assert.ok(calls.some(c=>c.path.endsWith('/publish')&&c.options.method==='POST'));module.destroy();
 }finally{Object.assign(globalThis,previous);}
});
