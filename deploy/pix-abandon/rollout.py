#!/usr/bin/env python3
"""Only replace the three verified Core modules; keep Web and data unchanged."""
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

sys.dont_write_bytecode = True
ROOT = Path('/opt/ramo-nessa-security')
SOURCE = 'c59c341bbf06cda2baddf13ba14822dd42fcf6ad'
ANCHOR = ROOT / ('pix-abandon-' + SOURCE[:12])
BASE = 'sha256:8f1603337ce42d08e04f170dc436aac8f500cb6bfb0e8ce4b97692cde0102d67'
CORE_ID = '339a18ed1a7e2ca8f019402f4e965a30b74f128285775a145795fd3d361178a3'
CONFIG = ROOT / 'route-quote-580be890da88/core-after.private.json'
CONFIG_SHA = 'fa43a22ff9d85d3285e5d9ddb73b26c13f4f372edce73ff64b8fd865dfbe4819'
PREVIOUS = ROOT / 'pix-premium-db71dbd92a68'
PREVIOUS_PLAN = 'ff6d0e1c654c96493f7c51c20b036f46ffe8a70a5d8f5d2efb449566c554960e'
WEB = Path('/opt/ramo-nessa-web/releases/pix-premium-db71dbd92a68/bundles')
PRIVACY = ROOT / 'privacy-final-2925c1a15a20/activate-apps.py'
PRIVACY_SHA = '00ca992f5ba6525e923828089b90a7294e4d6f7d36d76151756db8c6e4dc26d1'
GUARD_SHA = 'aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393'
BEFORE = {
    'server.js': 'd80db9f5b7cdd838386a6dcbd68fc9285b2c5266e702870c4b2c88df33b2226d',
    'matching/in-memory-ride-matching-repository.js': '7c3371777bfa2c1df14fcdbb3106481171852a836ed868cdca9284d9de7d1905',
    'matching/postgres-ride-matching-repository.js': 'adf04b51f61337e1de7350227ce0e936b3f4d443283e30883d750ea81cc2fa80',
}
AFTER = {
    'server.js': '2d8151cd3d9a8e9286642b9b8606465695e801a248c07cb74fc8ac5bea02124d',
    'matching/in-memory-ride-matching-repository.js': 'b1788034e78f7dab03438f8eea6f0d0d5cf1cce81f018704e85745fc40f8afea',
    'matching/postgres-ride-matching-repository.js': '9f837d43c0692565fb4dc4b614cfa5d74cdb90648536397fc3fbb2c1a8f01b24',
    'server.js.map': 'cede244ba5c357ef7016bae6d59cf95a9d3ecb7864038efa45b055cbfe3fa9e7',
    'matching/in-memory-ride-matching-repository.js.map': 'fd9d2242c798f5f4552ea22817c5b0fe755510938ec2842703650f84c76e7469',
    'matching/postgres-ride-matching-repository.js.map': '9cf74f1b122f407aa531b7940544d19f465b80c7935bfadc78aa3b8f39879c65',
}
STAGE = 'initialization'


class RolloutError(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise RolloutError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def stage(name):
    global STAGE
    STAGE = name
    print('Verificação: ' + name, flush=True)


def module(path, digest, name):
    require(path.is_file() and not path.is_symlink(), 'Guard ausente.')
    raw = path.read_bytes()
    require(sha(raw) == digest, 'Checksum do guard divergente.')
    result = types.ModuleType(name)
    result.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), result.__dict__)
    return result


def payload(folder):
    content = {}
    for name, digest in AFTER.items():
        path = folder / name
        require(path.is_file() and not path.is_symlink() and
                path.resolve() == path and path.stat().st_size < 2 * 1024**2,
                'Payload inválido: ' + name)
        raw = path.read_bytes()
        require(sha(raw) == digest, 'Payload divergiu: ' + name)
        content['dist/src/' + name] = raw
    require(set(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()) == set(AFTER),
            'Arquivo adicional no payload.')
    return content


def model(plan, candidate):
    result = copy.deepcopy(plan['snapshot']['model'])
    require(set(result['services']) == {'core'}, 'Compose deve conter somente Core.')
    require(result['services']['core']['image'] == BASE, 'Imagem-base divergente.')
    if candidate:
        result['services']['core']['image'] = plan['candidate']
    return result


def compose(h, plan, phase):
    return ['docker', 'compose', '--project-directory', plan['snapshot']['workdir'],
            '--project-name', h.PROJECT, '--env-file', '/dev/null', '-f',
            str(ANCHOR / ('core-' + phase + '.private.json'))]


