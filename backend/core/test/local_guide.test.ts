import assert from 'node:assert/strict';
import test from 'node:test';
import {guideData,mutateGuide,publicGuide,safeGuideUrl,GuideError,type GuideState} from '../src/guide/guide.js';
import {MemoryGuideStore,guideImagePublic} from '../src/guide/guide-store.js';
const draft=(name:string,extra:Record<string,unknown>={})=>guideData({name,...extra});
const seed=():GuideState=>({revision:0,entities:[
 {id:'jeri',kind:'locality',parentId:null,draft:draft('Jeri'),published:draft('Jeri'),archived:false},
 {id:'food',kind:'category',parentId:'jeri',draft:draft('Gastronomia',{template:'gastronomy'}),published:draft('Gastronomia',{template:'gastronomy'}),archived:false},
]});
function apply(s:GuideState,b:Record<string,unknown>){return mutateGuide(s,{expectedRevision:s.revision,...b});}
test('draft edits preserve published snapshots; unpublish/archive never remove content',()=>{
 let s=apply(seed(),{op:'save',id:'restaurant',kind:'item',parentId:'food',data:{name:'Restaurante teste',actions:[{id:'ig',type:'instagram',url:'https://instagram.com/example',primary:true}]}});
 assert.equal(publicGuide(s).entities.length,2);s=apply(s,{op:'publish',id:'restaurant'});const before=publicGuide(s).entities.find(e=>e.id==='restaurant');
 s=apply(s,{op:'save',id:'restaurant',kind:'item',parentId:'food',data:{name:'Nome em revisão'}});assert.deepEqual(publicGuide(s).entities.find(e=>e.id==='restaurant'),before);
 s=apply(s,{op:'unpublish',id:'restaurant'});assert.equal(publicGuide(s).entities.length,2);assert.equal(s.entities.length,3);
 s=apply(s,{op:'archive',id:'restaurant'});s=apply(s,{op:'restore',id:'restaurant'});assert.equal(s.entities.at(-1)?.draft.name,'Nome em revisão');assert.equal(s.entities.at(-1)?.published,null);
});
test('delivery supports WhatsApp + Instagram without coordinates or route',()=>{
 let s=apply(seed(),{op:'save',id:'delivery',kind:'item',parentId:'food',data:{name:'Delivery teste',actions:[{id:'w',type:'whatsapp',phone:'+55 (88) 99999-9999',message:'Olá! Quero pedir.'},{id:'i',type:'instagram',url:'https://www.instagram.com/example'}]}});
 s=apply(s,{op:'publish',id:'delivery'});const d=publicGuide(s).entities.find(e=>e.id==='delivery')!;assert.equal(d.latitude,null);assert.deepEqual(d.actions.map(a=>a.type),['whatsapp','instagram']);assert.equal(d.actions[0]?.phone,'5588999999999');
});
test('route publication requires finite, valid coordinates; disabled actions do not force a destination',()=>{
 for(const [lat,lng]of [[NaN,1],[91,0],[0,-181],[null,1]])assert.throws(()=>draft('Place',{latitude:lat,longitude:lng}));
 let s=apply(seed(),{op:'save',id:'venue',kind:'item',parentId:'food',data:{name:'Casa teste',actions:[{id:'r',type:'route'}]}});
 assert.throws(()=>apply(s,{op:'publish',id:'venue'}),/localização/);
 s=apply(s,{op:'save',id:'venue',kind:'item',parentId:'food',data:{name:'Casa teste',latitude:0,longitude:0,actions:[{id:'r',type:'route'}]}});s=apply(s,{op:'publish',id:'venue'});assert.equal(publicGuide(s).entities.find(e=>e.id==='venue')?.latitude,0);
});
test('hierarchy prevents invalid parents and public children of hidden ancestors',()=>{
 assert.throws(()=>apply(seed(),{op:'save',id:'x',kind:'item',parentId:'jeri',data:{name:'x'}}));
 let s=apply(seed(),{op:'save',id:'x',kind:'item',parentId:'food',data:{name:'x'}});s=apply(s,{op:'publish',id:'x'});s=apply(s,{op:'unpublish',id:'jeri'});assert.equal(publicGuide(s).entities.length,0);assert.equal(s.entities.length,3);
 assert.throws(()=>apply(s,{op:'publish',id:'x'}),/Publique primeiro/);
});
test('links reject scripts, credentials, local hosts and wrong Instagram hosts',()=>{
 for(const u of ['javascript:alert(1)','data:text/html,x','http://example.com','https://localhost','https://127.0.0.1','https://foo.local','https://user:pass@example.com','https://example.com:123'])assert.throws(()=>safeGuideUrl(u));
 assert.throws(()=>safeGuideUrl('https://instagram.com.evil.example',true));assert.equal(safeGuideUrl('https://example.com/path'),'https://example.com/path');
});
test('internal actions require a published target; drafts and self targets rejected',()=>{
 let s=apply(seed(),{op:'save',id:'x',kind:'item',parentId:'food',data:{name:'x',actions:[{id:'a',type:'internal',targetId:'x'}]}});assert.throws(()=>apply(s,{op:'publish',id:'x'}));
 s=apply(s,{op:'save',id:'x',kind:'item',parentId:'food',data:{name:'x',actions:[{id:'a',type:'internal',targetId:'food'}]}});assert.doesNotThrow(()=>apply(s,{op:'publish',id:'x'}));
});
test('model changes retain compatible and model-specific fields',()=>{
 let s=seed();s=apply(s,{op:'save',id:'food',kind:'category',parentId:'jeri',data:{...s.entities[1]!.draft,template:'events',filters:['Festas']}});assert.equal(s.entities[1]!.published!.template,'gastronomy');assert.equal(s.entities[1]!.draft.template,'events');
});
test('concurrent stale edits return a conflict and never overwrite',async()=>{
 const store=new MemoryGuideStore(seed()),body={op:'save',id:'new',kind:'item',parentId:'food',data:{name:'Primeiro'},expectedRevision:0};const result=await Promise.allSettled([store.write(body,'A'),store.write({...body,id:'other'},'B')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);const rejected=result.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal((rejected.reason as GuideError).status,409);
 assert.equal((await store.read()).entities.length,3);assert.equal((await store.history()).length,1);
});
test('new photos stay private until publication, replacements preserve old image bytes',async()=>{
 const store=new MemoryGuideStore(seed()),a=await store.upload('image/png',Buffer.from('image-a')),b=await store.upload('image/png',Buffer.from('image-b'));
 let s=await store.write({op:'save',id:'photo',kind:'item',parentId:'food',expectedRevision:0,data:{name:'Photo',image:'/v1/content/guide/images/'+a}},'A');assert.equal(await guideImagePublic(store,a),false);
 s=await store.write({op:'publish',id:'photo',expectedRevision:s.revision},'A');assert.equal(await guideImagePublic(store,a),true);
 s=await store.write({op:'save',id:'photo',kind:'item',parentId:'food',expectedRevision:s.revision,data:{name:'Photo edited',image:'/v1/content/guide/images/'+b}},'A');assert.equal(await guideImagePublic(store,a),true);assert.equal(await guideImagePublic(store,b),false);assert.equal((await store.image(a))?.bytes.toString(),'image-a');
 assert.equal((await store.history())[1]?.state.entities.at(-1)?.published?.name,'Photo');
});
test('reject missing images, duplicate button IDs and unbounded fields',async()=>{
 const store=new MemoryGuideStore(seed());await assert.rejects(()=>store.write({op:'save',id:'x',kind:'item',parentId:'food',expectedRevision:0,data:{name:'x',image:'/v1/content/guide/images/missing'}},'A'));
 assert.throws(()=>draft('x',{actions:[{id:'same',type:'none'},{id:'same',type:'none'}]}));assert.throws(()=>draft('x',{summary:'x'.repeat(281)}));assert.equal((await store.read()).revision,0);
});
test('reorder applies only order to public content while keeping edited text private',()=>{
 let s=apply(seed(),{op:'save',id:'a',kind:'item',parentId:'food',data:{name:'Publicado A'}});s=apply(s,{op:'publish',id:'a'});s=apply(s,{op:'save',id:'b',kind:'item',parentId:'food',data:{name:'Publicado B'}});s=apply(s,{op:'publish',id:'b'});s=apply(s,{op:'save',id:'a',kind:'item',parentId:'food',data:{name:'Nome privado'}});
 s=apply(s,{op:'reorder',id:'a',ids:['b','a']});assert.deepEqual(publicGuide(s).entities.filter(e=>e.kind==='item').map(e=>e.name),['Publicado B','Publicado A']);assert.equal(s.entities.find(e=>e.id==='a')!.draft.name,'Nome privado');assert.throws(()=>apply(s,{op:'reorder',id:'a',ids:['a']}));
});
