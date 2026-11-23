import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTestEnvironment } from '../env.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');
const envFile = resolve(here, '.env');
const project = 'ramo-photo-homologation';
const driverWeb = process.env.PHOTO_WEB_DIRECTORY || resolve(root, 'apps/driver/build/web');
if (!isAbsolute(driverWeb)) throw new Error('PHOTO_WEB_DIRECTORY precisa ser absoluto.');
const args = [
  'compose', '-p', project, '--env-file', envFile,
  '-f', resolve(here, '../compose.yml'), '-f', resolve(here, 'compose.yml'),
];
const env = { ...process.env, TEST_HTTP_PORT: '18765', PHOTO_WEB_DIRECTORY: driverWeb };

function compose(...command) {
  const result = spawnSync('docker', [...args, ...command], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Docker Compose falhou. Revise a saída acima.');
}

const command = process.argv[2];
if (command === 'up') {
  await access(resolve(driverWeb, 'index.html'));
  await ensureTestEnvironment(envFile, { port: 18765 });
  compose('up', '--detach', '--build', '--wait', '--wait-timeout', '120', 'gateway');
  console.log('Motorista http://127.0.0.1:18765/motorista/');
  console.log('ADM http://127.0.0.1:18765/administrodo/');
} else if (command === 'down') {
  compose('down');
} else if (command === 'admin') {
  compose('exec', '-T', 'core', 'node', 'dist/scripts/create-admin-user.js',
    '--name=ADM das Fotos', '--email=adm.fotos@example.test');
} else if (command === 'exec') {
  compose(...process.argv.slice(3));
} else {
  throw new Error('Uso: node stack.mjs up|down|admin');
}
