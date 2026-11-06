import test from 'node:test';
import assert from 'node:assert/strict';
import {mapActivationArguments,assertMapPlan} from './activate-web-map-update.mjs';
import {mapWebSource} from './prepare-web-map-update.mjs';
const dir='/opt/ramo-nessa-regions/map-web-updates/'+mapWebSource.slice(0,12);
function plan(){return {format:1,sourceCommit:mapWebSource,gatewayImage:'sha256:'+'a'.repeat(64),scope:['passenger-web','driver-web'],resetApplied:false,servicesRestarted:false,bundleRoot:'/opt/ramo-nessa-web/releases/maps-'+mapWebSource.slice(0,12)+'/bundles',oldBundleRoot:'/opt/ramo-nessa-web/releases/regions-original/bundles',caddy:'/private/Caddyfile',sourceConfig:'/private/gateway.json',newWebHash:'a'.repeat(64),oldWebHash:'b'.repeat(64),caddyHash:'c'.repeat(64),sourceConfigHash:'d'.repeat(64),planFiles:Object.fromEntries(['runtime-before.private.json','gateway-image.private.json','candidate.compose.private.json','rollback.compose.private.json'].map(n=>[n,'e'.repeat(64)]))};}
test('activation requires exact prepared source directory and digest',()=>{
 assert.deepEqual(mapActivationArguments([dir,'a'.repeat(64)]),{dir,sha256:'a'.repeat(64)});
 for(const args of [[],[dir,'bad'],[dir+'/../other','a'.repeat(64)],[dir,'a'.repeat(64),'--reset']])assert.throws(()=>mapActivationArguments(args));
});
test('accepts only two-role Web scope with immutable image and intact recovery files',()=>assert.doesNotThrow(()=>assertMapPlan(plan())));
for(const [key,value]of [['sourceCommit','f'.repeat(40)],['scope',['core','passenger-web','driver-web']],['resetApplied',true],['gatewayImage','latest'],['bundleRoot','/srv/web'],['oldWebHash','bad'],['planFiles',{}]])test('refuses altered '+key,()=>{const p=plan();p[key]=value;assert.throws(()=>assertMapPlan(p));});
