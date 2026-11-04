#!/usr/bin/env python3
"""Install the ADM-only account deletion overlay on the verified recovery release."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path('/opt/ramo-nessa-security')
RECOVERY = ROOT / 'password-recovery-hzv0tb5u'
PREVIOUS_ADM = ROOT / 'admin-account-deletion-cyqhtagb'
PREVIOUS_ADM_SOURCE = '7cbfaef1dabf1e3ff41ab34b4dccd92a2e8763f7'
PREVIOUS_ADM_ASSET = (
    'admin-account-deletion-7cbfaef1dabf/RamoNessa-Exclusao-ADM.zip',
    'fe2294534c26c54e032f938db2f13833310235582965b17654e823dfd9c16de3',
)
MIGRATION = 'migrations/104_admin_account_closure.sql'
RECOVERY_INSTALLER_HASH = 'd91d287e630c08d7ccee65afc65fbec7258f86ba7017919ce35a8a8f3c93fdc1'
RECOVERY_SOURCE = '45e9ba1cdd00ded076489b4567245c202c0bf5a6'
RECOVERY_ASSET = (
    'password-recovery-45e9ba1cdd00/RamoNessa-Recuperacao-Core.zip',
    'ed8cfae9dcd7094d2b06b24f48402de53631189a18a42a2907cf48db896f9b39',
)
PASSWORD_ASSET = (
    'driver-password-7c4c3dc2b3b8/RamoNessa-Core-Acesso-Senha.zip',
    '565938f6e7db8e7f5fa72466462e3accb9d2df55e6b6ca23cb719b9bed343e49',
)
BASE_RECOVERY_FILES = ('dist/src/server.js', 'dist/src/db/repositories.js')
BASE_ADMIN_FILE = 'dist/src/admin/admin-human-auth-service.js'
NEW_FILE = 'dist/src/admin/admin-account-deletion.js'
FILES = (*BASE_RECOVERY_FILES, BASE_ADMIN_FILE, NEW_FILE)
ADM_FILES = ('src/app.js', 'src/api.js')


class InstallError(Exception):
    pass


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def require(ok, message):
    if not ok:
        raise InstallError(message)


def load_guard():
    path = RECOVERY / 'activate.py'
    require(path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == RECOVERY_INSTALLER_HASH,
            'A âncora de recuperação esperada está ausente ou mudou.')
    spec = importlib.util.spec_from_file_location('rn_recovery_install', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, module.helper()


def admin_mount(container):
    mounts = container['Mounts']
    require(not any(m['Destination'] in ('/', '/srv') or m['Destination'].startswith('/srv/admin/')
                    for m in mounts), 'Outro mount sobrepõe os arquivos do ADM.')
    matches = [m for m in mounts if m['Destination'] == '/srv/admin']
    if not matches:
        return None
    require(len(matches) == 1 and matches[0]['Type'] == 'bind' and not matches[0]['RW'],
            'O mount ativo do ADM exige revisão.')
    return matches[0]['Source']


def download(path, asset):
    relative, checksum = asset
    url = 'https://github.com/iansilva23/ramo-nessa/releases/download/' + relative
    result = subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '120',
                             '--max-filesize', '20000000', '-o', str(path), url], capture_output=True)
    require(result.returncode == 0 and path.is_file() and sha(path.read_bytes()) == checksum,
            'Um pacote não passou na conferência de integridade.')


def config_path(h, service, stage):
    return h.DIRECTORY / f'{service}-{stage}.private.json'


def up(review, h, plan, service, stage):
    review.compose(h, plan[service]['workdir'], config_path(h, service, stage),
                   'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate',
                   '--wait', '--wait-timeout', '90', service, timeout=125)


def verify(review, h, plan, candidate):
    core = plan['core']['container']
    gateway = copy.deepcopy(plan['gateway']['container'])
    current_gateway = h.inspect(gateway['Name'])
    source = plan['nextAdmin'] if candidate and plan['oldAdmin'] else plan['oldAdmin']
    gateway_image = plan['gatewayImage'] if candidate else gateway['Image']
    require(admin_mount(current_gateway) == source, 'O mount publicado do ADM divergiu.')
    require(review.web_mount(current_gateway) == plan['web'], 'O mount dos apps Web divergiu.')
    if candidate and plan['oldAdmin']:
        for mount in gateway['Mounts']:
            if mount['Destination'] == '/srv/admin':
                mount['Source'] = source
        gateway['HostConfig']['Binds'] = [
            source + entry[len(plan['oldAdmin']):] if entry.startswith(plan['oldAdmin'] + ':') else entry
            for entry in gateway['HostConfig'].get('Binds') or []
        ]
    h.runtime_matches(gateway, current_gateway, gateway_image)
    h.runtime_matches(core, h.inspect(core['Name']), plan['image'] if candidate else core['Image'])
    for container in plan['others']:
        require(h.identity(h.inspect(container['Name'])) == h.identity(container), 'Outro serviço mudou.')

    checks = plan['admHashes']['after' if candidate else 'before']
    js = """
