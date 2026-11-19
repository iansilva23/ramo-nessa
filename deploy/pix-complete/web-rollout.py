#!/usr/bin/env python3
"""Apply only the pinned Passenger Web bundle, preserving the observed runtime."""
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import types
import zipfile

sys.dont_write_bytecode = True
ROOT = Path('/opt/ramo-nessa-security')
SOURCE = 'b06e61c8db8e65116d9a2d80176d6517c1215826'
TEST_RUN = 44581253782
NAME = 'pix-complete-web-' + SOURCE[:12]
ANCHOR = ROOT / NAME
WEB = Path('/opt/ramo-nessa-web/releases') / NAME / 'bundles'
OLD_WEB = Path('/opt/ramo-nessa-web/releases/pix-premium-db71dbd92a68/bundles')
PREVIOUS = ROOT / 'pix-premium-db71dbd92a68'
PREVIOUS_PLAN_SHA = 'ff6d0e1c654c96493f7c51c20b036f46ffe8a70a5d8f5d2efb449566c554960e'
CORE_ANCHOR = ROOT / ('pix-complete-core-' + SOURCE[:12])
CORE_BASE = 'sha256:a9124171ca1beecee2aca4ed17d184e82c762a1b344023c006d5d1077b21fdfa'
OLD_CONFIG = PREVIOUS / 'gateway-after.private.json'
CONFIG_SHA = None  # Set only from the exact completed previous plan.
CADDY_PATH = '/opt/ramo-nessa-security/apps-pending-9eb6aa071db4/Caddyfile.candidate'
CADDY_SHA = 'df3f304e8ae067e85d9ca66cc96b7941a72dc52119df72424f1426cb0cc37d73'
PACKAGE_SHA = '09b57fccb92c1bb0a5a6720fae4ec75a94298aae08e9cccfc7b939ed8ea49003'
BASE_IDS = {
    'core': None,
    'gateway': None,
    'postgres': '7e2682f5dc69be0c6386c77880f93a65a4681b726b72abeba987295acbecd978',
    'google-maps-mock': 'ec2402d83c48b9668dbcaa30feb018d7487d111f5d23c2133ab056725c6379d9',
}
CORE_IMAGE = None
GATEWAY_IMAGE = 'sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
BASE_JS = {'driver': '7d6e200bd70d6a656c70f10e2c2ba92b3700ff68af549591b78c9e6485076b02',
           'passenger': '521afb620ce9b4424d81d5bcfeffd55ef4321fdecdede2df70b92559743e1564'}
PRIVACY = ROOT / 'privacy-final-2925c1a15a20/activate-apps.py'
PRIVACY_SHA = '00ca992f5ba6525e923828089b90a7294e4d6f7d36d76151756db8c6e4dc26d1'
GUARD_SHA = 'aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393'
SHELL = {'index.html', 'manifest.json', 'ramo_push_config.js', 'ramo_web_push.js',
         'ramo_push_worker.js', 'ramo_card_fields.js'}
CORE_FILES = {'matching/in-memory-ride-matching-repository.js': '2b1ddbaf2e8a202f75b5e5e97fd0ca349d8d7351d7f1d03288220330fd644ef7', 'matching/in-memory-ride-matching-repository.js.map': '66ba486a3408489bbd5bba2e1f567a936c5cd7345f9fd845870dea5493a13c9c', 'matching/postgres-ride-matching-repository.js': '6eac5376d415f166fec68c108b65109f21b2f8aa0a387a3b641e9d96d966f4fc', 'matching/postgres-ride-matching-repository.js.map': 'b385bf464b6c226cb1b54a52f421786caa0937d88531e076876a30fb9e50090e'}
STAGE = 'initialization'


class RolloutError(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise RolloutError(message)


def stage(name):
    global STAGE
    STAGE = name
    print('Verificação: ' + name, flush=True)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def module(path, expected, name):
    require(path.is_file() and not path.is_symlink(), 'Ferramenta ausente.')
    raw = path.read_bytes()
    require(sha(raw) == expected, 'Checksum de ferramenta divergente.')
    result = types.ModuleType(name)
    result.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), result.__dict__)
    return result


