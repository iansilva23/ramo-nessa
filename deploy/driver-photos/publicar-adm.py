#!/usr/bin/env python3
"""Apply only the photo queue presentation patch to the active ADM."""
import copy
import fcntl
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

base = runpy.run_path(str(Path(__file__).with_name('publicar.py')))
ROOT, RELEASES, PROJECT = (base[k] for k in ('ROOT', 'RELEASES', 'PROJECT'))
need, digest, launch, verify_live = (base[k] for k in ('need', 'digest', 'launch', 'verify_live'))
WEB_RELEASE = 'driver-photos-web-550340d4d83d'
WEB = RELEASES / WEB_RELEASE / 'bundles'
FILES = ('src/app.js', 'src/driver-photo-review.js', 'pages/drivers.html', 'styles.css')


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 2, 'Uso: publicar-adm.py prepare-guard.py')
    tooling = Path(__file__).parent
    h = base['pinned_module'](base['GUARD'], base['GUARD_HASH'], 'guard')
    p = base['pinned_module'](Path(sys.argv[1]), base['PREP_HASH'], 'prepare')
    anchor = ROOT / 'driver-photos-adm-review'
    h.DIRECTORY = anchor
    os.umask(0o077)
    with (ROOT/'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        gateway, core = (h.inspect(base[name]) for name in ('GATEWAY', 'CORE'))
        need(gateway['Config']['Labels']['com.docker.compose.project.config_files'] ==
             str(ROOT / WEB_RELEASE / 'after.json'), 'O gateway está em outra revisão.')
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(WEB)
                 for m in gateway['Mounts']), 'Bundle Web ativo divergente.')
        for service in (gateway, core):
            need(service['State'].get('Health', {}).get('Status') == 'healthy', 'Serviço indisponível.')
        snapshot = p.snapshot(h, gateway, 'gateway', PROJECT)
        active = {n: h.run(['docker', 'exec', base['GATEWAY'], 'cat', '/srv/admin/'+n]) for n in FILES}
        anchor.mkdir(mode=0o700)
        overlay = anchor/'overlay'
        overlay.mkdir(mode=0o700)
        p.extract(active, overlay)
        subprocess.run(['git', 'apply', '--check', str(tooling/'adm-fotos.patch')], cwd=overlay, check=True)
        subprocess.run(['git', 'apply', str(tooling/'adm-fotos.patch')], cwd=overlay, check=True)
        for n in FILES:
            if n.endswith('.js'):
                h.run(['docker', 'exec', '-i', base['CORE'], 'node', '--input-type=module', '--check'],
                      input=(overlay/n).read_bytes())
        image = p.derive_image(h, gateway['Image'], anchor.name+'-gateway', overlay,
                               [(n, '/srv/admin/'+n) for n in FILES])
        old = snapshot['model']
        new = copy.deepcopy(old)
        new['services']['gateway']['image'] = image
        before, after = anchor/'before.json', anchor/'after.json'
        p.save(before, old)
        p.save(after, new)
        need(json.loads(h.run(base['compose'](snapshot, after)+['config','--format','json'])) == new,
             'Compose do gateway divergiu.')
        need(h.inspect(base['GATEWAY'])['Id'] == gateway['Id'], 'Gateway mudou durante a preparação.')
        try:
            launch(h, snapshot, after)
            verify_live(h, WEB, {'/administrodo/'+n:digest((overlay/n).read_bytes()) for n in FILES})
            need(h.inspect(base['CORE'])['Id'] == core['Id'], 'Core mudou durante a publicação.')
        except BaseException:
            launch(h, snapshot, before)
            verify_live(h, WEB, {'/administrodo/'+n:digest(active[n]) for n in FILES})
            print('ADM_FOTOS_REVERTIDO', flush=True)
            raise
        print('ADM_FOTOS_REVISADO_PUBLICADO', flush=True)


if __name__ == '__main__':
    main()
