#!/usr/bin/env python3
"""Install a verified recovery overlay and keep a reversible VPS checkpoint."""

import copy
import fcntl
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import warnings
import zipfile

ROOT = Path('/opt/ramo-nessa-security')
WEB_RELEASES = Path('/opt/ramo-nessa-web/releases')
HELPER = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
HELPER_HASH = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
SOURCE = '45e9ba1cdd00ded076489b4567245c202c0bf5a6'
BASE_CORE = 'ramo-nessa-core:password-only-7c4c3dc2'
BASE_SOURCE = '7c4c3dc2b3b8ca4fb89982f7ea39329c67e5559b'
BASE_WEB = '/opt/ramo-nessa-web/releases/password-only-7c4c3dc2-aIrxPqXh/bundles'
BASE_FILES = (
    'dist/src/server.js',
    'dist/src/db/repositories.js',
    'dist/src/auth/auth-service.js',
    'dist/src/auth/passenger-password-auth-service.js',
    'dist/src/auth/repositories/postgres-auth-session-repository.js',
)
NEW_FILES = tuple(f'dist/src/auth/{name}.js' for name in (
    'password-recovery-routes', 'password-recovery-store', 'recovery-delivery',
))
MIGRATION = 'migrations/103_password_recovery.sql'
ROLES = {'driver': 'motorista', 'passenger': 'passageiro'}
ASSETS = (
    ('old-core.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/driver-password-7c4c3dc2b3b8/RamoNessa-Core-Acesso-Senha.zip', '565938f6e7db8e7f5fa72466462e3accb9d2df55e6b6ca23cb719b9bed343e49', 1026353),
    ('old-driver.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/driver-password-7c4c3dc2b3b8/RamoNessa-Motorista-Login-Web.zip', '9e5286bf781de89816ff68a57675dcd700eb5d4f688929dab72b43cdcfb49d8c', 18309061),
    ('old-passenger.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/driver-password-7c4c3dc2b3b8/RamoNessa-Passageiro-Login-Web.zip', '12ad498ef7e7f0515a6f395921487eda14a8311507bb562429ad05f3f90160b4', 18473753),
    ('RamoNessa-Recuperacao-Core.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-45e9ba1cdd00/RamoNessa-Recuperacao-Core.zip', 'ed8cfae9dcd7094d2b06b24f48402de53631189a18a42a2907cf48db896f9b39', 71152),
    ('RamoNessa-Recuperacao-driver.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-45e9ba1cdd00/RamoNessa-Recuperacao-driver.zip', '59da92d89f7d1f12fa80aa54fd5c5360ec8326723de8d498b0a4589271078944', 18312006),
    ('RamoNessa-Recuperacao-passenger.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-45e9ba1cdd00/RamoNessa-Recuperacao-passenger.zip', '842b3f1511b9059d416bf0452647715e5acfd70e149c8e256bf8a5989b97cf5a', 18478173),
)


class InstallError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise InstallError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def download_assets(package):
    for name, url, digest, size in ASSETS:
        path = package / name
        result = subprocess.run([
            'curl', '-fLsS', '--retry', '2', '--max-time', '180',
            '--max-filesize', str(size), '--output', str(path), url,
        ], capture_output=True)
        require(result.returncode == 0 and path.is_file(), f'Não foi possível baixar {name}.')
        require(path.stat().st_size == size and sha(path.read_bytes()) == digest,
                f'Arquivo não passou na conferência de integridade: {name}.')
    print('Pacotes da API e dos dois apps Web conferidos.', flush=True)


