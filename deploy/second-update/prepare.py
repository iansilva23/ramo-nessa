"""Prepare pinned overlays and private return configurations. No activation command."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
import pwd
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

sys.dont_write_bytecode = True
ROOT = Path('/opt/ramo-nessa-security')
RELEASES = Path('/opt/ramo-nessa-web/releases')
SOURCE = '484f31979d80a0ea03cc6e17dabbb925d031322d'
PRODUCT_SOURCE = '3f6a9f57b447c1308ec587ad0e053fada4142fc3'
BASELINE = '2b3c3891a89dca2f4da9100b830dcb00cf142ff41a021a77e43c42949a2e3ce3'
BASE_WEB = Path('/opt/ramo-nessa-web/releases/restore-exact-guide-68329f854044/bundles')
SITE_COMPOSE = Path('/opt/ramo-nessa-site/compose.yml')
SITE_COMPOSE_SHA = '35d31dcf3e398c3f7db653fe1f5b06dc55a6574eb6de4ea24da6c799177270c6'
INVENTORY_SHA = '034ec10182c0fef822a2854d88189e8db60de2dd97e81f65d65e700c26baddb7'
HELPER = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
HELPER_SHA = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
BASE_MIGRATION_SHA = '6f3eaf321e7ff641ff98908ee24455c0c3d2bb31a87ae3d2e44a6a1900c40165'
NAME = 'second-update-' + SOURCE[:12] + '-' + BASELINE[:12]
MAX_BYTES = 600 * 1024**2
PAYLOAD = {'admin': ['RamoNessa-Segunda-admin.zip', 'dbf016e7bbbba68d73587be15989723d2b782f9e6283a4c8fbc28f6c1e468335'], 'core': ['RamoNessa-Segunda-core.zip', '88623a0f478ae098104e449835de1bfead55dcc4035a1e7800dc24619e85c09e'], 'driver': ['RamoNessa-Segunda-driver.zip', 'a164425bd4d3d7ba2e31ba203d0486a96059b12f6b52b71c528a54c90cde613d'], 'passenger': ['RamoNessa-Segunda-passenger.zip', 'edf307c8cdc9359e9e08ca8d20e1f3568b84229f34b5842d2bf2855a246eb1a0'], 'site': ['RamoNessa-Segunda-site.zip', '00c5ec8867fd1860cdfcd21899025c7896fbc8c1f4e794153bf0c762542fef30']}
ROUTES = {'driver': 'motorista', 'passenger': 'passageiro'}
CADDY_ROUTE = '  redir /excluir-conta/ /excluir-conta 308\n  handle /excluir-conta {\n    rewrite * /v1/account-deletion/page\n    reverse_proxy core:8080\n  }\n\n'

class PreparationError(Exception):
    pass

def require(condition, message):
    if not condition:
        raise PreparationError(message)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def save(path, value):
    raw = value if isinstance(value, bytes) else (json.dumps(value, indent=2) + '\n').encode()
    with path.open('xb') as out:
        out.write(raw)
        out.flush()
        os.fsync(out.fileno())
    return sha(raw)

def load_module(path, expected, name):
    require(path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == expected,
            'Ferramenta de conferência ausente ou divergente.')
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def relative(name):
    require(isinstance(name, str) and name and '\\' not in name and all(ord(c) >= 32 for c in name), 'Caminho inválido no pacote.')
    path = PurePosixPath(name)
    require(bool(path.parts) and not path.is_absolute() and str(path) == name and '..' not in path.parts, 'Caminho inseguro no pacote.')
    return path

def payload(package, component):
    filename, expected = PAYLOAD[component]
    path = package / filename
    require(path.is_file() and not path.is_symlink() and path.stat().st_size < MAX_BYTES and sha(path.read_bytes()) == expected,
            'Pacote não passou na integridade: ' + component)
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and len(names) < 30002 and
                sum(i.file_size for i in archive.infolist()) < MAX_BYTES and
                all(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16) for i in archive.infolist()), 'ZIP inseguro ou excessivo.')
        meta = json.loads(archive.read('manifest.json'))
        require(meta['source'] == SOURCE and meta['productSource'] == PRODUCT_SOURCE and meta['component'] == component,
                'Origem do pacote divergente.')
        files = meta['files']
        require(isinstance(files, dict) and files and set(names) == {'manifest.json', *(component + '/' + n for n in files)}, 'Manifesto incompleto.')
        content = {}
        for name, digest in files.items():
            relative(name)
            raw = archive.read(component + '/' + name)
            require(sha(raw) == digest, 'Arquivo não corresponde ao manifesto.')
            content[name] = raw
    return meta, content

def download_packages(package):
    base = 'https://github.com/iansilva23/ramo-nessa/releases/download/second-update-' + SOURCE[:12] + '/'
    for component, (filename, expected) in PAYLOAD.items():
        path = package / filename
        require(not path.is_symlink(), 'Link inesperado no destino de download.')
        if not path.exists():
            print('Baixando pacote verificado: ' + component, flush=True)
            descriptor = os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
            with os.fdopen(descriptor,'wb') as out:
                result = subprocess.run(['curl','-fLsS','--retry','2','--max-time','180','--max-filesize',str(MAX_BYTES),base+filename],stdout=out,stderr=subprocess.PIPE)
                out.flush()
                os.fsync(out.fileno())
            require(result.returncode == 0, 'Download incompleto: ' + component + '. Nenhum serviço foi alterado.')
        require(path.is_file() and not path.is_symlink() and path.stat().st_size < MAX_BYTES and sha(path.read_bytes()) == expected, 'Checksum do pacote divergente: ' + component)

def compose(h, project, workdir, config):
    # Preparation is deliberately restricted to Compose config, never up/run.
    return json.loads(h.run(['docker', 'compose', '--project-directory', workdir, '--project-name', project,
                             '--env-file', '/dev/null', '-f', str(config), 'config', '--format', 'json']))

def site_compose_source(path):
    # The deployed public site Compose belongs to ubuntu, unlike private Core/Gateway plans.
    require(path == SITE_COMPOSE and path.resolve() == path, 'Caminho do Compose do site difere do inventário.')
    allowed_owners = {0}
    try:
        allowed_owners.add(pwd.getpwnam('ubuntu').pw_uid)
    except KeyError:
        pass
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid in allowed_owners and
            not before.st_mode & 0o022 and before.st_size <= 1024**2,
            'Proprietário, tipo ou permissões do Compose do site exigem revisão.')
    identity = lambda st: (st.st_dev,st.st_ino,st.st_uid,st.st_mode,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
    descriptor = os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(descriptor,'rb') as stream:
        require(identity(os.fstat(stream.fileno())) == identity(before), 'Compose do site mudou antes da leitura.')
        raw = stream.read(1024**2+1)
    require(identity(path.lstat()) == identity(before) and len(raw) == before.st_size,
            'Compose do site mudou durante a leitura.')
    require(sha(raw) == SITE_COMPOSE_SHA, 'Checksum do Compose do site difere do inventário.')
    return raw

def snapshot(h, before, service, project):
    labels = before['Config'].get('Labels') or {}
    require(labels.get('com.docker.compose.project') == project and labels.get('com.docker.compose.service') == service,
            'Identidade Compose divergente.')
    path = labels.get('com.docker.compose.project.config_files', '')
    workdir = labels.get('com.docker.compose.project.working_dir', '')
    require(path.startswith('/') and ',' not in path and workdir.startswith('/'), 'Compose precisa de revisão.')
    raw = site_compose_source(Path(path)) if (service,project) == ('institutional-site','ramo-nessa-site') else h.private_file(Path(path))
    model = compose(h, project, workdir, path)
    require(set(model['services']) == {service} and not model['services'][service].get('env_file'), 'Compose deve ser autocontido e isolado.')
    alias = {**model, 'services': {'core': model['services'][service]}}
    image = h.inspect(before['Image'], True)
    h.assert_environment(alias, before, image)
    h.assert_mount_plan(alias, before)
    model['services'][service]['image'] = before['Image']
    return {'name': before['Name'], 'service': service, 'project': project, 'workdir': workdir,
            'configPath': path, 'configSha256': sha(raw), 'model': model}

def tree(root):
    require(root.is_dir() and not root.is_symlink() and root.resolve() == root, 'Árvore Web inválida.')
    result = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        require(all(not (Path(directory) / n).is_symlink() for n in dirs), 'Link inesperado na Web.')
        for name in files:
            p = Path(directory) / name
            require(stat.S_ISREG(p.lstat().st_mode), 'Arquivo Web não regular.')
            result[str(p.relative_to(root))] = {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
            require(len(result) <= 30000 and sum(x['bytes'] for x in result.values()) < 2 * MAX_BYTES, 'Web excessiva.')
    return result

def extract(content, destination, modes=None):
    modes = modes or {}
    for name, raw in content.items():
        target = destination / relative(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        target.chmod(0o755 if modes.get(name, 0) & 0o111 else 0o644)
    for directory, dirs, files in os.walk(destination):
        Path(directory).chmod(0o755)

def prepare_web(contents, anchor, destination):
    original = tree(BASE_WEB)
    for role, route in ROUTES.items():
        meta, content = contents[role]
        require(meta.get('basePath') == '/' + route + '/' and {'index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js'} <= content.keys(), 'Bundle incompleto.')
        for name in ('index.html','ramo_push_config.js','ramo_web_push.js','ramo_push_worker.js','manifest.json','ramo_card_fields.js'):
            if name in content:
                require((BASE_WEB / role / name).is_file() and (BASE_WEB / role / name).read_bytes() == content[name],
                        'Shell, Maps, push ou ponte Web diferem da versão ativa: ' + role + '/' + name)
        if role == 'driver':
            require(b'de20bf289d6db3ad15fdb14b' in content['main.dart.js'], 'Map ID Cinema ausente do Motorista.')
    shutil.copytree(BASE_WEB, anchor / 'before-web')
    require(tree(anchor / 'before-web') == original, 'Cópia anterior não confere.')
    shutil.copytree(BASE_WEB, destination)
    expected = copy.deepcopy(original)
    for role in ROUTES:
        extract(contents[role][1], destination / role)
        for name, raw in contents[role][1].items():
            expected[role + '/' + name] = {'sha256': sha(raw), 'bytes': len(raw)}
    require(tree(destination) == expected and tree(BASE_WEB) == original, 'Árvore Web mudou fora do plano.')
    return original, expected

def derive_image(h, before_id, tag, build, copies):
    image = h.inspect(before_id, True)
    require(image.get('Os') == 'linux' and image.get('Architecture') == 'amd64', 'Plataforma da imagem precisa de revisão.')
    base_tag = 'ramo-second-base:' + tag
    candidate_tag = 'ramo-second-candidate:' + tag
    h.run(['docker', 'image', 'tag', before_id, base_tag])
    (build / 'Dockerfile').write_text('FROM ' + base_tag + '\n' + ''.join('COPY --chown=node:node ' + source + ' ' + target + '\n' for source, target in copies))
    # Gateway has no node user; keep the existing root-owned static-file convention.
    if tag.endswith('-gateway'):
        (build / 'Dockerfile').write_text((build / 'Dockerfile').read_text().replace('COPY --chown=node:node ', 'COPY '))
    h.run(['docker','build','--pull=false','--network=none','-t',candidate_tag,str(build)], timeout=300)
    candidate = h.inspect(candidate_tag, True)
    require(candidate['Config'] == image['Config'] and candidate['RootFS']['Layers'][:len(image['RootFS']['Layers'])] == image['RootFS']['Layers'], 'Configuração da imagem derivada divergiu.')
    return candidate['Id']

SITE_PROBE = """
const {spawn}=await import('node:child_process');
const child=spawn(process.execPath,['server.js'],{env:{...process.env,HOSTNAME:'127.0.0.1',PORT:'3000'},stdio:'ignore'});
try{let ready=false;for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:3000/api/health');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))};if(!ready)throw Error('Site not ready');
const r=await fetch('http://127.0.0.1:3000/');if(!r.ok)throw Error('Page failed');
const html=await r.text();if(!html.includes('mailto:suporteramonessa@gmail.com')||!html.includes('69.495.337/0001-13'))throw Error('Footer missing');
}finally{child.kill('SIGTERM');}
"""

def schema_state(h, core, expected_105):
    probe = """
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const pool=createPostgresPool(process.env.DATABASE_URL);const client=await pool.connect();
try{await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='5s'");
const r=await client.query("SELECT filename,checksum FROM schema_migrations WHERE filename IN ('104_admin_account_closure.sql','105_self_account_deletion.sql') ORDER BY filename");
console.log(JSON.stringify(r.rows));await client.query('COMMIT');
}finally{client.release();await pool.end();}
"""
    rows = json.loads(h.run(['docker','exec',core['Name'],'node','--input-type=module','-e',probe],timeout=20))
    applied = {r['filename']: r['checksum'] for r in rows}
    require(applied.get('104_admin_account_closure.sql') == BASE_MIGRATION_SHA, 'A migração-base 104 não foi confirmada. Nenhuma migração aplicada; revisar antes de continuar.')
    if '105_self_account_deletion.sql' in applied:
        require(applied['105_self_account_deletion.sql'] == expected_105, 'Migração 105 existente diverge; não alterar o histórico.')
    return {'migration104':'verified','migration105':'already-present' if '105_self_account_deletion.sql' in applied else 'pending'}

def prepare(package, h, inventory):
    current = inventory.collect_all()
    require(current['baselineSha256'] == BASELINE and current['activeWebRoot'] == str(BASE_WEB), 'A VPS mudou desde o inventário. Nada será sobreposto.')
    require(all(v['running'] and v['health'] == 'healthy' for v in [*current['services'].values(), current['site']]), 'Serviço não saudável.')
    require(shutil.disk_usage(RELEASES).free > 3 * 1024**3, 'São necessários 3 GB livres para a preparação.')
    anchor = ROOT / NAME
    release = RELEASES / NAME
    require(not anchor.exists() and not release.exists(), 'Preparação já existe; não sobrescrever nem repetir automaticamente.')
    payloads = {key: payload(package, key) for key in ('driver','passenger','core','admin','site')}
    runtime = {k: h.inspect(v['name']) for k, v in current['services'].items()}
    runtime['site'] = h.inspect(current['site']['name'])
    require(h.environment(runtime['core']['Config'].get('Env')).get('SELF_ACCOUNT_DELETION_ENABLED', '').lower() != 'true', 'Flag de exclusão exige revisão antes da migração.')
    for component, base_path in [('core','/app/'),('admin','/srv/admin/')]:
        require(payloads[component][0].get('baseline'), 'Hashes da base ausentes.')
        for name, expected in payloads[component][0]['baseline'].items():
            raw = h.run(['docker','exec',runtime['core' if component == 'core' else 'gateway']['Name'],'cat',base_path+str(relative(name))])
            if sha(raw) != expected:
                print(json.dumps({'status':'SECOND_UPDATE_BASE_CODE_REQUIRES_REVIEW','component':component,'file':name,'expectedSha256':expected,'observedSha256':sha(raw),'changesApplied':False}))
                raise PreparationError('Código ativo difere da base compilada. Não trocar imagens; revisar a diferença registrada.')
    schema = schema_state(h, runtime['core'], payloads['core'][0]['files']['migrations/105_self_account_deletion.sql'])
    snapshots = {k: snapshot(h, runtime[k], k, 'ramo-nessa-staging') for k in ('core','gateway')}
    snapshots['site'] = snapshot(h, runtime['site'], 'institutional-site', 'ramo-nessa-site')
    caddy_mounts = [m for m in runtime['gateway']['Mounts'] if m['Destination'] == '/etc/caddy/Caddyfile']
    require(len(caddy_mounts) == 1 and caddy_mounts[0]['Type'] == 'bind' and not caddy_mounts[0]['RW'], 'Caddyfile montado exige revisão.')
    caddy_source = Path(caddy_mounts[0]['Source'])
    require(caddy_source.resolve() == caddy_source and stat.S_ISREG(caddy_source.lstat().st_mode) and not caddy_source.stat().st_mode & 0o022, 'Caddyfile ativo exige revisão de caminho/permissões.')
    caddy_raw = caddy_source.read_bytes()
    text = caddy_raw.decode()
    marker = '  @api path /v1/* /health /ready'
    require(text.count(marker) == 1 and '/excluir-conta' not in text, 'Rotas atuais exigem revisão antes da inclusão pontual.')
    candidate_caddy = text.replace(marker, CADDY_ROUTE + marker).encode()
    anchor.mkdir(mode=0o700)
    h.DIRECTORY = anchor
    save(anchor / 'phase.private.json', {'phase':'preparing','changesApplied':False})
    release.mkdir(mode=0o755)
    release.chmod(0o755)
    before_web, after_web = prepare_web(payloads, anchor, release / 'bundles')
    save(anchor / 'Caddyfile.before', caddy_raw)
    save(anchor / 'Caddyfile.candidate', candidate_caddy)
    images = {}
    for component, runtime_key in [('core','core'),('admin','gateway'),('site','site')]:
        print('Preparando imagem candidata: ' + runtime_key, flush=True)
        build = anchor / ('build-' + runtime_key)
        build.mkdir()
        meta, content = payloads[component]
        extract(content, build / 'payload', meta.get('modes'))
        if component == 'site':
            copies = [('payload/', '/app/')]
        else:
            root = '/app/' if component == 'core' else '/srv/admin/'
            copies = [('payload/' + name, root + name) for name in sorted(content)]
        images[runtime_key] = derive_image(h, runtime[runtime_key]['Image'], SOURCE[:12] + '-' + runtime_key, build, copies)
    js_files = ['/app/' + n for n in payloads['core'][1] if n.endswith('.js')]
    h.run(['docker','run','--rm','--network=none','--read-only','--entrypoint','sh',images['core'],'-ec','for f do node --check "$f"; done','second-check',*js_files],timeout=60)
    h.run(['docker','run','--rm','--network=none','--read-only','--tmpfs','/tmp:rw,mode=1777','--tmpfs','/var/lib/ramo-site:rw,uid=1000,gid=1000,mode=0700','--entrypoint','node',images['site'],'--input-type=module','-e',SITE_PROBE],timeout=40)
    env = h.environment(runtime['gateway']['Config'].get('Env'))
    h.run(['docker','run','--rm','--network=none','--read-only','--env','APP_DOMAIN='+env.get('APP_DOMAIN','app.ramonessa.com.br'),'--env','ACME_EMAIL='+env.get('ACME_EMAIL',''),'--mount','type=bind,src='+str(anchor/'Caddyfile.candidate')+',dst=/etc/caddy/Caddyfile,readonly','--entrypoint','caddy',images['gateway'],'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],timeout=40)
    files = {}
    for key, info in snapshots.items():
        for phase in ('before','after'):
            model = copy.deepcopy(info['model'])
            if phase == 'after':
                settings = model['services'][info['service']]
                settings['image'] = images[key]
                if key == 'gateway':
                    for target, source in [('/srv/web',str(release/'bundles')),('/etc/caddy/Caddyfile',str(anchor/'Caddyfile.candidate'))]:
                        mounts = [m for m in settings['volumes'] if m['target'] == target]
                        require(len(mounts) == 1 and mounts[0].get('read_only'), 'Mount candidato inválido.')
                        mounts[0]['source'] = source
            filename = key + '-' + phase + '.private.json'
            files[filename] = save(anchor / filename, model)
            require(compose(h, info['project'], info['workdir'], anchor / filename) == model, 'Releitura Compose alterou configurações.')
    bind_hashes = {}
    for item in runtime.values():
        for mount in item['Mounts']:
            if mount['Type'] == 'bind' and Path(mount['Source']).is_file():
                bind_hashes[mount['Source']] = h.bound_hash(Path(mount['Source']))
    plan = {'schema':1,'source':SOURCE,'productSource':PRODUCT_SOURCE,'baselineSha256':BASELINE,'snapshots':snapshots,'runtimeBefore':runtime,'images':images,'oldWeb':str(BASE_WEB),'newWeb':str(release/'bundles'),'beforeWebFiles':before_web,'candidateWebFiles':after_web,'bindHashes':bind_hashes,'schemaState':schema,'files':files,'caddySource':str(caddy_source),'caddyBeforeSha256':sha(caddy_raw),'caddyCandidateSha256':sha(candidate_caddy),'changesApplied':False,'activationImplemented':False,'databaseMigrationPerformed':False,'selfAccountDeletionEnabled':False}
    plan_hash = save(anchor / 'plan.private.json', plan)
    require(inventory.collect_all()['baselineSha256'] == BASELINE, 'VPS mudou durante a preparação; não ativar.')
    for key, before in runtime.items():
        observed = h.inspect(before['Name'])
        require(h.identity(before) == h.identity(observed), 'Container mudou durante a preparação.')
        h.runtime_matches(before, observed, before['Image'])
    require(sha(caddy_source.read_bytes()) == sha(caddy_raw), 'Caddyfile ativo mudou durante a preparação.')
    for path, digest in bind_hashes.items():
        require(h.bound_hash(Path(path)) == digest, 'Arquivo montado mudou durante a preparação.')
    result = {'status':'SECOND_UPDATE_PREPARED','source':SOURCE,'productSource':PRODUCT_SOURCE,'anchor':str(anchor),'planSha256':plan_hash,'baselineSha256':BASELINE,'candidateImages':images,'candidateWeb':str(release/'bundles'),'changesApplied':False,'servicesRestarted':False,'databaseMigrationPerformed':False,'activationImplemented':False,'selfAccountDeletionEnabled':False,'rollbackPrepared':False,'returnConfigurationsPrepared':True,'schemaState':schema}
    save(anchor / 'prepared.private.json', result)
    save(anchor / 'phase-complete.private.json', {'phase':'prepared','planSha256':plan_hash,'changesApplied':False})
    os.replace(anchor/'phase-complete.private.json',anchor/'phase.private.json')
    return result

def main():
    require(sys.argv[1:] == ['prepare'] and os.geteuid() == 0, 'Uso: sudo python3 prepare.py prepare. Sem comando de ativação.')
    require(set(PAYLOAD) == {'driver','passenger','core','admin','site'}, 'Hashes finais dos pacotes ainda não definidos; não executar.')
    os.umask(0o077)
    for directory in (ROOT, RELEASES):
        st = directory.lstat()
        require(stat.S_ISDIR(st.st_mode) and not directory.is_symlink() and st.st_uid == 0 and not st.st_mode & 0o022, 'Diretório operacional exige revisão.')
    package = Path(__file__).resolve().parent
    inventory = load_module(package/'inspect-active.py',INVENTORY_SHA,'ramo_second_inventory')
    h = load_module(HELPER,HELPER_SHA,'ramo_second_guard')
    h.DIRECTORY = Path('/proc/self/second-update-command-log-disabled')
    download_packages(package)
    descriptor = os.open(ROOT/'screen-lock-activation.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,'r+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        print(json.dumps(prepare(package,h,inventory),indent=2,ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except (PreparationError, RuntimeError, OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        if isinstance(error, PreparationError):
            sys.exit(str(error))
        sys.exit('Preparação interrompida. Consulte o estágio registrado; não repetir automaticamente. Nenhum serviço foi reiniciado por este preparador.')
