import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function arg(name) {
  const prefix = '--' + name + '=';
  return process.argv.slice(2).find((v) => v.startsWith(prefix))?.slice(prefix.length).trim();
}
const name = arg('name');
const email = arg('email');
if (!name || !email) {
  console.error('Uso: node deploy/staging/create-admin.mjs --name="Seu nome" --email="seu@email.com"');
  process.exit(2);
}
const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const result = spawnSync('docker', [
  'compose', '--env-file', resolve(here, '.env'), '-f', resolve(here, 'compose.yml'),
  'exec', '-T', 'core', 'node', 'dist/scripts/create-admin-user.js',
  '--name=' + name, '--email=' + email,
], { cwd: repoRoot, encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
console.log('Credenciais iniciais do Admin — guarde fora do Git:');
process.stdout.write(result.stdout);
console.log('Depois use: node deploy/staging/set-owner.mjs --user-id=<UUID>');
