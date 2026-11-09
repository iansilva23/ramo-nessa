#!/usr/bin/env python3
"""Stage, activate, or roll back the pinned route quote release."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import zipfile

sys.dont_write_bytecode = True
ROOT = Path('/opt/ramo-nessa-security')
SOURCE = '580be890da88c0aab544bb9f205336b9933eaac8'
NAME = 'route-quote-' + SOURCE[:12]
ANCHOR = ROOT / NAME
WEB = Path('/opt/ramo-nessa-web/releases') / NAME / 'bundles'
PRIVACY = ROOT / 'privacy-final-2925c1a15a20/activate-apps.py'
PRIVACY_SHA = '00ca992f5ba6525e923828089b90a7294e4d6f7d36d76151756db8c6e4dc26d1'
GUARD_SHA = 'aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393'
CORE_FILES = {'dist/src/server.js', 'dist/src/pricing/managed-operations.js',
              'dist/src/pricing/public-pricing-policy.js'}
ROLES = ('core', 'gateway')
SHELL = {'index.html', 'manifest.json', 'ramo_push_config.js', 'ramo_web_push.js',
         'ramo_push_worker.js', 'ramo_card_fields.js'}
STAGE = 'initialization'


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def stage(name):
    global STAGE
    STAGE = name
    print('Verificação: ' + name, flush=True)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def digest_ok(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def load(path, digest, module):
    require(path.is_file() and not path.is_symlink() and sha(path.read_bytes()) == digest,
            'Ferramenta fixada divergiu.')
    spec = importlib.util.spec_from_file_location(module, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def read_package(p, path, role, digest):
    require(digest_ok(digest) and path.is_file() and not path.is_symlink() and
            path.stat().st_size < 220 * 1024**2 and sha(path.read_bytes()) == digest,
            'Checksum do pacote divergiu: ' + role)
    with zipfile.ZipFile(path) as z:
        items = z.infolist()
        names = z.namelist()
        require(len(items) <= 2000 and len(names) == len(set(names)) and
                sum(i.file_size for i in items) < 220 * 1024**2 and
                all(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16) for i in items),
                'Pacote inválido.')
        meta = json.loads(z.read('manifest.json'))
        files = meta['files']
        require(meta['schema'] == 1 and meta['source'] == SOURCE and meta['component'] == role and
                set(names) == {'manifest.json', *(role + '/' + n for n in files)},
                'Manifesto não corresponde à publicação.')
        contents = {}
        for name, expected in files.items():
            p.relative(name)
            raw = z.read(role + '/' + name)
            require(sha(raw) == expected, 'Arquivo do pacote divergiu.')
            contents[name] = raw
    return meta, contents


def model_for(snapshot, role, candidate_core=None):
    model = copy.deepcopy(snapshot['model'])
    if candidate_core is None:
        return model
    service = model['services'][role]
    if role == 'core':
        service['image'] = candidate_core
    else:
        mount, = [m for m in service['volumes'] if m['target'] == '/srv/web']
        require(mount['type'] == 'bind' and mount.get('read_only'), 'Montagem Web inesperada.')
        mount['source'] = str(WEB)
    return model


def runtime_for(plan, role, candidate):
    expected = copy.deepcopy(plan['before'][role])
    if candidate and role == 'gateway':
        old = plan['oldWeb']
        mount, = [m for m in expected['Mounts'] if m['Destination'] == '/srv/web']
        require(mount['Source'] == old, 'Origem Web diferente da publicação verificada.')
        mount['Source'] = str(WEB)
        for m in expected['HostConfig'].get('Mounts') or []:
            if m.get('Target') == '/srv/web':
                m['Source'] = str(WEB)
        expected['HostConfig']['Binds'] = [
            str(WEB) + item[len(old):] if item.startswith(old + ':/srv/web:') else item
            for item in expected['HostConfig'].get('Binds') or []
        ]
    return expected


def compose_args(h, plan, role, phase):
    return ['docker', 'compose', '--project-directory', plan['snapshots'][role]['workdir'],
            '--project-name', h.PROJECT, '--env-file', '/dev/null', '-f',
            str(ANCHOR / f'{role}-{phase}.private.json')]


def current(h, plan, role, permit_missing=False):
    before = plan['before'][role]
    name = before['Name'].lstrip('/')
    ids = h.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$']).split()
    if not ids and permit_missing:
        return None, False
    require(len(ids) == 1, 'Serviço esperado não encontrado: ' + role)
    container = h.inspect(name)
    labels = container['Config']['Labels']
    config = labels.get('com.docker.compose.project.config_files')
    after = str(ANCHOR / f'{role}-after.private.json')
    require(labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == role and
            config in (plan['snapshots'][role]['configPath'],
                       str(ANCHOR / f'{role}-before.private.json'), after),
            'O serviço passou a pertencer a outra publicação: ' + role)
    candidate = config == after
    image = plan['coreCandidate'] if candidate and role == 'core' else before['Image']
    comparison = copy.deepcopy(container)
    comparison['State']['Running'] = True
    h.runtime_matches(runtime_for(plan, role, candidate), comparison, image, healthy=False)
    return container, candidate


def check_runtime(h, plan, candidate, original_ids=False):
    for role in ROLES:
        container, is_candidate = current(h, plan, role)
        require(is_candidate == candidate and container['State']['Running'] and
                container['State'].get('Health', {}).get('Status') == 'healthy',
                'Saúde ou fase divergente: ' + role)
        if original_ids:
            require(h.identity(container) == tuple(plan['identities'][role]),
                    'Serviço foi recriado desde o preparo: ' + role)
    for role, container in plan['other'].items():
        require(h.identity(h.inspect(container['Name'])) == tuple(plan['identities'][role]),
                'Outro serviço mudou durante a operação: ' + role)


def verify_assets(h, p, privacy, plan):
    for name, expected in plan['configs'].items():
        require(sha(h.private_file(ANCHOR / name)) == expected, 'Configuração preparada divergiu.')
    for role in ROLES:
        snapshot = plan['snapshots'][role]
        require(sha(h.private_file(Path(snapshot['configPath']))) == snapshot['configSha256'],
                'Configuração original divergiu.')
        for phase in ('before', 'after'):
            actual = json.loads(h.run(compose_args(h, plan, role, phase) + ['config', '--format', 'json']))
            require(actual == model_for(snapshot, role, plan['coreCandidate'] if phase == 'after' else None),
                    'Compose normalizado divergiu.')
    p.verify_image_base(h, plan['coreCandidate'], privacy.NEW_CORE)
    p.verify_image_files(h, plan['coreCandidate'], plan['coreHashes'], '/app/')
    require(privacy.tree(Path(plan['oldWeb'])) == plan['webBefore'] and
            privacy.tree(ANCHOR / 'before-web') == plan['webBefore'] and
            privacy.tree(WEB) == plan['webAfter'], 'Bundle ou retorno mudou.')
    caddy = plan['caddy']
    require(h.bound_hash(Path(caddy['path'])) == caddy['sha256'], 'Caddyfile mudou.')


def probe(h, plan, candidate, availability_only=False):
    files = plan['webAfter'] if candidate else plan['webBefore']
    hashes = {f'/{route}/{name}': files[role + '/' + name]['sha256']
              for role, route in [('driver', 'motorista'), ('passenger', 'passageiro')]
              for name in ('index.html', 'main.dart.js', 'ramo_push_config.js')}
    script = '''
import {createHash} from 'node:crypto';
const [base, mode, hashes] = JSON.parse(process.argv[1]);
async function get(path, status=200) {
  const r=await fetch(base+path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(r.status!==status)throw Error('HTTP probe failed: '+path);
  return r;
}
if(mode!=='only-policy') {
  await (await get('/ready')).arrayBuffer();
  for(const [path,digest] of Object.entries(hashes)){
    const r=await get(path+'?routeQuote='+Date.now());
    if(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')!==digest)
      throw Error('Web hash mismatch: '+path);
  }
  await (await get('/v1/me/account-deletion',401)).arrayBuffer();
  if(!(await (await get('/excluir-conta')).text()).includes('Excluir minha conta'))throw Error('Deletion page failed');
}
if(mode!=='baseline'){
  const policy=await (await get('/v1/pricing/policy')).json();
  if(policy.managementMode!=='managed')throw Error('Managed pricing not active');
  const regions=policy.regions?.map(r=>r.id);
  const origin=regions?.includes('jericoacoara')?'jericoacoara':regions?.[0];
  if(typeof origin!=='string')throw Error('Managed regions missing');
  const params=new URLSearchParams({originRegionId:origin,destinationRegionId:origin});
  const availability=await (await get('/v1/pricing/policy?'+params)).json();
  if(!Array.isArray(availability.availableRouteCategories)||
      availability.availableRouteCategories.some(c=>!policy.enabledCategories.includes(c)))throw Error('Availability missing');
  await (await get('/v1/pricing/policy?originRegionId='+encodeURIComponent(origin),400)).arrayBuffer();
}
'''
    mode = 'only-policy' if availability_only else 'candidate' if candidate else 'baseline'
    h.run(['docker', 'exec', plan['before']['core']['Name'], 'node', '--input-type=module',
           '-e', script, json.dumps(['https://app.ramonessa.com.br', mode, hashes])], timeout=165)


def prepare(h, p, privacy, core, passenger, core_sha, passenger_sha):
    stage('verify-previous-release-and-packages')
    old = privacy.read_plan(h)
    record = privacy.state(h)
    require(record and record['phase'] == 'completed', 'A publicação-base não foi confirmada.')
    privacy.files_intact(h, old)
    before = privacy.runtime_intact(h, old, True)
    require({r: c['Id'] for r, c in before.items()} == record['afterIds'],
            'Core ou gateway recriado depois da publicação-base.')
    snapshots = {r: p.snapshot(h, before[r], r, h.PROJECT) for r in ROLES}
    core_meta, core_bytes = read_package(p, core, 'core', core_sha)
    web_meta, web_bytes = read_package(p, passenger, 'passenger', passenger_sha)
    require(set(core_bytes) == set(core_meta['baseline']) == CORE_FILES and
            core_meta['baselineSource'] == privacy.SOURCE, 'Overlay do Core fora do escopo.')
    require(web_meta['basePath'] == '/passageiro/' and
            SHELL | {'main.dart.js', 'flutter_bootstrap.js'} <= set(web_bytes),
            'Bundle do Passageiro incompleto.')
    old_web = Path(privacy.NEW_WEB)
    for name in SHELL:
        require((old_web / 'passenger' / name).read_bytes() == web_bytes[name],
                'Shell ativo diverge do candidato: ' + name)
    p.verify_image_files(h, privacy.NEW_CORE, core_meta['baseline'], '/app/')
    require(not ANCHOR.exists() and not WEB.parent.exists(), 'Preparo já existe. Consulte a âncora.')
    require(shutil.disk_usage(ROOT).free >= 2 * 1024**3, 'Espaço insuficiente.')
    ANCHOR.mkdir(mode=0o700)
    h.DIRECTORY = ANCHOR
    stage('build-offline-core-overlay')
    build = ANCHOR / 'build-core'
    build.mkdir()
    p.extract(core_bytes, build / 'payload')
    image = p.derive_image(h, privacy.NEW_CORE, NAME + '-core', build, [('payload/', '/app/')])
    p.verify_image_files(h, image, core_meta['files'], '/app/')
    for name in sorted(CORE_FILES):
        h.run(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only',
               '--entrypoint', 'node', image, '--check', '/app/' + name], timeout=60)

    stage('stage-passenger-and-rollback')
    web_before = privacy.tree(old_web)
    shutil.copytree(old_web, ANCHOR / 'before-web')
    WEB.parent.mkdir(mode=0o755)
    WEB.parent.chmod(0o755)
    shutil.copytree(old_web, WEB)
    p.extract(web_bytes, WEB / 'passenger')
    web_after = {**web_before, **{
        'passenger/' + name: {'sha256': sha(raw), 'bytes': len(raw)}
        for name, raw in web_bytes.items()
    }}
    configs = {}
    for role in ROLES:
        for phase in ('before', 'after'):
            name = f'{role}-{phase}.private.json'
            configs[name] = p.save(ANCHOR / name, model_for(snapshots[role], role, image if phase == 'after' else None))
    other = {role: c for role, c in old['runtimeBefore'].items() if role not in ROLES}
    site = h.inspect('ramo-nessa-site-institutional-site-1')
    other['institutional-site'] = site
    caddy, = [m for m in before['gateway']['Mounts'] if m['Destination'] == '/etc/caddy/Caddyfile']
    plan = {'source': SOURCE, 'before': before, 'other': other, 'snapshots': snapshots,
            'identities': {r: h.identity(c) for r, c in {**before, **other}.items()},
            'coreCandidate': image, 'coreHashes': core_meta['files'], 'oldWeb': str(old_web),
            'webBefore': web_before, 'webAfter': web_after, 'configs': configs,
            'caddy': {'path': caddy['Source'], 'sha256': h.bound_hash(Path(caddy['Source']))}}
    verify_assets(h, p, privacy, plan)
    check_runtime(h, plan, False, original_ids=True)
    digest = p.save(ANCHOR / 'plan.private.json', plan)
    print(json.dumps({'status': 'PASSENGER_ROUTE_QUOTE_PREPARED', 'planSha256': digest,
                      'anchor': str(ANCHOR), 'candidateCore': image, 'servicesRestarted': False}), flush=True)


def journal(phase):
    tmp = ANCHOR / 'activation.incomplete'
    with tmp.open('w') as out:
        json.dump({'phase': phase, 'source': SOURCE}, out)
        out.flush()
        os.fsync(out.fileno())
    os.replace(tmp, ANCHOR / 'activation.private.json')


def up(h, plan, role, phase):
    h.run(compose_args(h, plan, role, phase) + [
        'up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate',
        '--wait', '--wait-timeout', '90', role,
    ], timeout=125)


def rollback(h, plan):
    stage('restore-previous-services')
    # Resolve ownership of both services before touching either one.
    found = {role: current(h, plan, role, permit_missing=True) for role in ROLES}
    journal('restoring')
    for role in ('gateway', 'core'):
        container, candidate = found[role]
        if candidate or container is None or not container['State']['Running']:
            up(h, plan, role, 'before')
    check_runtime(h, plan, False)
    probe(h, plan, False)
    journal('rolled-back')


def activate(h, p, privacy, plan):
    stage('verify-confirmed-plan-and-live-base')
    require(not (ANCHOR / 'activation.private.json').exists(), 'Operação já iniciada. Consulte a âncora.')
    verify_assets(h, p, privacy, plan)
    check_runtime(h, plan, False, original_ids=True)
    probe(h, plan, False)
    check_runtime(h, plan, False, original_ids=True)
    h.inactive()
    journal('switching-core')
    try:
        stage('activate-core-and-probe-availability')
        up(h, plan, 'core', 'after')
        core, candidate = current(h, plan, 'core')
        require(candidate and core['State'].get('Health', {}).get('Status') == 'healthy',
                'Saúde do novo Core não confirmada.')
        probe(h, plan, True, availability_only=True)
        journal('switching-gateway')
        stage('activate-passenger-web')
        up(h, plan, 'gateway', 'after')
        stage('verify-public-web-and-core')
        check_runtime(h, plan, True)
        probe(h, plan, True)
        journal('completed')
    except BaseException:
        failed = STAGE
        try:
            rollback(h, plan)
        except BaseException:
            journal('requires-review')
            print(json.dumps({'status': 'PASSENGER_ROUTE_QUOTE_REVIEW_REQUIRED', 'failedStage': failed}))
            raise
        print(json.dumps({'status': 'PASSENGER_ROUTE_QUOTE_ROLLED_BACK', 'failedStage': failed}))
        raise
    print(json.dumps({'status': 'PASSENGER_ROUTE_QUOTE_ACTIVATED', 'source': SOURCE,
                      'coreImage': plan['coreCandidate'], 'anchor': str(ANCHOR),
                      'databaseMigrationPerformed': False, 'databaseRestorePerformed': False,
                      'siteTouched': False, 'tripReproductionPerformed': False}), flush=True)


def main():
    require(os.geteuid() == 0 and len(sys.argv) >= 3, 'Execução operacional inválida.')
    os.umask(0o077)
    _, action, guard, *args = sys.argv
    privacy = load(PRIVACY, PRIVACY_SHA, 'privacy_baseline')
    p = load(Path(guard), GUARD_SHA, 'overlay_guard')
    h = privacy.load_guard()
    with (ROOT / 'screen-lock-activation.lock').open('r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'prepare' and len(args) == 4:
            core, passenger, core_sha, passenger_sha = args
            prepare(h, p, privacy, Path(core), Path(passenger), core_sha, passenger_sha)
            return
        require(action in ('activate', 'rollback') and len(args) == 1 and digest_ok(args[0]),
                'Forneça o hash do plano preparado.')
        h.DIRECTORY = ANCHOR
        info = ANCHOR.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o077 and
                ANCHOR.resolve() == ANCHOR, 'Âncora inválida.')
        raw = h.private_file(ANCHOR / 'plan.private.json')
        require(sha(raw) == args[0], 'Plano difere do hash informado.')
        plan = json.loads(raw)
        require(plan['source'] == SOURCE, 'Plano de outra publicação.')
        if action == 'activate':
            activate(h, p, privacy, plan)
        else:
            verify_assets(h, p, privacy, plan)
            require((ANCHOR / 'activation.private.json').is_file(), 'Nenhuma operação para reverter.')
            if current(h, plan, 'core', permit_missing=True)[0] is not None:
                h.inactive()
            rollback(h, plan)
            print(json.dumps({'status': 'PASSENGER_ROUTE_QUOTE_ROLLED_BACK'}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print(json.dumps({'status': 'PASSENGER_ROUTE_QUOTE_STOPPED', 'stage': STAGE}), flush=True)
        sys.exit('Operação interrompida. Preserve a âncora e não repita automaticamente.')
