#!/usr/bin/env python3
"""Stage a verified Motorista ringtone bundle without touching running containers."""
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path('/opt/ramo-nessa-toque-hml')
GATEWAY = 'ramo-nessa-staging-gateway-1'
TONE_SHA = '715ddb02d47699c91d48820d6ee8eb3fd1eb860d2517e54acd731609ead6bb25'
MAX_ZIP = 128 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024


def stop(reason):
    raise SystemExit('PARADO, SEM TROCA DE SERVICOS: ' + reason)


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(value):
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        stop('Caminho invalido no ZIP.')
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ('.', '..') for part in path.parts) or path.as_posix() != value:
        stop('ZIP contem caminho inseguro.')
    return value


def docker_snapshot():
    result = subprocess.run(
        ['docker', 'inspect', GATEWAY], capture_output=True, text=True, timeout=30, check=False
    )
    if result.returncode:
        stop('Gateway indisponivel. Execute a conferencia antes de instalar.')
    gateway = json.loads(result.stdout)[0]
    if not gateway['State'].get('Running') or (gateway['State'].get('Health') or {}).get('Status') != 'healthy':
        stop('Gateway nao esta saudavel.')
    mounts = [m for m in gateway['Mounts'] if m.get('Destination') == '/srv/web']
    if len(mounts) != 1 or mounts[0].get('Type') != 'bind':
        stop('Montagem Web do Gateway nao reconhecida.')
    old_root = Path(mounts[0]['Source'])
    if not old_root.is_dir() or not (old_root / 'driver/index.html').is_file() or not (old_root / 'driver/main.dart.js').is_file():
        stop('Pacote Motorista ativo nao foi identificado.')
    return {
        'gateway': GATEWAY,
        'activeWebRoot': str(old_root),
        'activeDriverIndexSha256': sha_bytes((old_root / 'driver/index.html').read_bytes()),
        'activeDriverMainSha256': sha_bytes((old_root / 'driver/main.dart.js').read_bytes()),
    }


def main():
    if os.geteuid() != 0:
        stop('Execute com sudo (apenas para criar pasta isolada em /opt).')
    if len(sys.argv) != 3:
        stop('Uso: sudo python3 stage-tone-hml.py PACOTE.zip SHA256')
    archive = Path(sys.argv[1])
    expected = sys.argv[2]
    if len(expected) != 64 or any(ch not in '0123456789abcdef' for ch in expected):
        stop('SHA-256 do pacote invalido.')
    try:
        info = archive.lstat()
    except OSError:
        stop('ZIP nao encontrado.')
    if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_ZIP or info.st_size == 0:
        stop('Arquivo ZIP invalido ou muito grande.')
    if sha_bytes(archive.read_bytes()) != expected:
        stop('O hash do arquivo nao corresponde ao manifestado.')
    runtime = docker_snapshot()
    try:
        z = zipfile.ZipFile(archive)
    except (OSError, zipfile.BadZipFile):
        stop('ZIP invalido.')
    with z:
        entries = z.infolist()
        if not entries or len(entries) > 5000:
            stop('Numero de arquivos inesperado.')
        names = [safe_path(i.filename) for i in entries]
        if len(names) != len(set(names)) or len(names) != len(set(n.casefold() for n in names)):
            stop('Arquivos duplicados no ZIP.')
        if any(i.is_dir() or stat.S_IFMT(i.external_attr >> 16) not in (0, stat.S_IFREG) for i in entries):
            stop('ZIP contem entrada especial.')
        if sum(i.file_size for i in entries) > MAX_EXPANDED:
            stop('ZIP expandido excede o limite.')
        if 'manifest.hml.json' not in names:
            stop('Manifesto de homologacao ausente.')
        manifest = json.loads(z.read('manifest.hml.json'))
        required = {'schemaVersion': 1, 'role': 'driver', 'basePath': '/motorista-toque-hml/',
                    'expectedOrigin': 'https://app.ramonessa.com.br',
                    'ciPreviewOnly': True, 'maps': 'PLACEHOLDER - NAO PUBLICAR',
                    'push': 'DESATIVADO - NAO PUBLICAR', 'audioSha256': TONE_SHA}
        if not isinstance(manifest, dict) or any(type(manifest.get(k)) is not type(v) or manifest[k] != v for k, v in required.items()):
            stop('Manifesto nao e um pacote de homologacao aprovado.')
        commit = manifest.get('sourceCommit')
        if not isinstance(commit, str) or len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
            stop('Commit da origem invalido.')
        records = manifest.get('files')
        if not isinstance(records, list) or not records:
            stop('Lista de arquivos ausente.')
        declared = {}
        for entry in records:
            if not isinstance(entry, dict) or set(entry) != {'path', 'bytes', 'sha256'}:
                stop('Registro de integridade invalido.')
            name = safe_path(entry['path'])
            if name in declared or type(entry['bytes']) is not int or entry['bytes'] < 0:
                stop('Registro duplicado ou tamanho invalido.')
            if not isinstance(entry['sha256'], str) or len(entry['sha256']) != 64:
                stop('Hash do arquivo invalido.')
            declared[name] = entry
        if set(names) != {'manifest.hml.json', *('driver/' + name for name in declared)}:
            stop('Conteudo ZIP diverge do manifesto.')
        if not any(name.endswith('/nova_corrida.mp3') for name in declared):
            stop('Toque nao encontrado no pacote.')
        for name, item in declared.items():
            value = z.read('driver/' + name)
            if len(value) != item['bytes'] or sha_bytes(value) != item['sha256']:
                stop('Arquivo diverge do manifesto: ' + name)
        if b'<base href="/motorista-toque-hml/">' not in z.read('driver/index.html'):\n            stop('O bundle nao foi isolado na rota de homologacao.')\n        if b'WEB_KEY_NOT_CONFIGURED_FOR_CI' not in z.read('driver/index.html'):
            stop('Pacote nao esta isolado da configuracao de producao.')
        if ROOT.is_symlink():
            stop('Pasta de destino nao pode ser link simbolico.')
        ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
        ROOT.chmod(0o700)
        destination = ROOT / ('review-' + commit[:12])
        if destination.exists() or destination.is_symlink():
            stop('Essa revisao ja foi preparada; nao sobrescrever.')
        tmp = Path(tempfile.mkdtemp(prefix='.preparing-', dir=ROOT))
        try:
            private_driver = tmp / 'driver'
            private_driver.mkdir()
            for name in declared:
                p = private_driver / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(z.read('driver/' + name))
            (tmp / 'manifest.hml.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
            report = {
                'status': 'STAGED_ONLY_NOT_LIVE', 'sourceCommit': commit,
                'archiveSha256': expected, 'runtime': runtime,
                'stagedDriverMainSha256': declared['main.dart.js']['sha256'],
                'note': 'Sem deploy, sem Gateway recriado, sem alteracao ao ADM/Core/Passageiro.'
            }
            (tmp / 'report.private.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
            os.rename(tmp, destination)
        except BaseException:
            shutil.rmtree(tmp)
            raise
    print('HOMOLOGACAO PREPARADA EM PASTA ISOLADA:', destination)
    print('MONTAGEM WEB ATIVA (NAO ALTERADA):', runtime['activeWebRoot'])
    print('VERSAO CANDIDATA:', commit)
    print('SEM PUBLICACAO: falta comparar versoes e configurar acesso HTTPS isolado.')
    print('RELATORIO:', destination / 'report.private.json')


if __name__ == '__main__':
    main()
