import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const verifyBackupScript = resolve(here, 'verify-backup.mjs');

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding,
    maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(
      command + ' terminou com código ' + String(result.status),
    );
  }
  return result;
}

function supportedBackupName(value, field) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value !== basename(value) ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(field + ' possui nome de arquivo inseguro.');
  }
  return value;
}

function cleanupContainer(name) {
  run('docker', ['rm', '-f', name], {
    stdio: 'ignore',
    allowFailure: true,
  });
}

function cleanupVolume(name) {
  run('docker', ['volume', 'rm', '-f', name], {
    stdio: 'ignore',
    allowFailure: true,
  });
}

// Primeiro valida hashes e estrutura sem restaurar nada.
run(process.execPath, [
  verifyBackupScript,
  '--backup-dir=' + backupDir,
]);

const manifest = JSON.parse(
  await readFile(resolve(backupDir, 'manifest.json'), 'utf8'),
);

if (
  manifest.version !== 1 ||
  manifest.project !== 'ramo-nessa-staging' ||
  manifest.containsSecrets !== false
) {
  throw new Error('Manifesto não pertence a um backup Ramo Nessa suportado.');
}

const databaseName = supportedBackupName(
  manifest.database?.name,
  'database',
);
const documentsName = supportedBackupName(
  manifest.driverDocuments?.name,
  'driverDocuments',
);

const suffix =
  String(process.pid) +
  '-' +
  Date.now().toString(36) +
  '-' +
  randomBytes(4).toString('hex');

const dbContainer = 'ramo-restore-drill-db-' + suffix;
const documentsVolume = 'ramo-restore-drill-docs-' + suffix;
const postgresUser = 'ramo_restore';
const postgresDb = 'ramo_restore';
const postgresPassword = randomBytes(32).toString('base64url');

let containerCreated = false;
let volumeCreated = false;

try {
  run('docker', [
    'volume',
    'create',
    '--label',
    'br.com.ramonessa.purpose=restore-drill',
    documentsVolume,
  ], { stdio: 'ignore' });
  volumeCreated = true;

  run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    dbContainer,
    '--network',
    'none',
    '--label',
    'br.com.ramonessa.purpose=restore-drill',
    '-e',
    'POSTGRES_USER=' + postgresUser,
    '-e',
    'POSTGRES_PASSWORD=' + postgresPassword,
    '-e',
    'POSTGRES_DB=' + postgresDb,
    '-v',
    backupDir + ':/backup:ro',
    'postgres:16',
  ], { stdio: 'ignore' });
  containerCreated = true;

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const health = run(
      'docker',
      [
        'exec',
        '-e',
        'PGPASSWORD=' + postgresPassword,
        dbContainer,
        'sh',
        '-lc',
        [
          'test "$(cat /proc/1/comm)" = "postgres"',
          'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null',
          'test "$(psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1")" = "1"',
        ].join(' && '),
      ],
      { stdio: 'ignore', allowFailure: true },
    );
    if (health.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }

  if (!ready) {
    throw new Error(
      'PostgreSQL isolado não concluiu a inicialização final para o teste de recuperação.',
    );
  }

  run('docker', [
    'exec',
    '-e',
    'PGPASSWORD=' + postgresPassword,
    dbContainer,
    'pg_restore',
    '--exit-on-error',
    '--no-owner',
    '--no-acl',
    '-U',
    postgresUser,
    '-d',
    postgresDb,
    '/backup/' + databaseName,
  ]);

  const tableCountResult = run(
    'docker',
    [
      'exec',
      '-e',
      'PGPASSWORD=' + postgresPassword,
      dbContainer,
      'psql',
      '-At',
      '-U',
      postgresUser,
      '-d',
      postgresDb,
      '-c',
      "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';",
    ],
    { stdio: 'pipe', encoding: 'utf8' },
  );

  const tableCount = Number(String(tableCountResult.stdout ?? '').trim());
  if (!Number.isInteger(tableCount) || tableCount < 1) {
    throw new Error(
      'O dump restaurou sem uma estrutura pública de banco reconhecível.',
    );
  }

  run('docker', [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
    '-v',
    backupDir + ':/backup:ro',
    '-v',
    documentsVolume + ':/restore',
    'postgres:16',
    'tar',
    '--no-same-owner',
    '-xzf',
    '/backup/' + documentsName,
    '-C',
    '/restore',
  ]);

  // A segunda leitura prova que o conteúdo extraído no volume efêmero
  // continua navegável, sem imprimir nomes de documentos nos logs.
  run('docker', [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
    '-v',
    documentsVolume + ':/restore:ro',
    'postgres:16',
    'tar',
    '-C',
    '/restore',
    '-cf',
    '/dev/null',
    '.',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  console.log(
    'Teste de recuperação concluído: banco restaurado em container isolado e documentos extraídos em volume descartável.',
  );
  console.log(
    'Nenhum volume, banco ou container de homologação foi alterado.',
  );
} finally {
  if (containerCreated) cleanupContainer(dbContainer);
  if (volumeCreated) cleanupVolume(documentsVolume);
}
