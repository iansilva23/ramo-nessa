// Run with Docker: reproduce the real deferred-header bug and exercise SIGUSR1.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { patchCardPolicy, passengerPolicy, secureFieldOrigins, fixtureConfig, writeInPlace, allowedPolicy, deniedPolicy } from './fix-web-card-csp.mjs';

const image = 'caddy:2.11.7-alpine';
const root = mkdtempSync(join(tmpdir(), 'ramo-card-csp-http-'));
// Public disposable fixture must be readable after dropping all container capabilities.
chmodSync(root,0o755);
const name = 'ramo-card-csp-http-' + process.pid;
const hash = value => createHash('sha256').update(value).digest('hex');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 ** 2 });
  if (result.error || result.status !== 0) throw Error('Docker test failed: ' + args.slice(0, 3).join(' ') + '\n' + result.stderr);
  return result.stdout;
}
function adapt(source) {
  return JSON.parse(docker(['run', '--rm', '-i', '--network', 'none', '--entrypoint', 'caddy', '-e', 'APP_DOMAIN=card-csp.example.test', '-e', 'ACME_EMAIL=qa@example.test', image, 'adapt', '--config', '-', '--adapter', 'caddyfile'], source));
}
const source = readFileSync(new URL('Caddyfile', import.meta.url), 'utf8').replace('connect-src '+secureFieldOrigins.join(' ')+' ','connect-src ');
const before = Buffer.from(JSON.stringify(fixtureConfig(adapt(source))));
const after = Buffer.from(JSON.stringify(fixtureConfig(adapt(patchCardPolicy(source)))));
const config = join(root, 'test.json');
async function check(expectedCsp) {
  for (const path of ['/motorista/', '/motorista/main.dart.js', '/motorista/corridas/atual', '/passageiro/', '/passageiro/main.dart.js', '/passageiro/historico', '/administrodo/']) {
    const result = spawnSync('docker', ['exec', name, 'wget', '-S', '-O', '/dev/null', '--header', 'Host: app.ramonessa.com.br', 'http://127.0.0.1:18080' + path], { encoding: 'utf8', timeout: 8000 });
    assert.equal(result.status, 0, result.stderr);
    const headers = result.stdout + result.stderr;
    const policy = [...headers.matchAll(/^\s*Permissions-Policy:\s*([^\r\n]+)/gmi)].map(match => match[1].trim());
    assert.deepEqual(policy, [path.startsWith('/administrodo/') ? deniedPolicy : allowedPolicy], path);
    if(path.startsWith('/passageiro/'))assert.deepEqual([...headers.matchAll(/^\s*Content-Security-Policy:\s*([^\r\n]+)/gmi)].map(m=>m[1].trim()),[expectedCsp],path);
    assert.match(headers, /X-Content-Type-Options: nosniff/i, path);
    assert.match(headers, /X-Frame-Options: DENY/i, path);
  }
}
async function waitFor(expected) {
  let failure;
  for (let attempt = 0; attempt < 15; attempt++) {
    try { await check(expected); return; }
    catch (error) { failure = error; await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  throw failure;
}
try {
  for (const role of ['passenger', 'driver']) {
    const dir = join(root, 'web', role);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), role);
    writeFileSync(join(dir, 'main.dart.js'), 'console.log("' + role + '")');
  }
  mkdirSync(join(root, 'admin'));
  writeFileSync(join(root, 'admin', 'index.html'), 'admin');
  writeFileSync(config, before);
  docker(['run', '-d', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--tmpfs', '/config', '--tmpfs', '/data', '--mount', 'type=bind,src=' + root + ',dst=/test,readonly', '--mount', 'type=bind,src=' + join(root, 'web') + ',dst=/srv/web,readonly', '--mount', 'type=bind,src=' + join(root, 'admin') + ',dst=/srv/admin,readonly', '--entrypoint', 'caddy', image, 'run', '--config', '/test/test.json']);
  await waitFor(passengerPolicy(source).policy);
  const original = JSON.parse(docker(['inspect', name]))[0];
  writeInPlace(config, after, hash(before));
  docker(['kill', '--signal=USR1', name]);
  await waitFor(passengerPolicy(patchCardPolicy(source)).policy);
  writeInPlace(config, before, hash(after));
  docker(['kill', '--signal=USR1', name]);
  await waitFor(passengerPolicy(source).policy);
  const final = JSON.parse(docker(['inspect', name]))[0];
  assert.equal(final.Id, original.Id);
  assert.equal(final.State.StartedAt, original.State.StartedAt);
  console.log('HTTP PASS: passenger secure-field connections repaired, GPS preserved in both apps, ADM unchanged, reload and rollback preserve container identity.');
} catch(error) {
  try { console.error(docker(['logs',name])); } catch {}
  throw error;
} finally {
  try { docker(['rm', '-f', name]); } catch {}
  rmSync(root, { recursive: true });
}
