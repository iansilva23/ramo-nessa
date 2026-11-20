#!/usr/bin/env python3
"""Publish the selected driver's photo thumbnails without replacing Core."""
import copy
import fcntl
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile

base = runpy.run_path(str(Path(__file__).with_name('publicar.py')))
ROOT, RELEASES, PROJECT = (base[k] for k in ('ROOT', 'RELEASES', 'PROJECT'))
need, digest, launch, verify_live = (base[k] for k in ('need', 'digest', 'launch', 'verify_live'))
WEB = RELEASES / 'driver-photos-web-550340d4d83d' / 'bundles'
PREVIOUS = ROOT / 'driver-photo-dossier-76da0538ee2e'
FILES = ('src/app.js', 'src/driver-photo-review.js', 'styles.css')


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 2, 'Uso: publicar-miniaturas.py prepare-guard.py')
    h = base['pinned_module'](base['GUARD'], base['GUARD_HASH'], 'guard')
    p = base['pinned_module'](Path(sys.argv[1]), base['PREP_HASH'], 'prepare')
    os.umask(0o077)

    with (ROOT/'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        gateway, core = (h.inspect(base[role]) for role in ('GATEWAY', 'CORE'))
        need(gateway['Config']['Labels']['com.docker.compose.project.config_files'] ==
             str(PREVIOUS/'gateway-after.json') and core['Config']['Labels'][
                 'com.docker.compose.project.config_files'] == str(PREVIOUS/'core-after.json'),
             'A ficha individual anterior não está ativa na VPS.')
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(WEB)
                 for m in gateway['Mounts']), 'Bundle Web divergente.')
        snapshot = p.snapshot(h, gateway, 'gateway', PROJECT)
        active = {n: h.run(['docker', 'exec', base['GATEWAY'], 'cat', '/srv/admin/'+n]) for n in FILES}
        anchor = Path(tempfile.mkdtemp(prefix='driver-photo-dossier-thumbnails-', dir=ROOT))
        h.DIRECTORY = anchor
        overlay = anchor/'overlay'
        overlay.mkdir(mode=0o700)
        p.extract(active, overlay)
        patch = str(Path(__file__).with_name('adm-miniaturas.patch'))
        subprocess.run(['git', 'apply', '--check', patch], cwd=overlay, check=True)
        subprocess.run(['git', 'apply', patch], cwd=overlay, check=True)
        for n in FILES:
            if n.endswith('.js'):
                h.run(['docker','exec','-i',base['CORE'],'node','--input-type=module','--check'],
                      input=(overlay/n).read_bytes())
        before, after = anchor/'before.json', anchor/'after.json'
        old = snapshot['model']
        new = copy.deepcopy(old)
        new['services']['gateway']['image'] = p.derive_image(
            h, gateway['Image'], anchor.name+'-gateway', overlay, [(n, '/srv/admin/'+n) for n in FILES])
        p.save(before, old)
        p.save(after, new)
        need(json.loads(h.run(base['compose'](snapshot, after)+['config','--format','json'])) == new,
             'Compose divergente.')
        need(h.inspect(base['GATEWAY'])['Id'] == gateway['Id'], 'O ADM mudou durante a preparação.')
        try:
            launch(h, snapshot, after)
            verify_live(h, WEB, {'/administrodo/'+n:digest((overlay/n).read_bytes()) for n in FILES})
            need(h.inspect(base['CORE'])['Id'] == core['Id'], 'O Core mudou durante a publicação.')
        except BaseException:
            launch(h, snapshot, before)
            verify_live(h, WEB, {'/administrodo/'+n:digest(active[n]) for n in FILES})
            print('ADM_MINIATURAS_REVERTIDAS', flush=True)
            raise
        print('ADM_MINIATURAS_POR_MOTORISTA_PUBLICADAS', flush=True)


if __name__ == '__main__':
    main()
