import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../deploy/staging/Caddyfile', import.meta.url),
  'utf8',
);

function routeBody(path) {
  const escaped = path.replaceAll('/', '\\/');
  const re = new RegExp('  handle_path /' + escaped + '/\\* \\{([\\s\\S]*?)\\n  \\}', 'u');
  const match = source.match(re);
  assert.ok(match, 'Missing isolated Caddy path for ' + path);
  return match[1];
}

assert.match(source, /@api path \/v1\/\* \/health \/ready/u);
assert.match(source, /handle @api \{[\s\S]*?reverse_proxy core:8080/u);
assert.match(source, /Permissions-Policy "camera=\(\), microphone=\(\), geolocation=\(\)"/u);

for (const [path, directory] of [
  ['passageiro', 'passenger'],
  ['motorista', 'driver'],
]) {
  const block = routeBody(path);
  assert.ok(block.includes('root * /srv/web/' + directory));
  assert.ok(block.includes('geolocation=(self)'),
    path + ': foreground GPS permission blocked');
  assert.ok(block.includes("'wasm-unsafe-eval'"),
    path + ': Flutter CanvasKit wasm CSP missing');
  assert.ok(block.includes('https://www.gstatic.com/firebasejs/13.0.0/'),
    path + ': pinned Firebase SDK source missing');
  assert.ok(block.includes("'self' wss://{host}"),
    path + ': explicit same-host secure WebSocket source missing');
  assert.ok(block.includes("object-src 'none'"),
    path + ': unsafe object sources');
  assert.ok(block.includes("frame-ancestors 'none'"),
    path + ': iframe embedding should be denied');
  const scripts = block.match(/script-src ([^;]+);/)?.[1];
  assert.ok(scripts && !scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"),
    path + ': executable inline JavaScript must remain blocked');
  assert.ok(!scripts.includes('https://*.gstatic.com'), path + ': broad script CDN trust');
  assert.ok(block.includes("script-src-attr 'none'"));
  assert.ok(block.includes("form-action 'self'"));
  assert.ok(block.includes('try_files {path} /index.html'),
    path + ': Flutter SPA fallback missing');
}
const passenger = routeBody('passageiro');
assert.ok(passenger.includes('https://sdk.mercadopago.com'));
assert.ok(passenger.includes('https://api.mercadopago.com'));
assert.ok(passenger.includes('frame-src https://*.mercadopago.com'));
assert.ok(!routeBody('motorista').includes('mercadopago'), 'Do not broaden driver payment sources');
const admin = routeBody('administrodo');
assert.ok(!admin.includes('mercadopago'), 'Do not broaden ADM payment sources');
assert.ok(admin.includes("script-src 'self'"));
assert.ok(!admin.includes('wasm-unsafe-eval'),
  'Do not broaden the ADM Content-Security-Policy');
assert.ok(!admin.includes('geolocation=(self)'),
  'Do not grant geolocation permission to ADM');
console.log('OK: Core /v1, isolated PWA GPS/CanvasKit and strict ADM headers.');

assert.match(source, /\{\$APP_DOMAIN\}, app\.ramonessa\.com\.br \{/u);
assert.doesNotMatch(source, /(?:handle_path|redir) \/admin(?:\/|\s)/u);
assert.doesNotMatch(source, /redir \/\s/u);
for (const path of ['site-management', 'media']) {
  const escaped = path.replaceAll('/', '\\/');
  assert.match(source, new RegExp('handle /' + escaped + '/\\* \\{\\s*reverse_proxy institutional-site:3000', 'u'));
}
assert.match(source, /ramonessa\.com\.br \{[\s\S]*?reverse_proxy institutional-site:3000/u);
assert.match(source, /www\.ramonessa\.com\.br \{\s*redir https:\/\/ramonessa\.com\.br\{uri\} 308/u);
console.log('OK: domínio app, administrodo, gerenciamento do site, mídia e domínio público preservados.');
