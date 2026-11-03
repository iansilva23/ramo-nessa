#!/usr/bin/env python3
"""Change only local WhatsApp OTP abuse controls on the verified active image."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

EXPECTED = 'sha256:449ead609890bc47d4274d4bc3e1df545ba87f5a732881efeb4037482a2e4083'
HELPER = Path('/opt/ramo-nessa-security/active-screen-lock-e2dfhu83/activate-lock-candidate.py')
HELPER_HASH = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
CORE = 'ramo-nessa-staging-core-1'
OTP_PATH = '/app/dist/src/auth/phone-otp-service.js'
FLAG = 'WHATSAPP_OTP_ABUSE_CONTROLS'


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def patch(text):
    changes = [
        ('const phoneE164 = normalizeBrazilMobilePhone(input.phone);',
         "const whatsappControlsDisabled = input.delivery.externalProvider === 'entrar-whatsapp' && process.env.WHATSAPP_OTP_ABUSE_CONTROLS === 'disabled';\n    const phoneE164 = normalizeBrazilMobilePhone(input.phone);", 1),
        ('await enforceOtpRequestRateLimits({', 'if (!whatsappControlsDisabled) await enforceOtpRequestRateLimits({', 1),
        ('Math.ceil(OTP_COOLDOWN_MS / 1000)', 'Math.ceil((whatsappControlsDisabled ? 0 : OTP_COOLDOWN_MS) / 1000)', 2),
        ('cooldownMs: OTP_COOLDOWN_MS', 'cooldownMs: whatsappControlsDisabled ? 0 : OTP_COOLDOWN_MS', 1),
    ]
    original = text
    require(FLAG not in text, 'Código já alterado; nenhuma repetição autorizada.')
    for old, new, count in changes:
        require(text.count(old) == count, 'Código OTP divergente; nada ativado.')
        text = text.replace(old, new)
    begin = text.index('const reserved = await input.repository.beginExternalVerification({')
    end = text.index('});', begin)
    segment = text[begin:end]
    old = 'maxAttempts: OTP_MAX_ATTEMPTS'
    new = "maxAttempts: process.env.WHATSAPP_OTP_ABUSE_CONTROLS === 'disabled' ? 2147483647 : OTP_MAX_ATTEMPTS"
    require(segment.count(old) == 1, 'Validação OTP divergente; nada ativado.')
    text = text[:begin] + segment.replace(old, new) + text[end:]
    restored = text.replace(new, old, 1)
    for old, new, count in reversed(changes):
        require(restored.count(new) == count, 'Alteração inesperada; nada ativado.')
        restored = restored.replace(new, old)
    require(restored == original, 'Alteração fora do escopo; nada ativado.')
    return text


def helper():
    require(HELPER.is_file() and not HELPER.is_symlink() and
            digest(HELPER.read_bytes()) == HELPER_HASH, 'Âncora de bloqueio ausente ou divergente.')
    spec = importlib.util.spec_from_file_location('previous_activation', HELPER)
    h = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(h)
    return h


def configure(h, directory, p):
    h.DIRECTORY = directory
    h.CONFIG = Path(p['configPath'])
    h.WORKDIR = Path(p['workdir'])
    h.OLD = p['originalImage']
    h.NEXT = p['candidateId']
    h.BASE_HASHES = p['originalHashes']
    original = h.runtime_matches

    def runtime_matches(before, current, image_id, healthy=True):
        expected = copy.deepcopy(before)
        if image_id == p['candidateId']:
            values = h.environment(expected['Config']['Env'])
            values[FLAG] = 'disabled'
            expected['Config']['Env'] = [k + '=' + v for k, v in values.items()]
        original(expected, current, image_id, healthy)

    h.runtime_matches = runtime_matches


def activate(h, test_file):
    require(test_file.is_file(), 'Arquivo de testes ausente.')
    before = [h.inspect(n) for n in h.NAMES]
    require(before[0]['Image'] == EXPECTED and before[0]['State']['Running'],
            'A imagem ativa mudou; nenhuma alteração realizada.')
    current_env = h.environment(before[0]['Config'].get('Env'))
    require(current_env.get('OTP_PROVIDER') == 'entrar-whatsapp' and
            current_env.get(FLAG) != 'disabled', 'Configuração OTP diferente; nenhuma repetição realizada.')
    labels = before[0]['Config'].get('Labels') or {}
    require(labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == 'core', 'Projeto ativo divergente.')
    workdir = labels['com.docker.compose.project.working_dir']
    config_path = labels['com.docker.compose.project.config_files']
    require(',' not in config_path, 'Configuração composta exige revisão.')
    h.WORKDIR, h.CONFIG = Path(workdir), Path(config_path)
    raw = h.private_file(h.CONFIG)
    model = json.loads(raw)
    require(not model['services']['core'].get('env_file'), 'Arquivo externo de ambiente exige revisão.')
    source = h.resolved(h.CONFIG)
    original_image = h.inspect(EXPECTED, True)
    h.assert_environment(source, before[0], original_image)
    h.assert_mount_plan(source, before[0])
    h.runtime_matches(before[0], before[0], EXPECTED)
    h.inactive()
    require(shutil.disk_usage(h.ROOT).free >= 1024**3, 'Menos de 1 GB livre; operação não iniciada.')
    directory = Path(tempfile.mkdtemp(prefix='whatsapp-login-', dir=h.ROOT))
    h.DIRECTORY = directory
    print('DIRETÓRIO DE PREPARO:', directory, flush=True)
    original_code = h.run(['docker', 'exec', CORE, 'cat', OTP_PATH])
    changed_code = patch(original_code.decode()).encode()
    h.save('phone-otp-service.js', changed_code)
    h.save('test-policy.mjs', test_file.read_bytes())
    (directory / 'phone-otp-service.js').chmod(0o644)
    (directory / 'test-policy.mjs').chmod(0o644)
    h.save('activate-whatsapp.py', Path(__file__).read_bytes())
    base_tag = 'ramo-nessa-whatsapp-login-base:449ead609890'
    existing = h.run(['docker', 'image', 'ls', '--format', '{{.ID}}', '--filter', 'reference=' + base_tag]).strip()
    if existing:
        require(h.inspect(base_tag, True)['Id'] == EXPECTED, 'Tag de base divergente.')
    h.run(['docker', 'image', 'tag', EXPECTED, base_tag])
    h.save('Dockerfile', ('FROM ' + base_tag + '\nCOPY phone-otp-service.js ' + OTP_PATH + '\n').encode())
    tag = 'ramo-nessa-whatsapp-login:' + directory.name.removeprefix('whatsapp-login-')
    print('Preparando somente o código de OTP, sem envios reais...', flush=True)
    h.run(['docker', 'build', '--pull=false', '--network=none', '-t', tag, str(directory)], timeout=180)
    candidate = h.inspect(tag, True)
    require(candidate['Config'] == original_image['Config'] and
            candidate['RootFS']['Layers'][:len(original_image['RootFS']['Layers'])] == original_image['RootFS']['Layers'],
            'A candidata divergiu da base original.')
    # This candidate test uses only in-memory repositories and fake WhatsApp delivery.
    output = h.run(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only',
        '--cap-drop=ALL', '--security-opt=no-new-privileges',
        '--env', 'NODE_ENV=test', '--env', 'LOGIN_POLICY_MODULE_ROOT=/app/dist/src/auth',
        '--mount', 'type=bind,src=' + str(directory / 'test-policy.mjs') + ',dst=/policy-test.mjs,readonly',
        '--entrypoint', 'node', candidate['Id'], '--test', '/policy-test.mjs'], timeout=90)
    h.save('tests.private.log', output)
    require(b'# fail 0' in output and b'# pass 7' in output, 'Os sete testes isolados não passaram.')
    original_hashes = {OTP_PATH: digest(original_code)}
    for path in ['/app/dist/src/server.js', '/app/dist/src/auth/entrar-whatsapp-otp-provider.js',
                 '/app/dist/src/auth/passenger-password-auth-service.js']:
        original_hashes[path] = digest(h.run(['docker', 'exec', CORE, 'cat', path]))
    candidate_hashes = {**original_hashes, OTP_PATH: digest(changed_code)}
    for path, expected in candidate_hashes.items():
        actual = h.run(['docker', 'run', '--rm', '--pull=never', '--network=none', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges', '--entrypoint', 'cat', candidate['Id'], path])
        require(digest(actual) == expected, 'Código candidato fora do escopo.')
    after = h.image_only(model, candidate['Id'])
    after['services']['core'].setdefault('environment', {})[FLAG] = 'disabled'
    h.save('before.compose.private.json', h.image_only(model, EXPECTED))
    h.save('after.compose.private.json', after)
    p = {'originalImage': EXPECTED, 'candidateReference': candidate['Id'], 'candidateId': candidate['Id'],
         'originalHashes': original_hashes, 'candidateHashes': candidate_hashes,
         'configPath': config_path, 'workdir': workdir, 'sourceHash': digest(raw), 'before': before,
         'bindHashes': {m['Source']: h.bound_hash(Path(m['Source'])) for m in before[0]['Mounts'] if m['Type'] == 'bind'},
         'files': {}}
    for name in ['before.compose.private.json', 'after.compose.private.json', 'activate-whatsapp.py', 'test-policy.mjs']:
        p['files'][name] = digest(h.private_file(directory / name))
    h.save('plan.private.json', p)
    configure(h, directory, p)
    require(h.resolved(directory / 'before.compose.private.json') == h.image_only(source, EXPECTED), 'Plano anterior divergente.')
    resolved_after = h.resolved(directory / 'after.compose.private.json')
    expected_after = h.image_only(source, candidate['Id'])
    expected_after['services']['core'].setdefault('environment', {})[FLAG] = 'disabled'
    require(resolved_after == expected_after, 'Plano altera opções além do OTP autorizado.')
    ref = copy.deepcopy(before[0])
    env = h.environment(ref['Config']['Env'])
    env[FLAG] = 'disabled'
    ref['Config']['Env'] = [k + '=' + v for k, v in env.items()]
    h.assert_environment(resolved_after, ref, candidate)
    h.assert_mount_plan(resolved_after, before[0])
    h.intact(p)
    require(h.identity(h.inspect(CORE)) == h.identity(before[0]), 'API mudou durante o preparo; nada ativado.')
    h.inactive()
    h.journal('prepared')
    print('ÂNCORA:', directory, flush=True)
    print('RETORNO: sudo python3 ' + str(directory / 'activate-whatsapp.py') + ' rollback ' + str(directory), flush=True)
    print('Aplicando somente os controles locais de WhatsApp. Pode haver breve interrupção da API.', flush=True)
    h.journal('switching')
    try:
        h.switch_release(lambda: h.up('after'), lambda: h.verify(p, True),
                         lambda: h.rollback(p), lambda: h.verify(p, False))
    except BaseException:
        try:
            h.verify(p, False)
            h.journal('rolled-back')
        except BaseException:
            h.journal('requires-review')
        raise
    h.journal('completed')
    print(json.dumps({'status': 'WHATSAPP_LOCAL_CONTROLS_DISABLED', 'driver': True, 'passenger': True,
        'passwordLoginChanged': False, 'databaseMigrationPerformed': False,
        'realWhatsAppSentByInstaller': False, 'isolatedTestsPassed': 7, 'anchor': str(directory)}, indent=2))


def main():
    require(os.geteuid() == 0, 'Execute com sudo python3.')
    os.umask(0o077)
    h = helper()
    with (h.ROOT / 'screen-lock-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if len(sys.argv) == 3 and sys.argv[1] == 'rollback':
            directory = Path(sys.argv[2])
            require(directory.parent == h.ROOT and directory.name.startswith('whatsapp-login-') and
                    not directory.is_symlink() and directory.stat().st_uid == 0 and
                    directory.stat().st_mode & 0o077 == 0, 'Âncora inválida.')
            p = json.loads(h.private_file(directory / 'plan.private.json'))
            require(p['originalImage'] == EXPECTED, 'Âncora de outra versão.')
            configure(h, directory, p)
            p = h.state()
            h.inactive()
            h.rollback(p)
            h.journal('rolled-back')
            print('CONTROLES ANTERIORES RESTAURADOS E API CONFERIDA.')
        elif len(sys.argv) == 2:
            activate(h, Path(sys.argv[1]))
        else:
            raise RuntimeError('Uso: activate-whatsapp.py test-policy.mjs | rollback DIRETORIO')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, RuntimeError) else 'Falha operacional; consulte os registros privados da âncora.'
        print('Operação não concluída: ' + message + ' Não repita automaticamente.', file=sys.stderr)
        sys.exit(1)
