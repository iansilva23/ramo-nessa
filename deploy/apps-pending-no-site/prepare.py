"""Prepare verified app/Core candidates only. No site, migration, or service restart."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import zipfile

ROOT = Path('/opt/ramo-nessa-security')
RELEASES = Path('/opt/ramo-nessa-web/releases')
SOURCE = '9eb6aa071db458c57c6298cfd656ad2bd2ba3227'
BASELINE = 'd9cdbf24cd35d58d3026c00f005b28b0fc6f746036605654f38b120b42373aa6'
OLD_WEB = Path('/opt/ramo-nessa-web/releases/restore-exact-guide-68329f854044/bundles')
OLD_CORE = 'sha256:f607fce3d8d840cfb375436896f028268936baa0d3d50d0c4afa1959e1476d78'
CORE = 'sha256:e4427c167ac583e68f144fbc7bee9b06faa99e677fd1b8ed88e346ab1fad7f7b'
GATEWAY = 'sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
NAME = 'apps-pending-' + SOURCE[:12]
PACKAGES = {'driver': '01ec8f5646ffd715726829c8083be23706abf75f92128964522a42e0ab18275d', 'passenger': '6a8501f1c7df7b847d0895f32ad15673ca1c011889a7c09c7982dc4fa49ee3b1'}
ACTIVE_STAGE = 'preflight'


def stage(name):
    global ACTIVE_STAGE
    ACTIVE_STAGE = name
    print('Verificação: '+name, flush=True)


BRIDGE = b'  <script src="ramo_offer_tone.js"></script>\n'


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def module(path, expected, name):
    require(path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == expected,
            'Ferramenta de preparo ausente ou divergente.')
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def download(path, url, expected):
    require(not path.exists() and not path.is_symlink(), 'Destino de download já existe.')
    with path.open('xb') as out:
        r = subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '180', '--max-filesize', str(600*1024**2), url], stdout=out, stderr=subprocess.PIPE)
    require(r.returncode == 0 and sha(path.read_bytes()) == expected, 'Download não passou na integridade.')


def read_web(path, role, p):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size < 600*1024**2 and sha(path.read_bytes()) == PACKAGES[role], 'Pacote Web divergente: '+role)
    with zipfile.ZipFile(path) as z:
        entries = z.infolist()
        require(len(entries) < 30000 and sum(i.file_size for i in entries) < 600*1024**2 and all(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16) for i in entries), 'ZIP excessivo ou com links.')
        m = json.loads(z.read('manifest.json'))
        route = {'driver': 'motorista', 'passenger': 'passageiro'}[role]
        require(m['source'] == SOURCE and m['component'] == role and m['basePath'] == '/'+route+'/', 'Origem do pacote Web divergente.')
        names = z.namelist()
        require(len(names) == len(set(names)) and set(names) == {'manifest.json', *(role+'/'+n for n in m['files'])}, 'Manifesto Web incompleto.')
        result = {}
        for name, digest in m['files'].items():
            p.relative(name)
            raw = z.read(role+'/'+name)
            require(sha(raw) == digest, 'Arquivo Web divergente.')
            result[name] = raw
        require({'index.html', 'main.dart.js', 'flutter_bootstrap.js', 'ramo_push_config.js'} <= result.keys(), 'Bundle Web incompleto.')
        return result


def shell(old, incoming, role):
    for name in ('index.html', 'ramo_push_config.js', 'ramo_web_push.js', 'ramo_push_worker.js', 'manifest.json', 'ramo_card_fields.js'):
        if name not in incoming:
            continue
        previous = (old/name).read_bytes()
        current = incoming[name]
        if role == 'driver' and name == 'index.html':
            require(current.count(BRIDGE) == 1 and BRIDGE not in previous, 'Ponte de áudio Web inesperada.')
            current = current.replace(BRIDGE, b'', 1)
        require(current == previous, 'Configuração Maps/push/shell mudou: '+role+'/'+name)
    if role == 'driver':
        require('ramo_offer_tone.js' in incoming and b'de20bf289d6db3ad15fdb14b' in incoming['main.dart.js'], 'Áudio ou configuração Cinema ausente.')


def stage_web(p, payloads, anchor, release):
    before = p.tree(OLD_WEB)
    for role in payloads:
        shell(OLD_WEB/role, payloads[role], role)
    shutil.copytree(OLD_WEB, anchor/'before-web')
    require(p.tree(anchor/'before-web') == before, 'Cópia de retorno divergente.')
    shutil.copytree(OLD_WEB, release)
    expected = copy.deepcopy(before)
    for role, content in payloads.items():
        p.extract(content, release/role)
        for name, raw in content.items():
            expected[role+'/'+name] = {'sha256': sha(raw), 'bytes': len(raw)}
    require(p.tree(release) == expected and p.tree(OLD_WEB) == before, 'Árvore Web mudou fora do plano.')
    return before, expected


def prepare(package, p, inventory, h):
    stage('active-staging-only')
    observed = inventory.collect()
    require(observed['baselineSha256'] == BASELINE and observed['activeWebRoot'] == str(OLD_WEB), 'A versão ativa mudou; nada foi aplicado.')
    require(all(s['running'] and s['health'] == 'healthy' for s in observed['services'].values()), 'Serviço ativo não saudável.')
    runtime = {k: h.inspect(s['name']) for k, s in observed['services'].items()}
    require(runtime['core']['Image'] == OLD_CORE and runtime['gateway']['Image'] == GATEWAY, 'Imagem ativa divergente.')
    require(h.environment(runtime['core']['Config'].get('Env')).get('SELF_ACCOUNT_DELETION_ENABLED', '').lower() != 'true', 'Exclusão autônoma deveria permanecer desativada.')
    stage('core-gateway-compose')
    snapshots = {k: p.snapshot(h, runtime[k], k, 'ramo-nessa-staging') for k in ('core', 'gateway')}
    payloads = {k: read_web(package/('RamoNessa-Apps-'+k+'.zip'), k, p) for k in PACKAGES}
    core_meta, core_content = p.payload(package, 'core')
    stage('reuse-verified-core-image')
    p.verify_image_base(h, CORE, OLD_CORE)
    p.verify_image_files(h, CORE, core_meta['files'], '/app/')
    stage('database-schema-read-only')
    schema = p.schema_state(h, runtime['core'], sha(core_content['migrations/105_self_account_deletion.sql']))
    caddy_source = Path('/home/ubuntu/ramo-nessa-v5-3f3aad573667/deploy/staging/Caddyfile')
    stage('preserve-active-caddy')
    original_caddy = p.caddy_source_bytes(h, runtime['gateway'], caddy_source)
    require(sha(original_caddy) == p.CADDY_SHA and original_caddy.count(b'  @api path /v1/* /health /ready') == 1 and b'/excluir-conta' not in original_caddy, 'Caddyfile ativo divergente.')
    candidate_caddy = original_caddy.replace(b'  @api path /v1/* /health /ready', p.CADDY_ROUTE.encode()+b'  @api path /v1/* /health /ready', 1)
    anchor = ROOT/NAME
    release = RELEASES/NAME/'bundles'
    require(not anchor.exists() and not release.parent.exists(), 'Preparação já existe; preservar e conferir o estágio antes de repetir.')
    require(shutil.disk_usage(ROOT).free >= 2*1024**3, 'Espaço livre insuficiente.')
    anchor.mkdir(mode=0o700)
    h.DIRECTORY = anchor
    release.parent.mkdir(mode=0o755)
    release.parent.chmod(0o755)
    p.save(anchor/'phase.private.json', {'stage': 'web-copy', 'changesApplied': False})
    stage('stage-web-with-return-copy')
    before, after = stage_web(p, payloads, anchor, release)
    p.save(anchor/'Caddyfile.candidate', candidate_caddy)
    (anchor/'Caddyfile.candidate').chmod(0o644)
    stage('validate-caddy-with-unchanged-gateway-image')
    env = h.environment(runtime['gateway']['Config'].get('Env'))
    h.run(['docker','run','--rm','--pull=never','--network=none','--read-only','--env','APP_DOMAIN='+env.get('APP_DOMAIN','app.ramonessa.com.br'),'--env','ACME_EMAIL='+env.get('ACME_EMAIL',''),'--mount','type=bind,src='+str(anchor/'Caddyfile.candidate')+',dst=/etc/caddy/Caddyfile,readonly','--entrypoint','caddy',GATEWAY,'validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'], timeout=40)
    stage('private-return-configurations')
    files = {}
    for key, info in snapshots.items():
        for phase in ('before', 'after'):
            model = copy.deepcopy(info['model'])
            if phase == 'after':
                settings = model['services'][key]
                if key == 'core':
                    settings['image'] = CORE
                else:
                    for target, source in [('/srv/web', str(release)), ('/etc/caddy/Caddyfile', str(anchor/'Caddyfile.candidate'))]:
                        mount, = [m for m in settings['volumes'] if m['target'] == target and m.get('read_only')]
                        mount['source'] = source
            name = key+'-'+phase+'.private.json'
            files[name] = p.save(anchor/name, model)
            require(p.compose(h, info['project'], info['workdir'], anchor/name) == model, 'Plano Compose mudou após releitura.')
    files['105_self_account_deletion.sql'] = p.save(anchor/'105_self_account_deletion.sql', core_content['migrations/105_self_account_deletion.sql'])
    files['Caddyfile.candidate'] = sha(candidate_caddy)
    plan = {'schema': 1, 'source': SOURCE, 'baselineSha256': BASELINE, 'snapshots': snapshots, 'runtimeBefore': runtime, 'images': {'core': CORE, 'gateway': GATEWAY}, 'oldWeb': str(OLD_WEB), 'newWeb': str(release), 'beforeWebFiles': before, 'candidateWebFiles': after, 'schemaState': schema, 'files': files, 'siteTouched': False, 'selfAccountDeletionEnabled': False, 'activationImplemented': False}
    require(inventory.collect()['baselineSha256'] == BASELINE, 'Serviços mudaram durante a preparação.')
    digest = p.save(anchor/'plan.private.json', plan)
    p.save(anchor/'prepared.private.json', {'status': 'APPS_WITHOUT_SITE_PREPARED', 'planSha256': digest})
    return {'status': 'APPS_WITHOUT_SITE_PREPARED', 'source': SOURCE, 'anchor': str(anchor), 'planSha256': digest, 'changesApplied': False, 'servicesRestarted': False, 'databaseMigrationPerformed': False, 'siteTouched': False, 'selfAccountDeletionEnabled': False}


def main():
    require(os.geteuid() == 0 and sys.argv[1:] == ['prepare'], 'Uso: sudo python3 prepare.py prepare')
    os.umask(0o077)
    package = Path(__file__).resolve().parent
    p = module(package/'prepare-guard.py', 'aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393', 'apps_prepare_guard')
    inventory = module(package/'inspect-active.py', '034ec10182c0fef822a2854d88189e8db60de2dd97e81f65d65e700c26baddb7', 'apps_inventory')
    h = module(ROOT/'active-screen-lock-e2dfhu83/activate-lock-candidate.py', '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f', 'apps_runtime_guard')
    with (ROOT/'screen-lock-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for role, digest in PACKAGES.items():
            filename = 'RamoNessa-Apps-'+role+'.zip'
            download(package/filename, 'https://github.com/iansilva23/ramo-nessa/releases/download/apps-pending-'+SOURCE[:12]+'/'+filename, digest)
        filename, digest = p.PAYLOAD['core']
        cached = Path('/tmp/ramo-segunda-preparo.tkopra')/filename
        if cached.is_file() and not cached.is_symlink() and sha(cached.read_bytes()) == digest:
            shutil.copyfile(cached, package/filename)
        else:
            download(package/filename, 'https://github.com/iansilva23/ramo-nessa/releases/download/second-update-'+p.SOURCE[:12]+'/'+filename, digest)
        print(json.dumps(prepare(package, p, inventory, h), indent=2), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status':'APPS_WITHOUT_SITE_PREPARATION_STOPPED','stage':ACTIVE_STAGE,'changesApplied':False,'servicesRestarted':False,'databaseMigrationPerformed':False,'siteTouched':False}), flush=True)
        sys.exit('Preparação interrompida no estágio informado. Preserve os arquivos; não repita automaticamente.')
