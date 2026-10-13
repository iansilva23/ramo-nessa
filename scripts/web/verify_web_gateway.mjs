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
  assert.ok(block.includes('https://*.gstatic.com'),
    path + ': Flutter CanvasKit CDN CSP missing');
  assert.ok(block.includes("connect-src 'self' wss://{$APP_DOMAIN}"),
    path + ': explicit same-host secure WebSocket source missing');
  assert.ok(block.includes("object-src 'none'"),
    path + ': unsafe object sources');
  assert.ok(block.includes("frame-ancestors 'none'"),
    path + ': iframe embedding should be denied');
  assert.ok(block.includes('try_files {path} /index.html'),
    path + ': Flutter SPA fallback missing');
}
const admin = routeBody('admin');
assert.ok(admin.includes("script-src 'self'"));
assert.ok(!admin.includes('wasm-unsafe-eval'),
  'Do not broaden the ADM Content-Security-Policy');
assert.ok(!admin.includes('geolocation=(self)'),
  'Do not grant geolocation permission to ADM');
console.log('OK: Core /v1, isolated PWA GPS/CanvasKit and strict ADM headers.');
