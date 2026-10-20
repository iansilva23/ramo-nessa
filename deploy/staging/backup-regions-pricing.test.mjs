import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { options, validate } from './backup-regions-pricing.mjs';
const image = 'sha256:' + 'a'.repeat(64);
const expected = options(['--core-image=' + image, '--gateway-image=' + image]);
const runtime = () => Object.fromEntries(Object.entries({core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'}).map(([role,name]) => [role,{Name:'/'+name,Image:image,State:{Running:true,Health:{Status:'healthy'}},Mounts:role==='core'?[{Type:'volume',Source:'/vol/docs',Destination:'/var/lib/ramo-nessa'}]:role==='gateway'?[{Type:'bind',Source:'/release/web',Destination:'/srv/web',RW:false},{Type:'bind',Source:'/release/Caddyfile',Destination:'/etc/caddy/Caddyfile',RW:false}]:[]}]));
test('requires both exact images and rejects operational mutation flags', () => {
  assert.throws(() => options([]));
  assert.throws(() => options(['--core-image=' + image]));
  assert.throws(() => options(['--core-image=' + image,'--gateway-image=' + image,'--reset']));
  assert.throws(() => options(['--core-image=' + image,'--gateway-image=' + image,'--core-image=' + image]));
});
test('rejects changed images, unhealthy services and missing mounts before backup', () => {
  assert.equal(validate(runtime(),expected).length,3);
  for(const role of ['core','gateway']) { const r=runtime();r[role].Image='sha256:'+'b'.repeat(64);assert.throws(()=>validate(r,expected)); }
  for(const role of ['core','gateway','postgres','maps','site']) { const r=runtime();r[role].State.Health.Status='unhealthy';assert.throws(()=>validate(r,expected)); }
  const r=runtime();r.gateway.Mounts[0].RW=true;assert.throws(()=>validate(r,expected));
  const missing=runtime();missing.core.Mounts=[];assert.throws(()=>validate(missing,expected));
});
test('rejects unsafe mount sources', () => {
  for(const source of ['/','relative','/mnt/a,b','/mnt/a\nb']) { const r=runtime();r.core.Mounts[0].Source=source;assert.throws(()=>validate(r,expected)); }
});
test('restoration is isolated and cleanup targets only disposable resources', () => {
  const source=readFileSync(new URL('./backup-regions-pricing.mjs',import.meta.url),'utf8');
  assert.match(source, /'--network', 'none'/);
  assert.match(source, /'pg_restore', '--exit-on-error'/);
  assert.match(source, /BEGIN READ ONLY/);
  assert.doesNotMatch(source, /compose.*down|volume.*prune|--apply-plan|prepare-regions-catalog/);
  assert.equal((source.match(/\['rm', '-f', drill\]/g)||[]).length,1);
  assert.equal((source.match(/\['volume', 'rm', volume\]/g)||[]).length,1);
});