def current(h, plan, missing=False):
    name = plan['before']['Name'].lstrip('/')
    ids = h.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + name + '$']).split()
    if not ids and missing:
        return None, False
    require(len(ids) == 1, 'Core não identificado.')
    c = h.inspect(name)
    labels = c['Config']['Labels']
    config = labels.get('com.docker.compose.project.config_files')
    after = str(ANCHOR / 'core-after.private.json')
    require(labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == 'core' and
            config in (str(CONFIG), str(ANCHOR / 'core-before.private.json'), after),
            'Core pertence a outra operação; não será substituído.')
    candidate = config == after
    comparison = copy.deepcopy(c)
    comparison['State']['Running'] = True
    h.runtime_matches(plan['before'], comparison, plan['candidate'] if candidate else BASE, healthy=False)
    return c, candidate


def runtime(h, p, plan, candidate, original=False):
    c, actual = current(h, plan)
    require(actual == candidate and c['State']['Running'] and
            c['State'].get('Health', {}).get('Status') == 'healthy', 'Core não saudável.')
    if original:
        require(c['Id'] == CORE_ID, 'Core recriado desde a leitura.')
    for name, before in plan['other'].items():
        after = h.inspect(before['Name'])
        require(h.identity(after) == tuple(plan['identities'][name]), 'Outro serviço mudou: ' + name)
        require(after['State'].get('Health', {}).get('Status') == before['State'].get('Health', {}).get('Status'),
                'Saúde de outro serviço mudou: ' + name)
    require(p.tree(WEB) == plan['web'], 'Web aprovado mudou.')
    caddy = plan['caddy']
    require(h.bound_hash(Path(caddy['path'])) == caddy['sha256'], 'Caddyfile mudou.')


def assets(h, p, plan):
    require(sha(h.private_file(CONFIG)) == CONFIG_SHA, 'Compose original mudou.')
    for phase in ('before', 'after'):
        name = 'core-' + phase + '.private.json'
        require(sha(h.private_file(ANCHOR / name)) == plan['configs'][name], 'Compose preparado mudou.')
        actual = json.loads(h.run(compose(h, plan, phase) + ['config', '--format', 'json']))
        require(actual == model(plan, phase == 'after'), 'Compose normalizado divergiu.')
    p.verify_image_base(h, plan['candidate'], BASE)
    p.verify_image_files(h, plan['candidate'], AFTER, '/app/dist/src/')


def probe(h, plan):
    hashes = {'/' + route + '/' + name: plan['web'][role + '/' + name]['sha256']
              for role, route in [('driver', 'motorista'), ('passenger', 'passageiro')]
              for name in ('index.html', 'main.dart.js', 'ramo_push_config.js')}
    script = """
import {createHash} from 'node:crypto';
for(const [path,digest] of Object.entries({'/ready':null,...JSON.parse(process.argv[1])})){
 const r=await fetch('https://app.ramonessa.com.br'+path+'?pixAbandon='+Date.now(),
  {cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(r.status!==200)throw Error('Public probe HTTP');
 const raw=Buffer.from(await r.arrayBuffer());
 if(digest&&createHash('sha256').update(raw).digest('hex')!==digest)throw Error('Public probe hash');
}
"""
    h.run(['docker', 'exec', plan['before']['Name'], 'node', '--input-type=module', '-e', script,
           json.dumps(hashes)], timeout=110)


SMOKE = """
import assert from 'node:assert/strict';
import {InMemoryRideMatchingRepository} from '/app/dist/src/matching/in-memory-ride-matching-repository.js';
await import('/app/dist/src/matching/postgres-ride-matching-repository.js');
let ride={id:'isolated-ride',state:'AWAITING_PAYMENT',paymentStatus:'created',driverConsentRequired:true,
 driverId:'isolated-driver',reservedDriverId:'isolated-driver'};
let supply={driverId:'isolated-driver',reservedRideId:ride.id,reservedUntil:'2030-01-01T00:00:00Z'};
const repo=new InMemoryRideMatchingRepository({findById:async()=>ride,save:async value=>(ride=value)},
 {findByDriverId:async()=>supply,upsert:async value=>(supply=value)});
const input={rideId:ride.id,at:'2026-11-19T00:00:00Z',cancelledByPassenger:true};
await repo.releasePrepaymentHold(input);
assert.equal(ride.state,'CANCELLED_BY_PASSENGER');assert.equal(supply.reservedRideId,undefined);
supply.reservedRideId='new-ride';await repo.releasePrepaymentHold(input);
assert.equal(supply.reservedRideId,'new-ride');
ride={...ride,state:'PAID',paymentStatus:'paid'};
await assert.rejects(repo.releasePrepaymentHold(input),{code:'RIDE_NOT_READY'});
"""


