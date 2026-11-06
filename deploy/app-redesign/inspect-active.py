#!/usr/bin/env python3
"""Read-only runtime inventory for the coordinated Passenger/Driver update.

Prints hashes and deployment paths; never prints container environment values,
Compose contents, credentials or customer data. Does not call a provider or
restart, create, update or remove any container or file.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from datetime import datetime, timezone

PROJECT = 'ramo-nessa-staging'
MAX_FILES = 30000
MAX_BYTES = 1024**3


class InventoryError(Exception):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def docker(*arguments):
    try:
        result = subprocess.run(['docker', *arguments], check=True, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        raise InventoryError('Não foi possível ler o Docker. Confira o acesso e os serviços; nada foi alterado.') from None
    return result.stdout


def containers():
    ids = docker('ps', '--filter', 'label=com.docker.compose.project=' + PROJECT, '--format', '{{.ID}}').split()
    if not ids:
        raise InventoryError('Projeto Compose ativo não encontrado; não presumir outra instalação.')
    values = json.loads(docker('inspect', *ids))
    by_service = {}
    for item in values:
        labels = item['Config'].get('Labels') or {}
        service = labels.get('com.docker.compose.service')
        if not service or service in by_service or labels.get('com.docker.compose.project') != PROJECT:
            raise InventoryError('Inventário Compose ambíguo; conferir manualmente antes de preparar a troca.')
        by_service[service] = item
    if not {'core', 'gateway'} <= by_service.keys():
        raise InventoryError('Core ou gateway não encontrado no projeto esperado.')
    return by_service


def file_hash(path):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_BYTES:
        raise InventoryError('Arquivo ausente, não regular ou grande demais; inventário interrompido.')
    value = hashlib.sha256()
    total = 0
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise InventoryError('Arquivo mudou durante a leitura; refazer o inventário.')
        while chunk := stream.read(1024**2):
            total += len(chunk)
            if total > MAX_BYTES:
                raise InventoryError('Arquivo excedeu o limite de leitura.')
            value.update(chunk)
    after = path.lstat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
        after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
    ) or total != before.st_size:
        raise InventoryError('Arquivo mudou durante a leitura; refazer o inventário.')
    return {'bytes': total, 'sha256': value.hexdigest()}


def tree_hash(root):
    if not root.is_dir() or root.is_symlink() or root.resolve() != root:
        raise InventoryError('Diretório Web inválido ou com links; revisão manual necessária.')
    records = {}
    total = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            if (Path(directory) / name).is_symlink():
                raise InventoryError('Link inesperado no bundle Web; revisão manual necessária.')
        for name in files:
            path = Path(directory) / name
            info = file_hash(path)
            records[path.relative_to(root).as_posix()] = info
            total += info['bytes']
            if len(records) > MAX_FILES or total > MAX_BYTES:
                raise InventoryError('Bundle Web excedeu o limite de inventário.')
    required = ('index.html', 'main.dart.js', 'ramo_push_config.js')
    if any(name not in records for name in required):
        raise InventoryError('Bundle Web incompleto; não preparar a troca automaticamente.')
    return {'fileCount': len(records), 'bytes': total, 'treeSha256': digest(records),
            'entryFiles': {name: records[name] for name in required}}


def public_snapshot(item):
    labels = item['Config'].get('Labels') or {}
    config_paths = labels.get('com.docker.compose.project.config_files', '').split(',')
    configs = []
    for value in config_paths:
        path = Path(value)
        if not value or not path.is_absolute() or path.resolve() != path:
            raise InventoryError('Caminho Compose ausente ou com links; revisão manual necessária.')
        configs.append({'path': value, **file_hash(path)})
    state = item['State']
    return {
        'containerId': item['Id'], 'name': item['Name'], 'imageId': item['Image'],
        'startedAt': state.get('StartedAt'), 'running': state.get('Running'),
        'health': state.get('Health', {}).get('Status', 'not-defined'),
        'composeFiles': configs,
        'configurationSha256': digest(item['Config']),
        'hostConfigurationSha256': digest(item['HostConfig']),
        'mounts': [{k: m.get(k) for k in ('Type', 'Source', 'Destination', 'RW')} for m in item['Mounts']],
    }


def collect():
    before = containers()
    snapshots = {service: public_snapshot(item) for service, item in sorted(before.items())}
    mounts = [m for m in before['gateway']['Mounts'] if m['Destination'] == '/srv/web']
    if len(mounts) != 1 or mounts[0]['Type'] != 'bind' or mounts[0]['RW']:
        raise InventoryError('Mount /srv/web difere do esperado; não preparar instalação automaticamente.')
    web_root = Path(mounts[0]['Source'])
    bundles = {role: tree_hash(web_root / role) for role in ('driver', 'passenger')}
    after = {service: public_snapshot(item) for service, item in sorted(containers().items())}
    if snapshots != after:
        raise InventoryError('Um serviço ou configuração mudou durante a leitura; refazer o inventário.')
    return {
        'status': 'APP_REDESIGN_READ_ONLY_INVENTORY',
        'observedAt': datetime.now(timezone.utc).isoformat(), 'project': PROJECT,
        'services': snapshots, 'activeWebRoot': str(web_root), 'bundles': bundles,
        'baselineSha256': digest({'services': snapshots, 'bundles': bundles}),
        'changesApplied': False, 'rollbackPrepared': False,
        'note': 'Inventário de leitura, sem prova de funcionamento em aparelho ou de rollback pronto.',
    }


def main():
    try:
        print(json.dumps(collect(), indent=2, ensure_ascii=False))
        return 0
    except (InventoryError, OSError, ValueError, KeyError):
        print('Inventário incompleto. Confira Docker, mounts, arquivos e ausência de mudanças concorrentes. Nada foi alterado.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
