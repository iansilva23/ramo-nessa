import test from 'node:test';
import assert from 'node:assert/strict';
import { assertGatewayOnly,fixWebPolicyHeader } from './web-refresh-contract.mjs';
test('global deferred removal is separated without modifying PWA/ADM/site rules',()=>{
  const before='  header {\n    -Server\n    Permissions-Policy "geolocation=()"\n  }\nhandle_path /passageiro/* {\nheader Permissions-Policy "geolocation=(self)"\n}\nhandle_path /motorista/* {\n}\nhandle_path /administrodo/* {\n}\n';
  const next=fixWebPolicyHeader(before);
  assert.equal(next.replace('  header -Server\n  header {\n','  header {\n    -Server\n'),before);
  assert.throws(()=>fixWebPolicyHeader('unknown'));
});
function fixture() {
  const baseline={services:{core:{image:'core',environment:{OTP_PROVIDER:'real',MERCADO_PAGO_MODE:'test'},volumes:[{target:'/documents',source:'existing'}]},postgres:{image:'pg'},gateway:{image:'gateway:staging',environment:{APP_DOMAIN:'existing'},ports:[443],volumes:[{type:'bind',source:'/old/bundles',target:'/srv/web',read_only:true},{type:'bind',source:'/Caddyfile',target:'/etc/caddy/Caddyfile',read_only:true}]}}};
  const preview=structuredClone(baseline);preview.services.gateway.image='sha256:existing';preview.services.gateway.volumes[0].source='/new/bundles';
  return {baseline,preview};
}
test('only gateway image reference and exact read-only Web mount may change',()=>{
  const {baseline,preview}=fixture();assertGatewayOnly(baseline,preview,'/new/bundles');
});
test('Core/provider/payment/storage changes and additional services are rejected',()=>{
  for(const mutate of [v=>v.services.core.image='other',v=>v.services.core.environment.MERCADO_PAGO_MODE='live',v=>v.services.core.volumes=[],v=>v.services.extra={}]){
    const {baseline,preview}=fixture();mutate(preview);assert.throws(()=>assertGatewayOnly(baseline,preview,'/new/bundles'));
  }
});
test('Caddy/environment/ports and writable or wrong Web mounts are rejected',()=>{
  for(const mutate of [v=>v.services.gateway.environment.APP_DOMAIN='other',v=>v.services.gateway.ports=[80],v=>v.services.gateway.volumes[1].source='/other',v=>v.services.gateway.volumes[0].read_only=false,v=>v.services.gateway.volumes[0].source='/wrong']){
    const {baseline,preview}=fixture();mutate(preview);assert.throws(()=>assertGatewayOnly(baseline,preview,'/new/bundles'));
  }
});
