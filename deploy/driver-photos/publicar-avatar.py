#!/usr/bin/env python3
"""Publish the approved profile avatar and Driver Web with rollback."""
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
CORE_FILES = ('driver-verification-photo-routes.js', 'driver-verification-photos.js')
WEB_BEFORE = RELEASES / 'driver-photos-web-550340d4d83d' / 'bundles'
CORE_BEFORE = ROOT / 'driver-photo-dossier-76da0538ee2e' / 'core-after.json'
PINNED_WEB = {
    'index.html', 'manifest.json', 'ramo_push_config.js', 'ramo_web_push.js',
    'ramo_push_worker.js', 'ramo_offer_tone.js', 'ramo_install_tutorial_ios.gif',
    'ramo_card_fields.js',
}


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 4,
         'Uso: publicar-avatar.py pacote commit prepare-guard.py')
    folder, revision, prepare = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    need(len(revision) == 40 and all(c in '0123456789abcdef' for c in revision),
         'Commit inválido.')
    package = {'SOURCE_COMMIT.txt', 'motorista-web.tar.gz', *CORE_FILES}
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
        gateway_base = configs['gateway']
        need(configs['core'] == CORE_BEFORE and gateway_base.name == 'after.json' and
             gateway_base.parent.parent == ROOT and
             gateway_base.parent.name.startswith('driver-photo-dossier-thumbnails-'),
             'A revisão ativa diverge da base preparada.')
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(WEB_BEFORE)
                 for m in services['gateway']['Mounts']), 'O bundle ativo diverge da base preparada.')
        need(shutil.disk_usage(RELEASES).free >= 1024**3, 'Espaço insuficiente.')
        anchor = Path(tempfile.mkdtemp(prefix='driver-avatar-' + revision[:12] + '-', dir=ROOT))
        h.DIRECTORY = anchor
        unpack(folder/'motorista-web.tar.gz', anchor/'driver')
        driver = anchor/'driver'
        js = (driver/'main.dart.js').read_bytes()
        need(all(marker in js for marker in (b'de20bf289d6db3ad15fdb14b',
                                              b'/verification-photos/avatar',
                                              b'Enviar nova foto de perfil')),
             'O bundle não contém o perfil e mapa esperados.')
        for name in ('ramo_push_config.js', 'ramo_web_push.js', 'ramo_push_worker.js'):
            need((driver/name).read_bytes() == (WEB_BEFORE/'driver'/name).read_bytes(),
                 'Configuração de push divergiu.')
        web = RELEASES/anchor.name/'bundles'
        web.parent.mkdir(mode=0o755)
        web.parent.chmod(0o755)
        shutil.copytree(WEB_BEFORE, web)
        p.extract({f.relative_to(driver).as_posix(): f.read_bytes()
                   for f in driver.rglob('*') if f.is_file()
                   and f.relative_to(driver).as_posix() not in PINNED_WEB}, web/'driver')
        need(p.tree(web/'passenger') == p.tree(WEB_BEFORE/'passenger'), 'Bundle do Passageiro divergiu.')

        overlay = anchor/'core'
        overlay.mkdir(mode=0o700)
        p.extract({n: (folder/n).read_bytes() for n in CORE_FILES}, overlay)
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
                    [(n, '/app/dist/src/drivers/'+n) for n in CORE_FILES])
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
            avatar = 'https://app.ramonessa.com.br/v1/driver/me/verification-photos/avatar'
            need(h.run(['curl', '-sS', '--max-time', '15', '-o', '/dev/null',
                        '-w', '%{http_code}', avatar]) == b'401',
                 'A rota privada da foto não exigiu autenticação.')
        except BaseException:
            for role in reversed(touched):
                launch(h, snapshots[role], cfg[role][0])
            verify_live(h, WEB_BEFORE, adm)
            print('FOTO_OFICIAL_PERFIL_REVERTIDA', flush=True)
            raise
        print('FOTO_OFICIAL_PERFIL_PUBLICADA', flush=True)


if __name__ == '__main__':
    main()
