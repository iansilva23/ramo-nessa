#!/usr/bin/env python3
"""Replace only the Motorista web bundle and reuse the active gateway image."""
import copy
import fcntl
import json
import os
from pathlib import Path
import runpy
import shutil
import sys

base = runpy.run_path(str(Path(__file__).with_name('publicar.py')))
ROOT, RELEASES, PROJECT = (base[k] for k in ('ROOT', 'RELEASES', 'PROJECT'))
need, digest, unpack, launch, verify_live = (
    base[k] for k in ('need', 'digest', 'unpack', 'launch', 'verify_live')
)
PREVIOUS = '397ed5b01ba4'
BEFORE_WEB = RELEASES / ('driver-photos-' + PREVIOUS) / 'bundles'


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 4,
         'Uso: publicar-web.py pasta-do-pacote commit prepare-guard.py')
    folder = Path(sys.argv[1])
    revision = sys.argv[2]
    need(len(revision) == 40 and all(c in '0123456789abcdef' for c in revision), 'Commit inválido.')
    h = base['pinned_module'](base['GUARD'], base['GUARD_HASH'], 'guard')
    p = base['pinned_module'](Path(sys.argv[3]), base['PREP_HASH'], 'prepare')
    anchor = ROOT / ('driver-photos-web-' + revision[:12])
    new_web = RELEASES / anchor.name / 'bundles'
    h.DIRECTORY = anchor
    os.umask(0o077)

    with (ROOT / 'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        need((folder/'SOURCE_COMMIT.txt').read_text().strip() == revision, 'Pacote de outra revisão.')
        archive = folder/'motorista-web.tar.gz'
        checks = dict((name.removeprefix('./'), checksum) for checksum, name in
                      (line.split() for line in (folder/'SHA256SUMS').read_text().splitlines()))
        need(digest(archive.read_bytes()) == checks.get(archive.name), 'Checksum do bundle não confere.')
        gateway = h.inspect(base['GATEWAY'])
        core = h.inspect(base['CORE'])
        need(gateway['State'].get('Health', {}).get('Status') == 'healthy' and
             core['State'].get('Health', {}).get('Status') == 'healthy', 'Gateway ou Core indisponível.')
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(BEFORE_WEB)
                 for m in gateway['Mounts']), 'A revisão Web ativa mudou.')
        need(core['Config']['Labels']['com.docker.compose.project.config_files'] ==
             str(ROOT/('driver-photos-'+PREVIOUS)/'core-after.json'), 'A revisão do Core mudou.')
        snapshot = p.snapshot(h, gateway, 'gateway', PROJECT)
        need(shutil.disk_usage(RELEASES).free >= 1024**3, 'Espaço insuficiente para nova revisão e retorno.')
        need(not new_web.parent.exists(), 'O diretório da revisão já existe.')
        anchor.mkdir(mode=0o700)
        unpack(archive, anchor/'driver')
        for filename in ('ramo_push_config.js','ramo_web_push.js','ramo_push_worker.js'):
            need((BEFORE_WEB/'driver'/filename).read_bytes() ==
                 (anchor/'driver'/filename).read_bytes(), 'Configuração de push divergiu.')
        js = (anchor/'driver/main.dart.js').read_bytes()
        need(b'de20bf289d6db3ad15fdb14b' in js and b'verification-photos' in js,
             'O bundle não contém o mapa e a revisão de fotos esperados.')
        passenger = p.tree(BEFORE_WEB/'passenger')
        new_web.parent.mkdir(mode=0o755)
        new_web.parent.chmod(0o755)
        shutil.copytree(BEFORE_WEB, new_web)
        pinned = {'index.html','manifest.json','ramo_push_config.js','ramo_web_push.js',
                  'ramo_push_worker.js','ramo_offer_tone.js','ramo_install_tutorial_ios.gif',
                  'ramo_card_fields.js'}
        p.extract({f.relative_to(anchor/'driver').as_posix(): f.read_bytes()
                   for f in (anchor/'driver').rglob('*') if f.is_file()
                   and f.relative_to(anchor/'driver').as_posix() not in pinned}, new_web/'driver')
        need(p.tree(new_web/'passenger') == passenger, 'Bundle do Passageiro divergiu.')
        current = snapshot['model']
        candidate = copy.deepcopy(current)
        mount, = [m for m in candidate['services']['gateway']['volumes'] if m['target'] == '/srv/web']
        mount['source'] = str(new_web)
        before, after = anchor/'before.json', anchor/'after.json'
        p.save(before, current)
        p.save(after, candidate)
        normalized = json.loads(h.run(base['compose'](snapshot, after)+['config','--format','json']))
        need(normalized == candidate, 'Compose da revisão divergiu.')
        need(h.inspect(base['GATEWAY'])['Id'] == gateway['Id'], 'Gateway mudou durante a preparação.')
        try:
            launch(h, snapshot, after)
            verify_live(h, new_web, {})
            need(h.inspect(base['CORE'])['Id'] == core['Id'], 'Core mudou durante a publicação.')
        except BaseException:
            launch(h, snapshot, before)
            verify_live(h, BEFORE_WEB, {})
            print('MOTORISTA_WEB_REVERTIDO', flush=True)
            raise
        print('FOTOS_MOTORISTA_WEB_ATUALIZADAS ' + revision, flush=True)


if __name__ == '__main__':
    main()
