import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
test('ADM mostra município sem renomear chave de preço e só salva rascunhos',()=>{
 const html=readFileSync(new URL('../pages/localities.html',import.meta.url),'utf8');
 const code=readFileSync(new URL('../src/localities-admin.js',import.meta.url),'utf8');
 for(const id of ['municipality-panel','municipality-entry','municipality-id',
  'municipality-source','municipality-save','municipality-status']) {
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(code,/municipality_assignment/);
 assert.match(code,/await applyPatch/);
 assert.match(code,/hasScope\('pricing:write'\)/);
 assert.match(code,/sourceUrl/);
 assert.equal(code.includes('.innerHTML'),false);
});
