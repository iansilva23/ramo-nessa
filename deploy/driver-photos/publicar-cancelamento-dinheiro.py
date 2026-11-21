#!/usr/bin/env python3
"""Publish cash cancellation and change for both web apps with rollback."""
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
MIGRATIONS = ('109_cash_cancellation_window.sql', '110_cash_tendered_amount.sql')
RIDE_MODULES = ('manual-cancellation-policy', 'manual-cancellation-routes',
                'manual-cancellation-store', 'authorize-cash', 'prepayment-driver-confirmation')
CORE_FILES = {part+'.js': '/app/dist/src/rides/'+part+'.js' for part in RIDE_MODULES}
CORE_FILES.update({
    'driver-app-service.js': '/app/dist/src/drivers/driver-app-service.js',
    'driver-ride-service.js': '/app/dist/src/drivers/driver-ride-service.js',
    'postgres-ride-matching-repository.js': '/app/dist/src/matching/postgres-ride-matching-repository.js',
    'postgres-ride-repository.js': '/app/dist/src/rides/repositories/postgres-ride-repository.js',
    'validation.js': '/app/dist/src/payments/validation.js',
})
CORE_FILES.update({name: '/app/migrations/'+name for name in MIGRATIONS})
SERVER_PATH = '/app/dist/src/server.js'
SERVER_MARKER = (
    b'const result = await authorizeCashRide({\n'
    b'                    rides: rideRepository,\n'
    b'                    settings: paymentPolicySettingsRepository,\n'
    b'                    finance: financeRepository,\n'
    b'                    rideId: ride.id,\n'
    b'                    passengerId,\n'
)
ACTIVE_RELEASES = {
    'core': ('passenger-driver-portrait-4ee0c0e45641-', 'core-after.json'),
    'gateway': ('passenger-cancel-web-9a0c0cf1a4b8-', 'after.json'),
}
PRIOR_RELEASE_PREFIXES = ('cash-cancellation-0ddd7652593b-', 'cash-change-6368e809fd96-')
WEB_FILES = {'passenger': 'passageiro.js', 'driver': 'motorista.js'}


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 1,
         'Execute com sudo python3 -I publicar-cancelamento-dinheiro.py.')
    folder = Path(__file__).resolve().parent
    expected = set(CORE_FILES) | set(WEB_FILES.values()) | { 'SOURCE_COMMIT.txt', 'publicar.py',
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
        configs = {}
        for role, (prefix, name) in ACTIVE_RELEASES.items():
            need(live[role]['State'].get('Health', {}).get('Status') == 'healthy',
                 'Serviço indisponível: ' + role)
            config = configs[role] = Path(live[role]['Config']['Labels']['com.docker.compose.project.config_files'])
            known = ((config.parent.name.startswith(prefix) and config.name == name) or
                     (config.parent.name.startswith(PRIOR_RELEASE_PREFIXES) and config.name == role+'-after.json'))
            need(config.parent.parent == ROOT and known, 'A revisão ativa mudou: '+role)
        gateway_config = configs['gateway']
        web_before = RELEASES/gateway_config.parent.name/'bundles'
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(web_before)
                 for m in live['gateway']['Mounts']), 'Bundle ativo divergente.')
        need(shutil.disk_usage(RELEASES).free >= 1024**3, 'Espaço insuficiente.')
        installed = set(base['db_query'](h, 'SELECT filename FROM schema_migrations').splitlines())
        existing = h.run(['docker', 'exec', base['CORE'], 'ls', '/app/migrations']).decode().splitlines()
        need({filename for filename in existing if filename.endswith('.sql')} <= installed,
             'Há migrações pendentes fora do escopo.')

        anchor = Path(tempfile.mkdtemp(prefix='cash-confirmation-' + revision[:12] + '-', dir=ROOT))
        h.DIRECTORY = anchor
        web = RELEASES/anchor.name/'bundles'
        web.parent.mkdir(mode=0o755)
        web.parent.chmod(0o755)
        shutil.copytree(web_before, web)
        for role, filename in WEB_FILES.items():
            p.extract({'main.dart.js': (folder/filename).read_bytes()}, web/role)
        old_tree, new_tree = p.tree(web_before), p.tree(web)
        changed_web = {name for name in old_tree if old_tree[name] != new_tree.get(name)}
        need(set(old_tree) == set(new_tree) and 'passenger/main.dart.js' in changed_web and
             changed_web <= {role+'/main.dart.js' for role in WEB_FILES},
             'Há diferenças fora dos arquivos JavaScript dos dois apps.')

        overlay = anchor/'overlay'
        overlay.mkdir()
        core_files = {**CORE_FILES, 'server.js': SERVER_PATH}
        server = h.run(['docker', 'exec', base['CORE'], 'cat', SERVER_PATH])
        need(server.count(SERVER_MARKER) == 1, 'A autorização em dinheiro do Core ativo divergiu.')
        parameter = b'                    ...(body.cashTenderedCents == null ? {} : { cashTenderedCents: body.cashTenderedCents }),\n'
        existing_marker = SERVER_MARKER+parameter
        old_marker = existing_marker if existing_marker in server else SERVER_MARKER
        request_flag = b'                    ...(body.requestCashRide == null ? {} : { requestCashRide: body.requestCashRide }),\n'
        server = server.replace(old_marker, existing_marker+request_flag, 1)
        previous_validation = (
            b'            await assertPrepaymentDriverAvailable(ride);\n'
            b'            const body = parseCreatePaymentRequest(await readJson(request));\n'
        )
        next_validation = (
            b'            const body = parseCreatePaymentRequest(await readJson(request));\n'
            b'            if (body.requestCashRide !== true)\n'
            b'                await assertPrepaymentDriverAvailable(ride);\n'
        )
        need(server.count(previous_validation) == 1, 'A validação de pagamento do Core ativo divergiu.')
        server = server.replace(previous_validation, next_validation, 1)
        p.extract({**{name: (folder/name).read_bytes() for name in CORE_FILES}, 'server.js': server}, overlay)
        for name in core_files:
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
                                                  overlay, list(core_files.items()))
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
            print('CANCELAMENTO_E_TROCO_REVERTIDOS', flush=True)
            raise
        print('CANCELAMENTO_E_TROCO_PUBLICADOS '+revision, flush=True)


if __name__ == '__main__':
    main()
