import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, statSync, statfsSync, lstatSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const names = {
  core: 'ramo-nessa-staging-core-1', gateway: 'ramo-nessa-staging-gateway-1',
  postgres: 'ramo-nessa-staging-postgres-1', maps: 'ramo-nessa-staging-google-maps-mock-1',
  site: 'ramo-nessa-site-institutional-site-1',
};
export function options(argv) {
  const result = {};
  for (const arg of argv) {
    const match = /^--(core-image|gateway-image)=(sha256:[a-f0-9]{64})$/.exec(arg);
    if (!match || result[match[1]]) throw Error('Informe somente --core-image=sha256:… e --gateway-image=sha256:…');
    result[match[1]] = match[2];
  }
  if (Object.keys(result).length !== 2) throw Error('As duas imagens auditadas são obrigatórias.');
  return result;
}
export function validate(runtime, expected) {
  for (const [role, name] of Object.entries(names)) {
    const item = runtime[role];
    if (item?.Name !== '/' + name || !item.State?.Running || (item.State.Health && item.State.Health.Status !== 'healthy')) throw Error('Serviço ausente ou sem saúde: ' + role);
  }
  for (const role of ['core', 'gateway']) if (runtime[role].Image !== expected[role + '-image']) throw Error('Imagem diferente da auditada: ' + role);
  const mounts = [...runtime.core.Mounts, ...runtime.gateway.Mounts];
  if (!runtime.core.Mounts.some(m => m.Destination === '/var/lib/ramo-nessa' && m.Type === 'volume')) throw Error('Volume de documentos não encontrado.');
  for (const target of ['/srv/web', '/etc/caddy/Caddyfile']) if (!runtime.gateway.Mounts.some(m => m.Destination === target && m.Type === 'bind' && m.RW === false)) throw Error('Mount do Gateway diferente: ' + target);
  for (const m of mounts) if (!['bind', 'volume'].includes(m.Type) || !m.Source?.startsWith('/') || m.Source === '/' || /[\n,]/.test(m.Source)) throw Error('Mount não suportado; interrompido antes do backup.');
  return [...new Map(mounts.map(m => [m.Source, m])).values()];
}
function canonical(value,key='') {
  if(Array.isArray(value)) {
    const rows=value.map(v=>canonical(v));
    if(['Env','Aliases','DNSNames','CapAdd','CapDrop','SecurityOpt'].includes(key))return rows.sort();
    if(key==='Mounts')return rows.sort((a,b)=>a.Destination.localeCompare(b.Destination));
    return rows;
  }
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k],k)]));
  return value;
}
export const runtimeIdentity = item => JSON.stringify(canonical([item.Id,item.Image,item.State.StartedAt,item.Config,item.HostConfig,item.Mounts,item.NetworkSettings.Networks]));
const stable=runtimeIdentity;
export async function backup(argv) {
  const expected = options(argv);
  if (process.getuid?.() !== 0) throw Error('Execute com sudo.');
  process.umask(0o077);
  function run(cmd, args, extra = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 ** 2, stdio: ['ignore', 'pipe', 'pipe'], ...extra });
    if (r.error || r.status !== 0) throw Error('Falha em ' + cmd + '; detalhes privados omitidos.');
    return r.stdout;
  }
  const inspect = () => Object.fromEntries(Object.entries(names).map(([role, name]) => [role, JSON.parse(run('docker', ['inspect', name]))[0]]));
  const before = inspect(), mounts = validate(before, expected);
  for (const mount of mounts) if (lstatSync(mount.Source).isSymbolicLink()) throw Error('Origem do mount é link simbólico; exige tratamento explícito.');
  const root = '/var/backups/ramo-nessa-regions';
  mkdirSync(root, { recursive: true, mode: 0o700 });
  // Refuse unsafe existing directories rather than silently changing their ownership/permissions.
  const rootInfo = statSync(root);
  if (rootInfo.uid !== 0 || (rootInfo.mode & 0o077)) throw Error('Pasta de backup precisa pertencer ao root com modo 0700.');
  const nonce = randomBytes(10).toString('hex');
  const finalDir = join(root, new Date().toISOString().replace(/[:.]/g, '-') + '-' + nonce);
  const destination = finalDir + '.incomplete';
  mkdirSync(destination, { mode: 0o700 });
  const save = (name, data) => writeFileSync(join(destination, name), data, { flag: 'wx', mode: 0o600 });
  const output = (name, cmd, args) => {
    const fd = openSync(join(destination, name), 'wx', 0o600);
    try { run(cmd, args, { stdio: ['ignore', fd, 'pipe'] }); } finally { closeSync(fd); }
  };
  const sql = query => run('docker', ['exec', names.postgres, 'sh', '-lc', 'exec env PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"', 'regions-backup-read-only', 'BEGIN READ ONLY; SET LOCAL statement_timeout=\'10s\'; ' + query + '; COMMIT;']);
  const migrations = sql('SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t');
  const images = [...new Set(Object.values(before).map(x => x.Image))];
  const imageBytes = images.reduce((sum, id) => sum + JSON.parse(run('docker', ['image', 'inspect', id]))[0].Size, 0);
  const databaseBytes = Number(sql('SELECT pg_database_size(current_database())').trim());
  const mountBytes = mounts.reduce((sum, m) => sum + Number(run('du', ['-sb', '--', m.Source]).split(/\s/)[0]), 0);
  const needed = Math.max(3 * 1024 ** 3, imageBytes * 1.25 + databaseBytes * 4 + mountBytes * 2);
  const disk = statfsSync(root);
  if (!Number.isFinite(needed) || disk.bavail * disk.bsize < needed) throw Error('Espaço insuficiente para backup e teste de restauração.');
  save('runtime.private.json', JSON.stringify(before, null, 2));
  save('mounts.private.json', JSON.stringify(mounts, null, 2));
  save('migrations.private.json', migrations);
  const configs = new Set(Object.values(before).flatMap(x => (x.Config.Labels?.['com.docker.compose.project.config_files'] || '').split(',')).filter(Boolean));
  const configMap = [];
  for (const path of configs) {
    if (!path.startsWith('/') || !existsSync(path) || !statSync(path).isFile()) throw Error('Arquivo Compose original indisponível; backup incompleto.');
    const file = 'compose-' + configMap.length + '.private';
    save(file, readFileSync(path)); configMap.push({ path, file });
  }
  save('compose-paths.private.json', JSON.stringify(configMap));
  console.log('Copiando banco, configurações, documentos, Web e imagens atuais. Nenhum serviço ativo será reiniciado.');
  output('database.dump', 'docker', ['exec', names.postgres, 'sh', '-lc', 'exec env PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-acl']);
  const archives = [];
  for (const [i, m] of mounts.entries()) {
    const file = 'mount-' + i + '.tar.gz';
    output(file, 'tar', ['--create', '--gzip', '--file', '-', '--directory', dirname(m.Source), '--', basename(m.Source)]);
    run('tar', ['--list', '--gzip', '--file', join(destination, file)]);
    archives.push({ file, source: m.Source, destination: m.Destination });
  }
  save('archives.private.json', JSON.stringify(archives, null, 2));
  output('images-before.tar', 'docker', ['image', 'save', ...images]);
  run('tar', ['--list', '--file', join(destination, 'images-before.tar')]);
  const drill = 'ramo-regions-restore-' + nonce, volume = drill + '-db';
  const label = 'br.com.ramonessa.regions-backup=' + nonce;
  let createdContainer = false, createdVolume = false;
  const cleanup = () => {
    // Only disposable resources created by this invocation are eligible for removal.
    if (createdContainer) { run('docker', ['rm', '-f', drill]); createdContainer = false; }
    if (createdVolume) { run('docker', ['volume', 'rm', volume]); createdVolume = false; }
  };
  try {
    if (run('docker', ['volume', 'ls', '--format', '{{.Name}}']).trim().split('\n').includes(volume) || run('docker', ['ps', '-a', '--format', '{{.Names}}']).trim().split('\n').includes(drill)) throw Error('Nome descartável já existe.');
    run('docker', ['volume', 'create', '--label', label, volume]); createdVolume = true;
    run('docker', ['run', '-d', '--pull=never', '--name', drill, '--label', label, '--network', 'none', '--env', 'POSTGRES_USER=ramo_restore', '--env', 'POSTGRES_DB=ramo_restore', '--env', 'POSTGRES_PASSWORD=' + randomBytes(32).toString('hex'), '--mount', 'type=volume,src=' + volume + ',dst=/var/lib/postgresql/data', '--mount', 'type=bind,src=' + destination + ',dst=/backup,readonly', before.postgres.Image]); createdContainer = true;
    console.log('Testando restauração em PostgreSQL isolado, sem rede e sem acesso aos provedores de pagamento.');
    let ready = false;
    for (let n = 0; n < 60; n++) {
      const r = spawnSync('docker', ['exec', drill, 'sh', '-lc', 'test "$(cat /proc/1/comm)" = "postgres" && psql -U ramo_restore -d ramo_restore -Atqc "SELECT 1"'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (r.status === 0 && r.stdout.trim() === '1') { ready = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!ready) throw Error('PostgreSQL isolado não iniciou.');
    run('docker', ['exec', drill, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '-U', 'ramo_restore', '-d', 'ramo_restore', '/backup/database.dump']);
    const restoredMigrations = run('docker', ['exec', drill, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'ramo_restore', '-d', 'ramo_restore', '-Atqc', 'SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t']);
    if (restoredMigrations.trim() !== migrations.trim()) throw Error('Migrations restauradas não conferem.');
    // Read every restored table, exercising restored storage rather than only the dump TOC.
    const counts = run('docker', ['exec', drill, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'ramo_restore', '-d', 'ramo_restore', '-Atq', '-c', "SELECT format('SELECT %L AS table_name, count(*) FROM %I.%I;', schemaname || '.' || tablename, schemaname, tablename) FROM pg_tables WHERE schemaname='public'", '-o', '/tmp/counts.sql']);
    void counts;
    save('restored-counts.private.txt', run('docker', ['exec', drill, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'ramo_restore', '-d', 'ramo_restore', '-Atqf', '/tmp/counts.sql']));
    const after = inspect(); validate(after, expected);
    for (const role of Object.keys(names)) if (stable(before[role]) !== stable(after[role])) {save('runtime-changed.private.json',JSON.stringify({role,before:before[role],after:after[role]},null,2));throw Error('Runtime mudou durante o backup: ' + role);}
    if (sql('SELECT json_agg(t ORDER BY filename) FROM (SELECT filename,checksum FROM schema_migrations) t').trim() !== migrations.trim()) throw Error('Migrations ativas mudaram.');
    for (const c of configMap) if (!readFileSync(c.path).equals(readFileSync(join(destination, c.file)))) throw Error('Compose mudou durante o backup.');
    cleanup();
    const files = [];
    for (const name of ['database.dump', 'images-before.tar', ...archives.map(a => a.file), 'runtime.private.json', 'mounts.private.json', 'migrations.private.json', 'archives.private.json', 'compose-paths.private.json', ...configMap.map(c => c.file), 'restored-counts.private.txt']) {
      const path = join(destination, name), hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      files.push({ name, bytes: statSync(path).size, sha256: hash.digest('hex') });
    }
    const manifest = { format: 1, createdAt: new Date().toISOString(), containsSecrets: true, databaseRestoredInIsolation: true, mountArchivesListed: true, files, activeDatabaseChanged: false, resetApplied: false, servicesRestarted: false, runtimeIds: Object.fromEntries(Object.entries(before).map(([role, item]) => [role, item.Id])) };
    save('verified.private.json', JSON.stringify(manifest, null, 2));
    renameSync(destination, finalDir);
    console.log(JSON.stringify({ status: 'BACKUP_VERIFICADO', directory: finalDir, manifestSha256: createHash('sha256').update(readFileSync(join(finalDir, 'verified.private.json'))).digest('hex'), databaseRestoredInIsolation: true, mountArchivesListed: true, servicesRestarted: false, resetApplied: false }, null, 2));
  } finally { cleanup(); }
}
if ((process.argv[1] === '-' && /\/\[eval\d+\]$/.test(import.meta.url)) || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  try { await backup(process.argv.slice(2)); } catch (error) { console.error('BACKUP NÃO CONCLUÍDO: ' + error.message + ' Nenhum reset foi executado.'); process.exitCode = 1; }
}
