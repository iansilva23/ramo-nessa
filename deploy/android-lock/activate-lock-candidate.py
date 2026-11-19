#!/usr/bin/env python3
"""Activate only the previously tested Core image; no migrations or data restore."""
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

ROOT = Path('/opt/ramo-nessa-security')
DIRECTORY = ROOT / 'active-screen-lock-e2dfhu83'
PREPARED = ROOT / 'candidate-screen-lock-e2dfhu83'
TEST = Path('/var/lib/ramo-nessa-security-tests/ramo-lock-test-4a6a3dd0ce5433e4')
OLD = 'sha256:a9228cfd6e52144338e03d64e1dcb5f6e3e251adfabf75ed0886d073b1e6bdb6'
NEXT = 'sha256:449ead609890bc47d4274d4bc3e1df545ba87f5a732881efeb4037482a2e4083'
TAG = 'ramo-nessa-screenlock-candidate:e2dfhu83'
ANCHOR = 'ramo-nessa-ancora-bloqueio:a9228cfd6e52'
PROJECT = 'ramo-nessa-staging'
WORKDIR = ROOT / 'prepared-08d1aa34a384611d'
CONFIG = WORKDIR / 'core-after.private.json'
NAMES = ['ramo-nessa-staging-core-1', 'ramo-nessa-staging-gateway-1',
         'ramo-nessa-staging-postgres-1', 'ramo-nessa-site-institutional-site-1']
BASE_HASHES = {
    '/app/dist/src/server.js': 'f0b57a4d160396177810b95a86d28b4a2e2b1ee8fd67043bfe3a02f54a28f075',
    '/app/dist/src/matching/postgres-ride-matching-repository.js': '3674660de29eadca2062ec4f2a4a8bab0f70ad6cf0588136f6eeb6c02c928058',
    '/app/dist/src/rides/pending-dispatch-service.js': '4e8257fe9314e2b2bab1f3d77b04742b68670117010b45b32ea02d8a7c0b565a',
}


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def private_file(path):
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022,
            'Arquivo operacional inválido; nenhuma substituição autorizada.')
    return path.read_bytes()


def bound_hash(path):
    # Existing mounted credentials may belong to the deploying account. Read and
    # compare their bytes without changing ownership, permissions or contents.
    require(path.is_file(), 'Arquivo montado indisponível; troca não iniciada.')
    return digest(path.read_bytes())


def save(name, value):
    raw = value if isinstance(value, bytes) else (json.dumps(value, indent=2) + '\n').encode()
    with (DIRECTORY / name).open('xb') as out:
        out.write(raw)


def run(args, timeout=30, input=None):
    # Do not inherit caller environment as Compose interpolation values.
    try:
        r = subprocess.run(args, input=input, capture_output=True, timeout=timeout,
                           env={'PATH': os.environ.get('PATH', '/usr/bin:/bin')})
    except (subprocess.TimeoutExpired, OSError):
        raise RuntimeError('Comando não concluído. Consulte os registros privados.') from None
    if r.returncode:
        if DIRECTORY.is_dir():
            with (DIRECTORY / 'command.private.log').open('ab') as out:
                out.write(r.stdout + r.stderr)
        raise RuntimeError('Comando falhou. Detalhes no registro privado; credenciais não exibidas.')
    return r.stdout


def inspect(name, image=False):
    return json.loads(run(['docker', *(['image'] if image else []), 'inspect', name]))[0]


def image_matches(info, expected):
    refs = [info.get('Id'), (info.get('Descriptor') or {}).get('digest')]
    refs += [x.rsplit('@', 1)[-1] for x in info.get('RepoDigests') or []]
    return expected in refs


def environment(lines):
    result = {}
    for line in lines or []:
        key, sep, value = line.partition('=')
        require(sep and key and key not in result, 'Ambiente privado inválido.')
        result[key] = value
    return result


