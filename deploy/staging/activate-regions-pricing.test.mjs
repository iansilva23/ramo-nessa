import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activationInput} from './activate-regions-pricing.mjs';
test('activation requires pinned private plan and explicit SHA-256',()=>{
 const path='/opt/ramo-nessa-regions/releases/'+'a'.repeat(12)+'/activation-'+'b'.repeat(16);
 assert.deepEqual(activationInput([path,'c'.repeat(64)]),{dir:path,expectedHash:'c'.repeat(64)});
 for(const args of [[],[path],['/tmp/plan','c'.repeat(64)],[path,'bad'],[path+'/../other','c'.repeat(64)],[path,'c'.repeat(64),'--force']])assert.throws(()=>activationInput(args));
});