def package(p, path):
    require(path.is_file() and not path.is_symlink() and
            path.stat().st_size < 220 * 1024**2 and sha(path.read_bytes()) == PACKAGE_SHA,
            'Pacote diferente do download confirmado.')
    with zipfile.ZipFile(path) as z:
        items = z.infolist()
        require(len(items) <= 2000 and len(items) == len(set(z.namelist())) and
                sum(i.file_size for i in items) < 220 * 1024**2 and
                all(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16) for i in items),
                'Estrutura do pacote inválida.')
        meta = json.loads(z.read('BUILD-INFO.json'))
        require(meta['source'] == SOURCE and meta['role'] == 'passenger' and
                meta['testsRun'] == TEST_RUN and meta['api'] == 'https://app.ramonessa.com.br',
                'Fonte do pacote divergente.')
        content = {}
        for name in z.namelist():
            if name == 'BUILD-INFO.json':
                continue
            require(name.startswith('passenger/'), 'Componente inesperado no pacote.')
            relative = name[len('passenger/'):]
            p.relative(relative)
            content[relative] = z.read(name)
        require(SHELL | {'main.dart.js', 'flutter_bootstrap.js'} <= content.keys() and
                sha(content['main.dart.js']) == meta['mainSha256'], 'Bundle incompleto.')
        return content


def model(snapshot, candidate):
    result = copy.deepcopy(snapshot['model'])
    require(set(result['services']) == {'gateway'}, 'Escopo Compose inválido.')
    service = result['services']['gateway']
    require(service['image'] == GATEWAY_IMAGE, 'Imagem do gateway divergente.')
    mounts = [m for m in service['volumes'] if m['target'] == '/srv/web']
    require(len(mounts) == 1 and mounts[0]['type'] == 'bind' and
            mounts[0].get('read_only') and mounts[0]['source'] == str(OLD_WEB),
            'Montagem Web divergente.')
    if candidate:
        mounts[0]['source'] = str(WEB)
    return result


def expected_gateway(plan, candidate):
    result = copy.deepcopy(plan['before'])
    if candidate:
        mount, = [m for m in result['Mounts'] if m['Destination'] == '/srv/web']
        require(mount['Source'] == str(OLD_WEB), 'Origem Web diferente da base.')
        mount['Source'] = str(WEB)
        for m in result['HostConfig'].get('Mounts') or []:
            if m.get('Target') == '/srv/web':
                m['Source'] = str(WEB)
        result['HostConfig']['Binds'] = [
            str(WEB) + item[len(str(OLD_WEB)):] if item.startswith(str(OLD_WEB) + ':/srv/web:') else item
            for item in result['HostConfig'].get('Binds') or []]
    return result


def compose(h, plan, phase):
    return ['docker', 'compose', '--project-directory', plan['snapshot']['workdir'],
            '--project-name', h.PROJECT, '--env-file', '/dev/null', '-f',
            str(ANCHOR / ('gateway-' + phase + '.private.json'))]


def current(h, plan, missing=False):
    name = plan['before']['Name'].lstrip('/')
    ids = h.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$']).split()
    if not ids and missing:
        return None, False
    require(len(ids) == 1, 'Gateway não identificado.')
    c = h.inspect(name)
    labels = c['Config']['Labels']
    path = labels.get('com.docker.compose.project.config_files')
    after = str(ANCHOR / 'gateway-after.private.json')
    require(labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == 'gateway' and
            path in (plan['snapshot']['configPath'], str(ANCHOR / 'gateway-before.private.json'), after),
            'Gateway pertence a outra operação; não será substituído.')
    candidate = path == after
    comparable = copy.deepcopy(c)
    comparable['State']['Running'] = True
    h.runtime_matches(expected_gateway(plan, candidate), comparable, GATEWAY_IMAGE, healthy=False)
    return c, candidate


def runtime(h, plan, candidate, original=False):
    c, actual = current(h, plan)
    require(actual == candidate and c['State']['Running'] and
            c['State'].get('Health', {}).get('Status') == 'healthy', 'Saúde do gateway não confirmada.')
    if original:
        require(c['Id'] == BASE_IDS['gateway'], 'Gateway recriado desde o inventário.')
    for name, before in plan['other'].items():
        after = h.inspect(before['Name'])
        require(h.identity(after) == tuple(plan['identities'][name]) and
                after['State']['Running'] == before['State']['Running'] and
                after['State'].get('Health', {}).get('Status') == before['State'].get('Health', {}).get('Status'),
                'Outro serviço mudou durante a atualização.')


def assets(h, p, plan, candidate=True):
    for name, expected in plan['configs'].items():
        require(sha(h.private_file(ANCHOR / name)) == expected, 'Configuração preparada mudou.')
    require(sha(h.private_file(OLD_CONFIG)) == CONFIG_SHA, 'Compose original mudou.')
    for phase in ('before', 'after'):
        actual = json.loads(h.run(compose(h, plan, phase) + ['config', '--format', 'json']))
        require(actual == model(plan['snapshot'], phase == 'after'), 'Compose normalizado divergiu.')
    require(p.tree(OLD_WEB) == plan['webBefore'] and
            p.tree(ANCHOR / 'before-web') == plan['webBefore'], 'Base ou cópia de retorno mudou.')
    if candidate:
        require(p.tree(WEB) == plan['webAfter'], 'Bundle candidato mudou.')
    require(h.bound_hash(Path(CADDY_PATH)) == CADDY_SHA, 'Caddyfile mudou.')


