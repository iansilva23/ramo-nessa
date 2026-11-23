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
SOURCE = '3f7a9fdae75fa0cac53df85cf7b18d7dbae6b52c'
BASE_SOURCE = '45e9ba1cdd00ded076489b4567245c202c0bf5a6'
BASE_CORE = 'sha256:077eee49e0acbf8fa00a9c28840d1c7dbc399dcbacdcc3277c0a42c4f46c8d8a'
BASE_GATEWAY = 'sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
BASE_WEB = '/opt/ramo-nessa-web/releases/password-recovery-hzv0tb5u/bundles'
UPDATED_FILES = tuple(f'dist/src/auth/{name}.js' for name in (
    'password-recovery-routes', 'password-recovery-store',
))
ROLES = {'driver': 'motorista', 'passenger': 'passageiro'}
ASSETS = (
    ('old-driver.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-45e9ba1cdd00/RamoNessa-Recuperacao-driver.zip', '59da92d89f7d1f12fa80aa54fd5c5360ec8326723de8d498b0a4589271078944', 18312006),
    ('old-passenger.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-45e9ba1cdd00/RamoNessa-Recuperacao-passenger.zip', '842b3f1511b9059d416bf0452647715e5acfd70e149c8e256bf8a5989b97cf5a', 18478173),
    ('RamoNessa-Recuperacao-Core.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-3f7a9fdae75f/RamoNessa-Recuperacao-Core.zip', '2725266b128eeb9254e5f50d5b83d44f0dc66caba7a8b29b9ed3aeb928ff22f9', 72332),
    ('RamoNessa-Recuperacao-driver.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-3f7a9fdae75f/RamoNessa-Recuperacao-driver.zip', 'a47ee151f32768e766f3383f78613e0180a6589579fec3047a4bf63e92db4577', 18314335),
    ('RamoNessa-Recuperacao-passenger.zip', 'https://github.com/iansilva23/ramo-nessa/releases/download/password-recovery-3f7a9fdae75f/RamoNessa-Recuperacao-passenger.zip', 'ed279f89b7f2e50fedc0d28d507eda0b832f14025a8d4ff1c15830d33542cbbf', 18479522),
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
    core = copy.deepcopy(plan['core']['container'])
    gateway = copy.deepcopy(plan['gateway']['container'])
    image = plan['image'] if candidate else core['Image']
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
    print('Conferindo a configuração, as redes e os volumes da versão ativa.', flush=True)
    core = snapshot(h, h.NAMES[0], 'core')
    gateway = snapshot(h, h.NAMES[1], 'gateway')
    require(core['container']['Image'] == BASE_CORE and gateway['container']['Image'] == BASE_GATEWAY,
            'O Core ou gateway ativo mudou desde a verificação.')
    require(web_mount(gateway['container']) == BASE_WEB, 'A versão Web ativa mudou.')
    require(shutil.disk_usage(ROOT).free >= 2 * 1024**3, 'São necessários pelo menos 2 GB livres.')
    require(all(not (m['Destination'] == '/app' or m['Destination'].startswith('/app/dist'))
                for m in core['container']['Mounts']), 'O código do Core está sobreposto por um mount.')
    try:
        h.inactive()
    except RuntimeError as error:
        raise InstallError(f'Conferência de atividade: {error}') from None
    h.DIRECTORY = Path(tempfile.mkdtemp(prefix='password-recovery-update-', dir=ROOT))
    print(f'Preparação privada: {h.DIRECTORY}', flush=True)
    build = h.DIRECTORY / 'build'
    build.mkdir()
    with zipfile.ZipFile(package / 'RamoNessa-Recuperacao-Core.zip') as candidate:
        require(candidate.read('source.txt').decode().strip() == source, 'Origem do pacote Core divergente.')
        for name in UPDATED_FILES:
            path = build / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(candidate.read(name))
            path.chmod(0o644)
    image = h.inspect(core['container']['Image'], True)
    tag = 'ramo-nessa-recovery-base:' + h.DIRECTORY.name
    candidate_tag = tag.replace('-base:', ':')
    h.run(['docker', 'image', 'tag', image['Id'], tag])
    (build / 'Dockerfile').write_text(f'FROM {tag}\n' +
        ''.join(f'COPY {name} /app/{name}\n' for name in UPDATED_FILES))
    h.run(['docker', 'build', '--pull=false', '--network=none', '-t', candidate_tag, str(build)], timeout=180)
    candidate = h.inspect(candidate_tag, True)
    require(candidate['Config'] == image['Config'] and
            candidate['RootFS']['Layers'][:len(image['RootFS']['Layers'])] == image['RootFS']['Layers'],
            'Configuração da imagem candidata divergente.')
    h.run(['docker', 'run', '--rm', '--network=none', '--read-only', '--entrypoint', 'sh',
           candidate['Id'], '-ec', 'for f do node --check "$f"; done', 'recovery-check',
           *[f'/app/{name}' for name in UPDATED_FILES]], timeout=45)
    new_root = WEB_RELEASES / h.DIRECTORY.name / 'bundles'
    new_root.parent.mkdir(mode=0o755)
    new_root.parent.chmod(0o755)
    prepare_web(Path(BASE_WEB), new_root, package, source)
    plan = {
        'core': core, 'gateway': gateway, 'image': candidate['Id'], 'source': source,
        'newWeb': str(new_root), 'composeHashes': {},
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
                        settings['image'] = candidate['Id']
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
            require(directory.parent == ROOT and directory.name.startswith('password-recovery-update-') and
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
