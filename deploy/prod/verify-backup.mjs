import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

function argValue(name) {
  const prefix = '--' + name + '=';
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const input = argValue('backup-dir');
if (!input) {
  throw new Error('--backup-dir é obrigatório.');
}
const backupDir = resolve(input);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      command + ' terminou com código ' + String(result.status),
    );
  }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function verifyFile(entry) {
  if (
    entry == null ||
    typeof entry.name !== 'string' ||
    !Number.isInteger(entry.bytes) ||
    typeof entry.sha256 !== 'string'
  ) {
    throw new Error('Manifesto de backup inválido.');
  }
  const path = resolve(backupDir, entry.name);
  if (!path.startsWith(backupDir + '/')) {
    throw new Error('Nome de arquivo inseguro no manifesto.');
  }
  const info = await stat(path);
  if (info.size !== entry.bytes) {
    throw new Error(entry.name + ' possui tamanho diferente do manifesto.');
  }
  const actualHash = await sha256File(path);
  if (actualHash !== entry.sha256) {
    throw new Error(entry.name + ' falhou na verificação SHA-256.');
  }
  return path;
}

const manifest = JSON.parse(
  await readFile(resolve(backupDir, 'manifest.json'), 'utf8'),
);
if (
  manifest.version !== 1 ||
  manifest.project !== 'ramo-nessa-prod' ||
  manifest.containsSecrets !== false
) {
  throw new Error('Manifesto não pertence a um backup Ramo Nessa suportado.');
}

const databaseFile = await verifyFile(manifest.database);
const documentsFile = await verifyFile(manifest.driverDocuments);

run('docker', [
  'run',
  '--rm',
  '--read-only',
  '--security-opt',
  'no-new-privileges',
  '--cap-drop',
  'ALL',
  '-v',
  backupDir + ':/backup:ro',
  'postgres:16',
  'pg_restore',
  '--list',
  '/backup/' + manifest.database.name,
]);

run('docker', [
  'run',
  '--rm',
  '--read-only',
  '--security-opt',
  'no-new-privileges',
  '--cap-drop',
  'ALL',
  '-v',
  backupDir + ':/backup:ro',
  'postgres:16',
  'tar',
  '-tzf',
  '/backup/' + manifest.driverDocuments.name,
]);

void databaseFile;
void documentsFile;
console.log(
  'Backup íntegro: hashes, dump PostgreSQL e arquivo de documentos validados.',
);
console.log('Nenhum dado foi restaurado ou alterado.');
