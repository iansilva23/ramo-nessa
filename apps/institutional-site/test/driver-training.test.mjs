import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultTraining, trainingSchema, youtubeId } from '../lib/driver-training.ts';
import { openSiteManagement } from '../db/site-management.ts';
import { authorizeTraining, trainingCookie, trainingToken, requireTrainingOrigin } from '../lib/training-auth.ts';
const example=()=>({...structuredClone(defaultTraining),lessons:[{id:'first',moduleId:'primeiros-passos',title:'Abrir o aplicativo',description:'Atenção ao acesso.',duration:'2 min',cover:'',youtubeUrl:'https://youtu.be/M7lc1UVf-VE',visible:true},{id:'hidden',moduleId:'corridas',title:'Rascunho privado',description:'Ainda em preparação',duration:'',cover:'',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',visible:false}]});
test('YouTube IDs accept known video links, never arbitrary hosts/HTML/credentials',()=>{
 for(const value of ['https://youtu.be/M7lc1UVf-VE?si=test','https://www.youtube.com/watch?v=M7lc1UVf-VE&t=2','https://m.youtube.com/shorts/M7lc1UVf-VE','https://youtube.com/live/M7lc1UVf-VE','https://www.youtube.com/embed/M7lc1UVf-VE'])assert.equal(youtubeId(value),'M7lc1UVf-VE');
 for(const value of ['http://youtu.be/M7lc1UVf-VE','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://evil.test/M7lc1UVf-VE','https://user@youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com:444/watch?v=M7lc1UVf-VE','javascript:alert(1)','<iframe src=x>','https://youtu.be/short','https://youtu.be/M7lc1UVf-VE/extra'])assert.equal(youtubeId(value),null,value);
 const content=example();assert.ok(trainingSchema.safeParse(content).success);
 assert.ok(!trainingSchema.safeParse({...content,lessons:[...content.lessons,content.lessons[0]]}).success);
 assert.ok(!trainingSchema.safeParse({...content,modules:[]}).success);
 assert.ok(!trainingSchema.safeParse({...content,lessons:[{...content.lessons[0],cover:'https://evil.test/file.svg'}]}).success);
});
test('training draft/publication/restoration isolated from site; account progress private and persistent',()=>{
 const dir=mkdtempSync(join(tmpdir(),'rn-training-')),filename=join(dir,'test.sqlite');let store;
 try{
  store=openSiteManagement(filename);const initial=store.state();const content=example();
  assert.equal(store.publicTraining().lessons.length,0);store.saveTraining(content,0,'editor');assert.equal(store.publicTraining().lessons.length,0);
  assert.throws(()=>store.publishTraining(0,'editor'),e=>e.status===409);
  store.publishTraining(1,'publisher');assert.deepEqual(store.state(),initial);assert.equal(store.publicTraining().lessons.length,1);assert.ok(!JSON.stringify(store.publicTraining()).includes('Rascunho privado'));
  store.setTrainingProgress('driver-a','first',true);store.setTrainingProgress('driver-a','first',true);assert.deepEqual(store.trainingProgress('driver-a'),['first']);assert.deepEqual(store.trainingProgress('driver-b'),[]);
  assert.throws(()=>store.setTrainingProgress('driver-a','hidden',true),e=>e.status===404);
  assert.throws(()=>store.saveTraining({...content,lessons:[{...content.lessons[0],cover:'/media/'+'a'.repeat(64)+'.png'}]},2,'editor'),e=>e.status===400);
  store.close();store=openSiteManagement(filename);assert.deepEqual(store.trainingProgress('driver-a'),['first']);
  store.setTrainingProgress('driver-a','first',false);assert.deepEqual(store.trainingProgress('driver-a'),[]);
  store.restoreTraining(Number(store.trainingReleases()[0].id),2,'editor');assert.equal(store.publicTraining().lessons.length,1);store.publishTraining(3,'publisher');assert.equal(store.publicTraining().lessons.length,0);assert.equal(store.state().revision,0);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('training covers become public only when visible and published',()=>{
 const store=openSiteManagement(':memory:');try{
 const content=example(),asset='/media/'+'b'.repeat(64)+'.png';store.registerAsset('b'.repeat(64),'png','image/png',100,'editor');content.lessons[0].cover=asset;
 store.saveTraining(content,0,'editor');assert.equal(store.isPublishedAsset(asset),false);store.publishTraining(1,'editor');assert.equal(store.isPublishedAsset(asset),true);
 content.lessons[0].visible=false;store.saveTraining(content,2,'editor');store.publishTraining(3,'editor');assert.equal(store.isPublishedAsset(asset),false);
 }finally{store.close();}
});
test('driver session checked live, wrong roles/revoked sessions denied; host-only HttpOnly cookies and strict origins',async()=>{
 const token='A'.repeat(43),request=new Request('https://ramonessa.com.br/api/driver-training',{headers:{cookie:'__Host-rn_training='+token}});
 const mock=async(url,init)=>{assert.equal(url.pathname,'/v1/auth/me/check');assert.equal(init.headers.authorization,'Bearer '+token);assert.equal(init.cache,'no-store');return Response.json({subjectType:'driver',subjectId:'driver-a'});};
 assert.deepEqual(await authorizeTraining(request,mock),{id:'driver-a'});
 await assert.rejects(authorizeTraining(request,async()=>Response.json({subjectType:'passenger',subjectId:'p'})),e=>e.status===403);
 await assert.rejects(authorizeTraining(request,async()=>new Response(null,{status:401})),e=>e.status===401);
 assert.throws(()=>trainingToken(new Request(request,{headers:{cookie:'__Host-rn_training='+token+'; __Host-rn_training='+token}})),e=>e.status===401);
 const cookie=trainingCookie(token,new Date(Date.now()+3600000).toISOString());assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.ok(!cookie.includes('Domain='));
 assert.throws(()=>requireTrainingOrigin(new Request(request,{headers:{origin:'https://evil.test'}})),e=>e.status===403);
 assert.throws(()=>requireTrainingOrigin(new Request(request,{headers:{origin:'https://ramonessa.com.br','sec-fetch-site':'cross-site'}})),e=>e.status===403);
 requireTrainingOrigin(new Request(request,{headers:{origin:process.env.PUBLIC_SITE_ORIGIN??'https://ramonessa.com.br'}}));
});