def assert_environment(model, container, image):
    env = model['services']['core'].get('environment', {})
    require(isinstance(env, dict) and all(isinstance(v, str) for v in env.values()),
            'Ambiente Compose precisa de revisão.')
    # Compose config output doubles literal dollars for subsequent re-input.
    expected = {**environment(image['Config'].get('Env')),
                **{k: v.replace('$$', '$') for k, v in env.items()}}
    require(expected == environment(container['Config'].get('Env')),
            'Compose difere do ambiente ativo. Nenhum valor privado foi exibido.')


def image_only(model, image):
    require(model.get('name') == PROJECT and 'core' in model.get('services', {}),
            'Projeto Compose divergente.')
    require(not model['services']['core'].get('env_file'), 'Compose não é autocontido.')
    result = copy.deepcopy(model)
    result['services']['core']['image'] = image
    return result


def compose_args(path):
    return ['docker', 'compose', '--project-directory', str(WORKDIR),
            '--project-name', PROJECT, '--env-file', '/dev/null', '-f', str(path)]


def resolved(path):
    return json.loads(run(compose_args(path) + ['config', '--format', 'json']))


def assert_mount_plan(model, before):
    service = model['services']['core']
    require(not any(service.get(k) for k in ['network_mode', 'volumes_from', 'secrets', 'configs', 'extends']),
            'Plano contém opções que exigem revisão.')
    expected = []
    for m in service.get('volumes', []):
        require(m['type'] in ('volume', 'bind'), 'Tipo de volume exige revisão.')
        source = m['source']
        if m['type'] == 'volume':
            source = model.get('volumes', {}).get(source, {}).get('name')
        expected.append((m['type'], source, m['target'], not m.get('read_only', False)))
    actual = [(m['Type'], m.get('Name') if m['Type'] == 'volume' else m['Source'],
               m['Destination'], m['RW']) for m in before.get('Mounts', [])]
    require(sorted(expected) == sorted(actual), 'Volumes resolvidos diferem dos volumes ativos.')
    networks = service.get('networks', {})
    require(isinstance(networks, dict), 'Formato de rede exige revisão.')
    expected_nets = [model.get('networks', {}).get(k, {}).get('name') for k in networks]
    require(sorted(expected_nets) == sorted(before['NetworkSettings']['Networks']),
            'Redes resolvidas diferem das redes ativas.')


def mounts(c):
    return sorted((m['Type'], m.get('Name', ''), m['Source'], m['Destination'], m['RW'],
                   m.get('Propagation', '')) for m in c.get('Mounts', []))


def runtime_matches(before, current, image_id, healthy=True):
    require(current['Image'] == image_id and current['State']['Running'], 'Imagem/API divergente ou parada.')
    if healthy:
        require(current['State'].get('Health', {}).get('Status') == 'healthy', 'Saúde da API não confirmada.')
    require(environment(before['Config'].get('Env')) == environment(current['Config'].get('Env')),
            'O ambiente da API divergiu; valores privados não exibidos.')
    require(mounts(before) == mounts(current), 'Volumes da API divergentes.')
    require(sorted(before['NetworkSettings']['Networks']) == sorted(current['NetworkSettings']['Networks']),
            'Redes da API divergentes.')
    host_keys = ['PortBindings', 'ReadonlyRootfs', 'RestartPolicy', 'LogConfig', 'Privileged',
                 'Memory', 'NanoCpus', 'PidsLimit', 'Tmpfs', 'ShmSize', 'Dns', 'ExtraHosts',
                 'Ulimits', 'GroupAdd', 'Init', 'NetworkMode', 'AutoRemove', 'OomKillDisable']
    for key in host_keys:
        require(before['HostConfig'].get(key) == current['HostConfig'].get(key),
                'Opção operacional da API divergiu: ' + key)
    for key in ['CapAdd', 'CapDrop', 'SecurityOpt', 'Binds']:
        require(sorted(before['HostConfig'].get(key) or []) == sorted(current['HostConfig'].get(key) or []),
                'Proteção/montagem da API divergiu: ' + key)
    for key in ['User', 'Cmd', 'Entrypoint', 'WorkingDir', 'Healthcheck', 'StopSignal', 'ExposedPorts']:
        require(before['Config'].get(key) == current['Config'].get(key), 'Inicialização da API divergiu: ' + key)