def helper():
    require(HELPER.is_file() and not HELPER.is_symlink() and sha(HELPER.read_bytes()) == HELPER_HASH,
            'A âncora de segurança esperada está ausente ou mudou.')
    spec = importlib.util.spec_from_file_location('ramo_deploy_guard', HELPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def compose(h, workdir, path, *args, timeout=30):
    return h.run([
        'docker', 'compose', '--project-directory', workdir, '--project-name', h.PROJECT,
        '--env-file', '/dev/null', '-f', str(path), *args,
    ], timeout=timeout)


def web_mount(container):
    mounts = [m for m in container['Mounts'] if m['Destination'] == '/srv/web']
    require(len(mounts) == 1 and mounts[0]['Type'] == 'bind' and not mounts[0]['RW'],
            'O mount da Web diverge da configuração esperada.')
    return mounts[0]['Source']


def snapshot(h, name, service):
    container = h.inspect(name)
    labels = container['Config']['Labels']
    require(container['State'].get('Health', {}).get('Status') == 'healthy',
            f'{service} não está saudável.')
    require(labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == service, 'Projeto Compose divergente.')
    path = labels.get('com.docker.compose.project.config_files', '')
    workdir = labels.get('com.docker.compose.project.working_dir', '')
    require(path.startswith('/') and ',' not in path and workdir.startswith('/'),
            'A configuração Compose exige revisão.')
    raw = h.private_file(Path(path))
    original = json.loads(raw)
    require(set(original['services']) == {service} and not original['services'][service].get('env_file'),
            'A configuração Compose deve conter um serviço isolado e sem env_file.')
    resolved = json.loads(compose(h, workdir, path, 'config', '--format', 'json'))
    verify_model = {'services': {'core': resolved['services'][service]}}
    h.assert_environment(verify_model, container, h.inspect(container['Image'], True))
    h.assert_mount_plan(verify_model, container)
    original['services'][service]['image'] = container['Image']
    resolved['services'][service]['image'] = container['Image']
    return {
        'name': name, 'container': container, 'config': path, 'configHash': sha(raw),
        'workdir': workdir, 'original': original, 'resolved': resolved,
    }


def safe_web_path(value):
    path = PurePosixPath(value)
    require(bool(path.parts) and not path.is_absolute() and str(path) == value and
            all(part not in ('..', '.') for part in path.parts), 'Nome inválido no pacote Web.')
    return path


def verify_shell(before, incoming, route):
    for name in ['index.html', 'ramo_push_config.js']:
        require((before / name).is_file(), 'Shell atual da Web está incompleto.')
    old_index = (before / 'index.html').read_text()
    new_index = incoming['index.html'].decode()
    pattern = r'https://maps\.googleapis\.com/maps/api/js\?key=(AIza[A-Za-z0-9_-]{35})'
    maps = re.search(pattern, old_index)
    new_maps = re.search(pattern, new_index)
    require(f'<base href="/{route}/">' in old_index and f'<base href="/{route}/">' in new_index
            and maps and new_maps and maps[1] == new_maps[1], 'Base da Web ou configuração Maps mudou.')
    config = r'self\.ramoPushConfig = ([\s\S]+);\s*$'
    current = re.search(config, (before / 'ramo_push_config.js').read_text())
    candidate = re.search(config, incoming['ramo_push_config.js'].decode())
    require(current and candidate and json.loads(current[1]) == json.loads(candidate[1]),
            'A configuração de push Web diverge da ativa.')


def prepare_web(old_root, new_root, package, source):
    require(not old_root.is_symlink() and all(not p.is_symlink() for p in old_root.rglob('*')),
            'Há links inesperados nos arquivos Web ativos.')
    shutil.copytree(old_root, new_root)
    for role, route in ROLES.items():
        with zipfile.ZipFile(package / f'old-{role}.zip') as previous,              zipfile.ZipFile(package / f'RamoNessa-Recuperacao-{role}.zip') as candidate:
            baseline = json.loads(previous.read('manifest.json'))
            metadata = json.loads(candidate.read('manifest.json'))
            require(baseline['source'] == BASE_SOURCE and metadata['source'] == source and
                    baseline['role'] == metadata['role'] == role, 'Origem dos bundles Web divergente.')
            require(sha((old_root / role / 'main.dart.js').read_bytes()) == baseline['files']['main.dart.js'],
                    'O bundle Web em uso mudou desde a versão revisada.')
            require(set(candidate.namelist()) == {'manifest.json', *(f'{role}/{name}' for name in metadata['files'])},
                    'Arquivos inesperados no pacote Web.')
            verify_shell(old_root / role, {name: candidate.read(f'{role}/{name}')
                         for name in ('index.html', 'ramo_push_config.js')}, route)
            for name, digest in metadata['files'].items():
                relative = safe_web_path(name)
                raw = candidate.read(f'{role}/{name}')
                require(sha(raw) == digest, 'Arquivo Web não corresponde ao manifesto.')
                destination = new_root / role / relative
                compiled = (name.startswith('main.dart.') or name.endswith('.map') or
                            name in {'flutter.js', 'flutter_bootstrap.js', 'flutter_service_worker.js'})
                if len(relative.parts) == 1 and not compiled and destination.exists():
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(raw)
                destination.chmod(0o644)
    for path in [new_root, *[p for p in new_root.rglob('*') if p.is_dir()]]:
        path.chmod(0o755)


def get_keys():
    with open('/dev/tty', 'r') as tty, warnings.catch_warnings():
        require(tty.isatty(), 'Abra um terminal interativo para digitar as chaves.')
        warnings.simplefilter('error', getpass.GetPassWarning)
        email = getpass.getpass('Cole a chave de envio do Resend e pressione Enter: ').strip()
        whatsapp = getpass.getpass('Cole o API Secret da Entrar e pressione Enter: ').strip()
    require(re.fullmatch(r're_[A-Za-z0-9_-]{10,256}', email) and
            re.fullmatch(r'[A-Za-z0-9_.+/=-]{10,256}', whatsapp), 'Formato de chave inválido.')
    return {
        'PASSWORD_RECOVERY_SECRET': secrets.token_urlsafe(48),
        'RESEND_API_KEY': email,
        'PASSWORD_RECOVERY_EMAIL_FROM': 'Ramo Nessa <recuperacao@acesso.ramonessa.com.br>',
        'PASSWORD_RECOVERY_ENTRAR_API_SECRET': whatsapp,
        'PASSWORD_RECOVERY_EMAIL_DAILY_LIMIT': '80',
        'PASSWORD_RECOVERY_WHATSAPP_DAILY_LIMIT': '50',
    }


def migrate(h, core, migration):
    script = """
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const filename = '103_password_recovery.sql';
const sql = MIGRATION_CONTENT;
const checksum = createHash('sha256').update(sql).digest('hex');
const pool = createPostgresPool(process.env.DATABASE_URL);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='8s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['ramo-nessa-schema-migrations']);
  const base = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', ['102_remove_whatsapp_auth.sql']);
  if (!base.rowCount) throw Error('Migration 102 missing');
  const old = await client.query('SELECT checksum FROM schema_migrations WHERE filename=$1', [filename]);
  if (old.rowCount) {
    if (old.rows[0].checksum !== checksum) throw Error('Migration checksum mismatch');
  } else {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [filename,checksum]);
  }
  await client.query('COMMIT');
  console.log('RECOVERY_MIGRATION_OK');
} catch {
  await client.query('ROLLBACK');
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
"""
    result = h.run(['docker', 'exec', '-i', core, 'node', '--input-type=module', '-'],
                   input=script.replace('MIGRATION_CONTENT', json.dumps(migration)).encode(), timeout=45)
    require(result.strip() == b'RECOVERY_MIGRATION_OK', 'O banco não confirmou a migration 103.')


def up(h, plan, service, phase):
    info = plan[service]
    compose(h, info['workdir'], h.DIRECTORY / f'{service}-{phase}.private.json',
            'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate',
            '--wait', '--wait-timeout', '90', service, timeout=125)


def assert_other_services(h, plan):
    for container in plan['others']:
        require(h.identity(h.inspect(container['Name'])) == h.identity(container),
                'Outro container mudou durante a preparação.')


def verify_runtime(h, plan, candidate):
    core = copy.deepcopy(plan['core']['container'])
    gateway = copy.deepcopy(plan['gateway']['container'])
    image = plan['image'] if candidate else core['Image']
    if candidate:
        updated = json.loads(h.private_file(h.DIRECTORY / 'core-after.private.json'))
        environment = updated['services']['core']['environment']
        core['Config']['Env'] += [f'{name}={environment[name]}' for name in plan['newKeys']]
        for mount in gateway['Mounts']:
            if mount['Destination'] == '/srv/web':
                mount['Source'] = plan['newWeb']
        for mount in gateway['HostConfig'].get('Mounts') or []:
            if mount.get('Target') == '/srv/web':
                mount['Source'] = plan['newWeb']
        gateway['HostConfig']['Binds'] = [
            plan['newWeb'] + bind[len(BASE_WEB):] if bind.startswith(BASE_WEB + ':') else bind
            for bind in gateway['HostConfig'].get('Binds') or []
        ]
    h.runtime_matches(core, h.inspect(plan['core']['name']), image)
    h.runtime_matches(gateway, h.inspect(plan['gateway']['name']), gateway['Image'])
    assert_other_services(h, plan)


def verify_public(h, plan, candidate):
    root = Path(plan['newWeb'] if candidate else BASE_WEB)
    bundles = {route: sha((root / role / 'main.dart.js').read_bytes()) for role, route in ROLES.items()}
    probe = """
import {createHash} from 'node:crypto';
const base = 'https://app.ramonessa.com.br';
const request = async path => {
  const response = await fetch(base + path, {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw Error('HTTP probe failed');
  return response;
};
await (await request('/ready')).arrayBuffer();
for (const [route, sha] of Object.entries(BUNDLES)) {
  const r = await request('/' + route + '/main.dart.js?recovery=' + Date.now());
  if (createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex') !== sha) throw Error('Web mismatch');
}
if (NEW_RELEASE) {
  for (const role of ['driver','passenger']) {
    const r = await request('/v1/auth/' + role + '/recovery/channels');
    if (JSON.stringify((await r.json()).channels) !== '["email","whatsapp"]') throw Error('Missing recovery channels');
  }
}
"""
    probe = probe.replace('BUNDLES', json.dumps(bundles)).replace('NEW_RELEASE', json.dumps(candidate))
    h.run(['docker', 'exec', plan['core']['name'], 'node', '--input-type=module', '-e', probe], timeout=70)


def rollback(h, plan):
    for service in ('core', 'gateway'):
        info = plan[service]
        require(sha(h.private_file(Path(info['config']))) == info['configHash'],
                'A configuração original mudou. Retorno interrompido.')
        for phase in ('before', 'after'):
            file = f'{service}-{phase}.private.json'
            require(sha(h.private_file(h.DIRECTORY / file)) == plan['composeHashes'][file],
                    'A âncora foi alterada. Retorno interrompido.')
    changed = {}
    for service in ('core', 'gateway'):
        info = plan[service]
        name = info['name'].lstrip('/')
        exists = h.run(['docker', 'ps', '-aq', '--filter', f'name=^/{name}$']).strip()
        if not exists:
            changed[service] = True
            continue
        current = h.inspect(info['name'])
        labels = current['Config']['Labels']
        require(labels.get('com.docker.compose.project') == h.PROJECT and
                labels.get('com.docker.compose.service') == service,
                'O container ativo pertence a outro projeto. Retorno interrompido.')
        allowed_configs = {
            info['config'], *(str(h.DIRECTORY / f'{service}-{phase}.private.json') for phase in ('before', 'after')),
        }
        require(labels.get('com.docker.compose.project.config_files') in allowed_configs,
                'A configuração ativa pertence a outra publicação. Retorno interrompido.')
        if service == 'core':
            require(current['Image'] in (info['container']['Image'], plan['image']),
                    'Outra versão do Core foi publicada. Retorno interrompido.')
            changed[service] = current['Image'] == plan['image']
        else:
            mount = web_mount(current)
            require(current['Image'] == info['container']['Image'] and mount in (BASE_WEB, plan['newWeb']),
                    'Outra versão Web foi publicada. Retorno interrompido.')
            changed[service] = mount == plan['newWeb']
    for service in ('gateway', 'core'):
        if changed[service]:
            up(h, plan, service, 'before')
    verify_runtime(h, plan, False)
    verify_public(h, plan, False)


def install(h, package, source):
    require(re.fullmatch(r'[a-f0-9]{40}', source), 'Identificador do pacote inválido.')
    core = snapshot(h, h.NAMES[0], 'core')
    gateway = snapshot(h, h.NAMES[1], 'gateway')
    require(core['container']['Config']['Image'] == BASE_CORE or
            core['container']['Image'] == h.inspect(BASE_CORE, True)['Id'],
            'A versão ativa do Core mudou desde a verificação.')
    require(web_mount(gateway['container']) == BASE_WEB, 'A versão Web ativa mudou.')
    require(shutil.disk_usage(ROOT).free >= 2 * 1024**3, 'São necessários pelo menos 2 GB livres.')
    require(all(not (m['Destination'] == '/app' or m['Destination'].startswith('/app/dist'))
                for m in core['container']['Mounts']), 'O código do Core está sobreposto por um mount.')
    h.inactive()
    h.DIRECTORY = Path(tempfile.mkdtemp(prefix='password-recovery-', dir=ROOT))
    print(f'Preparação privada: {h.DIRECTORY}', flush=True)
    build = h.DIRECTORY / 'build'
    build.mkdir()
    with zipfile.ZipFile(package / 'old-core.zip') as baseline,          zipfile.ZipFile(package / 'RamoNessa-Recuperacao-Core.zip') as candidate:
        require(candidate.read('source.txt').decode().strip() == source, 'Origem do pacote Core divergente.')
        require(set(candidate.namelist()) == {'source.txt', *BASE_FILES, *NEW_FILES, MIGRATION},
                'Conteúdo inesperado no pacote Core.')
        for name in BASE_FILES:
            live = h.run(['docker', 'exec', core['name'], 'cat', f'/app/{name}'])
            require(live == baseline.read(name), f'O módulo em uso mudou: {name}.')
        for name in (*BASE_FILES, *NEW_FILES, MIGRATION):
            path = build / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(candidate.read(name))
            path.chmod(0o644)
    image = h.inspect(core['container']['Image'], True)
    tag = 'ramo-nessa-recovery-base:' + h.DIRECTORY.name
    candidate_tag = tag.replace('-base:', ':')
    h.run(['docker', 'image', 'tag', image['Id'], tag])
    (build / 'Dockerfile').write_text(f'FROM {tag}\n' +
        ''.join(f'COPY {name} /app/{name}\n' for name in (*BASE_FILES, *NEW_FILES, MIGRATION)))
    h.run(['docker', 'build', '--pull=false', '--network=none', '-t', candidate_tag, str(build)], timeout=180)
    candidate = h.inspect(candidate_tag, True)
    require(candidate['Config'] == image['Config'] and
            candidate['RootFS']['Layers'][:len(image['RootFS']['Layers'])] == image['RootFS']['Layers'],
            'Configuração da imagem candidata divergente.')
    h.run(['docker', 'run', '--rm', '--network=none', '--read-only', '--entrypoint', 'sh',
           candidate['Id'], '-ec', 'for f do node --check "$f"; done', 'recovery-check',
           *[f'/app/{name}' for name in (*BASE_FILES, *NEW_FILES)]], timeout=45)
    new_root = WEB_RELEASES / h.DIRECTORY.name / 'bundles'
    new_root.parent.mkdir(mode=0o755)
    new_root.parent.chmod(0o755)
    prepare_web(Path(BASE_WEB), new_root, package, source)
    keys = get_keys()
    plan = {
        'core': core, 'gateway': gateway, 'image': candidate['Id'], 'source': source,
        'newWeb': str(new_root), 'newKeys': list(keys), 'composeHashes': {},
        'others': [h.inspect(name) for name in h.NAMES[2:]],
    }
    for service in ('core', 'gateway'):
        info = plan[service]
        for phase in ('before', 'after'):
            config = copy.deepcopy(info['original'])
            expected = copy.deepcopy(info['resolved'])
            if phase == 'after':
                for model in (config, expected):
                    settings = model['services'][service]
                    if service == 'core':
                        require(not set(keys).intersection(settings.get('environment', {})),
                                'Já há configuração de recuperação na versão ativa.')
                        settings['image'] = candidate['Id']
                        settings.setdefault('environment', {}).update(keys)
                    else:
                        web, = [mount for mount in settings['volumes'] if mount.get('target') == '/srv/web']
                        require(web['source'] == BASE_WEB and web.get('read_only'), 'O plano de mount Web mudou.')
                        web['source'] = str(new_root)
            filename = f'{service}-{phase}.private.json'
            h.save(filename, config)
            plan['composeHashes'][filename] = sha(h.private_file(h.DIRECTORY / filename))
            actual = json.loads(compose(h, info['workdir'], h.DIRECTORY / filename, 'config', '--format', 'json'))
            require(actual == expected, f'O plano de {service} alteraria configurações fora do escopo.')
    h.save('plan.private.json', plan)
    shutil.copyfile(Path(__file__).resolve(), h.DIRECTORY / 'activate.py')
    print(f'Retorno: sudo python3 {h.DIRECTORY}/activate.py rollback {h.DIRECTORY}', flush=True)
    assert_other_services(h, plan)
    for info in (core, gateway):
        require(sha(h.private_file(Path(info['config']))) == info['configHash'],
                'A configuração original mudou durante a preparação.')
    for filename, digest in plan['composeHashes'].items():
        require(sha(h.private_file(h.DIRECTORY / filename)) == digest, 'O plano privado mudou durante a preparação.')
    for info in (core, gateway):
        require(h.identity(h.inspect(info['name'])) == h.identity(info['container']),
                'Os serviços mudaram durante a preparação.')
    h.inactive()
    migrate(h, core['name'], (build / MIGRATION).read_text())
    h.inactive()
    print('Ativando Core e Web. Pode haver uma breve interrupção.', flush=True)
    try:
        up(h, plan, 'core', 'after')
        up(h, plan, 'gateway', 'after')
        verify_runtime(h, plan, True)
        verify_public(h, plan, True)
    except BaseException:
        try:
            rollback(h, plan)
        except BaseException:
            raise InstallError('Falha na ativação. O retorno automático não foi confirmado.') from None
        raise InstallError('A instalação falhou e a versão anterior foi restaurada.') from None
    print(json.dumps({
        'status': 'PASSWORD_RECOVERY_WEB_ACTIVATED', 'source': source,
        'anchor': str(h.DIRECTORY), 'channels': ['email', 'whatsapp'],
        'realCodesSent': False,
    }), flush=True)


def main():
    require(os.geteuid() == 0, 'Execute com sudo python3.')
    os.umask(0o077)
    h = helper()
    with (ROOT / 'screen-lock-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if len(sys.argv) == 3 and sys.argv[1] == 'rollback':
            directory = Path(sys.argv[2])
            require(directory.parent == ROOT and directory.name.startswith('password-recovery-') and
                    not directory.is_symlink() and directory.stat().st_uid == 0 and
                    directory.stat().st_mode & 0o077 == 0, 'Âncora de retorno inválida.')
            h.DIRECTORY = directory
            h.inactive()
            rollback(h, json.loads(h.private_file(directory / 'plan.private.json')))
            print('PASSWORD_RECOVERY_WEB_ROLLED_BACK')
        elif len(sys.argv) == 1:
            with tempfile.TemporaryDirectory(prefix='recovery-payload-') as directory:
                package = Path(directory)
                download_assets(package)
                install(h, package, SOURCE)
        else:
            raise InstallError('Uso: activate.py ou activate.py rollback ANCORA.')


if __name__ == '__main__':
    try:
        main()
    except InstallError as error:
        sys.exit(str(error))
    except BaseException:
        sys.exit('Operação interrompida. Confira o último estágio informado; não repita automaticamente.')
