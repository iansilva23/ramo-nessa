import test from 'node:test';
import assert from 'node:assert/strict';
import { assertKnownEditor, assertGatewayImage, assertComposeLocation, assertTrainingEnvironment, prepareGatewayConfig, fetchChecked, isTransientFetchError } from './publish-driver-training.mjs';
const live='e9eb5d1904f0e5c90867004da96438e0d07d3315935a04c6706769e61675dc8b';
const gateway='sha256:b305f39894ae35a548baeadc81cc03236fa150f821d56fdcf2b6e19247f8e991';
test('accepts the two reviewed editors but rejects local/container drift and unknown code',()=>{
  assert.doesNotThrow(()=>assertKnownEditor(live,live));
  const original='6f8a10f6449c784610c524d67632c85632a05bff147ca1d302969c67555ea013';
  assert.doesNotThrow(()=>assertKnownEditor(original,original));
  assert.throws(()=>assertKnownEditor(original,live));assert.throws(()=>assertKnownEditor('a'.repeat(64),'a'.repeat(64)));
});
test('only the standard tag and observed cash-update image are accepted',()=>{
  assert.doesNotThrow(()=>assertGatewayImage(gateway));assert.doesNotThrow(()=>assertGatewayImage('ramo-nessa-admin-gateway:staging'));assert.throws(()=>assertGatewayImage('sha256:'+'c'.repeat(64)));
});
test('pinned gateway replacement preserves the active cash release and every other service/setting',()=>{
  const config={name:'ramo-nessa-staging',services:{gateway:{image:gateway,ports:[{target:443,published:'443'}],volumes:[{type:'bind',source:'/opt/cash-release/passenger',target:'/srv/passenger',read_only:true}],environment:{APP_DOMAIN:'app.example.test',LITERAL_EXAMPLE:'keep$$value${unchanged}'},networks:{default:null},healthcheck:{test:['CMD','true']}},core:{image:'core:active',environment:{PLACEHOLDER:'test-only'}},postgres:{image:'postgres:16'}},networks:{default:{name:'ramo-nessa-staging_default'}},volumes:{data:{name:'existing-volume'}}};
  const initial=structuredClone(config),id='sha256:'+'a'.repeat(64),result=prepareGatewayConfig(config,gateway,id);
  assert.equal(result.services.gateway.image,id);const restored=structuredClone(result);restored.services.gateway.image=gateway;assert.deepEqual(restored,initial);assert.deepEqual(config,initial);
  assert.throws(()=>prepareGatewayConfig(config,'another-image',id));assert.throws(()=>prepareGatewayConfig(config,gateway,'mutable:tag'));assert.throws(()=>prepareGatewayConfig({},gateway,id));
});

test('accepts live VPS configuration and exact documented defaults for omitted origins',()=>{
  assert.doesNotThrow(()=>assertTrainingEnvironment({TRUST_PROXY:'true'},{PUBLIC_SITE_ORIGIN:'https://ramonessa.com.br'}));
  assert.doesNotThrow(()=>assertTrainingEnvironment({TRUST_PROXY:'true'},{}));
  assert.doesNotThrow(()=>assertTrainingEnvironment({TRUST_PROXY:'true'},{PUBLIC_SITE_ORIGIN:'https://ramonessa.com.br',ADMIN_SITE_ORIGIN:'https://app.ramonessa.com.br'}));
});
test('defaults never authorize foreign/empty origins or a missing/disabled Core proxy',()=>{
  for(const env of [{},{TRUST_PROXY:'false'},{TRUST_PROXY:''}])assert.throws(()=>assertTrainingEnvironment(env,{}));
  for(const site of [{PUBLIC_SITE_ORIGIN:''},{ADMIN_SITE_ORIGIN:''},{PUBLIC_SITE_ORIGIN:'https://foreign.test'},{ADMIN_SITE_ORIGIN:'https://foreign.test'},{PUBLIC_SITE_ORIGIN:'https://ramonessa.com.br/'}])assert.throws(()=>assertTrainingEnvironment({TRUST_PROXY:'true'},site));
});

