import assert from 'node:assert/strict';
import test from 'node:test';
import {createNavigationAdmin} from '../src/navigation-admin.js';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.dataset={};}
 append(...children){this.children.push(...children);}
 setAttribute(){}
 addEventListener(event,listener){this.listeners[event]=listener;}
}
const tick=()=>new Promise(r=>setImmediate(r));
async function fixture(t,writable=true){
 const old=globalThis.document;t.after(()=>globalThis.document=old);
 globalThis.document={createElement:tag=>new Element(tag)};
 let section;const calls=[];
 const root={querySelector:s=>s==='[data-manual-refunds]'?{before:n=>section=n}:null};
 let reject=false;
 createNavigationAdmin({root,getToken:()=> 'session',hasScope:()=>writable,
 api:{navigationRequest:async(token,method='GET',body)=>{calls.push({method,body});if(reject)throw Error('Não foi possível salvar');return method==='PUT'?{...body,revision:1}:{enabled:false,revision:0,usage:{requests:8,initial:2,recalculations:6,errors:1}};}}});
 await tick();const flatten=n=>[n,...n.children.flatMap(flatten)];
 return {calls,nodes:flatten(section),reject:()=>reject=true};
}
test('loading ADM keeps protection off; activation only sends after explicit save with revision',async t=>{
 const f=await fixture(t);const input=f.nodes.find(n=>n.type==='checkbox');assert.equal(input.checked,false);assert.equal(f.calls.length,1);
 input.checked=true;f.nodes.find(n=>n.tag==='form').listeners.submit({preventDefault(){}});await tick();
 assert.deepEqual(f.calls[1],{method:'PUT',body:{enabled:true,revision:0}});assert.equal(input.checked,true);
});
test('read-only user cannot activate, and failed save preserves draft without claiming activation',async t=>{
 const f=await fixture(t,false);assert.equal(f.nodes.find(n=>n.type==='checkbox').disabled,true);
 f.nodes.find(n=>n.tag==='form').listeners.submit({preventDefault(){}});await tick();assert.equal(f.calls.length,1);
});
test('failed save retains edited checkbox and permits retry',async t=>{
 const f=await fixture(t);const input=f.nodes.find(n=>n.type==='checkbox');input.checked=true;f.reject();
 f.nodes.find(n=>n.tag==='form').listeners.submit({preventDefault(){}});await tick();assert.equal(input.checked,true);assert.equal(input.disabled,false);
});
