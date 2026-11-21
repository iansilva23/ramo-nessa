#!/usr/bin/env python3
"""Publish the approved ride portrait and Passenger Web with rollback."""
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
need, digest, unpack, launch, verify_live = (
    base[k] for k in ('need', 'digest', 'unpack', 'launch', 'verify_live')
)
CORE_FILES = {
    'driver-verification-photo-routes.js': '/app/dist/src/drivers/driver-verification-photo-routes.js',
    'server.js': '/app/dist/src/server.js',
}
ACTIVE_AVATAR = 'driver-avatar-46eafcdf3b54-'
PINNED_WEB = {
    'index.html', 'manifest.json', 'ramo_push_config.js', 'ramo_web_push.js',
    'ramo_push_worker.js', 'ramo_offer_tone.js', 'ramo_install_tutorial_ios.gif',
    'ramo_card_fields.js',
}


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 4,
         'Uso: publicar-retrato-passageiro.py pacote commit prepare-guard.py')
    folder, revision, prepare = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    need(len(revision) == 40 and all(c in '0123456789abcdef' for c in revision),
         'Commit inválido.')
    package = {'SOURCE_COMMIT.txt', 'passageiro-web.tar.gz', 'driver-verification-photo-routes.js'}
    sums = {name: sha for sha, name in
            (line.split() for line in (folder/'SHA256SUMS').read_text().splitlines())}
    need(set(sums) == package and all(digest((folder/name).read_bytes()) == sha
                                    for name, sha in sums.items()), 'Pacote divergente.')
    need((folder/'SOURCE_COMMIT.txt').read_text().strip() == revision, 'Pacote de outra revisão.')
    h = base['pinned_module'](base['GUARD'], base['GUARD_HASH'], 'guard')
    p = base['pinned_module'](prepare, base['PREP_HASH'], 'prepare')
    os.umask(0o077)
    with (ROOT/'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        services = {role: h.inspect(base[role.upper()]) for role in ('core', 'gateway')}
        for service in services.values():
            need(service['State'].get('Health', {}).get('Status') == 'healthy',
                 'Core ou gateway indisponível.')
        configs = {role: Path(service['Config']['Labels']['com.docker.compose.project.config_files'])
                   for role, service in services.items()}
        current_release = configs['core'].parent
        need(current_release.parent == ROOT and current_release.name.startswith(ACTIVE_AVATAR)
             and configs['core'] == current_release/'core-after.json'
             and configs['gateway'] == current_release/'gateway-after.json',
             'A revisão ativa diverge da base com a foto oficial do Motorista.')
        web_before = RELEASES/current_release.name/'bundles'
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(web_before)
                 for m in services['gateway']['Mounts']), 'O bundle ativo diverge da base preparada.')
        need(shutil.disk_usage(RELEASES).free >= 1024**3, 'Espaço insuficiente.')
        anchor = Path(tempfile.mkdtemp(prefix='passenger-driver-portrait-' + revision[:12] + '-', dir=ROOT))
        h.DIRECTORY = anchor
        unpack(folder/'passageiro-web.tar.gz', anchor/'passenger')
        passenger = anchor/'passenger'
        need(b'/driver-portrait' in (passenger/'main.dart.js').read_bytes(),
             'O bundle não contém o retrato da corrida.')
        for name in ('ramo_push_config.js', 'ramo_web_push.js', 'ramo_push_worker.js'):
            need((passenger/name).read_bytes() == (web_before/'passenger'/name).read_bytes(),
                 'Configuração de push divergiu.')
        web = RELEASES/anchor.name/'bundles'
        web.parent.mkdir(mode=0o755)
        web.parent.chmod(0o755)
        shutil.copytree(web_before, web)
        p.extract({f.relative_to(passenger).as_posix(): f.read_bytes()
                   for f in passenger.rglob('*') if f.is_file()
                   and f.relative_to(passenger).as_posix() not in PINNED_WEB}, web/'passenger')
        need(p.tree(web/'driver') == p.tree(web_before/'driver'), 'Bundle do Motorista divergiu.')

        overlay = anchor/'core'
        overlay.mkdir(mode=0o700)
        route = 'driver-verification-photo-routes.js'
        active = h.run(['docker', 'exec', base['CORE'], 'cat', CORE_FILES['server.js']])
        marker = (b'            photos: driverPhotoPreview.photos, storage: driverPhotoPreview.storage,\n'
                  b'            driver: async () => (await authenticateBearer(')
        replacement = (b'            photos: driverPhotoPreview.photos, storage: driverPhotoPreview.storage,\n'
                       b'            rides: rideRepository,\n'
                       b'            passenger: async () => (await authenticateBearer({ repository: authSessionRepository,\n'
                       b"                headers: request.headers, requiredType: 'passenger', identities: authIdentityRepository })).subjectId,\n"
                       b'            driver: async () => (await authenticateBearer(')
        need(active.count(marker) == 1, 'A integração de fotos do Core ativo divergiu.')
        server = active.replace(marker, replacement, 1)
        p.extract({route: (folder/route).read_bytes(), 'server.js': server}, overlay)
        for name in CORE_FILES:
            h.run(['docker', 'exec', '-i', base['CORE'], 'node', '--input-type=module', '--check'],
                  input=(overlay/name).read_bytes())

        adm = {f'/administrodo/{name}': digest(h.run(
            ['docker', 'exec', base['GATEWAY'], 'cat', '/srv/admin/'+name]))
            for name in ('src/app.js', 'src/driver-photo-review.js', 'pages/drivers.html', 'styles.css')}
        cfg = {}
        snapshots = {}
        for role, live in services.items():
            snap = snapshots[role] = p.snapshot(h, live, role, PROJECT)
            old = snap['model']
            new = copy.deepcopy(old)
            service = new['services'][role]
            if role == 'core':
                service['image'] = p.derive_image(
                    h, live['Image'], anchor.name+'-core', overlay,
                    list(CORE_FILES.items()))
            else:
                mount, = [m for m in service['volumes'] if m['target'] == '/srv/web']
                mount['source'] = str(web)
            before, after = anchor/(role+'-before.json'), anchor/(role+'-after.json')
            p.save(before, old)
            p.save(after, new)
            need(json.loads(h.run(base['compose'](snap, after)+['config','--format','json'])) == new,
                 'Compose da revisão divergiu: ' + role)
            cfg[role] = before, after
        for role, live in services.items():
            need(h.inspect(base[role.upper()])['Id'] == live['Id'], 'A VPS mudou durante a preparação.')
        touched = []
        try:
            for role in ('core', 'gateway'):
                touched.append(role)
                launch(h, snapshots[role], cfg[role][1])
            verify_live(h, web, adm)
            avatar = ('https://app.ramonessa.com.br/v1/rides/'
                      '00000000-0000-4000-8000-000000000000/driver-portrait?driver=synthetic-check')
            need(h.run(['curl', '-sS', '--max-time', '15', '-o', '/dev/null',
                        '-w', '%{http_code}', avatar]) == b'401',
                 'A rota privada da foto não exigiu autenticação.')
        except BaseException:
            for role in reversed(touched):
                launch(h, snapshots[role], cfg[role][0])
            verify_live(h, web_before, adm)
            print('RETRATO_PASSAGEIRO_REVERTIDO', flush=True)
            raise
        print('RETRATO_PASSAGEIRO_PUBLICADO', flush=True)


if __name__ == '__main__':
    main()