def prepare(h, p, folder, diagnostic):
    stage('verify-confirmed-core-and-payload')
    content = payload(folder)
    before = h.inspect('ramo-nessa-staging-core-1')
    require(before['Id'] == CORE_ID and before['Image'] == BASE, 'Core divergiu da leitura confirmada.')
    h.runtime_matches(before, before, BASE)
    require(before['Config']['Labels'].get('com.docker.compose.project.config_files') == str(CONFIG)
            and sha(h.private_file(CONFIG)) == CONFIG_SHA, 'Compose ativo divergiu.')
    for name, digest in BEFORE.items():
        require(sha(h.run(['docker', 'exec', before['Name'], 'cat', '/app/dist/src/' + name])) == digest,
                'Módulo ativo mudou: ' + name)
    raw = h.private_file(PREVIOUS / 'plan.private.json')
    require(sha(raw) == PREVIOUS_PLAN, 'Plano Web premium divergiu.')
    previous = json.loads(raw)
    state = json.loads(h.private_file(PREVIOUS / 'activation.private.json'))
    require(state['phase'] == 'completed' and state['source'] == previous['source']
            and previous['source'] == 'db71dbd92a6840d48cc5b3ce31dd9ac2016250ad',
            'Ativação Web premium não confirmada.')
    web = p.tree(WEB)
    require(web == previous['webAfter'], 'Web premium mudou.')
    snapshot = p.snapshot(h, before, 'core', h.PROJECT)
    other = {role: h.inspect(name) for role, name in {
        'gateway': 'ramo-nessa-staging-gateway-1', 'postgres': 'ramo-nessa-staging-postgres-1',
        'maps': 'ramo-nessa-staging-google-maps-mock-1', 'site': 'ramo-nessa-site-institutional-site-1'}.items()}
    gateway = other['gateway']
    mount, = [m for m in gateway['Mounts'] if m['Destination'] == '/srv/web']
    require(mount['Source'] == str(WEB) and not mount['RW'], 'Gateway não serve o Web premium aprovado.')
    caddy, = [m for m in gateway['Mounts'] if m['Destination'] == '/etc/caddy/Caddyfile']
    for service in other.values():
        require(service['State']['Running'] and service['State'].get('Health', {}).get('Status') == 'healthy',
                'Outro serviço não saudável.')
    h.inactive()
    require(shutil.disk_usage(ROOT).free >= 1024**3, 'Espaço insuficiente.')
    require(not ANCHOR.exists(), 'Preparo já existe; não repetir.')
    os.rename(diagnostic, ANCHOR)
    h.DIRECTORY = ANCHOR
    stage('build-only-three-core-modules-offline')
    build = ANCHOR / 'build-core'
    build.mkdir()
    p.extract(content, build / 'payload')
    image = p.derive_image(h, BASE, 'pix-abandon-' + SOURCE[:12] + '-core', build, [('payload/', '/app/')])
    p.verify_image_files(h, image, AFTER, '/app/dist/src/')
    for name in BEFORE:
        h.run(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only',
               '--entrypoint', 'node', image, '--check', '/app/dist/src/' + name], timeout=60)
    stage('isolated-cancellation-smoke-without-payments-or-database')
    h.run(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only',
           '--cap-drop=ALL', '--security-opt=no-new-privileges', '--entrypoint', 'node',
           image, '--input-type=module', '-e', SMOKE], timeout=60)
    plan = {'source': SOURCE, 'before': before, 'snapshot': snapshot, 'candidate': image,
            'other': other, 'identities': {k: h.identity(c) for k, c in other.items()},
            'web': web, 'caddy': {'path': caddy['Source'], 'sha256': h.bound_hash(Path(caddy['Source']))}}
    plan['configs'] = {('core-' + phase + '.private.json'):
                       p.save(ANCHOR / ('core-' + phase + '.private.json'), model(plan, phase == 'after'))
                       for phase in ('before', 'after')}
    assets(h, p, plan)
    runtime(h, p, plan, False, original=True)
    digest = p.save(ANCHOR / 'plan.private.json', plan)
    print(json.dumps({'status': 'PIX_ABANDON_CORE_PREPARED', 'anchor': str(ANCHOR),
                      'planSha256': digest, 'candidateCore': image, 'servicesRestarted': False,
                      'databaseMigrationPerformed': False, 'oldRidesChanged': False}), flush=True)
    return plan


def journal(phase):
    tmp = ANCHOR / 'activation.incomplete'
    with tmp.open('w') as out:
        json.dump({'phase': phase, 'source': SOURCE, 'stage': STAGE}, out)
        out.flush()
        os.fsync(out.fileno())
    os.replace(tmp, ANCHOR / 'activation.private.json')


