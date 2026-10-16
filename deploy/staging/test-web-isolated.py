"""Restore a backup and exercise migration/repositories without starting HTTP servers."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

TARGET = '5247aabd587efa610c9b4cc36d74cbc348048b41'
ROOT = Path('/var/backups/ramo-nessa-web/5247aabd587e')
RELEASE = Path('/opt/ramo-nessa-web/releases/5247aabd587e')
MIGRATION = '085_web_push_preferences.sql'
CHECKSUM = '3dcc187d0562289d9c1f5757cc4fd354611e95d6c36232af028be8dfa0b4d790'


def migration_plan(applied, files):
    if len(applied) != 86 or any(files.get(name) != checksum for name, checksum in applied.items()):
        raise ValueError('Histórico de migrations diferente do aprovado.')
    if set(files) - set(applied) != {MIGRATION} or files[MIGRATION] != CHECKSUM:
        raise ValueError('A única migration pendente deve ser a 085 aprovada.')


def backup_file(directory, entry):
    name = entry['name']
    if not isinstance(name, str) or not name or Path(name).name != name or name in ('.', '..'):
        raise ValueError('Nome de backup inseguro.')
    path = directory / name
    if path.is_symlink() or not path.is_file():
        raise ValueError('Arquivo de backup ausente ou inválido.')
    if hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
        raise ValueError('Checksum do backup diferente do manifesto.')
    return path


def main():
    if os.geteuid() != 0:
        raise SystemExit('Execute com sudo.')
    prepared = json.loads((ROOT / 'prepared.json').read_text())
    images = json.loads((ROOT / 'images-prepared.json').read_text())
    if prepared['target'] != TARGET or images['target'] != TARGET or not prepared['restoreDrillPassed']:
        raise SystemExit('Preparação verificada obrigatória.')
    if images['environmentPreserved'] is not True or images['servicesUnchanged'] is not True:
        raise SystemExit('Preparação de imagens incompleta.')
    core_backup = Path(prepared['coreBackup'])
    if not core_backup.resolve().is_relative_to(ROOT.resolve()):
        raise SystemExit('Diretório de backup inesperado.')
    manifest = json.loads((core_backup / 'manifest.json').read_text())
    if manifest['version'] != 1 or manifest['project'] != 'ramo-nessa-staging':
        raise SystemExit('Manifesto inesperado.')
    dump = backup_file(core_backup, manifest['database'])
    probe = Path(__file__).with_name('probe-web-push-schema.mjs').resolve()
    log_path = ROOT / ('isolated-test-' + secrets.token_hex(6) + '.log')
    log_fd = os.open(log_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    log = os.fdopen(log_fd, 'w')
    suffix = secrets.token_hex(10)
    database = 'ramo-web-isolated-' + suffix
    worker = 'ramo-web-probe-' + suffix
    password = secrets.token_urlsafe(32)
    connection = 'postgresql://ramo_isolated:' + password + '@127.0.0.1:5432/ramo_isolated'

    def run(args, input=None, allow_failure=False):
        result = subprocess.run(args, input=input, capture_output=True, text=True, timeout=240)
        log.write(result.stdout + result.stderr)
        log.flush()
        if result.returncode and not allow_failure:
            raise RuntimeError('Etapa isolada falhou; detalhes no log privado: ' + str(log_path))
        return result

    def inspect(name):
        return json.loads(run(['docker', 'inspect', name]).stdout)[0]

    def sql(query):
        return run(['docker', 'exec', '-i', database, 'psql', '-v', 'ON_ERROR_STOP=1',
                    '-Atq', '-U', 'ramo_isolated', '-d', 'ramo_isolated'], input=query).stdout.strip()

    def migrations():
        rows = sql('SELECT filename,checksum FROM schema_migrations ORDER BY filename;')
        return dict(row.split('|', 1) for row in rows.splitlines())

    def image_command(image, command):
        return run(['docker', 'run', '--rm', '--name', worker, '--network', 'container:' + database,
                    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                    '--env', 'DATABASE_URL=' + connection, '--env', 'NODE_ENV=test',
                    '--mount', 'type=bind,src=' + str(probe) + ',dst=/probe.mjs,readonly',
                    '--entrypoint', 'node', image, *command]).stdout

    before = []
    created = False
    try:
        for item in images['containers']:
            current = inspect(item['name'])
            if current['Id'] != item['id'] or current['Image'] != item['image']:
                raise RuntimeError('Um serviço mudou desde a preparação.')
            before.append((item['name'], current['Id'], current['Image']))
        active_caddy = Path('/opt/ramo-nessa/deploy/staging/Caddyfile')
        if hashlib.sha256(active_caddy.read_bytes()).hexdigest() != images['activeSha256']:
            raise RuntimeError('Configuração ativa mudou.')
        image_id = run(['docker', 'image', 'inspect', '--format', '{{.Id}}', images['coreImage']]).stdout.strip()
        if image_id != images['coreId']:
            raise RuntimeError('Imagem candidata mudou.')
        old_image = prepared['images']['ramo-nessa-staging-core-1']['image']
        pg_image = prepared['images']['ramo-nessa-staging-postgres-1']['image']
        print('Restaurando cópia do banco em container sem acesso à internet...', flush=True)
        run(['docker', 'run', '-d', '--rm', '--name', database, '--network', 'none',
             '--label', 'br.com.ramonessa.purpose=web-isolated-test',
             '--env', 'POSTGRES_USER=ramo_isolated', '--env', 'POSTGRES_DB=ramo_isolated',
             '--env', 'POSTGRES_PASSWORD=' + password,
             '--mount', 'type=bind,src=' + str(core_backup) + ',dst=/backup,readonly', pg_image])
        created = True
        for _ in range(60):
            ready = run(['docker', 'exec', database, 'sh', '-c',
                         'test "$(cat /proc/1/comm)" = postgres && pg_isready -U ramo_isolated -d ramo_isolated'], allow_failure=True)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Banco isolado não iniciou.')
        run(['docker', 'exec', database, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
             '-U', 'ramo_isolated', '-d', 'ramo_isolated', '/backup/' + dump.name])
        files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in (RELEASE / 'source/backend/core/migrations').glob('*.sql')}
        applied = migrations()
        migration_plan(applied, files)
        original_devices = sql("SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'[]')) FROM push_devices p;")
        print('Testando migration 085 e sua repetição pelo runner da imagem candidata...', flush=True)
        first = image_command(image_id, ['dist/scripts/migrate.js'])
        if [line for line in first.splitlines() if line.startswith('applied ')] != ['applied ' + MIGRATION]:
            raise RuntimeError('Runner aplicou migrations diferentes da 085.')
        second = image_command(image_id, ['dist/scripts/migrate.js'])
        if any(line.startswith('applied ') for line in second.splitlines()) or migrations() != files:
            raise RuntimeError('Repetição da migration ou histórico inválido.')
        preserved = sql("SELECT md5(COALESCE(jsonb_agg(to_jsonb(p)-'notification_preference' ORDER BY id)::text,'[]')) FROM push_devices p;")
        if preserved != original_devices or sql("SELECT count(*) FROM push_devices WHERE notification_preference <> 'all';") != '0':
            raise RuntimeError('Registros anteriores não foram preservados.')
        print('Testando registros Android/iOS/Web e o repositório da imagem anterior...', flush=True)
        if 'OLD_REPOSITORY_OK' not in image_command(old_image, ['/probe.mjs']):
            raise RuntimeError('Repositório anterior incompatível.')
        if 'NEW_REPOSITORY_OK' not in image_command(image_id, ['/probe.mjs', '--modern']):
            raise RuntimeError('Repositório novo incompatível.')
        if 'OLD_REPOSITORY_OK' not in image_command(old_image, ['/probe.mjs']):
            raise RuntimeError('Repositório anterior falhou após o novo.')
        old_runner = image_command(old_image, ['dist/scripts/migrate.js'])
        if any(line.startswith('applied ') for line in old_runner.splitlines()):
            raise RuntimeError('Runner anterior alterou o banco atualizado.')
        if migrations() != files or preserved != sql("SELECT md5(COALESCE(jsonb_agg(to_jsonb(p)-'notification_preference' ORDER BY id)::text,'[]')) FROM push_devices p;"):
            raise RuntimeError('Os probes alteraram os registros originais.')
        for name, identifier, image in before:
            current = inspect(name)
            if (current['Id'], current['Image']) != (identifier, image):
                raise RuntimeError('Um serviço ativo mudou durante o teste.')
        if hashlib.sha256(active_caddy.read_bytes()).hexdigest() != images['activeSha256']:
            raise RuntimeError('Caddy ativo mudou durante o teste.')
        report = dict(target=TARGET, passed=True, migration085Isolated=True,
                      migrationIdempotent=True, originalPushRecordsPreserved=True,
                      nativeOldRepository=True, nativeAndWebNewRepository=True,
                      oldMigrationRunner=True, servicesUnchanged=True,
                      liveMigrationApplied=False, fullHttpOrProviderTest=False,
                      completedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    finally:
        cleanup_ok = run(['docker', 'rm', '-f', worker], allow_failure=True).returncode == 0
        if created:
            cleanup_ok = run(['docker', 'rm', '-fv', database], allow_failure=True).returncode == 0
        log.close()
    if not cleanup_ok:
        raise RuntimeError('Confira a limpeza do container isolado antes de continuar.')
    report['disposableDatabaseRemoved'] = True
    path = ROOT / 'isolated-test.json'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(report, output, indent=2)
    print('TESTE ISOLADO APROVADO. Migration 085 e repositórios de notificações verificados.')
    print('Cópia descartável removida. Serviços ativos preservados. Migration 085 NÃO aplicada à homologação.')


if __name__ == '__main__':
    main()
