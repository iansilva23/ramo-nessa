#!/usr/bin/env python3
"""Publish only the per-driver ADM and its two Core modules."""
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
ADMIN = ('src/app.js', 'src/api.js', 'src/driver-photo-review.js', 'pages/drivers.html', 'styles.css')
CORE = ('driver-verification-photo-routes.js', 'driver-verification-photos.js')


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 4, 'Uso: publicar-adm.py pasta commit prepare-guard.py')
    folder, revision = Path(sys.argv[1]), sys.argv[2]
    need(len(revision) == 40 and all(c in '0123456789abcdef' for c in revision), 'Commit inválido.')
    need((folder/'SOURCE_COMMIT.txt').read_text().strip() == revision, 'Pacote de outra revisão.')
    sums = dict((name.removeprefix('./'), sha) for sha, name in
                (line.split() for line in (folder/'SHA256SUMS').read_text().splitlines()))
    need(set(sums) == {*CORE, 'adm-fotos.patch', 'SOURCE_COMMIT.txt'} and
         all(digest((folder/name).read_bytes()) == sha for name, sha in sums.items()), 'Checksum divergente.')
    h = base['pinned_module'](base['GUARD'], base['GUARD_HASH'], 'guard')
    p = base['pinned_module'](Path(sys.argv[3]), base['PREP_HASH'], 'prepare')
    anchor = ROOT / ('driver-photo-dossier-' + revision[:12])
    h.DIRECTORY = anchor
    os.umask(0o077)
    with (ROOT/'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        services = {role: h.inspect(base[role.upper()]) for role in ('gateway', 'core')}
        expected = {'gateway': ROOT / WEB_RELEASE / 'after.json',
                    'core': ROOT / 'driver-photos-397ed5b01ba4' / 'core-after.json'}
        for role, service in services.items():
            need(service['Config']['Labels']['com.docker.compose.project.config_files'] == str(expected[role])
                 and service['State'].get('Health', {}).get('Status') == 'healthy', 'Revisão ativa divergente: ' + role)
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(WEB)
                 for m in services['gateway']['Mounts']), 'Bundle Web ativo divergente.')
        snapshots = {role:p.snapshot(h, service, role, PROJECT) for role, service in services.items()}
        active = {n: h.run(['docker', 'exec', base['GATEWAY'], 'cat', '/srv/admin/'+n]) for n in ADMIN}
        anchor.mkdir(mode=0o700)
        admin_overlay, core_overlay = anchor/'adm', anchor/'core'
        admin_overlay.mkdir(mode=0o700)
        core_overlay.mkdir(mode=0o700)
        p.extract(active, admin_overlay)
        for command in (['git','apply','--check'], ['git','apply']):
            subprocess.run([*command, str((folder/'adm-fotos.patch').resolve())], cwd=admin_overlay, check=True)
        p.extract({n: (folder/n).read_bytes() for n in CORE}, core_overlay)
        for root,names in ((admin_overlay, ADMIN),(core_overlay, CORE)):
            for n in names:
                if n.endswith('.js'):
                    h.run(['docker', 'exec', '-i', base['CORE'], 'node', '--input-type=module', '--check'],
                          input=(root/n).read_bytes())
        copies = {'gateway': (admin_overlay, [(n, '/srv/admin/'+n) for n in ADMIN]),
                  'core': (core_overlay, [(n, '/app/dist/src/drivers/'+n) for n in CORE])}
        configs = {}
        for role, live in services.items():
            old = snapshots[role]['model']
            new = copy.deepcopy(old)
            overlay, files = copies[role]
            new['services'][role]['image'] = p.derive_image(h, live['Image'], anchor.name+'-'+role, overlay, files)
            before, after = anchor/(role+'-before.json'), anchor/(role+'-after.json')
            p.save(before, old)
            p.save(after, new)
            need(json.loads(h.run(base['compose'](snapshots[role], after)+['config','--format','json'])) == new,
                 'Compose divergente: ' + role)
            configs[role] = before, after
        for role, live in services.items():
            need(h.inspect(base[role.upper()])['Id'] == live['Id'], 'A VPS mudou durante a preparação.')
        touched = []
        try:
            for role in ('core', 'gateway'):
                touched.append(role)
                launch(h, snapshots[role], configs[role][1])
            route = 'https://app.ramonessa.com.br/v1/admin/driver-verification-photos/driver/check'
            status = h.run(['curl', '-sS', '--max-time', '15', '-o', '/dev/null', '-w', '%{http_code}', route])
            need(status == b'401', 'A rota privada por motorista não está disponível.')
            verify_live(h, WEB, {'/administrodo/'+n:digest((admin_overlay/n).read_bytes()) for n in ADMIN})
        except BaseException:
            for role in reversed(touched):
                launch(h, snapshots[role], configs[role][0])
            verify_live(h, WEB, {'/administrodo/'+n:digest(active[n]) for n in ADMIN})
            print('ADM_FICHA_FOTOS_REVERTIDO', flush=True)
            raise
        print('ADM_FOTOS_POR_MOTORISTA_PUBLICADO', flush=True)


if __name__ == '__main__':
    main()
