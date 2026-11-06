#!/usr/bin/env python3
"""Prepare a pinned Web update and private return checkpoint; never activate it."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import zipfile

sys.dont_write_bytecode = True
ROOT = Path('/opt/ramo-nessa-security')
RELEASES = Path('/opt/ramo-nessa-web/releases')
HELPER = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
HELPER_SHA = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
INVENTORY_SHA = 'cb995c91b4cda7f17c94940ae45f4b0284a0374b6613625d2f49fcb186cd5b55'
BASELINE = '996eb5ddbdbbc9df2df2b21a062e66f0046e742cb9773a09ce4672539f41c628'
BASE_WEB = Path('/opt/ramo-nessa-web/releases/recovery-web-copy-h3pobi71/bundles')
SOURCE = '0d8d865af3b27db8f7ea91663e0393aeb134b817'
NAME = 'app-redesign-' + SOURCE[:12] + '-' + BASELINE[:12]
PAYLOAD = {
    'driver': ('RamoNessa-Motorista-Redesign-Web.zip', '3a8c7ca391ca1f22deaa1e1be87bcc10313b886bb8fcbc8cdb7c93eec28cf928'),
    'passenger': ('RamoNessa-Passageiro-Redesign-Web.zip', 'c073afbaa6b0c5a63eca298123dbe134d63e809f17a364fb315e2000d81bfb5a'),
}
ROUTES = {'driver': 'motorista', 'passenger': 'passageiro'}
MAX_BYTES = 512 * 1024**2


class PreparationError(Exception):
    pass


def require(value, message):
    if not value:
        raise PreparationError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def load_module(path, expected, name):
    require(path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == expected,
            'Ferramenta de conferência ausente ou com checksum divergente.')
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def private_save(path, value):
    raw = value if isinstance(value, bytes) else (json.dumps(value, indent=2) + '\n').encode()
    with path.open('xb') as out:
        out.write(raw)
        out.flush()
        os.fsync(out.fileno())
    require(path.stat().st_mode & 0o077 == 0, 'Permissões da âncora privada divergentes.')
    return sha(raw)


def safe_relative(value):
    require(isinstance(value, str) and value and '\\' not in value and
            not any(ord(c) < 32 for c in value), 'Nome inválido no pacote Web.')
    path = PurePosixPath(value)
    require(not path.is_absolute() and str(path) == value and
            all(part not in ('.', '..') for part in path.parts), 'Caminho inseguro no pacote Web.')
    return path


def bundle(package, role):
    filename, expected = PAYLOAD[role]
    path = package / filename
    require(path.is_file() and not path.is_symlink() and path.stat().st_size < MAX_BYTES and
            sha(path.read_bytes()) == expected, 'Pacote Web não corresponde ao candidato validado.')
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and len(names) <= 5000, 'Entradas duplicadas ou excessivas no ZIP.')
        require(sum(i.file_size for i in archive.infolist()) <= MAX_BYTES and
                all(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16) for i in archive.infolist()),
                'Tipo ou tamanho de arquivo inválido no ZIP.')
        metadata = json.loads(archive.read('manifest.json'))
        require(metadata.get('source') == SOURCE and metadata.get('role') == role and
                metadata.get('basePath') == '/' + ROUTES[role] + '/', 'Fonte, perfil ou rota do pacote divergente.')
        files = metadata.get('files')
        require(isinstance(files, dict) and files and
                set(names) == {'manifest.json', *(role + '/' + name for name in files)},
                'Manifesto incompleto ou arquivos não declarados.')
        content = {}
        for name, digest in files.items():
            safe_relative(name)
            require(isinstance(digest, str) and re.fullmatch('[0-9a-f]{64}', digest), 'Hash inválido no manifesto.')
            raw = archive.read(role + '/' + name)
            require(sha(raw) == digest, 'Arquivo Web não passou na conferência de hash.')
            content[name] = raw
    require({'index.html', 'main.dart.js', 'flutter_bootstrap.js', 'ramo_push_config.js'} <= content.keys(),
            'Pacote Web sem arquivos essenciais.')
    return metadata, content


def tree(root):
    require(root.is_dir() and not root.is_symlink() and root.resolve() == root,
            'Diretório Web inválido ou com links.')
    records = {}
    total = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            require(not (Path(directory) / name).is_symlink(), 'Link inesperado em diretório Web.')
        for name in files:
            path = Path(directory) / name
            info = path.lstat()
            require(stat.S_ISREG(info.st_mode), 'Arquivo Web não regular.')
            total += info.st_size
            require(total <= 2 * MAX_BYTES and len(records) < 30000, 'Árvore Web excedeu o limite de conferência.')
            records[path.relative_to(root).as_posix()] = {
                'sha256': sha(path.read_bytes()), 'bytes': info.st_size, 'mode': stat.S_IMODE(info.st_mode),
            }
    return records


def compose(h, workdir, path):
    # Intentionally only `config`: this preparer has no activation subcommand.
    return json.loads(h.run(['docker', 'compose', '--project-directory', workdir,
        '--project-name', h.PROJECT, '--env-file', '/dev/null', '-f', str(path),
        'config', '--format', 'json']))


def gateway_snapshot(h, container):
    labels = container['Config'].get('Labels') or {}
    require(labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == 'gateway', 'Origem do gateway divergente.')
    path = labels.get('com.docker.compose.project.config_files', '')
    workdir = labels.get('com.docker.compose.project.working_dir', '')
    require(path.startswith('/') and ',' not in path and workdir.startswith('/'), 'Configuração Compose exige revisão.')
    raw = h.private_file(Path(path))
    original = json.loads(raw)
    require(set(original.get('services', {})) == {'gateway'} and
            not original['services']['gateway'].get('env_file'), 'Gateway exige configuração autocontida e isolada.')
    resolved = compose(h, workdir, path)
    verified = {**resolved, 'services': {'core': resolved['services']['gateway']}}
    h.assert_environment(verified, container, h.inspect(container['Image'], True))
    h.assert_mount_plan(verified, container)
    for model in (original, resolved):
        model['services']['gateway']['image'] = container['Image']
    return {'path': path, 'workdir': workdir, 'sourceSha256': sha(raw),
            'sourceBytes': raw, 'original': original, 'resolved': resolved}


def before_after(model, new_web):
    result = copy.deepcopy(model)
    service = result['services']['gateway']
    mounts = [v for v in service.get('volumes', []) if v.get('target') == '/srv/web']
    require(len(mounts) == 1 and mounts[0].get('type') == 'bind' and mounts[0].get('read_only') and
            mounts[0].get('source') == str(BASE_WEB), 'Mount Web não corresponde à base conferida.')
    mounts[0]['source'] = str(new_web)
    return result


def prepare_web(package, old_root, backup_root, new_root):
    original = tree(old_root)
    incoming = {}
    for role in ROUTES:
        metadata, content = bundle(package, role)
        # Retain exact entry shell, providers and browser bridges from the active release.
        for name in ('index.html', 'ramo_push_config.js', 'ramo_web_push.js', 'ramo_push_worker.js', 'manifest.json', 'ramo_card_fields.js'):
            if name in content:
                path = old_root / role / name
                require(path.is_file() and path.read_bytes() == content[name],
                        'Shell, Maps, push ou ponte Web diverge da versão ativa; nenhuma troca preparada.')
        incoming[role] = content
    shutil.copytree(old_root, backup_root)
    require(tree(backup_root) == original, 'Cópia privada da versão anterior não passou na conferência.')
    shutil.copytree(backup_root, new_root)
    expected = copy.deepcopy(original)
    for role, content in incoming.items():
        for name, raw in content.items():
            relative = str(PurePosixPath(role) / safe_relative(name))
            target = new_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            target.chmod(0o644)
            expected[relative] = {'sha256': sha(raw), 'bytes': len(raw), 'mode': 0o644}
        for directory, dirs, files in os.walk(new_root / role):
            Path(directory).chmod(0o755)
    require(tree(new_root) == expected, 'A candidata alterou arquivos fora dos dois bundles previstos.')
    require(tree(old_root) == original, 'A versão ativa mudou durante a preparação.')
    return original, expected


def prepare(package, h, inventory):
    current = inventory.collect()
    require(current['baselineSha256'] == BASELINE and current['activeWebRoot'] == str(BASE_WEB),
            'A VPS mudou desde a leitura aprovada. Faça novo inventário; nada será sobreposto.')
    require(all(item['running'] and item['health'] == 'healthy' for item in current['services'].values()),
            'Um serviço ativo não está saudável; preparação interrompida.')
    require(shutil.disk_usage(RELEASES).free >= 1024**3, 'É necessário pelo menos 1 GB livre para as cópias.')
    anchor = ROOT / NAME
    release = RELEASES / NAME
    require(not anchor.exists() and not release.exists(), 'Esta preparação já tem registro; não repetir ou sobrescrever.')
    runtime = {service: h.inspect(info['name']) for service, info in current['services'].items()}
    gateway = gateway_snapshot(h, runtime['gateway'])
    # Validate both immutable payloads before creating any release/checkpoint directory.
    for role in ROUTES:
        bundle(package, role)
    anchor.mkdir(mode=0o700)
    h.DIRECTORY = anchor
    release.mkdir(mode=0o755)
    release.chmod(0o755)
    new_web = release / 'bundles'
    private_save(anchor / 'phase.private.json', {'phase': 'preparing', 'source': SOURCE, 'changesApplied': False})
    original, candidate = prepare_web(package, BASE_WEB, anchor / 'before-web', new_web)
    source_raw = gateway.pop('sourceBytes')
    files = {}
    files['gateway-source.private.json'] = private_save(anchor / 'gateway-source.private.json', source_raw)
    for phase in ('before', 'after'):
        model = gateway['original'] if phase == 'before' else before_after(gateway['original'], new_web)
        expected = gateway['resolved'] if phase == 'before' else before_after(gateway['resolved'], new_web)
        name = 'gateway-' + phase + '.private.json'
        files[name] = private_save(anchor / name, model)
        require(compose(h, gateway['workdir'], anchor / name) == expected,
                'Releitura Compose alteraria algo além do mount dos apps Web.')
    bind_hashes = {}
    for item in runtime.values():
        for mount in item['Mounts']:
            if mount['Type'] == 'bind' and Path(mount['Source']).is_file():
                bind_hashes[mount['Source']] = h.bound_hash(Path(mount['Source']))
    plan = {'schema': 1, 'source': SOURCE, 'baselineSha256': BASELINE, 'gateway': gateway,
            'oldWeb': str(BASE_WEB), 'newWeb': str(new_web), 'runtimeBefore': runtime,
            'beforeWebFiles': original, 'candidateWebFiles': candidate, 'bindHashes': bind_hashes,
            'files': files, 'changesApplied': False, 'activationImplemented': False}
    plan_hash = private_save(anchor / 'plan.private.json', plan)
    require(inventory.collect()['baselineSha256'] == BASELINE, 'A VPS mudou durante a preparação; não ativar a candidata.')
    for service, item in runtime.items():
        observed = h.inspect(item['Name'])
        require(h.identity(item) == h.identity(observed), 'Um container mudou durante a preparação.')
        h.runtime_matches(item, observed, item['Image'])
    for path, digest in bind_hashes.items():
        require(h.bound_hash(Path(path)) == digest, 'Um arquivo montado mudou durante a preparação.')
    result = {'status': 'APP_REDESIGN_WEB_PREPARED', 'source': SOURCE, 'anchor': str(anchor),
              'candidateWeb': str(new_web), 'baselineSha256': BASELINE, 'planSha256': plan_hash,
              'gatewayImage': runtime['gateway']['Image'], 'coreImage': runtime['core']['Image'],
              'onlyPlannedChange': 'gateway /srv/web bind source', 'changesApplied': False,
              'servicesRestarted': False, 'activationImplemented': False}
    private_save(anchor / 'prepared.private.json', result)
    private_save(anchor / 'phase-complete.private.json', {'phase': 'prepared', 'planSha256': plan_hash, 'changesApplied': False})
    os.replace(anchor / 'phase-complete.private.json', anchor / 'phase.private.json')
    descriptor = os.open(anchor, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return result


def main():
    try:
        require(sys.argv[1:] == ['prepare'], 'Uso: prepare-web.py prepare. Este arquivo não possui comando de ativação.')
        require(os.geteuid() == 0, 'Execute com sudo python3.')
        os.umask(0o077)
        for directory in (ROOT, RELEASES):
            info = directory.lstat()
            require(stat.S_ISDIR(info.st_mode) and not directory.is_symlink() and info.st_uid == 0 and
                    not info.st_mode & 0o022, 'Diretório operacional exige revisão de proprietário/permissões.')
        package = Path(__file__).resolve().parent
        inventory = load_module(package / 'inspect-active.py', INVENTORY_SHA, 'ramo_redesign_inventory')
        h = load_module(HELPER, HELPER_SHA, 'ramo_redesign_guard')
        h.DIRECTORY = Path('/proc/self/app-redesign-command-log-disabled')
        descriptor = os.open(ROOT / 'screen-lock-activation.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'r+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            print(json.dumps(prepare(package, h, inventory), indent=2, ensure_ascii=False))
        return 0
    except PreparationError as error:
        print(str(error), file=sys.stderr)
    except BaseException:
        print('Preparação interrompida. Nenhum comando de ativação foi executado. Preserve a âncora parcial e envie a saída para análise.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
