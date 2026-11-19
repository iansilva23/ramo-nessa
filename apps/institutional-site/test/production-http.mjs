import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'ramo-site-http-'));
const database = join(dir, 'interests.sqlite');
const origin = 'http://127.0.0.1:4399';
const child = spawn(process.execPath, [process.env.RAMO_SITE_SERVER_ENTRY ?? '.next/standalone/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', PORT: '4399', PUBLIC_SITE_ORIGIN: origin, INTERESTS_DB_PATH: database },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const exit = new Promise(resolve => child.on('exit', resolve));

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + '/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Server did not start: ' + logs);
  const checks = [];
  const get = async path => { const r = await fetch(origin + path); assert.equal(r.status, 200, path); checks.push(path); return r; };
  const page = await (await get('/')).text();
  assert.ok(page.includes('O próximo destino'));
  assert.ok(page.includes('Download em breve'));
  assert.ok(page.includes('Versão web em breve'));
  assert.ok(!page.includes('/administrodo'));
  for (const m of page.matchAll(/(?:href|src)="(\/_next\/[^"?]+\.(?:css|js)(?:\?[^" ]*)?)"/g)) await get(m[1].replaceAll('&amp;', '&'));
  for (const p of ['/app-icon.webp', '/driver-icon.webp', '/jericoacoara.webp', '/fonts/general-sans-400.woff2', '/fonts/general-sans-500.woff2', '/fonts/general-sans-700.woff2', '/favicon.svg']) await get(p);
  assert.equal((await (await get('/api/health')).json()).ok, true);
  const body = { name: 'Teste Automatizado Local', phone: '(88) 99999-9999', region: 'Preá', vehicle: 'Mototáxi', consent: true, website: '', requestId: '7dfec38b-d64f-44e1-aee8-19bda3bd95a0' };
  const post = async (value, headers = { origin, 'content-type': 'application/json' }) => fetch(origin + '/api/interesse', { method: 'POST', headers, body: typeof value === 'string' ? value : JSON.stringify(value) });
  assert.equal((await post(body)).status, 201);
  assert.equal((await post(body)).status, 201);
  assert.equal((await post({ ...body, consent: false })).status, 400);
  assert.equal((await post(body, { origin: 'https://outro.test', 'content-type': 'application/json' })).status, 403);
  assert.equal((await post(body, { origin, 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post('{invalid')).status, 400);
  assert.equal((await post('é'.repeat(2100))).status, 413);
  const db = new DatabaseSync(database, { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM driver_interests').get().n, 1);
  db.close();
  for (const p of ['/admin/', '/administrodo/']) assert.equal((await fetch(origin + p)).status, 404);
  console.log(JSON.stringify({ productionHTTP: true, resources: checks.length, formStatuses: [201, 400, 403, 415, 413], duplicateRequestCreatesOneRecord: true, adminAbsentFromSite: true }));
} finally {
  child.kill('SIGTERM');
  await exit;
  rmSync(dir, { recursive: true, force: true });
}