def identity(c):
    return (c['Id'], c['Image'], c['State']['StartedAt'], c['State']['Running'])


def assert_code(container, hashes):
    for path, expected in hashes.items():
        require(digest(run(['docker', 'exec', container, 'cat', path])) == expected,
                'Código compilado divergente: ' + path)


def health(image_id):
    for _ in range(90):
        c = inspect(NAMES[0])
        require(c['Image'] == image_id, 'Outra imagem foi instalada; interrompendo.')
        if c['State']['Running'] and c['State'].get('Health', {}).get('Status') == 'healthy':
            return c
        time.sleep(1)
    raise RuntimeError('API não ficou saudável em 90 segundos.')


PROBE = """
const base='http://127.0.0.1:'+(process.env.PORT||'8080');
for(const [path,method,expected] of [['/health','GET',200],['/ready','GET',200],
 ['/v1/driver/me/screen-lock','POST',401]]){
 const r=await fetch(base+path,{method,headers:{authorization:'Bearer invalid-screen-lock-probe'},
 signal:AbortSignal.timeout(5000)});await r.body?.cancel();
 if(r.status!==expected)throw Error('Probe failed');
}
"""

ACTIVITY = """
import {createPostgresPool} from '/app/dist/src/db/postgres.js';
const pool=createPostgresPool(process.env.DATABASE_URL);
try {
 const r=await pool.query(`SELECT count(*)::int AS count FROM rides WHERE
 state IN ('PAID','SEARCHING_DRIVER','DRIVER_ASSIGNED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','INTERRUPTED')
 OR (state='AWAITING_PAYMENT' AND coalesce(payment_expires_at,driver_hold_expires_at)>now())`);
 console.log(JSON.stringify({active:r.rows[0].count}));
} finally {await pool.end();}
"""


def inactive():
    r = json.loads(run(['docker', 'exec', NAMES[0], 'node', '--input-type=module', '-e', ACTIVITY]))
    require(r.get('active') == 0, 'Há corridas/buscas/pagamentos em andamento. Troca não iniciada; aguarde terminarem.')


def journal(phase):
    # Atomic journal, so loss of process does not leave a truncated recovery record.
    temp = DIRECTORY / 'journal.incomplete'
    temp.write_text(json.dumps({'phase': phase, 'at': time.time()}) + '\n')
    temp.replace(DIRECTORY / 'activation.private.json')


def state():
    p = json.loads(private_file(DIRECTORY / 'plan.private.json'))
    require(p.get('originalImage') == OLD and p.get('candidateReference') == NEXT, 'Plano de retorno divergente.')
    for name, expected in p['files'].items():
        require('/' not in name and digest(private_file(DIRECTORY / name)) == expected, 'Âncora alterada.')
    return p


def intact(p, check_other=True):
    require(digest(private_file(CONFIG)) == p['sourceHash'], 'Configuração original mudou; exige revisão.')
    for path, expected in p['bindHashes'].items():
        require(bound_hash(Path(path)) == expected, 'Arquivo de integração mudou; exige revisão.')
    if check_other:
        for c in p['before'][1:]:
            require(identity(c) == identity(inspect(c['Name'])), 'Outro serviço mudou; exige revisão.')


