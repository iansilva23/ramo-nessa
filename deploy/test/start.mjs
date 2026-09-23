import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureTestEnvironment } from './env.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const composeFile = resolve(here, 'compose.yml');
const envFile = resolve(here, '.env');

await ensureTestEnvironment(envFile);

const dockerCheck = spawnSync(
  'docker',
  ['compose', 'version'],
  { cwd: repoRoot, stdio: 'ignore' },
);
if (dockerCheck.status !== 0) {
  throw new Error('Docker Compose não está disponível neste computador.');
}

const up = spawnSync(
  'docker',
  [
    'compose',
    '--env-file',
    envFile,
    '-f',
    composeFile,
    'up',
    '-d',
    '--build',
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (up.status !== 0) {
  process.exit(up.status ?? 1);
}

const rawEnv = await import('node:fs/promises').then(({ readFile }) =>
  readFile(envFile, 'utf8'),
);
const port =
  rawEnv.match(/^TEST_HTTP_PORT=(\d+)$/m)?.[1] ?? '8080';
const baseUrl = `http://127.0.0.1:${port}`;

const deadline = Date.now() + 90_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${baseUrl}/ready`, {
      cache: 'no-store',
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolvePromise) =>
    setTimeout(resolvePromise, 1000),
  );
}
if (!ready) {
  throw new Error(
    'O stack subiu, mas o Core não ficou ready dentro de 90 segundos.',
  );
}

console.log('');
console.log('Ramo Nessa test stack pronto.');
console.log(`Admin: ${baseUrl}/admin/`);
console.log(`Readiness: ${baseUrl}/ready`);
console.log('');
console.log(
  'Crie o primeiro usuário com: ' +
    'node deploy/test/create-admin.mjs --name="Seu nome" ' +
    '--email="seu@email.com"',
);