def up(h, plan, phase):
    h.run(compose(h, plan, phase) + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never',
          '--force-recreate', '--wait', '--wait-timeout', '90', 'core'], timeout=125)


def rollback(h, p, plan):
    stage('verify-return-and-core-operation-ownership')
    assets(h, p, plan)
    c, candidate = current(h, plan, missing=True)
    journal('restoring')
    if c is None or candidate or not c['State']['Running']:
        up(h, plan, 'before')
    runtime(h, p, plan, False)
    probe(h, plan)
    journal('rolled-back')


def activate(h, p, plan):
    stage('verify-prepared-plan-and-no-active-rides')
    require(not (ANCHOR / 'activation.private.json').exists(), 'Operação já iniciada; não repetir.')
    assets(h, p, plan)
    runtime(h, p, plan, False, original=True)
    probe(h, plan)
    h.inactive()
    runtime(h, p, plan, False, original=True)
    journal('switching')
    try:
        stage('activate-only-core')
        up(h, plan, 'after')
        stage('verify-core-public-apps-and-preserved-services')
        runtime(h, p, plan, True)
        probe(h, plan)
        journal('completed')
    except BaseException:
        failed = STAGE
        try:
            rollback(h, p, plan)
        except BaseException:
            journal('requires-review')
            print(json.dumps({'status': 'PIX_ABANDON_CORE_REVIEW_REQUIRED', 'failedStage': failed}))
            raise
        print(json.dumps({'status': 'PIX_ABANDON_CORE_ROLLED_BACK', 'failedStage': failed}))
        raise
    print(json.dumps({'status': 'PIX_ABANDON_CORE_ACTIVATED', 'source': SOURCE, 'anchor': str(ANCHOR),
                      'coreImage': plan['candidate'], 'onlyCoreRecreated': True, 'webChanged': False,
                      'databaseMigrationPerformed': False, 'databaseRestorePerformed': False,
                      'oldRidesChanged': False, 'siteTouched': False, 'rollbackPrepared': True,
                      'deviceValidationPerformed': False}), flush=True)


def main():
    require(os.geteuid() == 0 and len(sys.argv) == 4 and
            sys.argv[1] in ('apply', 'prepare', 'activate', 'rollback'),
            'Uso: sudo python3 rollout.py apply|prepare GUARD PAYLOAD ou activate|rollback GUARD HASH_PLANO')
    os.umask(0o077)
    info = ROOT.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022
            and ROOT.resolve() == ROOT, 'Diretório operacional inválido.')
    p = module(Path(sys.argv[2]), GUARD_SHA, 'pix_abandon_prepare_guard')
    privacy = module(PRIVACY, PRIVACY_SHA, 'pix_abandon_privacy_loader')
    h = privacy.load_guard()
    require(h.PROJECT == 'ramo-nessa-staging', 'Projeto inesperado.')
    fd = os.open(ROOT / 'screen-lock-activation.lock', os.O_RDWR | os.O_NOFOLLOW)
    with os.fdopen(fd, 'r+') as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022, 'Lock inválido.')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if sys.argv[1] in ('apply', 'prepare'):
            require(not ANCHOR.exists(), 'Operação já preparada; consulte o plano, não repetir.')
            diagnostic = Path(tempfile.mkdtemp(prefix='pix-abandon-preflight-', dir=ROOT))
            h.DIRECTORY = diagnostic
            plan = prepare(h, p, Path(sys.argv[3]).resolve(), diagnostic)
            if sys.argv[1] == 'apply':
                activate(h, p, plan)
        else:
            require(re.fullmatch('[0-9a-f]{64}', sys.argv[3]) is not None, 'Hash do plano obrigatório.')
            h.DIRECTORY = ANCHOR
            raw = h.private_file(ANCHOR / 'plan.private.json')
            require(sha(raw) == sys.argv[3], 'Plano difere do hash preparado.')
            plan = json.loads(raw)
            require(plan['source'] == SOURCE, 'Fonte do plano divergente.')
            if sys.argv[1] == 'activate':
                activate(h, p, plan)
            else:
                require((ANCHOR / 'activation.private.json').is_file(), 'Ativação não iniciada.')
                rollback(h, p, plan)
                print(json.dumps({'status': 'PIX_ABANDON_CORE_ROLLED_BACK', 'databaseRestorePerformed': False}))


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps({'status': 'PIX_ABANDON_CORE_STOPPED', 'stage': STAGE,
                          'reason': str(error) if isinstance(error, RolloutError) else None,
                          'errorType': type(error).__name__}), flush=True)
        sys.exit('Operação interrompida. Preserve a âncora e envie a saída; não repetir automaticamente.')
