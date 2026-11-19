import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openInterestStore } from '../db/interests.ts';
import { openSiteManagement } from '../db/site-management.ts';
import { defaultContent,contentSchema } from '../lib/site-content.ts';
import { authorizeSite } from '../lib/site-auth.ts';
import { receiveAsset } from '../lib/site-files.ts';
const token='rn_admin_session_'+'a'.repeat(43);
const req=(method='GET',origin='https://app.ramonessa.com.br')=>new Request('http://site/site-management/content',{method,headers:{authorization:'Bearer '+token,origin}});
test('every request validates the live Core session and required scope, rejects foreign mutations',async()=>{
  let calls=0;const mock=async(url,options)=>{calls++;assert.equal(url.pathname,'/v1/admin/auth/me');assert.equal(options.headers.authorization,'Bearer '+token);assert.equal(options.redirect,'error');return Response.json({user:{id:'actor',name:'Owner',scopes:['communications:read']}});};
  assert.equal((await authorizeSite(req(),'communications:read',mock)).id,'actor');
  await assert.rejects(authorizeSite(req(),'communications:write',mock),e=>e.status===403);
  await assert.rejects(authorizeSite(req('POST','https://evil.test'),'communications:read',mock),e=>e.status===403);
  await assert.rejects(authorizeSite(req(),'communications:read',async()=>new Response(null,{status:401})),e=>e.status===401);
  await assert.rejects(authorizeSite(new Request('http://site/'),'communications:read',mock),e=>e.status===401);
  assert.equal(calls,2);
});
test('existing leads retained, filter/pagination and review conflicts, no driver account created',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ramo-cms-'));const filename=join(dir,'db.sqlite');
  try{let interests=openInterestStore(filename);interests.save({id:'id1',name:'Nome <script>',phone:'88999999999',region:'Preá',vehicle:'Mototáxi'});interests.close();let store=openSiteManagement(filename);
    assert.equal(store.leads('new','',1).total,1);store.review('id1','contacted','Observação',0,'actor');assert.equal(store.leads('new','',1).total,0);assert.equal(store.leads('contacted','88999',1).items[0].notes,'Observação');assert.throws(()=>store.review('id1','closed','',0,'actor'),e=>e.status===409);assert.throws(()=>store.review('missing','closed','',0,'actor'),e=>e.status===404);store.close();store=openSiteManagement(filename);assert.equal(store.leads('','',1).items[0].revision,1);store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('draft, publication, rollback, optimistic locking and immutable audit survive restart',()=>{
 const store=openSiteManagement(':memory:');try{const changed={...structuredClone(defaultContent),heroTitle:'Um novo destino'};const draft=store.saveDraft(changed,0,'editor');assert.equal(draft.published.heroTitle,defaultContent.heroTitle);assert.throws(()=>store.publish(0,'editor'),e=>e.status===409);const published=store.publish(1,'publisher');assert.equal(published.published.heroTitle,changed.heroTitle);assert.equal(store.releases().length,1);const restored=store.restore(Number(store.releases()[0].id),2,'editor');assert.equal(restored.draft.heroTitle,defaultContent.heroTitle);assert.equal(restored.published.heroTitle,changed.heroTitle);store.publish(3,'publisher');assert.equal(store.state().published.heroTitle,defaultContent.heroTitle);assert.equal(store.audit().length,4);assert.throws(()=>store.saveDraft({...changed,heroImage:'/media/'+'a'.repeat(64)+'.png'},4,'editor'),e=>e.status===400);}finally{store.close();}
});
test('content forbids scripts, credential URLs, unknown fields and duplicate app roles',()=>{
 for(const value of [{...defaultContent,apps:defaultContent.apps.map(a=>({...a,webHref:'javascript:alert(1)'}))},{...defaultContent,photoCreditUrl:'https://u:p@example.com'},{...defaultContent,heroImage:'https://evil.test/a.svg'},{...defaultContent,unexpected:'script'},{...defaultContent,apps:[defaultContent.apps[0],defaultContent.apps[0]]}])assert.equal(contentSchema.safeParse(value).success,false);
});
test('uploads stream to private files, hash their content and clean up invalid payloads',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ramo-upload-'));const prior=process.env.INTERESTS_DB_PATH;process.env.INTERESTS_DB_PATH=join(dir,'db.sqlite');
 try{const png=Buffer.from('89504e470d0a1a0a00000000','hex');const asset=await receiveAsset(new Request('http://site',{method:'POST',body:png}),'image');assert.equal(asset.extension,'png');assert.deepEqual(readFileSync(join(dir,'assets',asset.id+'.png')),png);await assert.rejects(receiveAsset(new Request('http://site',{method:'POST',body:'<svg onload="x">x</svg>'}),'image'),e=>e.status===400);await assert.rejects(receiveAsset(new Request('http://site',{method:'POST',body:'PK\x03\x04this is not android'}),'apk'),e=>e.status===400);assert.equal(readdirSync(join(dir,'assets')).length,1);}finally{if(prior===undefined)delete process.env.INTERESTS_DB_PATH;else process.env.INTERESTS_DB_PATH=prior;rmSync(dir,{recursive:true,force:true});}
});
