import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';

function argValue(name) {
  const prefix = '--' + name + '=';
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function parseInteger(name, raw, fallback, min, max) {
  const value = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      '--' + name + ' deve ser um inteiro entre ' + min + ' e ' + max + '.',
    );
  }
  return value;
}

function parseBoolean(name, raw, fallback = false) {
  if (raw == null || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error('--' + name + ' deve ser true ou false.');
}

const backupRoot = resolve(
  argValue('backup-dir') ||
    process.env.RAMO_BACKUP_DIR ||
    '/var/backups/ramo-nessa',
);
const keep = parseInteger('keep', argValue('keep'), 14, 7, 365);
const apply = parseBoolean('apply', argValue('apply'), false);

const snapshotPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

function safeSnapshotPath(root, name) {
  if (!snapshotPattern.test(name) || name !== basename(name)) {
    throw new Error('Nome de snapshot não suportado: ' + name);
  }
  const candidate = resolve(root, name);
  if (!candidate.startsWith(root + sep)) {
    throw new Error('Snapshot escapou da raiz de backup.');
  }
  return candidate;
}

async function recognizedSnapshot(path) {
  try {
    const manifest = JSON.parse(
      await readFile(resolve(path, 'manifest.json'), 'utf8'),
    );
    return (
      manifest.version === 1 &&
      manifest.project === 'ramo-nessa-prod' &&
      manifest.containsSecrets === false &&
      manifest.database?.name === 'database.dump' &&
      manifest.driverDocuments?.name ===
        'driver-documents.tar.gz'
    );
  } catch {
    return false;
  }
}

const rootInfo = await stat(backupRoot);
if (!rootInfo.isDirectory()) {
  throw new Error('A raiz de backup não é um diretório.');
}

const entries = await readdir(backupRoot, { withFileTypes: true });
const completed = [];
const skipped = [];

for (const entry of entries) {
  if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
  if (entry.name.endsWith('.incomplete')) {
    skipped.push({
      name: entry.name,
      reason: 'snapshot incompleto é preservado',
    });
    continue;
  }
  if (!snapshotPattern.test(entry.name)) continue;

  const path = safeSnapshotPath(backupRoot, entry.name);
  if (!(await recognizedSnapshot(path))) {
    skipped.push({
      name: entry.name,
      reason: 'manifesto ausente ou não reconhecido',
    });
    continue;
  }
  completed.push({ name: entry.name, path });
}

completed.sort((a, b) => b.name.localeCompare(a.name));
const preserved = completed.slice(0, keep);
const removable = completed.slice(keep);

const summary = {
  backupRoot,
  mode: apply ? 'apply' : 'dry-run',
  keep,
  recognizedSnapshots: completed.length,
  preserved: preserved.map((item) => item.name),
  removable: removable.map((item) => item.name),
  skipped,
};

console.log(JSON.stringify(summary));

if (!apply) {
  console.log(
    'Dry-run: nenhum backup foi removido. Use --apply=true somente após revisar a lista.',
  );
  process.exit(0);
}

for (const item of removable) {
  await rm(item.path, {
    recursive: true,
    force: false,
    maxRetries: 2,
    retryDelay: 100,
  });
  console.log('Snapshot local removido pela retenção: ' + item.name);
}

console.log(
  'Retenção local concluída. Snapshots .incomplete, links e diretórios não reconhecidos não foram removidos.',
);
