#!/usr/bin/env python3
"""Publish the verified photo bundle on the known Ramo Nessa stack."""
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import types

PROJECT = 'ramo-nessa-staging'
ROOT = Path('/opt/ramo-nessa-security')
RELEASES = Path('/opt/ramo-nessa-web/releases')
BASE_CORE = 'sha256:44d2d2053eee1b67a9545fde7968cdc4cce91808109b5a2db8609972df791f48'
BASE_WEB = RELEASES / 'marca-oficial-d47c6c91a3fc/bundles'
GUARD = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
GUARD_HASH = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
PREP_HASH = 'aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393'
BASE_ADMIN = ('src/app.js', 'src/api.js', 'pages/drivers.html', 'src/driver-photo-review.js')
ADM_BASE_HASHES = {
    'src/app.js': 'e2fe436915444e45b729dfda6cadae1695587a9db01394c0f98a7b94e6e378fc',
    'src/api.js': '21e45e8fb952e6b7ca722b77a7da286846a2e14b2d4c1064bf0387c6a7a6a761',
    'pages/drivers.html': 'dfa4bb793013b41f07047d965b7714f7523a590b531f1ad874f475cf6e091ce1',
}
CORE = PROJECT + '-core-1'
GATEWAY = PROJECT + '-gateway-1'
DB = PROJECT + '-postgres-1'


def need(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pinned_module(path, sha, name):
    data = path.read_bytes()
    need(digest(data) == sha, 'Checksum do utilitário não confere.')
    module = types.ModuleType(name)
    module.__file__ = str(path)
    exec(compile(data, str(path), 'exec'), module.__dict__)
    return module


def unpack(path, destination):
    destination.mkdir()
    with tarfile.open(path, 'r:gz') as archive:
        members = archive.getmembers()
        need(len(members) < 12000 and sum(m.size for m in members) < 800 * 1024**2,
             'Pacote excede os limites de extração.')
        need(all((m.isdir() or m.isfile()) and not m.name.startswith('/') and '..' not in Path(m.name).parts
                 for m in members), 'Pacote contém entradas inválidas.')
        archive.extractall(destination, filter='data')


def compose(snapshot, path):
    return ['docker', 'compose', '--project-directory', snapshot['workdir'],
            '--project-name', PROJECT, '--env-file', '/dev/null', '-f', str(path)]


def launch(h, snapshot, path):
    command = compose(snapshot, path)
    h.run(command + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate',
                    '--wait', '--wait-timeout', '80', snapshot['service']], timeout=105)


def db_query(h, statement):
    return h.run(['docker', 'exec', DB, 'sh', '-ec',
                  'exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"',
                  'psql', statement]).decode().strip()


def verify_live(h, web, adm):
    probes = {'/ready': None, '/motorista/main.dart.js': digest((web/'driver/main.dart.js').read_bytes()),
              '/passageiro/main.dart.js': digest((web/'passenger/main.dart.js').read_bytes()), **adm}
    for path, expected in probes.items():
        raw = h.run(['curl', '-fsS', '--max-time', '15', 'https://app.ramonessa.com.br' + path])
        need(expected is None or digest(raw) == expected, 'Conteúdo público divergiu: ' + path)


