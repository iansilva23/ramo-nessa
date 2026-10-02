import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureStagingEnvironment } from './env.mjs';
import { stagingComposeArguments, stagingComposeEnvironment } from './firebase.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const envFile = resolve(here, '.env');
await ensureStagingEnvironment(envFile);

function run(command, args, stdio = 'inherit') {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio, env: stagingComposeEnvironment() });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, [resolve(here, 'validate-env.mjs'), '--env-file=' + envFile]);
const composeArgs = await stagingComposeArguments(envFile);
run('docker', ['compose', 'version'], 'ignore');
run('docker', [...composeArgs, 'config'], 'ignore');
run('docker', [...composeArgs, 'up', '-d', '--build']);

const raw = await readFile(envFile, 'utf8');
const domain = raw.match(/^APP_DOMAIN=(.+)$/m)?.[1]?.trim();
const readyUrl = 'https://' + domain + '/ready';
const deadline = Date.now() + 120000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(readyUrl, { cache: 'no-store' });
    if (response.ok) { ready = true; break; }
  } catch {}
  await new Promise((r) => setTimeout(r, 1500));
}
if (!ready) throw new Error('Stack subiu, mas /ready não respondeu por HTTPS. Verifique DNS, Caddy e logs.');
console.log('Admin: https://' + domain + '/admin/');
console.log('Readiness: ' + readyUrl);
