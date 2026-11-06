import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { webSecurityPolicy } from './web_security_policy.mjs';
const caddy=await readFile(new URL('../../deploy/staging/Caddyfile',import.meta.url),'utf8');

for(const origin of ['https://app.ramonessa.com.br','https://vps-a70eab23.vps.ovh.ca','https://127.0.0.1:4443']){
  test('WebSocket CSP follows the serving host: '+new URL(origin).host,()=>{
    for(const role of ['passenger','driver']){
      const policy=webSecurityPolicy(role,origin);
      assert.ok(policy.includes('wss://'+new URL(origin).host));
      assert.ok(!policy.includes('{host}')&&!policy.includes('{$APP_DOMAIN}'));
      assert.ok(!policy.includes("'unsafe-eval'"));
    }
    const admin=webSecurityPolicy('admin',origin);
    assert.ok(admin.includes("script-src 'self'"));
    assert.ok(!admin.includes('wasm-unsafe-eval')&&!admin.includes('mercadopago'));
  });
}
test('ADM, website management and public website survive the PWA integration',()=>{
  assert.match(caddy,/handle_path \/administrodo\/\*/);
  assert.doesNotMatch(caddy,/(?:handle_path|redir) \/admin(?:\/|\s)/);
  assert.match(caddy,/handle \/site-management\/\* \{\s*reverse_proxy institutional-site:3000/);
  assert.match(caddy,/handle \/media\/\* \{\s*reverse_proxy institutional-site:3000/);
  assert.match(caddy,/www\.ramonessa\.com\.br \{\s*redir https:\/\/ramonessa\.com\.br\{uri\} 308/);
  assert.equal((caddy.match(/geolocation=\(self\)/g)??[]).length,2);
});
test('gateway verifier is executable on the integrated Caddy configuration',()=>{
  const result=spawnSync(process.execPath,[new URL('./verify_web_gateway.mjs',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