def main():
    need(os.geteuid() == 0 and len(sys.argv) == 5, 'Uso: publicar.py apply|rollback pacote commit prepare-guard.py')
    action, package, revision, prep = sys.argv[1:]
    need(action in ('apply', 'rollback') and len(revision) == 40 and all(c in '0123456789abcdef' for c in revision),
         'Operação inválida.')
    package = Path(package).resolve()
    anchor = ROOT / ('driver-photos-' + revision[:12])
    web = RELEASES / anchor.name / 'bundles'
    h = pinned_module(GUARD, GUARD_HASH, 'guard')
    p = pinned_module(Path(prep), PREP_HASH, 'prepare')
    h.DIRECTORY = anchor
    os.umask(0o077)
    with (ROOT / 'driver-photos.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action == 'rollback':
            plan = json.loads(h.private_file(anchor/'return.json'))
            for service in ('gateway', 'core'):
                live = h.inspect(PROJECT + '-' + service + '-1')
                need(live['Config']['Labels']['com.docker.compose.project.config_files'] in
                     (plan[service]['configPath'], str(anchor/(service+'-after.json')), str(anchor/(service+'-before.json'))),
                     'Outra publicação foi detectada.')
                need(digest(h.private_file(anchor/(service+'-before.json'))) == plan['rollbackHashes'][service],
                     'Arquivo de retorno alterado.')
            for service in ('gateway', 'core'):
                launch(h, plan[service], anchor/(service+'-before.json'))
            verify_live(h, BASE_WEB, {})
            print('FOTOS_REVERTIDAS', flush=True)
            return

        need(not anchor.exists() and not web.parent.exists(), 'Já existe uma preparação para esta revisão.')
        need((package/'SOURCE_COMMIT.txt').read_text().strip() == revision, 'Commit do pacote divergente.')
        checks = {}
        for line in (package/'SHA256SUMS').read_text().splitlines():
            sha, name = line.split(maxsplit=1)
            checks[name.removeprefix('./')] = sha
        expected = {'SOURCE_COMMIT.txt','core-source.tar.gz','adm-overlay.tar.gz','motorista-web.tar.gz'}
        need(set(checks) == expected and all(digest((package/n).read_bytes()) == checks[n] for n in expected),
             'Os checksums dos arquivos não conferem.')
        need(min(shutil.disk_usage(ROOT).free, shutil.disk_usage(RELEASES).free) >= 3 * 1024**3,
             'Espaço livre insuficiente para a preparação, backup e retorno.')
        original = {role: h.inspect(name) for role, name in [('core',CORE), ('gateway',GATEWAY)]}
        need(original['core']['Image'] == BASE_CORE, 'A imagem Core em execução mudou.')
        need(any(m['Destination'] == '/srv/web' and m['Source'] == str(BASE_WEB)
                 for m in original['gateway']['Mounts']), 'A versão Web em execução mudou.')
        env = h.environment(original['core']['Config']['Env'])
        private_dir = env.get('DOCUMENT_STORAGE_LOCAL_DIR', '')
        need(private_dir.startswith('/') and not env.get('DOCUMENT_STORAGE_BASE_URL') and
             any(m['RW'] and (private_dir == m['Destination'] or private_dir.startswith(m['Destination'].rstrip('/') + '/'))
                 for m in original['core']['Mounts']), 'Volume privado não confirmado.')
        need(digest(h.run(['docker','exec',GATEWAY,'cat','/etc/caddy/Caddyfile'])) ==
             'df3f304e8ae067e85d9ca66cc96b7941a72dc52119df72424f1426cb0cc37d73',
             'O Caddyfile ativo diverge da versão publicada.')
        for name, checksum in ADM_BASE_HASHES.items():
            need(digest(h.run(['docker','exec',GATEWAY,'cat','/srv/admin/'+name])) == checksum,
                 'O ADM ativo diverge do código-base: ' + name)
        h.run(['docker','exec',CORE,'node','-e',
               'const fs=require("node:fs");const p=process.argv[1];fs.accessSync(p,fs.constants.R_OK|fs.constants.W_OK);'
               'const d=fs.statfsSync(p,{bigint:true});if (d.bavail*d.bsize<1073741824n)process.exit(1);',private_dir])
        for role, service in original.items():
            need(service['State'].get('Health', {}).get('Status') == 'healthy', role + ' não saudável.')
        plan = {role: p.snapshot(h, service, role, PROJECT) for role, service in original.items()}
        anchor.mkdir(mode=0o700)
        unpack(package/'core-source.tar.gz', anchor/'core')
        unpack(package/'adm-overlay.tar.gz', anchor/'adm')
        unpack(package/'motorista-web.tar.gz', anchor/'driver')
        need((anchor/'driver/main.dart.js').is_file(), 'Bundle do Motorista incompleto.')
        release_root = web.parent
        release_root.mkdir(mode=0o755)
        release_root.chmod(0o755)
        shutil.copytree(BASE_WEB, web)
        p.extract({str(f.relative_to(anchor/'driver')): f.read_bytes()
                   for f in (anchor/'driver').rglob('*') if f.is_file()}, web/'driver')
        for name in ('ramo_push_config.js', 'ramo_web_push.js', 'ramo_push_worker.js'):
            before, after = BASE_WEB/'driver'/name, anchor/'driver'/name
            if before.exists():
                need(after.is_file() and before.read_bytes() == after.read_bytes(), 'Configuração Web divergiu: ' + name)
        for name in ('index.html','ramo_push_config.js','ramo_web_push.js','ramo_push_worker.js','manifest.json','ramo_card_fields.js'):
            before = BASE_WEB/'driver'/name
            if before.exists():
                shutil.copy2(before, web/'driver'/name)
        for name in ('ramo_install_tutorial_ios.gif', 'ramo_offer_tone.js'):
            before = BASE_WEB/'driver'/name
            if before.exists():
                shutil.copy2(before, web/'driver'/name)
        need(p.tree(web/'passenger') == p.tree(BASE_WEB/'passenger'), 'Bundle do Passageiro divergiu.')
        print('Preparando as imagens do Core e do gateway.', flush=True)
        core_tag = 'ramo-driver-photos-core:' + revision[:12]
        h.run(['docker','build','--label','org.opencontainers.image.revision='+revision,'-t',core_tag,
               str(anchor/'core/backend/core')],timeout=900)
        core_image = h.inspect(core_tag, True)['Id']
        adm_path = anchor/'adm/apps/admin'
        gateway_image = p.derive_image(h, original['gateway']['Image'], anchor.name+'-gateway', adm_path,
                                       [(n,'/srv/admin/'+n) for n in BASE_ADMIN])
        plan['rollbackHashes'] = {}
        for role in ('core','gateway'):
            old_model = plan[role]['model']
            new_model = copy.deepcopy(old_model)
            service = new_model['services'][role]
            service['image'] = core_image if role == 'core' else gateway_image
            if role == 'core':
                service['environment']['DRIVER_PHOTO_VERIFICATION_PREVIEW'] = 'true'
            else:
                mount, = [m for m in service['volumes'] if m['target'] == '/srv/web']
                mount['source'] = str(web)
            plan['rollbackHashes'][role] = p.save(anchor/(role+'-before.json'),old_model)
            p.save(anchor/(role+'-after.json'), new_model)
            normalized = json.loads(h.run(compose(plan[role], anchor/(role+'-after.json'))+['config','--format','json']))
            need(normalized == new_model, 'Compose da versão candidata divergiu.')
        p.save(anchor/'return.json', plan)

        for role,name in [('core',CORE),('gateway',GATEWAY)]:
            need(h.inspect(name)['Id'] == original[role]['Id'], 'Serviço mudou durante a preparação.')
        print('Criando backup privado antes da migração.', flush=True)
        with (anchor/'database-before.dump').open('xb') as output:
            subprocess.run(['docker','exec',DB,'sh','-ec',
                            'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner'],
                           stdout=output, check=True, timeout=300)
        need((anchor/'database-before.dump').stat().st_size > 0, 'Backup vazio.')
        with (anchor/'database-before.dump').open('rb') as backup:
            subprocess.run(['docker','exec','-i',DB,'pg_restore','--list'],
                           stdin=backup, stdout=subprocess.DEVNULL, check=True, timeout=120)
        migrations = anchor/'core/backend/core/migrations'
        installed = set(db_query(h, 'SELECT filename FROM schema_migrations').splitlines())
        pending = {p.name for p in migrations.glob('*.sql')} - installed
        need(pending <= {'107_driver_verification_photos.sql','108_driver_photo_policy.sql'}, 'Há migrações pendentes fora do escopo.')
        with (anchor/'documents-before.tar.gz').open('xb') as output:
            subprocess.run(['docker','exec',CORE,'tar','-C',private_dir,'-czf','-','.'],
                           stdout=output, check=True, timeout=300)
        with tarfile.open(anchor/'documents-before.tar.gz','r:gz') as archive:
            need(archive.next() is not None, 'Backup do volume privado vazio.')
        for filename in ('database-before.dump','documents-before.tar.gz'):
            file = anchor/filename
            with file.open('rb') as stream:
                checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
            p.save(anchor/(filename+'.sha256'),(checksum+'\n').encode())
        changed = []
        try:
            print('Aplicando migrações e publicando Core, Motorista Web e ADM.', flush=True)
            h.run(compose(plan['core'],anchor/'core-after.json')+['run','--rm','--no-deps','-T','core',
                  'node','dist/scripts/migrate.js'],timeout=180)
            for role in ('core','gateway'):
                changed.append(role)
                launch(h, plan[role], anchor/(role+'-after.json'))
            verify_live(h, web, {'/administrodo/'+n:digest((adm_path/n).read_bytes()) for n in BASE_ADMIN})
            status = h.run(['curl','-sS','--max-time','15','-o','/dev/null','-w','%{http_code}',
                            'https://app.ramonessa.com.br/v1/driver/me/verification-photos']).decode()
            need(status == '401', 'Rota de fotos ativa e protegida não confirmada.')
            db_query(h, "INSERT INTO driver_photo_policy (required,actor_kind,actor_id) VALUES (true,'user','owner-approved-release')")
            need(db_query(h, 'SELECT required FROM driver_photo_policy ORDER BY revision DESC LIMIT 1') == 't',
                 'Ativação da exigência não confirmada.')
            print('FOTOS_PUBLICADAS_E_EXIGIDAS ' + revision, flush=True)
        except BaseException:
            if changed:
                failed = []
                for role in reversed(changed):
                    try:
                        launch(h, plan[role], anchor/(role+'-before.json'))
                    except Exception:
                        failed.append(role)
                if failed:
                    print('FOTOS_RETORNO_NAO_CONFIRMADO ' + ','.join(failed), flush=True)
                else:
                    verify_live(h, BASE_WEB, {})
                    print('FOTOS_PUBLICACAO_REVERTIDA', flush=True)
            raise


if __name__ == '__main__':
    main()
