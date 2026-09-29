import { spawnSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const composeFile = resolve(here, 'compose.yml');

function argValue(name) {
  const prefix = '--' + name + '=';
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const envFile = resolve(here, argValue('env-file') || '.env');
const outputRoot = resolve(
  argValue('output-dir') ||
    process.env.RAMO_BACKUP_DIR ||
    '/var/backups/ramo-nessa',
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      command + ' terminou com código ' + String(result.status),
    );
  }
  return result;
}

function composeArgs(...args) {
  return [
    'compose',
    '--env-file',
    envFile,
    '-f',
    composeFile,
    ...args,
  ];
}

function utcStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function sha256File(path) {
  const content = await readFile(path);
  return createHash('sha256').update(content).digest('hex');
}

async function describeFile(path, name) {
  const info = await stat(path);
  return {
    name,
    bytes: info.size,
    sha256: await sha256File(path),
  };
}

await mkdir(outputRoot, { recursive: true, mode: 0o700 });
await chmod(outputRoot, 0o700);

const stamp = utcStamp();
const incompleteDir = resolve(outputRoot, stamp + '.incomplete');
const finalDir = resolve(outputRoot, stamp);
await mkdir(incompleteDir, { mode: 0o700 });

const databaseFile = resolve(incompleteDir, 'database.dump');
const documentsFile = resolve(
  incompleteDir,
  'driver-documents.tar.gz',
);

try {
  run('docker', composeArgs(
    'exec',
    '-T',
    'postgres',
    'sh',
    '-lc',
    'PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ));

  const databaseHandle = await open(databaseFile, 'wx', 0o600);
  try {
    run(
      'docker',
      composeArgs(
        'exec',
        '-T',
        'postgres',
        'sh',
        '-lc',
        'exec env PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-acl',
      ),
      { stdio: ['ignore', databaseHandle.fd, 'inherit'] },
    );
  } finally {
    await databaseHandle.close();
  }

  const volumeResult = run(
    'docker',
    [
      'volume',
      'ls',
      '--filter',
      'label=com.docker.compose.project=ramo-nessa-prod',
      '--filter',
      'label=com.docker.compose.volume=driver_documents',
      '--format',
      '{{.Name}}',
    ],
    { stdio: 'pipe', encoding: 'utf8' },
  );
  const documentVolume = String(volumeResult.stdout ?? '').trim();
  if (!documentVolume || documentVolume.includes('\n')) {
    throw new Error(
      'Volume driver_documents de produção não foi encontrado de forma inequívoca.',
    );
  }

  const documentsHandle = await open(documentsFile, 'wx', 0o600);
  try {
    run(
      'docker',
      [
        'run',
        '--rm',
        '--read-only',
        '--security-opt',
        'no-new-privileges',
        '--cap-drop',
        'ALL',
        '-v',
        documentVolume + ':/source:ro',
        'postgres:16',
        'tar',
        '-C',
        '/source',
        '-czf',
        '-',
        '.',
      ],
      { stdio: ['ignore', documentsHandle.fd, 'inherit'] },
    );
  } finally {
    await documentsHandle.close();
  }

  run('docker', [
    'run',
    '--rm',
    '--read-only',
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
    '-v',
    incompleteDir + ':/backup:ro',
    'postgres:16',
    'pg_restore',
    '--list',
    '/backup/database.dump',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  run('docker', [
    'run',
    '--rm',
    '--read-only',
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
    '-v',
    incompleteDir + ':/backup:ro',
    'postgres:16',
    'tar',
    '-tzf',
    '/backup/driver-documents.tar.gz',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  const manifest = {
    version: 1,
    project: 'ramo-nessa-prod',
    createdAt: new Date().toISOString(),
    containsSecrets: false,
    database: await describeFile(databaseFile, 'database.dump'),
    driverDocuments: await describeFile(
      documentsFile,
      'driver-documents.tar.gz',
    ),
  };

  const manifestPath = resolve(incompleteDir, 'manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n',
    { encoding: 'utf8', mode: 0o600 },
  );

  await rename(incompleteDir, finalDir);
  console.log('Backup verificado criado em: ' + finalDir);
  console.log(
    'O arquivo não contém o .env nem outros segredos de runtime.',
  );
} catch (error) {
  console.error(
    'Backup não foi concluído. O diretório parcial foi mantido com sufixo .incomplete.',
  );
  throw error;
}
