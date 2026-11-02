#!/usr/bin/env python3
"""Prepare an immutable, production-configured DRIVER-only candidate; do not switch anything."""
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

GATEWAY = 'ramo-nessa-staging-gateway-1'
EXPECTED_ACTIVE_ROOT = Path('/opt/ramo-nessa-web/releases/coupons-2fc82e5dfd0a/bundles')
EXPECTED_ACTIVE_MAIN_SHA = 'e8eb196d7aa52b4fb78e119a8e9584ece869ece25162125693fb59d01fa7b92d'
EXPECTED_SOURCE = 'b2d4c2edd7a69b0a935cd5256700c76ae1144f5a'
AUDIO_SHA = '715ddb02d47699c91d48820d6ee8eb3fd1eb860d2517e54acd731609ead6bb25'
STAGE = Path('/opt/ramo-nessa-toque-hml/review-b2d4c2edd7a6')
RELEASE = Path('/opt/ramo-nessa-web/releases/driver-tone-b2d4c2edd7a6')
BUNDLES = RELEASE / 'bundles'
PROTECTED = ('ramo_push_config.js', 'ramo_push_worker.js', 'ramo_web_push.js')
KEY_RE = re.compile(r'^AIza[A-Za-z0-9_-]{35}$')


def fail(message):
    raise SystemExit('PARADO (nenhum serviço alterado): ' + message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    return sha(path.read_bytes())


def measure(root):
    return sum(p.stat().st_size for p in root.rglob('*') if p.is_file())


def prohibit_links(root):
    for p in root.rglob('*'):
        if p.is_symlink():
            fail('Symlink inesperado: ' + str(p))


def inspect():
    r = subprocess.run(['docker', 'inspect', GATEWAY], text=True,
                       capture_output=True, timeout=30, check=False)
    if r.returncode:
        fail('Gateway não pôde ser inspecionado.')
    obj = json.loads(r.stdout)[0]
    state = obj['State']
    if not state.get('Running') or (state.get('Health') or {}).get('Status') != 'healthy':
        fail('Gateway não está saudável.')
    mounts = [m for m in obj['Mounts'] if m['Destination'] == '/srv/web']
    if len(mounts) != 1 or mounts[0]['Type'] != 'bind' or mounts[0]['RW']:
        fail('Montagem Web insegura ou inesperada.')
    if Path(mounts[0]['Source']) != EXPECTED_ACTIVE_ROOT:
        fail('Gateway não utiliza mais a versão esperada. Reavaliar antes de continuar.')
    return obj


def main():
    if os.geteuid() != 0:
        fail('Execute via sudo.')
    gateway = inspect()
    active = EXPECTED_ACTIVE_ROOT
    driver = active / 'driver'
    if not active.is_dir() or not driver.is_dir() or not (active / 'passenger').is_dir():
        fail('Estrutura Web ativa inesperada.')
    if file_hash(driver / 'main.dart.js') != EXPECTED_ACTIVE_MAIN_SHA:
        fail('Código do Motorista oficial mudou.')
    if not STAGE.is_dir() or not (STAGE / 'manifest.hml.json').is_file():
        fail('Pacote de homologação ausente.')
    if RELEASE.exists() or RELEASE.is_symlink():
        fail('Versão candidata já existe. Não substituir.')
    prohibit_links(active)
    prohibit_links(STAGE / 'driver')
    manifest = json.loads((STAGE / 'manifest.hml.json').read_text())
    expected = {
        'sourceCommit': EXPECTED_SOURCE,
        'schemaVersion': 1,
        'role': 'driver',
        'ciPreviewOnly': True,
        'basePath': '/motorista-toque-hml/',
        'audioSha256': AUDIO_SHA,
    }
    if not isinstance(manifest, dict) or any(manifest.get(k) != v for k, v in expected.items()):
        fail('Manifesto não corresponde ao pacote aprovado.')
    files = manifest.get('files')
    if not isinstance(files, list) or not files:
        fail('Manifesto de arquivos ausente.')
    approved = {}
    for entry in files:
        if not isinstance(entry, dict) or not all(k in entry for k in ('path', 'bytes', 'sha256')):
            fail('Entrada de manifesto inválida.')
        name = entry['path']
        if not isinstance(name, str) or name.startswith('/') or '\\' in name or any(x in ('', '.', '..') for x in name.split('/')):
            fail('Caminho inseguro no manifesto.')
        path = STAGE / 'driver' / name
        if name in approved or not path.is_file() or path.stat().st_size != entry['bytes'] or file_hash(path) != entry['sha256']:
            fail('Arquivo de homologação divergente: ' + name)
        approved[name] = path
    if 'main.dart.js' not in approved or 'index.html' not in approved:
        fail('Arquivos Flutter obrigatórios ausentes.')
    tone = [name for name in approved if name.endswith('/nova_corrida.mp3')]
    if len(tone) != 1 or file_hash(approved[tone[0]]) != AUDIO_SHA:
        fail('MP3 difere do toque aprovado.')

    live_index = (driver / 'index.html').read_text()
    matches = re.findall(r'https://maps.googleapis.com/maps/api/js\?key=([^&"\x27\s]+)', live_index)
    if len(matches) != 1 or not KEY_RE.fullmatch(matches[0]):
        fail('Chave pública Maps ativa não identificada; não usar placeholder.')
    current_maps = matches[0]
    hml_index = approved['index.html'].read_text()
    if hml_index.count('WEB_KEY_NOT_CONFIGURED_FOR_CI') != 1:
        fail('Placeholder Maps do pacote diferente do esperado.')
    if hml_index.count('<base href="/motorista-toque-hml/">') != 1:
        fail('Caminho de homologação diferente do esperado.')
    updated_index = (hml_index
        .replace('WEB_KEY_NOT_CONFIGURED_FOR_CI', current_maps)
        .replace('<base href="/motorista-toque-hml/">', '<base href="/motorista/">'))
    if 'WEB_KEY_NOT_CONFIGURED_FOR_CI' in updated_index or '<base href="/motorista/">' not in updated_index:
        fail('Configuração pública não foi reconstruída corretamente.')
    protected_hashes = {}
    for name in PROTECTED:
        old = driver / name
        if not old.is_file():
            fail('Configuração Push oficial ausente: ' + name)
        protected_hashes[name] = file_hash(old)
    if not (driver / 'manifest.json').is_file():
        fail('Manifesto Web oficial ausente.')

    used = measure(active) + measure(STAGE / 'driver')
    free = shutil.disk_usage(active).free
    if free < max(used * 3, 512 * 1024 * 1024):
        fail('Espaço livre insuficiente para copiar a versão preservando rollback.')

    RELEASE.mkdir(mode=0o755)
    try:
        shutil.copytree(active, BUNDLES, symlinks=False)
        new_driver = BUNDLES / 'driver'
        for name, original in approved.items():
            if name == 'index.html' or name in PROTECTED:
                continue
            destination = new_driver / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, destination)
        (new_driver / 'index.html').write_text(updated_index)
        if any(file_hash(new_driver / name) != hashval for name, hashval in protected_hashes.items()):
            fail('Configuração Push foi modificada.')
        if file_hash(new_driver / 'main.dart.js') != file_hash(approved['main.dart.js']):
            fail('Código compilado do toque difere do homologado.')
        new_tone = new_driver / tone[0]
        if file_hash(new_tone) != AUDIO_SHA:
            fail('Toque não corresponde ao aprovado.')
        if file_hash(active / 'driver/main.dart.js') != EXPECTED_ACTIVE_MAIN_SHA:
            fail('Motorista oficial mudou durante a preparação.')
        if measure(active / 'passenger') != measure(BUNDLES / 'passenger'):
            fail('Tamanho do Passageiro mudou durante cópia.')
        if file_hash(active / 'passenger/main.dart.js') != file_hash(BUNDLES / 'passenger/main.dart.js'):
            fail('Passageiro foi alterado.')
        if Path([m for m in inspect()['Mounts'] if m['Destination']=='/srv/web'][0]['Source']) != active:
            fail('Montagem mudou durante a preparação.')
        report = {
            'status':'PREPARED_NOT_ACTIVE',
            'sourceCommit': EXPECTED_SOURCE,
            'activeMount':str(active),
            'candidateMount':str(BUNDLES),
            'activeMainSha256': EXPECTED_ACTIVE_MAIN_SHA,
            'candidateMainSha256':file_hash(new_driver/'main.dart.js'),
            'audioSha256':AUDIO_SHA,
            'passengerPreserved':True,
            'pushPublicConfigPreserved':True,
            'mapsBrowserKeyPreserved':True,
            'gatewayUnchanged':True,
        }
        (RELEASE / 'prepare-report.json').write_text(json.dumps(report, indent=2)+'\n')
        print('CANDIDATO PRONTO, NAO PUBLICADO:', BUNDLES)
        print('Motorista oficial preservado:', active)
        print('SHA-256 do novo main.dart.js:', report['candidateMainSha256'])
        print('Mapas e configuração Web Push: preservados da versão oficial')
        print('Gateway: não foi reiniciado nem alterado')
    except BaseException:
        if RELEASE.exists():
            shutil.rmtree(RELEASE)
        raise


if __name__ == '__main__':
    main()
