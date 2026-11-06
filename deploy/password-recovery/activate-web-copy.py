#!/usr/bin/env python3
"""Install a verified recovery overlay and keep a reversible VPS checkpoint."""

import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path('/opt/ramo-nessa-security')
WEB_RELEASES = Path('/opt/ramo-nessa-web/releases')
HELPER = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
HELPER_HASH = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
SOURCE = '9e913c89de373945cb99b3b3150feb9c012d2983'
BASE_SOURCE = '3f7a9fdae75fa0cac53df85cf7b18d7dbae6b52c'
BASE_GATEWAY = 'sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
BASE_WEB = '/opt/ramo-nessa-web/releases/password-recovery-update-js1drz_5/bundles'
ROLES = {'driver': 'motorista', 'passenger': 'passageiro'}
ASSETS = (
    ('old-driver.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-3f7a9fdae75f/RamoNessa-Recuperacao-driver.zip', 'a47ee151f32768e766f3383f78613e0180a6589579fec3047a4bf63e92db4577', 18314335),
    ('old-passenger.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-3f7a9fdae75f/RamoNessa-Recuperacao-passenger.zip', 'ed279f89b7f2e50fedc0d28d507eda0b832f14025a8d4ff1c15830d33542cbbf', 18479522),
    ('RamoNessa-Recuperacao-driver.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/recovery-web-9e913c89de37/RamoNessa-Recuperacao-driver.zip', 'fde41d20e0b6dfe4d1c9854ed0fc5f8d42c1ee40171544a24d288145816c4966', 18314426),
    ('RamoNessa-Recuperacao-passenger.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/recovery-web-9e913c89de37/RamoNessa-Recuperacao-passenger.zip', '3d2a6017aec1f5f37bd22bb743e673f3cbe804a9bdc95a2c05fa305e66cca758', 18479660),
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
    verify_model = {**resolved, 'services': {'core': resolved['services'][service]}}
    try:
        h.assert_environment(verify_model, container, h.inspect(container['Image'], True))
        h.assert_mount_plan(verify_model, container)
    except RuntimeError as error:
        raise InstallError(f'Conferência do {service}: {error}') from None
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
                if len(relative.parts) == 1 and not compiled and destination.exists() and name != 'version.json':
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(raw)
                destination.chmod(0o644)
    for path in [new_root, *[p for p in new_root.rglob('*') if p.is_dir()]]:
        path.chmod(0o755)


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
    gateway = copy.deepcopy(plan['gateway']['container'])
    if candidate:
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
    info = plan['gateway']
    require(sha(h.private_file(Path(info['config']))) == info['configHash'],
            'A configuração original mudou. Retorno interrompido.')
    for filename, digest in plan['composeHashes'].items():
        require(sha(h.private_file(h.DIRECTORY / filename)) == digest,
                'A âncora mudou. Retorno interrompido.')
    exists = h.run(['docker', 'ps', '-aq', '--filter', f"name=^/{info['name'].lstrip('/')}$"]).strip()
    if exists:
        current = h.inspect(info['name'])
        labels = current['Config']['Labels']
        require(labels.get('com.docker.compose.project') == h.PROJECT and
                labels.get('com.docker.compose.service') == 'gateway' and current['Image'] == BASE_GATEWAY,
                'O gateway mudou. Retorno interrompido.')
        configs = {info['config'], *(str(h.DIRECTORY / filename) for filename in plan['composeHashes'])}
        require(labels.get('com.docker.compose.project.config_files') in configs,
                'A configuração ativa pertence a outra publicação.')
        mount = web_mount(current)
        require(mount in (BASE_WEB, plan['newWeb']), 'Outra versão Web foi publicada.')
        if mount == BASE_WEB:
            verify_runtime(h, plan, False)
            verify_public(h, plan, False)
            return
    up(h, plan, 'gateway', 'before')
    verify_runtime(h, plan, False)
    verify_public(h, plan, False)


def install(h, package, source):
    require(re.fullmatch(r'[a-f0-9]{40}', source), 'Identificador do pacote inválido.')
    print('Conferindo a configuração, as redes e os volumes da versão ativa.', flush=True)
    core = snapshot(h, h.NAMES[0], 'core')
    gateway = snapshot(h, h.NAMES[1], 'gateway')
    require(gateway['container']['Image'] == BASE_GATEWAY and web_mount(gateway['container']) == BASE_WEB,
            'A versão ativa da Web mudou desde a verificação.')
    require(shutil.disk_usage(WEB_RELEASES).free >= 1024**3, 'É necessário pelo menos 1 GB livre.')
    h.inactive()
    h.DIRECTORY = Path(tempfile.mkdtemp(prefix='recovery-web-copy-', dir=ROOT))
    new_root = WEB_RELEASES / h.DIRECTORY.name / 'bundles'
    new_root.parent.mkdir(mode=0o755)
    new_root.parent.chmod(0o755)
    prepare_web(Path(BASE_WEB), new_root, package, source)
    plan = {
        'core': core, 'gateway': gateway, 'source': source,
        'newWeb': str(new_root), 'composeHashes': {},
        'others': [core['container'], *[h.inspect(name) for name in h.NAMES[2:]]],
    }
    service = 'gateway'
    info = gateway
    for phase in ('before', 'after'):
        config = copy.deepcopy(info['original'])
        expected = copy.deepcopy(info['resolved'])
        if phase == 'after':
            for model in (config, expected):
                settings = model['services'][service]
                web, = [mount for mount in settings['volumes'] if mount.get('target') == '/srv/web']
                require(web['source'] == BASE_WEB and web.get('read_only'), 'O plano de mount Web mudou.')
                web['source'] = str(new_root)
        filename = f'{service}-{phase}.private.json'
        h.save(filename, config)
        plan['composeHashes'][filename] = sha(h.private_file(h.DIRECTORY / filename))
        actual = json.loads(compose(h, info['workdir'], h.DIRECTORY / filename, 'config', '--format', 'json'))
        require(actual == expected, 'O plano alteraria configurações fora da Web.')
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
    print('Ativando os dois apps Web. Pode haver uma breve interrupção.', flush=True)
    try:
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
        'status': 'RECOVERY_EMAIL_NOTICE_WEB_ACTIVATED', 'source': source,
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
            require(directory.parent == ROOT and directory.name.startswith('recovery-web-copy-') and
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