def probe(h, plan, candidate):
    files = plan['webAfter'] if candidate else plan['webBefore']
    hashes = {'/' + route + '/' + name: files[role + '/' + name]['sha256']
              for role, route in [('driver', 'motorista'), ('passenger', 'passageiro')]
              for name in ('index.html', 'main.dart.js', 'ramo_push_config.js')}
    script = """
import {createHash} from 'node:crypto';
const hashes=JSON.parse(process.argv[1]);
for(const [path,digest] of Object.entries({'/ready':null,...hashes})){
  const r=await fetch('https://app.ramonessa.com.br'+path+'?pixCheckout='+Date.now(),
    {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(r.status!==200)throw Error('Public probe HTTP');
  const bytes=Buffer.from(await r.arrayBuffer());
  if(digest&&createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('Public probe hash');
}
"""
    core = plan['other']['core']['Name']
    h.run(['docker', 'exec', core, 'node', '--input-type=module', '-e', script, json.dumps(hashes)], timeout=110)


def journal(phase):
    target = ANCHOR / 'activation.private.json'
    tmp = ANCHOR / 'activation.incomplete'
    with tmp.open('w') as f:
        json.dump({'phase': phase, 'source': SOURCE, 'stage': STAGE}, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, target)


def up(h, plan, phase):
    h.run(compose(h, plan, phase) + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never',
          '--force-recreate', '--wait', '--wait-timeout', '90', 'gateway'], timeout=125)


def rollback(h, p, plan):
    stage('verify-return-copy-and-operation-ownership')
    assets(h, p, plan, candidate=False)
    c, candidate = current(h, plan, missing=True)
    journal('restoring')
    if c is None or candidate or not c['State']['Running']:
        up(h, plan, 'before')
    runtime(h, plan, False)
    probe(h, plan, False)
    journal('rolled-back')


def activate(h, p, plan):
    stage('verify-plan-and-live-base')
    require(not (ANCHOR / 'activation.private.json').exists(), 'Operação já iniciada; não repetir.')
    assets(h, p, plan)
    runtime(h, plan, False, original=True)
    probe(h, plan, False)
    runtime(h, plan, False, original=True)
    journal('switching')
    try:
        stage('activate-passenger-web-only')
        up(h, plan, 'after')
        stage('verify-public-bundles-and-preserved-services')
        runtime(h, plan, True)
        probe(h, plan, True)
        journal('completed')
    except BaseException:
        failed = STAGE
        try:
            rollback(h, p, plan)
        except BaseException:
            journal('requires-review')
            print(json.dumps({'status': 'PIX_WEB_REVIEW_REQUIRED', 'failedStage': failed}))
            raise
        print(json.dumps({'status': 'PIX_WEB_ROLLED_BACK', 'failedStage': failed}))
        raise
    print(json.dumps({'status': 'PIX_WEB_ACTIVATED', 'source': SOURCE, 'anchor': str(ANCHOR),
                      'onlyGatewayRecreated': True, 'coreImage': CORE_IMAGE,
                      'gatewayImage': GATEWAY_IMAGE, 'databaseMigrationPerformed': False,
                      'databaseRestorePerformed': False, 'driverBundleChanged': False,
                      'siteTouched': False, 'rollbackPrepared': True,
                      'devicePaymentValidationPerformed': False}), flush=True)


