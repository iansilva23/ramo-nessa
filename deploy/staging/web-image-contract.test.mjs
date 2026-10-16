import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';
import {mergeWebCaddy,sameConfiguration}from'./web-image-contract.mjs';
const template=await readFile(new URL('./Caddyfile',import.meta.url),'utf8');
const start=template.indexOf('  # Web apps usam a mesma origem HTTPS'),end=template.indexOf('  handle_path /administrodo/* {',start);
const active=template.slice(0,start)+template.slice(end);
test('PWA insertion preserves every byte of existing site, admin and API configuration',()=>{
 const result=mergeWebCaddy(active,template);
 assert.equal(result.candidate.replace(result.fragment,''),active);
 for(const marker of ['handle /site-management/*','handle /media/*','handle_path /administrodo/*','www.ramonessa.com.br','reverse_proxy institutional-site:3000','reverse_proxy core:8080'])assert.ok(result.candidate.includes(marker));
 assert.equal((result.candidate.match(/geolocation=\(self\)/g)??[]).length,2);
});
test('already-present Web routes or changed admin marker block insertion',()=>{
 for(const value of [template,active.replace('handle_path /administrodo/*','handle_path /admin/*'),active+active])assert.throws(()=>mergeWebCaddy(value,template));
 assert.throws(()=>mergeWebCaddy(active,template.replaceAll('wss://{host}','wss://old.example')));
});
test('configuration comparison ignores object key order and detects changed environment, volume or image',()=>{
 assert.equal(sameConfiguration({a:1,b:{c:2}},{b:{c:2},a:1}),true);
 for(const [a,b]of [[{value:'original'},{value:'changed'}],[['original'],['changed']],[{image:'old'},{image:'new'}]])assert.equal(sameConfiguration(a,b),false);
});