import {createHash} from 'node:crypto';
const base = 'https://app.ramonessa.com.br';
const get = (path, options = {}) => fetch(base + path, {
  signal: AbortSignal.timeout(12000), redirect: 'error', cache: 'no-store', ...options,
});
if (!(await get('/ready')).ok) throw Error('Core unavailable');
for (const [name, checksum] of Object.entries(ADM_FILES)) {
  const response = await get('/administrodo/' + name + '?check=' + Date.now());
  if (!response.ok || createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex') !== checksum) {
    throw Error('ADM mismatch');
  }
}
if (CANDIDATE) {
  const response = await get('/v1/admin/accounts/passenger/adm-deletion-probe/delete', {
    method: 'POST', headers: {'content-type':'application/json'}, body: '{}',
  });
  if (response.status !== 401) throw Error('Unauthenticated request was not denied');
  const recovery = await get('/v1/auth/passenger/recovery/channels');
  if (!recovery.ok || JSON.stringify((await recovery.json()).channels) !== '["email","whatsapp"]') {
    throw Error('Recovery channels unavailable');
  }
}
"""
    js = js.replace('ADM_FILES', json.dumps(checks)).replace('CANDIDATE', json.dumps(candidate))
    h.run(['docker', 'exec', core['Name'], 'node', '--input-type=module', '-e', js], timeout=80)


def rollback(review, h, plan):
    for filename, digest in plan['configHashes'].items():
        require(sha(h.private_file(h.DIRECTORY / filename)) == digest, 'A âncora de retorno foi alterada.')
    changed = {}
    for service in ('gateway', 'core'):
        info = plan[service]
        original = info['container']
        exists = h.run(['docker', 'ps', '-aq', '--filter', 'name=^' + original['Name'] + '$']).strip()
        if not exists:
            changed[service] = True
            continue
        current = h.inspect(original['Name'])
        labels = current['Config']['Labels']
        allowed = {info['config'], *(str(config_path(h, service, stage)) for stage in ('before', 'after'))}
        require(labels.get('com.docker.compose.project.config_files') in allowed,
                'Outra publicação está ativa. Retorno interrompido.')
        if service == 'core':
            require(current['Image'] in (original['Image'], plan['image']), 'Imagem do Core mudou.')
            changed[service] = current['Image'] == plan['image']
        else:
            source = admin_mount(current)
            require(review.web_mount(current) == plan['web'], 'O mount dos apps Web mudou.')
            if plan['oldAdmin'] is None:
                require(source is None and current['Image'] in (original['Image'], plan['gatewayImage']),
                        'A imagem do gateway mudou.')
                changed[service] = current['Image'] == plan['gatewayImage']
            else:
                require(current['Image'] == original['Image'] and source in (plan['oldAdmin'], plan['nextAdmin']),
                        'O mount do ADM mudou.')
                changed[service] = source == plan['nextAdmin']
    for service in ('gateway', 'core'):
        if changed[service]:
            up(review, h, plan, service, 'before')
    verify(review, h, plan, False)


def migrate_account_closure(h, core, migration):
    script = """