def prepare(h, p, package_path, diagnostic):
    stage('verify-confirmed-inventory-and-package')
    web_bytes = package(p, package_path)
    all_services = {r: h.inspect('ramo-nessa-staging-' + r + '-1') for r in BASE_IDS}
    for role, c in all_services.items():
        require(c['Id'] == BASE_IDS[role] and c['State']['Running'] and
                c['State'].get('Health', {}).get('Status') == 'healthy', 'Base ativa mudou: ' + role)
    require(all_services['core']['Image'] == CORE_IMAGE and
            all_services['gateway']['Image'] == GATEWAY_IMAGE, 'Imagem ativa diferente do inventário.')
    gateway = all_services.pop('gateway')
    all_services['institutional-site'] = h.inspect('ramo-nessa-site-institutional-site-1')
    require(gateway['Config']['Labels']['com.docker.compose.project.config_files'] == str(OLD_CONFIG)
            and sha(h.private_file(OLD_CONFIG)) == CONFIG_SHA, 'Compose ativo mudou.')
    mount, = [m for m in gateway['Mounts'] if m['Destination'] == '/srv/web']
    caddy, = [m for m in gateway['Mounts'] if m['Destination'] == '/etc/caddy/Caddyfile']
    require(mount['Type'] == 'bind' and not mount['RW'] and mount['Source'] == str(OLD_WEB)
            and caddy['Source'] == CADDY_PATH and not caddy['RW']
            and h.bound_hash(Path(CADDY_PATH)) == CADDY_SHA, 'Montagens ativas mudaram.')
    require(sha(h.run(['docker', 'exec', gateway['Name'], 'cat', '/etc/caddy/Caddyfile'])) == CADDY_SHA,
            'Caddyfile montado diverge do host.')
    snapshot = p.snapshot(h, gateway, 'gateway', h.PROJECT)
    before = p.tree(OLD_WEB)
    for app, digest in BASE_JS.items():
        require(before[app + '/main.dart.js']['sha256'] == digest, 'Bundle ativo mudou.')
    for name in SHELL:
        require((OLD_WEB / 'passenger' / name).read_bytes() == web_bytes[name],
                'Configuração Web/Maps/push mudou: ' + name)
    require(shutil.disk_usage(ROOT).free >= 1024**3, 'Espaço insuficiente.')
    require(not ANCHOR.exists() and not WEB.parent.exists(), 'Preparo já existe; consulte a âncora.')
    os.rename(diagnostic, ANCHOR)
    h.DIRECTORY = ANCHOR
    stage('prepare-web-copy-and-return-configurations')
    shutil.copytree(OLD_WEB, ANCHOR / 'before-web')
    WEB.parent.mkdir(mode=0o755)
    WEB.parent.chmod(0o755)
    shutil.copytree(OLD_WEB, WEB)
    p.extract(web_bytes, WEB / 'passenger')
    after = {**before, **{'passenger/' + k: {'sha256': sha(v), 'bytes': len(v)}
                         for k, v in web_bytes.items()}}
    configs = {}
    for phase in ('before', 'after'):
        name = 'gateway-' + phase + '.private.json'
        configs[name] = p.save(ANCHOR / name, model(snapshot, phase == 'after'))
    plan = {'source': SOURCE, 'before': gateway, 'snapshot': snapshot, 'other': all_services,
            'identities': {r: h.identity(c) for r, c in all_services.items()},
            'webBefore': before, 'webAfter': after, 'configs': configs}
    assets(h, p, plan)
    runtime(h, plan, False, original=True)
    digest = p.save(ANCHOR / 'plan.private.json', plan)
    print(json.dumps({'status': 'PIX_WEB_PREPARED', 'anchor': str(ANCHOR), 'planSha256': digest,
                      'changesApplied': False, 'servicesRestarted': False}), flush=True)
    return plan



def configure_confirmed_previous(h, p, active):
    global CONFIG_SHA
    stage('verify-completed-pix-rollout')
    raw = h.private_file(PREVIOUS / 'plan.private.json')
    require(sha(raw) == PREVIOUS_PLAN_SHA, 'Plano Pix anterior divergente.')
    previous = json.loads(raw)
    require(previous['source'] == 'db71dbd92a6840d48cc5b3ce31dd9ac2016250ad',
            'Fonte Pix anterior divergente.')
    state = json.loads(h.private_file(PREVIOUS / 'activation.private.json'))
    require(state['phase'] == 'completed' and state['source'] == previous['source'],
            'Ativação Pix anterior não concluída.')
    CONFIG_SHA = previous['configs']['gateway-after.private.json']
    require(sha(h.private_file(OLD_CONFIG)) == CONFIG_SHA, 'Compose Pix anterior mudou.')
    require(p.tree(OLD_WEB) == previous['webAfter'], 'Web Pix anterior mudou.')
    if active:
        gateway = h.inspect('ramo-nessa-staging-gateway-1')
        expected = copy.deepcopy(previous['before'])
        old_mount, = [m for m in expected['Mounts'] if m['Destination'] == '/srv/web']
        original = old_mount['Source']
        old_mount['Source'] = str(OLD_WEB)
        for mount in expected['HostConfig'].get('Mounts') or []:
            if mount.get('Target') == '/srv/web':
                mount['Source'] = str(OLD_WEB)
        expected['HostConfig']['Binds'] = [
            str(OLD_WEB) + bind[len(original):] if bind.startswith(original + ':/srv/web:') else bind
            for bind in expected['HostConfig'].get('Binds') or []]
        h.runtime_matches(expected, gateway, GATEWAY_IMAGE)
        for role, identity in previous['identities'].items():
            if role == 'core':
                continue  # Verified separately against the new Core plan.
            observed = h.inspect(previous['other'][role]['Name'])
            require(h.identity(observed) == tuple(identity), 'Serviço mudou desde o Pix: ' + role)
        BASE_IDS['gateway'] = gateway['Id']



