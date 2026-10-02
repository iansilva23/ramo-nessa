import { chmod, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagingComposeArguments, stagingComposeEnvironment } from './firebase.mjs';

const rawArg = process.argv.slice(2).find((v) => v.startsWith('--user-id='));
const userId = rawArg?.slice('--user-id='.length).trim() ?? '';
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
  throw new Error('--user-id precisa ser o UUID retornado ao criar a conta proprietária.');
}
const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const envFile = resolve(here, '.env');
let raw = await readFile(envFile, 'utf8');
const composeArgs = await stagingComposeArguments(envFile);
for (const key of ['ADMIN_OWNER_USER_ID', 'ADMIN_PAYOUT_APPROVER_USER_ID']) {
  const re = new RegExp('^' + key + '=.*$', 'm');
  if (!re.test(raw)) throw new Error(key + ' não existe no .env.');
  raw = raw.replace(re, key + '=' + userId);
}
await writeFile(envFile, raw, { encoding: 'utf8', mode: 0o600 });
await chmod(envFile, 0o600);
const result = spawnSync('docker', [
  ...composeArgs,
  'up', '-d', '--no-deps', '--force-recreate', 'core',
], { cwd: repoRoot, stdio: 'inherit', env: stagingComposeEnvironment() });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Conta proprietária aplicada às duas proteções do ambiente.');