import {createHash} from 'node:crypto';
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const filename = '104_admin_account_closure.sql';
const sql = MIGRATION_CONTENT;
const checksum = createHash('sha256').update(sql).digest('hex');
const pool = createPostgresPool(process.env.DATABASE_URL);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='8s'");
  await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['ramo-nessa-schema-migrations']);
  const base = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', ['103_password_recovery.sql']);
  if (!base.rowCount) throw Error('Migration 103 missing');
  const old = await client.query('SELECT checksum FROM schema_migrations WHERE filename=$1', [filename]);
  if (old.rowCount) {
    if (old.rows[0].checksum !== checksum) throw Error('Migration checksum mismatch');
  } else {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)', [filename,checksum]);
  }
  await client.query('COMMIT');
  console.log('ACCOUNT_CLOSURE_SCHEMA_OK');
} catch {
  await client.query('ROLLBACK');
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
"""
    result = h.run(['docker', 'exec', '-i', core, 'node', '--input-type=module', '-'],
                   input=script.replace('MIGRATION_CONTENT', json.dumps(migration)).encode(), timeout=45)
    require(result.strip() == b'ACCOUNT_CLOSURE_SCHEMA_OK', 'O banco não confirmou a migration 104.')


def install(review, h, source, checksum):
    require(re.fullmatch(r'[0-9a-f]{40}', source) and re.fullmatch(r'[0-9a-f]{64}', checksum), 'Dados de release inválidos.')
    active = json.loads(h.private_file(RECOVERY / 'plan.private.json'))
    require(active.get('source') == RECOVERY_SOURCE, 'A âncora pertence a outra release.')
    core = review.snapshot(h, h.NAMES[0], 'core')
    gateway = review.snapshot(h, h.NAMES[1], 'gateway')
    previous_plan = PREVIOUS_ADM / 'plan.private.json'
    previous = json.loads(h.private_file(previous_plan)) if previous_plan.is_file() else {}
    mounted_admin = admin_mount(gateway['container'])
    on_previous_adm = (
        previous.get('source') == PREVIOUS_ADM_SOURCE
        and core['container']['Image'] == previous.get('image')
        and gateway['container']['Image'] == previous.get('gatewayImage')
        and mounted_admin == (previous.get('nextAdmin') if previous.get('oldAdmin') else None)
    )
    on_recovery = (
        core['container']['Image'] == active['image']
        and gateway['container']['Image'] == active['gateway']['container']['Image']
    )
    require((on_recovery or on_previous_adm) and review.web_mount(gateway['container']) == active['newWeb'],
            'A versão em uso difere das duas versões validadas para a atualização.')
    require(shutil.disk_usage(ROOT).free >= 2 * 1024**3, 'São necessários 2 GB livres.')
    require(all(not (m['Destination'] == '/app' or m['Destination'].startswith('/app/dist'))
                for m in core['container']['Mounts']), 'O Core está sobreposto por um mount.')
    active_admin_mount = mounted_admin
    old_admin = Path(active_admin_mount) if active_admin_mount else None
    if old_admin is not None:
        require(old_admin.is_dir() and not old_admin.is_symlink()
                and all(not p.is_symlink() for p in old_admin.rglob('*')), 'Pasta atual do ADM exige revisão.')
    h.inactive()
    others = [h.inspect(name) for name in h.NAMES[2:]]
    h.DIRECTORY = Path(tempfile.mkdtemp(prefix='admin-account-deletion-', dir=ROOT))
    print('Preparando a imagem da API e conferindo os arquivos ativos do ADM.', flush=True)

    with tempfile.TemporaryDirectory(prefix='rn-admin-payload-') as tmp:
        tmp = Path(tmp)
        download(tmp / 'release.zip', (f'admin-account-deletion-{source[:12]}/RamoNessa-Exclusao-ADM.zip', checksum))
        if on_previous_adm:
            download(tmp / 'previous.zip', PREVIOUS_ADM_ASSET)
        else:
            download(tmp / 'recovery.zip', RECOVERY_ASSET)
            download(tmp / 'password.zip', PASSWORD_ASSET)
        build = h.DIRECTORY / 'build'
        build.mkdir()
        with zipfile.ZipFile(tmp / 'release.zip') as package:
            require(set(package.namelist()) == {*FILES, MIGRATION, 'adm.patch', 'adm-from-v1.patch', 'source.txt'}
                    and package.read('source.txt').decode().strip() == source, 'Pacote inesperado.')
            expected_files = FILES if on_previous_adm else (*BASE_RECOVERY_FILES, BASE_ADMIN_FILE)
            for name in expected_files:
                archive = 'previous.zip' if on_previous_adm else ('password.zip' if name == BASE_ADMIN_FILE else 'recovery.zip')
                with zipfile.ZipFile(tmp / archive) as baseline:
                    require(h.run(['docker', 'exec', core['name'], 'cat', '/app/' + name]) == baseline.read(name),
                            'Um módulo ativo mudou desde a versão validada.')
            for name in (*FILES, MIGRATION):
                destination = build / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(package.read(name))
                destination.chmod(0o644)
            patch = tmp / 'adm.patch'
            patch.write_bytes(package.read('adm-from-v1.patch' if on_previous_adm else 'adm.patch'))

        release_root = Path('/opt/ramo-nessa-web/releases') / h.DIRECTORY.name
        next_admin = release_root / 'apps/admin'
        next_admin.parent.mkdir(parents=True)
        for directory in (release_root, next_admin.parent):
            directory.chmod(0o755)
        if old_admin is None:
            next_admin.mkdir(mode=0o755)
            h.run(['docker', 'cp', gateway['name'] + ':/srv/admin/.', str(next_admin)], timeout=45)
        else:
            shutil.copytree(old_admin, next_admin)
        require(all(not p.is_symlink() and (p.is_file() or p.is_dir()) for p in next_admin.rglob('*')),
                'Arquivos inesperados na cópia do ADM.')
        before_hashes = {name: sha((next_admin / name).read_bytes()) for name in ADM_FILES}
        for opts in (['--check'], []):
            result = subprocess.run(['git', 'apply', *opts, '--include=apps/admin/src/app.js',
                                     '--include=apps/admin/src/api.js', str(patch)],
                                    cwd=release_root, capture_output=True)
            require(result.returncode == 0, 'Os arquivos atuais do ADM exigem revisão antes da troca.')
        for name in ADM_FILES:
            require(sha((next_admin / name).read_bytes()) != before_hashes[name],
                    'A atualização não foi aplicada aos dois arquivos do ADM.')
            (next_admin / name).chmod(0o644)
            h.run(['docker', 'exec', '-i', core['name'], 'node', '--input-type=module', '--check'],
                  input=(next_admin / name).read_bytes())

    image = h.inspect(core['container']['Image'], True)
    tag = 'ramo-nessa-admin-delete-base:' + h.DIRECTORY.name
    target = tag.replace('-base:', ':')
    h.run(['docker', 'image', 'tag', image['Id'], tag])
    (build / 'Dockerfile').write_text(f'FROM {tag}\n' + ''.join(f'COPY {name} /app/{name}\n' for name in (*FILES, MIGRATION)))
    h.run(['docker', 'build', '--pull=false', '--network=none', '-t', target, str(build)], timeout=180)
    candidate = h.inspect(target, True)
    require(candidate['Config'] == image['Config'] and
            candidate['RootFS']['Layers'][:len(image['RootFS']['Layers'])] == image['RootFS']['Layers'],
            'A configuração da imagem candidata mudou.')
    h.run(['docker', 'run', '--rm', '--network=none', '--read-only', '--entrypoint', 'sh',
           candidate['Id'], '-ec', 'for f do node --check "$f"; done', 'core-check',
           *('/app/' + name for name in FILES)])

    gateway_image = h.inspect(gateway['container']['Image'], True)
    if old_admin is None:
        context = h.DIRECTORY / 'gateway-build'
        context.mkdir()
        gateway_tag = 'ramo-nessa-adm-gateway-base:' + h.DIRECTORY.name
        gateway_candidate_tag = gateway_tag.replace('-base:', ':')
        h.run(['docker', 'image', 'tag', gateway_image['Id'], gateway_tag])
        dockerfile = [f'FROM {gateway_tag}']
        for name in ADM_FILES:
            path = context / Path(name).name
            shutil.copyfile(next_admin / name, path)
            path.chmod(0o644)
            dockerfile.append(f'COPY {path.name} /srv/admin/{name}')
        (context / 'Dockerfile').write_text('\n'.join(dockerfile) + '\n')
        h.run(['docker', 'build', '--pull=false', '--network=none', '-t', gateway_candidate_tag, str(context)], timeout=180)
        next_gateway = h.inspect(gateway_candidate_tag, True)
        require(next_gateway['Config'] == gateway_image['Config'] and
                next_gateway['RootFS']['Layers'][:len(gateway_image['RootFS']['Layers'])] == gateway_image['RootFS']['Layers'],
                'A configuração da imagem do gateway mudou.')
        for name in ADM_FILES:
            raw = h.run(['docker', 'run', '--rm', '--network=none', '--read-only', '--entrypoint', 'cat',
                         next_gateway['Id'], '/srv/admin/' + name])
            require(sha(raw) == sha((next_admin / name).read_bytes()), 'O arquivo na imagem do ADM divergiu.')
    else:
        next_gateway = gateway_image

    plan = {'core': core, 'gateway': gateway, 'image': candidate['Id'], 'source': source,
            'gatewayImage': next_gateway['Id'], 'oldAdmin': active_admin_mount,
            'nextAdmin': str(next_admin), 'web': active['newWeb'], 'configHashes': {}, 'others': others,
            'admHashes': {'before': before_hashes,
                          'after': {name: sha((next_admin / name).read_bytes()) for name in ADM_FILES}}}
    for service in ('core', 'gateway'):
        info = plan[service]
        for stage in ('before', 'after'):
            config = copy.deepcopy(info['original'])
            expected = copy.deepcopy(info['resolved'])
            if stage == 'after':
                for model in (config, expected):
                    settings = model['services'][service]
                    if service == 'core':
                        settings['image'] = candidate['Id']
                    elif old_admin is None:
                        settings['image'] = next_gateway['Id']
                    else:
                        mount, = [m for m in settings['volumes'] if m.get('target') == '/srv/admin']
                        require(mount.get('source') == str(old_admin) and mount.get('read_only'), 'Mount ADM divergente.')
                        mount['source'] = str(next_admin)
            path = config_path(h, service, stage)
            h.save(path.name, config)
            plan['configHashes'][path.name] = sha(h.private_file(path))
            actual = json.loads(review.compose(h, info['workdir'], path, 'config', '--format', 'json'))
            require(actual == expected, 'O plano mudaria opções fora do escopo.')
        require(sha(h.private_file(Path(info['config']))) == info['configHash'], 'A configuração ativa mudou.')
        require(h.identity(h.inspect(info['name'])) == h.identity(info['container']), 'Um serviço mudou durante o preparo.')
    h.save('plan.private.json', plan)
    shutil.copyfile(Path(__file__).resolve(), h.DIRECTORY / 'activate.py')
    h.inactive()
    print(f'Retorno: sudo python3 {h.DIRECTORY}/activate.py rollback {h.DIRECTORY}', flush=True)
    migrate_account_closure(h, core['name'], (build / MIGRATION).read_text())
    print('Banco atualizado. Ativando o Core e o ADM.', flush=True)
    try:
        up(review, h, plan, 'core', 'after')
        up(review, h, plan, 'gateway', 'after')
        verify(review, h, plan, True)
    except BaseException:
        try:
            rollback(review, h, plan)
        except BaseException:
            raise InstallError('Falha na ativação. O retorno automático não foi confirmado.') from None
        raise InstallError('A instalação falhou e a versão anterior foi restaurada.') from None
    print(json.dumps({'status': 'ADM_ACCOUNT_DELETION_IMMEDIATE_ACTIVATED', 'source': source,
                      'anchor': str(h.DIRECTORY), 'accountsDeleted': 0}), flush=True)


def main():
    require(os.geteuid() == 0, 'Execute com sudo python3.')
    os.umask(0o077)
    review, guard = load_guard()
    with (ROOT / 'screen-lock-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if len(sys.argv) == 3 and sys.argv[1] == 'rollback':
            directory = Path(sys.argv[2])
            require(directory.parent == ROOT and directory.name.startswith('admin-account-deletion-')
                    and directory.is_dir() and not directory.is_symlink()
                    and directory.stat().st_uid == 0 and directory.stat().st_mode & 0o077 == 0,
                    'Âncora inválida.')
            guard.DIRECTORY = directory
            guard.inactive()
            rollback(review, guard, json.loads(guard.private_file(directory / 'plan.private.json')))
            print('ADM_ACCOUNT_DELETION_ROLLED_BACK')
        elif len(sys.argv) == 3:
            install(review, guard, sys.argv[1], sys.argv[2])
        else:
            raise InstallError('Informe o commit do pacote e o SHA-256, ou rollback e a âncora.')


if __name__ == '__main__':
    try:
        main()
    except InstallError as error:
        sys.exit(str(error))
    except BaseException:
        sys.exit('Operação interrompida. Envie a última etapa exibida, sem arquivos privados.')
