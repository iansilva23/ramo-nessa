#!/usr/bin/env python3
"""Publish the cash cancellation policy and Passenger Web with rollback."""
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
MIGRATION = '109_cash_cancellation_window.sql'
CORE_FILES = {
    'manual-cancellation-' + part + '.js': '/app/dist/src/rides/manual-cancellation-' + part + '.js'
    for part in ('policy', 'routes', 'store')
}
CORE_FILES[MIGRATION] = '/app/migrations/' + MIGRATION
ACTIVE_RELEASES = {
    'core': ('passenger-driver-portrait-4ee0c0e45641-', 'core-after.json'),
    'gateway': ('passenger-cancel-web-9a0c0cf1a4b8-', 'after.json'),
}


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 1,
         'Execute com sudo python3 -I publicar-cancelamento-dinheiro.py.')
    folder = Path(__file__).resolve().parent
    expected = set(CORE_FILES) | {'main.dart.js', 'SOURCE_COMMIT.txt', 'publicar.py',
                                  'prepare-guard.py', Path(__file__).name}
    checksums = {name: sha for sha, name in
                 (line.split() for line in (folder/'SHA256SUMS').read_text().splitlines())}
    need(set(checksums) == expected and all(digest((folder/name).read_bytes()) == sha
         for name, sha in checksums.items()), 'Pacote divergente.')
    revision = (folder/'SOURCE_COMMIT.txt').read_text().strip()
    need(len(revision) == 40 and all(c in '0123456789abcdef' for c in revision),
         'Commit inválido.')
    h = base['pinned_module'](base['GUARD'], base['GUARD_HASH'], 'guard')
    p = base['pinned_module'](folder/'prepare-guard.py', base['PREP_HASH'], 'prepare')
    os.umask(0o077)
    with (ROOT/'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        live = {role: h.inspect(base[role.upper()]) for role in ACTIVE_RELEASES}
        for role, (prefix, name) in ACTIVE_RELEASES.items():
            need(live[role]['State'].get('Health', {}).get('Status') == 'healthy',
                 'Serviço indisponível: ' + role)
            config = Path(live[role]['Config']['Labels']['com.docker.compose.project.config_files'])
            need(config.parent.parent == ROOT and config.parent.name.startswith(prefix)
                 and config.name == name, 'A revisão ativa mudou: ' + role)
        gateway_config = Path(live['gateway']['Config']['Labels']['com.docker.compose.project.config_files'])
        web_before = RELEASES/gateway_config.parent.name/'bundles'
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(web_before)
                 for m in live['gateway']['Mounts']), 'Bundle ativo divergente.')
        need(shutil.disk_usage(RELEASES).free >= 1024**3, 'Espaço insuficiente.')
        installed = set(base['db_query'](h, 'SELECT filename FROM schema_migrations').splitlines())
        existing = h.run(['docker', 'exec', base['CORE'], 'ls', '/app/migrations']).decode().splitlines()
        need({filename for filename in existing if filename.endswith('.sql')} <= installed,
             'Há migrações pendentes fora do escopo.')

        anchor = Path(tempfile.mkdtemp(prefix='cash-cancellation-' + revision[:12] + '-', dir=ROOT))
        h.DIRECTORY = anchor
        web = RELEASES/anchor.name/'bundles'
        web.parent.mkdir(mode=0o755)
        web.parent.chmod(0o755)
        shutil.copytree(web_before, web)
        p.extract({'main.dart.js': (folder/'main.dart.js').read_bytes()}, web/'passenger')
        old_tree, new_tree = p.tree(web_before), p.tree(web)
        need(set(old_tree) == set(new_tree) and
             [name for name in old_tree if old_tree[name] != new_tree[name]] == ['passenger/main.dart.js'],
             'Há diferenças fora do JavaScript do Passageiro.')

        overlay = anchor/'overlay'
        overlay.mkdir()
        p.extract({name: (folder/name).read_bytes() for name in CORE_FILES}, overlay)
        for name in CORE_FILES:
            if name.endswith('.js'):
                h.run(['docker', 'exec', '-i', base['CORE'], 'node', '--input-type=module', '--check'],
                      input=(overlay/name).read_bytes())
        adm = {'/administrodo/'+name: digest(h.run(
            ['docker', 'exec', base['GATEWAY'], 'cat', '/srv/admin/'+name]))
            for name in ('src/app.js', 'src/driver-photo-review.js', 'pages/drivers.html', 'styles.css')}

        plans = {}
        for role, container in live.items():
            snap = p.snapshot(h, container, role, PROJECT)
            old = snap['model']
            new = copy.deepcopy(old)
            service = new['services'][role]
            if role == 'core':
                service['image'] = p.derive_image(h, container['Image'], anchor.name+'-core',
                                                  overlay, list(CORE_FILES.items()))
            else:
                mount, = [m for m in service['volumes'] if m['target'] == '/srv/web']
                mount['source'] = str(web)
            before, after = anchor/(role+'-before.json'), anchor/(role+'-after.json')
            p.save(before, old)
            p.save(after, new)
            need(json.loads(h.run(base['compose'](snap, after)+['config', '--format', 'json'])) == new,
                 'Compose da revisão divergiu: '+role)
            plans[role] = snap, before, after

        for role, container in live.items():
            need(h.inspect(base[role.upper()])['Id'] == container['Id'], 'A VPS mudou durante a preparação.')
        snap, _, after = plans['core']
        h.run(base['compose'](snap, after)+['run', '--rm', '--no-deps', '-T', 'core',
                                           'node', 'dist/scripts/migrate.js'], timeout=180)
        changed = []
        try:
            for role, (snap, _, after) in plans.items():
                changed.append(role)
                launch(h, snap, after)
            verify_live(h, web, adm)
        except BaseException:
            for role in reversed(changed):
                snap, before, _ = plans[role]
                launch(h, snap, before)
            verify_live(h, web_before, adm)
            print('CANCELAMENTO_DINHEIRO_REVERTIDO', flush=True)
            raise
        print('CANCELAMENTO_DINHEIRO_PUBLICADO '+revision, flush=True)


if __name__ == '__main__':
    main()
