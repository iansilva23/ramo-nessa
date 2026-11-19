#!/usr/bin/env python3
"""Read-only metadata for the Passenger Pix Web update; never print secrets."""
import hashlib
import json
import os
import stat
import subprocess
from pathlib import Path


def inspect(name):
    return json.loads(subprocess.check_output(
        ['docker', 'inspect', name], timeout=25,
        stderr=subprocess.DEVNULL))[0]


def file_meta(path):
    p = Path(path)
    if not p.is_file():
        return {'exists': False}
    s = p.stat()
    return {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
            'bytes': s.st_size, 'ownerUid': s.st_uid,
            'mode': oct(stat.S_IMODE(s.st_mode)), 'symlink': p.is_symlink()}


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run with sudo')
    result = {'status': 'PIX_WEB_READ_ONLY_INVENTORY', 'services': {}}
    for role in ('core', 'gateway', 'postgres', 'google-maps-mock'):
        c = inspect('ramo-nessa-staging-' + role + '-1')
        labels = c['Config'].get('Labels') or {}
        item = {'id': c['Id'], 'image': c['Image'],
                'running': c['State']['Running'],
                'health': c['State'].get('Health', {}).get('Status'),
                'project': labels.get('com.docker.compose.project')}
        if role == 'gateway':
            paths = labels.get('com.docker.compose.project.config_files', '')
            item['composeFiles'] = [{'path': p, **file_meta(p)}
                                    for p in paths.split(',') if p]
            for mount in c['Mounts']:
                if mount['Destination'] == '/srv/web':
                    root = Path(mount['Source'])
                    item['webRoot'] = str(root)
                    item['bundles'] = {app: file_meta(root / app / 'main.dart.js')
                                       for app in ('driver', 'passenger')}
                elif mount['Destination'] == '/etc/caddy/Caddyfile':
                    item['caddy'] = {'path': mount['Source'],
                                     **file_meta(mount['Source'])}
        result['services'][role] = item
    result.update(changesApplied=False, servicesRestarted=False,
                  databaseChanged=False)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'PIX_WEB_INVENTORY_STOPPED',
                          'errorType': type(error).__name__,
                          'changesApplied': False}))
        raise SystemExit(1)
