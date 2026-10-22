import assert from 'node:assert/strict';
import test from 'node:test';
import {parseProductionCredentials,storeInDirectory,assertPrivateParent} from './capture-mp-production.mjs';
import {mkdtempSync,mkdirSync,readFileSync,lstatSync,rmSync,symlinkSync,chmodSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const key='APP_USR-fixture-public-12345',token='APP_USR-fixture-private-67890',secret='fixture-webhook-secret-1234567890';
const input=(a=key,b=token,c=secret)=>[a,b,c,''].join('\0');
test('parses three separate production fields without changing literal bytes',()=>{
  assert.deepEqual(parseProductionCredentials(input()),{format:1,publicKey:key,accessToken:token,webhookSecret:secret});
});
test('rejects missing fields, test credentials, duplicate public/private and pasted newlines',()=>{
  for(const value of ['',input('TEST-public-key'),input(key,'TEST-secret-token'),input(key,key),input(key,token,'short'),input(key,token,secret+'\nextra'),input()+'extra'])assert.throws(()=>parseProductionCredentials(value));
});
test('validation errors never disclose provided credentials',()=>{
  const value='sensitive-invalid-fixture';
  assert.throws(()=>parseProductionCredentials(input(key,value)),error=>!error.message.includes(value));
});
test('stores privately in new or existing empty directory and never overwrites credentials',t=>{
  if(process.getuid?.()!==0){t.skip('root-only filesystem contract');return;}
  const root=mkdtempSync(join(tmpdir(),'mp-capture-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const empty of [false,true]){
    const dir=join(root,String(empty));if(empty)mkdirSync(dir,{mode:0o700});
    storeInDirectory(input(),dir);
    const file=join(dir,'credentials.private.json'),before=readFileSync(file,'utf8');
    assert.equal(lstatSync(file).mode&0o777,0o600);
    assert.equal(JSON.parse(before).accessToken,token);
    assert.throws(()=>storeInDirectory(input(key,token+'new'),dir),{code:'EEXIST'});
    assert.equal(readFileSync(file,'utf8'),before);
  }
});
test('rejects open directories and symlinked directories/files without changing targets',t=>{
  if(process.getuid?.()!==0){t.skip('root-only filesystem contract');return;}
  const root=mkdtempSync(join(tmpdir(),'mp-capture-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const dir=join(root,'private');mkdirSync(dir,{mode:0o700});
  const link=join(root,'link');symlinkSync(dir,link);
  assert.throws(()=>storeInDirectory(input(),link));assert.equal(existsSync(join(dir,'credentials.private.json')),false);
  chmodSync(dir,0o755);assert.throws(()=>storeInDirectory(input(),dir));chmodSync(dir,0o700);
  const target=join(root,'untouched');symlinkSync(target,join(dir,'credentials.private.json'));
  assert.throws(()=>storeInDirectory(input(),dir),{code:'EEXIST'});assert.equal(existsSync(target),false);
});
test('accepts shared root-owned 0755 parent while preserving mode and rejects writable or linked parents',t=>{
  if(process.getuid?.()!==0){t.skip('root-only filesystem contract');return;}
  const root=mkdtempSync(join(tmpdir(),'mp-parent-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  chmodSync(root,0o755);assertPrivateParent(root);
  storeInDirectory(input(),join(root,'credentials'));
  assert.equal(lstatSync(root).mode&0o777,0o755);
  assert.equal(lstatSync(join(root,'credentials')).mode&0o777,0o700);
  for(const mode of [0o775,0o757,0o777]){chmodSync(root,mode);assert.throws(()=>assertPrivateParent(root));}
  chmodSync(root,0o755);const link=join(root,'link');symlinkSync(root,link);assert.throws(()=>assertPrivateParent(link));
});
