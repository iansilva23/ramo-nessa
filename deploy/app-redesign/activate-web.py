#!/usr/bin/env python3
"""Activate/restore only the pinned gateway Web bind from a verified private plan."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
import time

sys.dont_write_bytecode = True
ROOT = Path('/opt/ramo-nessa-security')
ANCHOR = ROOT / 'app-redesign-0d8d865af3b2-996eb5ddbdbb'
PLAN_SHA = '9dc6f5df39666007241072b2e1dfde6db4581a06a01364fdcc1ae67ef096d525'
SOURCE = '0d8d865af3b27db8f7ea91663e0393aeb134b817'
BASELINE = '996eb5ddbdbbc9df2df2b21a062e66f0046e742cb9773a09ce4672539f41c628'
OLD_WEB = '/opt/ramo-nessa-web/releases/recovery-web-copy-h3pobi71/bundles'
NEW_WEB = '/opt/ramo-nessa-web/releases/app-redesign-0d8d865af3b2-996eb5ddbdbb/bundles'
CORE_IMAGE = 'sha256:f607fce3d8d840cfb375436896f028268936baa0d3d50d0c4afa1959e1476d78'
GATEWAY_IMAGE = 'sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
HELPER = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
HELPER_SHA = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
PUBLIC_BASE = 'https://app.ramonessa.com.br'


class ActivationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ActivationError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def tree(root):
    require(root.is_dir() and not root.is_symlink() and root.resolve() == root, 'Árvore Web inválida ou com links.')
    result = {}
    total = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            require(not (Path(directory) / name).is_symlink(), 'Link inesperado na árvore Web.')
        for name in files:
            path = Path(directory) / name
            info = path.lstat()
            require(stat.S_ISREG(info.st_mode), 'Arquivo Web não regular.')
            total += info.st_size
            require(total <= 1024**3 and len(result) < 30000, 'Árvore Web excedeu o limite previsto.')
            result[path.relative_to(root).as_posix()] = {
                'sha256': sha(path.read_bytes()), 'bytes': info.st_size, 'mode': stat.S_IMODE(info.st_mode),
            }
    return result


def load_guard():
    require(sha(HELPER.read_bytes()) == HELPER_SHA and not HELPER.is_symlink(), 'Helper de segurança divergente.')
    spec = importlib.util.spec_from_file_location('redesign_activation_guard', HELPER)
    h = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(h)
    h.DIRECTORY = ANCHOR
    return h


def read_plan(h):
    info = ANCHOR.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o077 and
            not ANCHOR.is_symlink(), 'Âncora privada inválida.')
    raw = h.private_file(ANCHOR / 'plan.private.json')
    require(sha(raw) == PLAN_SHA, 'Plano divergente do checksum informado pelo operador. Nada autorizado.')
    p = json.loads(raw)
    require(p.get('schema') == 1 and p.get('source') == SOURCE and p.get('baselineSha256') == BASELINE and
            p.get('oldWeb') == OLD_WEB and p.get('newWeb') == NEW_WEB, 'Plano não pertence a esta atualização.')
    require(p['runtimeBefore']['core']['Image'] == CORE_IMAGE and
            p['runtimeBefore']['gateway']['Image'] == GATEWAY_IMAGE, 'Imagens do plano divergentes.')
    prepared = json.loads(h.private_file(ANCHOR / 'prepared.private.json'))
    require(prepared.get('status') == 'APP_REDESIGN_WEB_PREPARED' and prepared.get('planSha256') == PLAN_SHA and
            prepared.get('source') == SOURCE and prepared.get('changesApplied') is False,
            'Preparação concluída não confirmada.')
    return p


def files_intact(h, p, candidate=True):
    require(sha(h.private_file(Path(p['gateway']['path']))) == p['gateway']['sourceSha256'],
            'A configuração de origem mudou; exige revisão.')
    for name, expected in p['files'].items():
        require(Path(name).name == name and sha(h.private_file(ANCHOR / name)) == expected, 'Arquivo da âncora mudou.')
    for path, expected in p['bindHashes'].items():
        require(h.bound_hash(Path(path)) == expected, 'Um arquivo de integração montado mudou.')
    require(tree(Path(OLD_WEB)) == p['beforeWebFiles'] and tree(ANCHOR / 'before-web') == p['beforeWebFiles'],
            'A versão anterior ou sua cópia de retorno mudou.')
    if candidate:
        require(tree(Path(NEW_WEB)) == p['candidateWebFiles'], 'A candidata Web mudou desde a preparação.')


def mount_source(container):
    mounts = [m for m in container['Mounts'] if m['Destination'] == '/srv/web']
    require(len(mounts) == 1 and mounts[0]['Type'] == 'bind' and not mounts[0]['RW'], 'Mount Web divergente.')
    return mounts[0]['Source']


def expected_gateway(p, candidate):
    result = copy.deepcopy(p['runtimeBefore']['gateway'])
    if candidate:
        for mount in result['Mounts']:
            if mount['Destination'] == '/srv/web':
                mount['Source'] = NEW_WEB
        for mount in result['HostConfig'].get('Mounts') or []:
            if mount.get('Target') == '/srv/web':
                mount['Source'] = NEW_WEB
        result['HostConfig']['Binds'] = [NEW_WEB + value[len(OLD_WEB):] if value.startswith(OLD_WEB + ':') else value
                                       for value in result['HostConfig'].get('Binds') or []]
    return result


def other_services(h, p):
    for service, before in p['runtimeBefore'].items():
        if service == 'gateway':
            continue
        current = h.inspect(before['Name'])
        require(h.identity(current) == h.identity(before), 'Outro serviço foi recriado ou parou; operação recusada.')
        h.runtime_matches(before, current, before['Image'])


def owned_gateway(h, p, allow_missing=False):
    before = p['runtimeBefore']['gateway']
    exists = h.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + before['Name'].lstrip('/') + '$']).strip()
    if not exists:
        require(allow_missing, 'Gateway ausente; verificar o registro antes de continuar.')
        return None
    current = h.inspect(before['Name'])
    labels = current['Config'].get('Labels') or {}
    config = labels.get('com.docker.compose.project.config_files')
    require(current['Image'] == GATEWAY_IMAGE and labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == 'gateway', 'Gateway pertence a outra versão; retorno recusado.')
    require(config in (p['gateway']['path'], str(ANCHOR / 'gateway-before.private.json'),
                       str(ANCHOR / 'gateway-after.private.json')), 'Outra publicação passou a controlar o gateway.')
    source = mount_source(current)
    require(source in (OLD_WEB, NEW_WEB), 'Outra versão Web está ativa; não sobrescrever.')
    if config == p['gateway']['path']:
        require(h.identity(current) == h.identity(before) and source == OLD_WEB, 'A publicação original mudou.')
    elif config == str(ANCHOR / 'gateway-after.private.json'):
        require(source == NEW_WEB, 'Configuração da candidata e mount não correspondem.')
    else:
        require(source == OLD_WEB, 'Configuração de retorno e mount não correspondem.')
    return current


def compose_args(h, p, phase):
    return ['docker', 'compose', '--project-directory', p['gateway']['workdir'], '--project-name', h.PROJECT,
            '--env-file', '/dev/null', '-f', str(ANCHOR / ('gateway-' + phase + '.private.json'))]


def verify_models(h, p):
    for phase in ('before', 'after'):
        expected = copy.deepcopy(p['gateway']['resolved'])
        if phase == 'after':
            mounts = [v for v in expected['services']['gateway']['volumes'] if v['target'] == '/srv/web']
            require(len(mounts) == 1 and mounts[0]['source'] == OLD_WEB and mounts[0].get('read_only'),
                    'Modelo resolvido original divergente.')
            mounts[0]['source'] = NEW_WEB
        actual = json.loads(h.run(compose_args(h, p, phase) + ['config', '--format', 'json']))
        require(actual == expected, 'Compose alteraria opções além do mount Web; troca recusada.')


def public_probe(h, p, candidate):
    records = p['candidateWebFiles'] if candidate else p['beforeWebFiles']
    expected = {'/' + route + '/' + file: records[role + '/' + file]['sha256']
                for role, route in [('driver', 'motorista'), ('passenger', 'passageiro')]
                for file in ('index.html', 'main.dart.js', 'ramo_push_config.js')}
    script = '''
import {createHash} from 'node:crypto';
const base = BASE, expected = FILES;
const get = async path => {
 const r = await fetch(base+path,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(r.status!==200) throw Error('HTTP probe failed');
 return r;
};
await (await get('/ready')).arrayBuffer();
for(const [path,digest] of Object.entries(expected)) {
 const r=await get(path+'?redesign='+Date.now());
 if(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')!==digest) throw Error('Bundle mismatch');
}
for(const role of ['driver','passenger']) {
 const data=await (await get('/v1/auth/'+role+'/recovery/channels')).json();
 if(JSON.stringify(data.channels?.slice().sort())!=='["email","whatsapp"]') throw Error('Recovery channels missing');
}
'''.replace('BASE', json.dumps(PUBLIC_BASE)).replace('FILES', json.dumps(expected))
    h.run(['docker', 'exec', p['runtimeBefore']['core']['Name'], 'node', '--input-type=module', '-e', script], timeout=125)


def verify_runtime(h, p, candidate):
    other_services(h, p)
    current = owned_gateway(h, p)
    require(mount_source(current) == (NEW_WEB if candidate else OLD_WEB), 'Versão Web ativa não corresponde ao plano.')
    h.runtime_matches(expected_gateway(p, candidate), current, GATEWAY_IMAGE)
    public_probe(h, p, candidate)
    return current


def state(h):
    path = ANCHOR / 'activation.private.json'
    if not path.exists():
        return None
    result = json.loads(h.private_file(path))
    require(result.get('planSha256') == PLAN_SHA, 'Registro de outra ativação; nada repetido.')
    if result.get('scriptSha256'):
        require(sha(h.private_file(ANCHOR / 'activate-web.py')) == result['scriptSha256'] and
                sha(Path(__file__).read_bytes()) == result['scriptSha256'], 'O ativador não corresponde ao registro desta âncora.')
    return result


def journal(h, phase, **extra):
    previous = state(h) or {}
    value = {**previous, **extra, 'phase': phase, 'planSha256': PLAN_SHA, 'at': time.time()}
    temporary = ANCHOR / 'activation.incomplete'
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(value, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, ANCHOR / 'activation.private.json')
    descriptor = os.open(ANCHOR, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def up(h, p, phase):
    h.run(compose_args(h, p, phase) + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never',
          '--force-recreate', '--wait', '--wait-timeout', '90', 'gateway'], timeout=125)


def rollback(h, p, automatic=False):
    record = state(h)
    require(record is not None and record['phase'] in ('switching', 'completed', 'restoring', 'requires-review', 'rolled-back'),
            'Não existe uma ativação desta âncora para retornar.')
    files_intact(h, p, candidate=False)
    other_services(h, p)
    verify_models(h, p)
    current = owned_gateway(h, p, allow_missing=True)
    if not automatic:
        h.inactive()
    if current and mount_source(current) == OLD_WEB and current['State'].get('Health', {}).get('Status') == 'healthy':
        verified = verify_runtime(h, p, False)
        journal(h, 'rolled-back', gatewayBeforeId=verified['Id'])
        return
    journal(h, 'restoring')
    up(h, p, 'before')
    restored = verify_runtime(h, p, False)
    files_intact(h, p, candidate=False)
    journal(h, 'rolled-back', gatewayBeforeId=restored['Id'])


def activate(h, p):
    record = state(h)
    if record is not None:
        require(record['phase'] == 'completed', 'Ativação já iniciada ou retornada; não repetir automaticamente.')
        files_intact(h, p)
        current = verify_runtime(h, p, True)
        require(current['Id'] == record.get('gatewayAfterId'), 'Gateway foi recriado depois desta ativação.')
        return {'status': 'APP_REDESIGN_WEB_ALREADY_ACTIVATED', 'servicesRestarted': False, 'source': SOURCE}
    files_intact(h, p)
    other_services(h, p)
    current = owned_gateway(h, p)
    require(h.identity(current) == h.identity(p['runtimeBefore']['gateway']), 'Gateway mudou desde a preparação.')
    verify_models(h, p)
    verify_runtime(h, p, False)
    h.inactive()
    # Final short checks after the public baseline probe, before the only mutation.
    files_intact(h, p)
    other_services(h, p)
    require(h.identity(owned_gateway(h, p)) == h.identity(current), 'Gateway mudou antes da troca.')
    script = Path(__file__).read_bytes()
    saved = ANCHOR / 'activate-web.py'
    if saved.exists():
        require(sha(h.private_file(saved)) == sha(script), 'Outra versão do ativador está registrada na âncora.')
    else:
        descriptor = os.open(saved, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(script)
            output.flush()
            os.fsync(output.fileno())
    h.inactive()
    journal(h, 'switching', scriptSha256=sha(script), gatewayBeforeId=current['Id'])
    try:
        up(h, p, 'after')
        updated = verify_runtime(h, p, True)
        files_intact(h, p)
        journal(h, 'completed', gatewayAfterId=updated['Id'])
    except BaseException:
        try:
            rollback(h, p, automatic=True)
        except BaseException:
            journal(h, 'requires-review')
            raise ActivationError('Ativação interrompida e retorno NÃO confirmado. Preserve a âncora; não repita a ativação.') from None
        raise ActivationError('Ativação interrompida; versão anterior restaurada e conferida. Não repetir automaticamente.') from None
    return {'status': 'APP_REDESIGN_WEB_ACTIVATED', 'source': SOURCE, 'anchor': str(ANCHOR), 'planSha256': PLAN_SHA,
            'onlyGatewayRecreated': True, 'coreImage': CORE_IMAGE, 'gatewayImage': GATEWAY_IMAGE,
            'databaseMigrationPerformed': False, 'databaseRestorePerformed': False,
            'mobileDeviceValidationPerformed': False}


def main():
    try:
        require(sys.argv[1:] in (['verify'], ['activate'], ['rollback']), 'Uso: activate-web.py verify|activate|rollback.')
        require(os.geteuid() == 0, 'Execute com sudo python3.')
        os.umask(0o077)
        h = load_guard()
        descriptor = os.open(ROOT / 'screen-lock-activation.lock', os.O_RDWR | os.O_NOFOLLOW)
        with os.fdopen(descriptor, 'r+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            p = read_plan(h)
            mode = sys.argv[1]
            if mode == 'activate':
                result = activate(h, p)
            elif mode == 'rollback':
                rollback(h, p)
                result = {'status': 'APP_REDESIGN_WEB_ROLLED_BACK', 'source': SOURCE, 'anchor': str(ANCHOR)}
            else:
                files_intact(h, p)
                verify_models(h, p)
                record = state(h)
                require(record is None or record['phase'] in ('completed', 'rolled-back'), 'Uma transição exige revisão.')
                verify_runtime(h, p, bool(record and record['phase'] == 'completed'))
                result = {'status': 'APP_REDESIGN_WEB_PLAN_VERIFIED', 'planSha256': PLAN_SHA, 'changesAppliedByThisCommand': False, 'activeCandidate': bool(record and record['phase'] == 'completed')}
            print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except ActivationError as error:
        print(str(error), file=sys.stderr)
    except BaseException:
        print('Operação interrompida. Confira a âncora e o último estágio; não repita automaticamente.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