def up(version):
    run(compose_args(DIRECTORY / (version + '.compose.private.json')) +
        ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', 'core'], timeout=150)


def verify(p, candidate):
    image_id = p['candidateId'] if candidate else OLD
    current = health(image_id)
    runtime_matches(p['before'][0], current, image_id)
    assert_code(NAMES[0], p['candidateHashes'] if candidate else BASE_HASHES)
    intact(p)
    if candidate:
        run(['docker', 'exec', NAMES[0], 'node', '--input-type=module', '-e', PROBE], timeout=25)


def rollback(p):
    # Never overwrite an unrelated later release, even during automatic recovery.
    intact(p)
    raw = run(['docker', 'ps', '-aq', '--filter', 'name=^/' + NAMES[0] + '$']).strip()
    if raw:
        c = inspect(NAMES[0])
        require(c['Image'] in (OLD, p['candidateId']), 'API de outra atualização; retorno recusado.')
        labels = c['Config'].get('Labels') or {}
        require(labels.get('com.docker.compose.project') == PROJECT and
                labels.get('com.docker.compose.service') == 'core', 'Origem da API divergente.')
        if c['Image'] == OLD and c['State']['Running'] and c['State'].get('Health', {}).get('Status') == 'healthy':
            verify(p, False)
            return
    up('before')
    verify(p, False)


def switch_release(install, check, restore, check_restore):
    try:
        install()
        check()
    except BaseException as cause:
        try:
            restore()
            check_restore()
        except BaseException:
            raise RuntimeError('Troca interrompida e retorno NÃO confirmado. Consulte a âncora e os registros privados.') from None
        raise RuntimeError('Troca interrompida. Imagem anterior restaurada e conferida.') from cause


def activate():
    require(not DIRECTORY.exists(), 'Esta ativação já tem registro. Nada repetido; confira o resultado anterior.')
    prep = json.loads(private_file(PREPARED / 'result.json'))
    require((prep.get('candidateImage'), prep.get('candidateImageId'), prep.get('originalImage')) == (TAG, NEXT, OLD),
            'Preparação divergente.')
    candidate, original = inspect(TAG, True), inspect(OLD, True)
    require(image_matches(candidate, NEXT) or inspect(NEXT, True)['Id'] == candidate['Id'], 'Imagem candidata divergente.')
    result = json.loads(private_file(TEST / 'result.private.json'))
    require(result.get('status') == 'ISOLATED_SCREEN_LOCK_CANDIDATE_APPROVED' and
            result.get('candidateImageId') == candidate['Id'] and result.get('testResourcesRemoved') is True and
            result.get('cleanupPending') == [] and result.get('productionDatabaseUsed') is False,
            'Aprovação isolada ausente ou de outra imagem.')
    report = private_file(TEST / 'tests.private.log').decode(errors='replace').splitlines()
    require(all(x in report for x in ['# tests 4', '# pass 4', '# fail 0', '# skipped 0']), 'Relatório isolado incompleto.')
    require(candidate['Config'] == original['Config'] and
            candidate['RootFS']['Layers'][:len(original['RootFS']['Layers'])] == original['RootFS']['Layers'],
            'Imagem candidata não preserva a configuração/base original.')
    require(inspect(ANCHOR, True)['Id'] == OLD, 'Âncora da imagem original ausente ou divergente.')
    before = [inspect(n) for n in NAMES]
    require(all(c['State']['Running'] and c['State'].get('Health', {}).get('Status') in (None, 'healthy')
                for c in before), 'Serviço ativo sem saúde; troca não iniciada.')
    runtime_matches(before[0], before[0], OLD)
    labels = before[0]['Config'].get('Labels') or {}
    for key, expected in {'project': PROJECT, 'service': 'core', 'project.working_dir': str(WORKDIR),
                          'project.config_files': str(CONFIG)}.items():
        require(labels.get('com.docker.compose.' + key) == expected, 'Origem Compose mudou; troca não iniciada.')
    assert_code(NAMES[0], BASE_HASHES)
    raw = private_file(CONFIG)
    model = json.loads(raw)
    source = resolved(CONFIG)
    assert_environment(source, before[0], original)
    assert_mount_plan(source, before[0])
    inactive()
    DIRECTORY.mkdir(mode=0o700)
    save('source.compose.private.json', raw)
    save('before.compose.private.json', image_only(model, OLD))
    save('after.compose.private.json', image_only(model, candidate['Id']))
    save('activate-lock-candidate.py', Path(__file__).read_bytes())
    for version, img in [('before', original), ('after', candidate)]:
        reread = resolved(DIRECTORY / (version + '.compose.private.json'))
        require(reread == image_only(source, img['Id']), 'Releitura Compose alterou opções além da imagem.')
        assert_environment(reread, before[0], img)
        assert_mount_plan(reread, before[0])
    hashes = dict(BASE_HASHES)
    for filename, app_path in [('server.js', '/app/dist/src/server.js'),
                               ('matching.js', '/app/dist/src/matching/postgres-ride-matching-repository.js')]:
        hashes[app_path] = digest(private_file(PREPARED / 'candidate' / filename))
        actual = run(['docker', 'run', '--rm', '--network', 'none', '--pull=never', '--entrypoint', 'cat', candidate['Id'], app_path])
        require(digest(actual) == hashes[app_path], 'Código candidato divergiu da preparação.')
    files = ['source.compose.private.json', 'before.compose.private.json',
             'after.compose.private.json', 'activate-lock-candidate.py']
    p = {'originalImage': OLD, 'candidateReference': NEXT, 'candidateId': candidate['Id'],
         'sourceHash': digest(raw), 'before': before, 'candidateHashes': hashes,
         'files': {n: digest(private_file(DIRECTORY / n)) for n in files},
         'bindHashes': {m['Source']: bound_hash(Path(m['Source']))
                        for m in before[0]['Mounts'] if m['Type'] == 'bind'}}
    save('plan.private.json', p)
    intact(p)
    require(identity(inspect(NAMES[0])) == identity(before[0]), 'API mudou durante a preparação; troca não iniciada.')
    inactive()
    journal('prepared')
    print('ÂNCORA PRONTA:', DIRECTORY, flush=True)
    print('RETORNO: sudo python3 ' + str(DIRECTORY / 'activate-lock-candidate.py') + ' rollback', flush=True)
    print('Recriando somente a API. Pode haver uma breve interrupção...', flush=True)
    journal('switching')
    try:
        switch_release(lambda: up('after'), lambda: verify(p, True), lambda: rollback(p), lambda: verify(p, False))
    except BaseException:
        # Preserve exact phase even when the process is interrupted by the operator.
        try:
            verify(p, False)
            journal('rolled-back')
        except BaseException:
            journal('requires-review')
        raise
    journal('completed')
    print(json.dumps({'status': 'SCREEN_LOCK_API_ACTIVATED', 'anchor': str(DIRECTORY),
                      'onlyCoreRecreated': True, 'configurationPreserved': True,
                      'databaseMigrationPerformed': False, 'databaseRestorePerformed': False,
                      'webChanged': False, 'mobileDeviceValidationPerformed': False}, indent=2))


def main():
    require(os.geteuid() == 0, 'Execute com sudo python3.')
    require(sys.argv[1:] in ([], ['rollback']), 'Uso: activate-lock-candidate.py [rollback]')
    os.umask(0o077)
    require(ROOT.is_dir() and not ROOT.is_symlink(), 'Diretório operacional inválido.')
    with (ROOT / 'screen-lock-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if sys.argv[1:]:
            require(DIRECTORY.is_dir() and not DIRECTORY.is_symlink() and DIRECTORY.stat().st_uid == 0
                    and not DIRECTORY.stat().st_mode & 0o077, 'Âncora privada inválida.')
            p = state()
            rollback(p)
            journal('rolled-back')
            print('IMAGEM ANTERIOR RESTAURADA E SAÚDE CONFERIDA. Dados do banco preservados.')
        else:
            activate()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError) as error:
        # Exception text from JSON/files/commands can contain secrets; print only our safe messages.
        print(str(error) if isinstance(error, RuntimeError) else 'Operação não concluída; registros privados preservados.', file=sys.stderr)
        sys.exit(1)
