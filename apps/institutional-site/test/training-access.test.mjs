import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSiteManagement } from '../db/site-management.ts';
import { verifyPassword, hashPassword } from '../lib/training-access.ts';
test('access defaults preserve individual login; only a valid, versioned configuration enables shared/public access',()=>{
 const store=openSiteManagement(':memory:');try{
 assert.deepEqual(store.trainingAccess(),{revision:0,mode:'individual',username:'',hasPassword:false});
 assert.throws(()=>store.saveTrainingAccess({mode:'shared',username:'grupo',password:'',expectedRevision:0},'editor'),e=>e.status===400);
 assert.throws(()=>store.saveTrainingAccess({mode:'shared',username:'grupo',password:'curta',expectedRevision:0},'editor'),e=>e.status===400);
 store.saveTrainingAccess({mode:'shared',username:'grupo',password:'SenhaLonga123!',expectedRevision:0},'editor');
 assert.throws(()=>store.saveTrainingAccess({mode:'public',username:'grupo',password:'',expectedRevision:0},'editor'),e=>e.status===409);
 assert.ok(!JSON.stringify(store.trainingAccess()).includes('SenhaLonga123!'));
 assert.ok(!JSON.stringify(store.audit()).includes('SenhaLonga123!'));
 assert.ok(!JSON.stringify(store.state()).includes('SenhaLonga123!'));
 const a=store.sharedTrainingLogin('grupo','SenhaLonga123!','a'),b=store.sharedTrainingLogin('grupo','SenhaLonga123!','b');
 assert.ok(a.token);assert.ok(b.token);assert.notEqual(a.token,b.token);assert.equal(store.validTrainingSession(a.token),true);
 assert.equal(store.validTrainingSession('forged'),false);assert.equal(store.validTrainingSession(a.token,Date.now()+86400001),false);
 store.deleteTrainingSession(a.token);assert.equal(store.validTrainingSession(a.token),false);assert.equal(store.validTrainingSession(b.token),true);
 store.saveTrainingAccess({mode:'public',username:'grupo',password:'',expectedRevision:1},'editor');assert.equal(store.validTrainingSession(b.token),false);
 store.saveTrainingAccess({mode:'shared',username:'grupo',password:'',expectedRevision:2},'editor');assert.ok(store.sharedTrainingLogin('grupo','SenhaLonga123!','c').token);
 assert.equal(store.validTrainingSession(b.token),false);
 }finally{store.close();}
});
test('wrong credentials, IP and global login limits persist; password rotation invalidates all shared sessions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'rn-access-')),file=join(dir,'db.sqlite');let store=openSiteManagement(file);try{
 store.saveTrainingAccess({mode:'shared',username:'grupo',password:'SenhaLonga123!',expectedRevision:0},'editor');
 assert.ok(store.sharedTrainingLogin('errado','SenhaLonga123!','x').denied);assert.ok(store.sharedTrainingLogin('grupo','incorreta','y').denied);
 const session=store.sharedTrainingLogin('grupo','SenhaLonga123!','valid');assert.ok(session.token);
 for(let i=0;i<20;i++)assert.ok(store.sharedTrainingLogin('grupo','errada','blocked',100000).denied);
 store.close();store=openSiteManagement(file);assert.equal(store.validTrainingSession(session.token),true);assert.ok(store.sharedTrainingLogin('grupo','SenhaLonga123!','blocked',100001).limited);
 assert.ok(store.sharedTrainingLogin('grupo','SenhaLonga123!','blocked',700001).token);
 store.saveTrainingAccess({mode:'shared',username:'grupo',password:'SenhaNova456!',expectedRevision:1},'editor');
 assert.equal(store.validTrainingSession(session.token),false);assert.ok(store.sharedTrainingLogin('grupo','SenhaLonga123!','old').denied);assert.ok(store.sharedTrainingLogin('grupo','SenhaNova456!','new').token);
 for(let i=0;i<200;i++)store.sharedTrainingLogin('bad','bad','ip'+i,900000);
 assert.ok(store.sharedTrainingLogin('grupo','SenhaNova456!','another',900001).limited);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('salted password hashes never equal plaintext and compare exact passwords',()=>{
 const first=hashPassword('SenhaLonga123!'),second=hashPassword('SenhaLonga123!');assert.notEqual(first,second);assert.equal(verifyPassword('SenhaLonga123!',first),true);assert.equal(verifyPassword('errada',first),false);
});
