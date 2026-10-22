import assert from 'node:assert/strict';
import test from 'node:test';
import {parseProductionCredentials} from './capture-mp-production.mjs';
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
