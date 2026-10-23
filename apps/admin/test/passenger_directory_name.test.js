import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {passengerDisplayName} from '../src/passenger-directory.js';

test('passenger name is the primary display, with explicit unnamed fallback',()=>{
 assert.equal(passengerDisplayName({fullName:' João Silva ',passengerId:'p-123'}),'João Silva');
 for(const fullName of [null,undefined,'','   ',42])assert.equal(passengerDisplayName({fullName,passengerId:'p-123'}),'Nome não informado');
});

test('actual table renderer shows name first, ID second and opens the same account ID',()=>{
 class Element {
  children=[];textContent='';hidden=false;disabled=false;
  constructor(tag){this.tagName=tag;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  addEventListener(type,fn){this[type]=fn;}
 }
 const elements=new Map();
 const byId=id=>{if(!elements.has(id))elements.set(id,new Element('fixture'));return elements.get(id);};
 const opened=[];
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const start=source.indexOf('function renderPassengerDirectory()');
 const end=source.indexOf('async function loadPassengerDirectory',start);
 const items=[{passengerId:'p-123',fullName:'João Silva',status:'active'},{passengerId:'p-456',fullName:null,status:'active'}];
 vm.runInNewContext(source.slice(start,end)+'\nrenderPassengerDirectory();',{
  document:{createElement:tag=>new Element(tag)},byId,passengerDisplayName,
  state:{passengerDirectory:{items,nextCursor:null,summary:{total:2}}},
  passengerStatusPresentation:()=>({tone:'success',label:'Ativo'}),
  formatDateTime:()=>'',hasScope:()=>true,lookupPassenger:id=>opened.push(id),
 });
 const rows=byId('passenger-directory-body').children;
 assert.equal(rows[0].children[0].children[0].textContent,'João Silva');
 assert.equal(rows[0].children[0].children[1].textContent,'ID: p-123');
 assert.equal(rows[1].children[0].children[0].textContent,'Nome não informado');
 rows[0].children[5].children[0].click();assert.deepEqual(opened,['p-123']);
});

test('profile heading uses name and retains ID as a secondary detail',()=>{
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const detail=source.slice(source.indexOf('function renderPassengerDetail(payload)'),source.indexOf('async function lookupPassenger'));
 assert.match(detail,/name\.textContent = passengerDisplayName\(passenger\)/);
 assert.match(detail,/passengerDetailItem\('ID do passageiro', passenger\.passengerId\)/);
 const page=readFileSync(new URL('../pages/passengers.html',import.meta.url),'utf8');
 assert.match(page,/placeholder="Nome do passageiro, telefone ou ID"/);
});
