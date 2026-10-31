import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,cpSync,unlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {directIndex,assertDirectWebDelta,directDir} from './prepare-web-direct-entry.mjs';
import {directActivationArguments} from './activate-web-direct-entry.mjs';
const html='<html>\n  <link rel="stylesheet" href="ramo_entry_gate.css">\n  <script src="ramo_entry_gate.js"></script>\n  <script src="flutter_bootstrap.js"></script>\n</html>\n';
test('removes only the exact two entry imports, preserving the rest of the configured index',()=>{
  assert.equal(directIndex(html),'<html>\n  <script src="flutter_bootstrap.js"></script>\n</html>\n');
  assert.throws(()=>directIndex(html+html));assert.throws(()=>directIndex('<html>different</html>'));
});
test('rejects changed app code, extra removals or additions and HTML unrelated to the surface',()=>{
  const dir=mkdtempSync(join(tmpdir(),'direct-entry-contract-')),old=join(dir,'old'),next=join(dir,'next');
  try{
    for(const role of ['passenger','driver']){mkdirSync(join(old,role),{recursive:true});for(const [n,b]of Object.entries({'index.html':html,'main.dart.js':'approved app','ramo_entry_gate.js':'removed js','ramo_entry_gate.css':'removed css'}))writeFileSync(join(old,role,n),b);}
    cpSync(old,next,{recursive:true});for(const role of ['passenger','driver']){writeFileSync(join(next,role,'index.html'),directIndex(html));for(const n of ['ramo_entry_gate.js','ramo_entry_gate.css'])unlinkSync(join(next,role,n));}
    assert.doesNotThrow(()=>assertDirectWebDelta(old,next));
    writeFileSync(join(next,'passenger/main.dart.js'),'unexpected');assert.throws(()=>assertDirectWebDelta(old,next),/Arquivo aprovado/);
    writeFileSync(join(next,'passenger/main.dart.js'),'approved app');writeFileSync(join(next,'passenger/new.js'),'unexpected');assert.throws(()=>assertDirectWebDelta(old,next),/além/);
    unlinkSync(join(next,'passenger/new.js'));writeFileSync(join(next,'passenger/index.html'),directIndex(html)+'extra');assert.throws(()=>assertDirectWebDelta(old,next),/HTML/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('activation requires the exact private plan and integrity hash',()=>{
  assert.doesNotThrow(()=>directActivationArguments([directDir,'a'.repeat(64)]));
  assert.throws(()=>directActivationArguments(['/other','a'.repeat(64)]));assert.throws(()=>directActivationArguments([directDir,'bad']));
});