test('retries socket resets after gateway restart without relaxing success status',async()=>{
  let calls=0;
  const delays=[];
  const transient=Object.assign(new Error('connection closed'),{cause:{code:'UND_ERR_SOCKET'}});
  assert.equal(isTransientFetchError(transient),true);
  const result=await fetchChecked('https://ramonessa.com.br/motoristas',200,{
    request:async()=>{calls++;if(calls===1)throw transient;return new Response('ok',{status:200});},
    pause:async ms=>{delays.push(ms);},
    attempts:3
  });
  assert.equal(result.status,200);assert.equal(calls,2);assert.deepEqual(delays,[300]);
});

test('brief proxy 503 can settle to the exact expected authenticated status',async()=>{
  let calls=0;
  const result=await fetchChecked('https://app.ramonessa.com.br/site-management/training',401,{
    request:async()=>{calls++;return new Response('',{status:calls===1?503:401});},
    pause:async()=>{},
    attempts:2
  });
  assert.equal(result.status,401);assert.equal(calls,2);
});

test('wrong authorization status and unsafe TLS failures do not retry',async()=>{
  let calls=0;
  await assert.rejects(
    fetchChecked('https://app.ramonessa.com.br/site-management/training',401,{
      request:async()=>{calls++;return new Response('',{status:200});},
      pause:async()=>{},
      attempts:4
    }),
    /HTTP 200 \(esperado 401\)/
  );
  assert.equal(calls,1);
  calls=0;
  const tls=Object.assign(new Error('fetch failed'),{cause:{code:'ERR_TLS_CERT_ALTNAME_INVALID'}});
  assert.equal(isTransientFetchError(tls),false);
  await assert.rejects(
    fetchChecked('https://app.ramonessa.com.br/ready',200,{
      request:async()=>{calls++;throw tls;},
      pause:async()=>{},
      attempts:4
    }),
    /ERR_TLS_CERT_ALTNAME_INVALID/
  );
  assert.equal(calls,1);
});

test('accepts the observed recovery snapshot and original gateway release paths',()=>{
  const base={project:'ramo-nessa-staging',projectDir:'/opt/ramo-nessa-security/prepared-08d1aa34a384611d'};
  for(const composeFile of ['/var/backups/ramo-nessa-training/44fddaa88935/gateway.before.json','/var/backups/ramo-nessa-training/be8124bfab0d/gateway.candidate.json','/opt/ramo-nessa-security/troco-web-1fd614b34bb8-3nmg3dhl/after.json'])assert.doesNotThrow(()=>assertComposeLocation({...base,composeFile},()=>true));
});
test('recovery path support never permits traversal, unrelated paths, other projects or missing inputs',()=>{
  const base={project:'ramo-nessa-staging',projectDir:'/opt/ramo-nessa-security/prepared-08d1aa34a384611d',composeFile:'/var/backups/ramo-nessa-training/44fddaa88935/gateway.before.json'};
  for(const composeFile of ['/var/backups/other/44fddaa88935/gateway.before.json','/var/backups/ramo-nessa-training/not-a-sha/gateway.before.json','/var/backups/ramo-nessa-training/44fddaa88935/unrelated.json','/opt/../etc/compose.json','/var/backups/ramo-nessa-training/44fddaa88935/../44fddaa88935/gateway.before.json','/tmp/gateway.json','/opt/one.json,/opt/two.json',undefined])assert.throws(()=>assertComposeLocation({...base,composeFile},()=>true));
  assert.throws(()=>assertComposeLocation({...base,project:'another-project'},()=>true));
  assert.throws(()=>assertComposeLocation({...base,projectDir:'/tmp/work'},()=>true));
  assert.throws(()=>assertComposeLocation(base,p=>p!==base.composeFile),/Arquivo Compose ativo não encontrado/);
  assert.throws(()=>assertComposeLocation(base,p=>p!==base.projectDir),/Diretório de trabalho do Compose não encontrado/);
});