def configure_new_core(h, p, digest):
    global CORE_IMAGE
    stage('verify-completed-current-flow-core')
    require(re.fullmatch('[0-9a-f]{64}', digest) is not None, 'Hash do plano Core obrigatório.')
    raw = h.private_file(CORE_ANCHOR / 'plan.private.json')
    require(sha(raw) == digest, 'Plano Core difere do preparo executado.')
    plan = json.loads(raw)
    state = json.loads(h.private_file(CORE_ANCHOR / 'activation.private.json'))
    require(plan['source'] == SOURCE and state['source'] == SOURCE and state['phase'] == 'completed',
            'Core corrigido não foi ativado.')
    CORE_IMAGE = plan['candidate']
    p.verify_image_base(h, CORE_IMAGE, CORE_BASE)
    p.verify_image_files(h, CORE_IMAGE, CORE_FILES, '/app/dist/src/')
    core = h.inspect('ramo-nessa-staging-core-1')
    config = CORE_ANCHOR / 'core-after.private.json'
    require(core['Config']['Labels'].get('com.docker.compose.project.config_files') == str(config)
            and sha(h.private_file(config)) == plan['configs']['core-after.private.json'],
            'Configuração do Core corrigido divergiu.')
    h.runtime_matches(plan['before'], core, CORE_IMAGE)
    BASE_IDS['core'] = core['Id']


def main():
    require(os.geteuid() == 0 and len(sys.argv) == 5 and sys.argv[1] in ('apply', 'rollback'),
            'Uso: apply GUARD PACOTE HASH_PLANO_CORE ou rollback GUARD HASH_PLANO_WEB HASH_PLANO_CORE')
    os.umask(0o077)
    info = ROOT.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022
            and ROOT.resolve() == ROOT, 'Diretório operacional inválido.')
    privacy = module(PRIVACY, PRIVACY_SHA, 'pix_privacy_guard_loader')
    p = module(Path(sys.argv[2]), GUARD_SHA, 'pix_overlay_guard')
    h = privacy.load_guard()
    require(h.PROJECT == 'ramo-nessa-staging', 'Projeto inesperado.')
    lock_path = ROOT / 'screen-lock-activation.lock'
    descriptor = os.open(lock_path, os.O_RDWR | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'r+') as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'Lock operacional inválido.')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        h.DIRECTORY = Path(tempfile.mkdtemp(prefix='pix-premium-base-', dir=ROOT))
        configure_new_core(h, p, sys.argv[4])
        configure_confirmed_previous(h, p, active=sys.argv[1] == 'apply')
        if sys.argv[1] == 'apply':
            require(not ANCHOR.exists(), 'Operação já preparada/iniciada; não repetir.')
            diagnostic = Path(tempfile.mkdtemp(prefix='pix-checkout-preflight-', dir=ROOT))
            h.DIRECTORY = diagnostic
            plan = prepare(h, p, Path(sys.argv[3]), diagnostic)
            activate(h, p, plan)
        else:
            require(re.fullmatch('[0-9a-f]{64}', sys.argv[3]) is not None, 'Hash do plano obrigatório.')
            info = ANCHOR.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                    not info.st_mode & 0o077 and ANCHOR.resolve() == ANCHOR, 'Âncora inválida.')
            h.DIRECTORY = ANCHOR
            raw = h.private_file(ANCHOR / 'plan.private.json')
            require(sha(raw) == sys.argv[3], 'Plano difere do hash preparado.')
            plan = json.loads(raw)
            require(plan['source'] == SOURCE and (ANCHOR / 'activation.private.json').is_file(),
                    'Operação não identificada.')
            rollback(h, p, plan)
            print(json.dumps({'status': 'PIX_WEB_ROLLED_BACK', 'databaseRestorePerformed': False}))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'status': 'PIX_WEB_STOPPED', 'stage': STAGE,
                          'reason': str(error) if isinstance(error, RolloutError) else None,
                          'errorType': type(error).__name__}), flush=True)
        sys.exit('Operação interrompida. Preserve a âncora e envie a saída; não repetir automaticamente.')
