import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

const name = arg('name');
const email = arg('email');
if (!name || !email) {
  console.error(
    'Uso: node deploy/test/create-admin.mjs ' +
      '--name="Seu nome" --email="seu@email.com"',
  );
  process.exit(2);
}

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const composeFile = resolve(here, 'compose.yml');
const envFile = resolve(here, '.env');

const result = spawnSync(
  'docker',
  [
    'compose',
    '--env-file',
    envFile,
    '-f',
    composeFile,
    'exec',
    '-T',
    'core',
    'node',
    'dist/scripts/create-admin-user.js',
    `--name=${name}`,
    `--email=${email}`,
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

console.log(
  'Credenciais iniciais do Admin — guarde agora e não envie para o Git:',
);
process.stdout.write(result.stdout);
