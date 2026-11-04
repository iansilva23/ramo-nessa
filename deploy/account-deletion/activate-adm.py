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
    matches = [m for m in container['Mounts'] if m['Destination'] == '/srv/admin']
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
    source = plan['nextAdmin'] if candidate else plan['oldAdmin']
    require(admin_mount(current_gateway) == source, 'O mount publicado do ADM divergiu.')
    require(review.web_mount(current_gateway) == plan['web'], 'O mount dos apps Web divergiu.')
    if candidate:
        for mount in gateway['Mounts']:
            if mount['Destination'] == '/srv/admin':
                mount['Source'] = source
        gateway['HostConfig']['Binds'] = [
            source + entry[len(plan['oldAdmin']):] if entry.startswith(plan['oldAdmin'] + ':') else entry
            for entry in gateway['HostConfig'].get('Binds') or []
        ]
    h.runtime_matches(gateway, current_gateway, gateway['Image'])
    h.runtime_matches(core, h.inspect(core['Name']), plan['image'] if candidate else core['Image'])
    for container in plan['others']:
        require(h.identity(h.inspect(container['Name'])) == h.identity(container), 'Outro serviço mudou.')

    checks = {name: sha((Path(source) / name).read_bytes()) for name in ADM_FILES}
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
            require(current['Image'] == original['Image'] and source in (plan['oldAdmin'], plan['nextAdmin'])
                    and review.web_mount(current) == plan['web'], 'O gateway mudou.')
            changed[service] = source == plan['nextAdmin']
    for service in ('gateway', 'core'):
        if changed[service]:
            up(review, h, plan, service, 'before')
    verify(review, h, plan, False)


def install(review, h, source, checksum):
    require(re.fullmatch(r'[0-9a-f]{40}', source) and re.fullmatch(r'[0-9a-f]{64}', checksum), 'Dados de release inválidos.')
    active = json.loads(h.private_file(RECOVERY / 'plan.private.json'))
    require(active.get('source') == RECOVERY_SOURCE, 'A âncora pertence a outra release.')
    core = review.snapshot(h, h.NAMES[0], 'core')
    gateway = review.snapshot(h, h.NAMES[1], 'gateway')
    require(core['container']['Image'] == active['image']
            and gateway['container']['Image'] == active['gateway']['container']['Image']
            and review.web_mount(gateway['container']) == active['newWeb'],
            'A versão em uso difere da recuperação publicada.')
    require(shutil.disk_usage(ROOT).free >= 2 * 1024**3, 'São necessários 2 GB livres.')
    require(all(not (m['Destination'] == '/app' or m['Destination'].startswith('/app/dist'))
                for m in core['container']['Mounts']), 'O Core está sobreposto por um mount.')
    old_admin = Path(admin_mount(gateway['container']))
    require(old_admin.is_dir() and not old_admin.is_symlink()
            and all(not p.is_symlink() for p in old_admin.rglob('*')), 'Pasta atual do ADM exige revisão.')
    h.inactive()
    others = [h.inspect(name) for name in h.NAMES[2:]]
    h.DIRECTORY = Path(tempfile.mkdtemp(prefix='admin-account-deletion-', dir=ROOT))
    print('Preparando a imagem da API e conferindo os arquivos ativos do ADM.', flush=True)

    with tempfile.TemporaryDirectory(prefix='rn-admin-payload-') as tmp:
        tmp = Path(tmp)
        download(tmp / 'release.zip', (f'admin-account-deletion-{source[:12]}/RamoNessa-Exclusao-ADM.zip', checksum))
        download(tmp / 'recovery.zip', RECOVERY_ASSET)
        download(tmp / 'password.zip', PASSWORD_ASSET)
        build = h.DIRECTORY / 'build'
        build.mkdir()
        with zipfile.ZipFile(tmp / 'release.zip') as package,              zipfile.ZipFile(tmp / 'recovery.zip') as recovery,              zipfile.ZipFile(tmp / 'password.zip') as password:
            require(set(package.namelist()) == {*FILES, 'adm.patch', 'source.txt'}
                    and package.read('source.txt').decode().strip() == source, 'Pacote inesperado.')
            for name in (*BASE_RECOVERY_FILES, BASE_ADMIN_FILE):
                baseline = (password if name == BASE_ADMIN_FILE else recovery).read(name)
                require(h.run(['docker', 'exec', core['name'], 'cat', '/app/' + name]) == baseline,
                        'Um módulo ativo mudou desde a versão validada.')
            for name in FILES:
                destination = build / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(package.read(name))
                destination.chmod(0o644)
            patch = tmp / 'adm.patch'
            patch.write_bytes(package.read('adm.patch'))

        release_root = Path('/opt/ramo-nessa-web/releases') / h.DIRECTORY.name
        next_admin = release_root / 'apps/admin'
        next_admin.parent.mkdir(parents=True)
        for directory in (release_root, next_admin.parent):
            directory.chmod(0o755)
        shutil.copytree(old_admin, next_admin)
        for opts in (['--check'], []):
            result = subprocess.run(['git', 'apply', *opts, '--include=apps/admin/src/app.js',
                                     '--include=apps/admin/src/api.js', str(patch)],
                                    cwd=release_root, capture_output=True)
            require(result.returncode == 0, 'Os arquivos atuais do ADM exigem revisão antes da troca.')
        for name in ADM_FILES:
            require((next_admin / name).read_bytes() != (old_admin / name).read_bytes(),
                    'A atualização não foi aplicada aos dois arquivos do ADM.')
            (next_admin / name).chmod(0o644)
            h.run(['docker', 'exec', '-i', core['name'], 'node', '--input-type=module', '--check'],
                  input=(next_admin / name).read_bytes())

    image = h.inspect(core['container']['Image'], True)
    tag = 'ramo-nessa-admin-delete-base:' + h.DIRECTORY.name
    target = tag.replace('-base:', ':')
    h.run(['docker', 'image', 'tag', image['Id'], tag])
    (build / 'Dockerfile').write_text(f'FROM {tag}\n' + ''.join(f'COPY {name} /app/{name}\n' for name in FILES))
    h.run(['docker', 'build', '--pull=false', '--network=none', '-t', target, str(build)], timeout=180)
    candidate = h.inspect(target, True)
    require(candidate['Config'] == image['Config'] and
            candidate['RootFS']['Layers'][:len(image['RootFS']['Layers'])] == image['RootFS']['Layers'],
            'A configuração da imagem candidata mudou.')
    h.run(['docker', 'run', '--rm', '--network=none', '--read-only', '--entrypoint', 'sh',
           candidate['Id'], '-ec', 'for f do node --check "$f"; done', 'core-check',
           *('/app/' + name for name in FILES)])

    plan = {'core': core, 'gateway': gateway, 'image': candidate['Id'], 'source': source,
            'oldAdmin': str(old_admin), 'nextAdmin': str(next_admin), 'web': active['newWeb'],
            'configHashes': {}, 'others': others}
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
    print(json.dumps({'status': 'ADM_ACCOUNT_DELETION_ACTIVATED', 'source': source,
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
