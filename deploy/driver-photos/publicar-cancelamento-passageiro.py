#!/usr/bin/env python3
"""Deploy only the Passenger Web JavaScript and retain the previous gateway."""
import copy
import fcntl
import json
import os
from pathlib import Path
import runpy
import shutil
import sys
import tempfile

base = runpy.run_path(str(Path(__file__).with_name('publicar.py')))
ROOT, RELEASES, PROJECT = (base[k] for k in ('ROOT', 'RELEASES', 'PROJECT'))
need, digest, launch, verify_live = (
    base[k] for k in ('need', 'digest', 'launch', 'verify_live')
)
ACTIVE_GESTURE = 'driver-web-gesture-b76decad5e91-'


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 4,
         'Uso: publicar-cancelamento-passageiro.py pacote commit prepare-guard.py')
    folder, revision, prepare = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    need(len(revision) == 40 and all(c in '0123456789abcdef' for c in revision),
         'Commit inválido.')
    checksums = {name: sha for sha, name in
                 (line.split() for line in (folder/'SHA256SUMS').read_text().splitlines())}
    need(set(checksums) == {'main.dart.js', 'SOURCE_COMMIT.txt'} and
         all(digest((folder/name).read_bytes()) == sha for name, sha in checksums.items()),
         'Pacote divergente.')
    need((folder/'SOURCE_COMMIT.txt').read_text().strip() == revision, 'Pacote de outra revisão.')
    new_js = (folder/'main.dart.js').read_bytes()
    need(all(marker in new_js for marker in (
        b'Deseja cancelar a corrida?', b'Sim, cancelar', b'/driver-portrait')),
        'O pacote não contém o cancelamento e o retrato do motorista.')
    h = base['pinned_module'](base['GUARD'], base['GUARD_HASH'], 'guard')
    p = base['pinned_module'](prepare, base['PREP_HASH'], 'prepare')
    os.umask(0o077)
    with (ROOT/'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        gateway = h.inspect(base['GATEWAY'])
        need(gateway['State'].get('Health', {}).get('Status') == 'healthy',
             'Gateway indisponível.')
        config = Path(gateway['Config']['Labels']['com.docker.compose.project.config_files'])
        current = config.parent
        need(current.parent == ROOT and current.name.startswith(ACTIVE_GESTURE) and
             config.name == 'after.json', 'A revisão ativa mudou.')
        web_before = RELEASES/current.name/'bundles'
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(web_before)
                 for m in gateway['Mounts']), 'Bundle ativo divergente.')
        need(shutil.disk_usage(RELEASES).free >= 1024**3, 'Espaço insuficiente.')

        anchor = Path(tempfile.mkdtemp(prefix='passenger-cancel-web-' + revision[:12] + '-', dir=ROOT))
        h.DIRECTORY = anchor
        web = RELEASES/anchor.name/'bundles'
        web.parent.mkdir(mode=0o755)
        web.parent.chmod(0o755)
        shutil.copytree(web_before, web)
        p.extract({'main.dart.js': new_js}, web/'passenger')
        old_tree, new_tree = p.tree(web_before), p.tree(web)
        need(set(old_tree) == set(new_tree) and
             [name for name in old_tree if old_tree[name] != new_tree[name]] == ['passenger/main.dart.js'],
             'Há diferenças fora do JavaScript do Passageiro.')

        adm = {'/administrodo/'+name: digest(h.run(
            ['docker', 'exec', base['GATEWAY'], 'cat', '/srv/admin/'+name]))
            for name in ('src/app.js', 'pages/drivers.html', 'styles.css')}
        snapshot = p.snapshot(h, gateway, 'gateway', PROJECT)
        old = snapshot['model']
        new = copy.deepcopy(old)
        mount, = [m for m in new['services']['gateway']['volumes'] if m['target'] == '/srv/web']
        mount['source'] = str(web)
        before, after = anchor/'before.json', anchor/'after.json'
        p.save(before, old)
        p.save(after, new)
        need(json.loads(h.run(base['compose'](snapshot, after)+['config','--format','json'])) == new,
             'O Compose da revisão divergiu.')
        need(h.inspect(base['GATEWAY'])['Id'] == gateway['Id'], 'A VPS mudou durante a preparação.')
        try:
            launch(h, snapshot, after)
            verify_live(h, web, adm)
        except BaseException:
            launch(h, snapshot, before)
            verify_live(h, web_before, adm)
            print('CANCELAMENTO_PASSAGEIRO_WEB_REVERTIDO', flush=True)
            raise
        print('CANCELAMENTO_PASSAGEIRO_WEB_PUBLICADO', flush=True)


if __name__ == '__main__':
    main()
