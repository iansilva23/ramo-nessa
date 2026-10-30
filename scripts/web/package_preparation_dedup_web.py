#!/usr/bin/env python3
"""Package the configured passenger candidate; never installs or activates it."""
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

BASELINE = '2fc82e5dfd0a2ccd958be088ed11970b262c6f15'
NAME = 'RamoNessa-Passageiro-Duplicacao-Web-20261030-r1.zip'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    root = Path('apps/passenger/build/web')
    source = os.environ['GITHUB_SHA']
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise RuntimeError('Invalid source revision.')
    index = (root / 'index.html').read_text()
    key = re.search(r'https://maps\.googleapis\.com/maps/api/js\?key=([^"\s<>]+)', index)
    if not key or not re.fullmatch(r'AIza[A-Za-z0-9_-]{35}', key.group(1)):
        raise RuntimeError('Configured Maps key missing; review-only bundles cannot be packaged.')
    push_text = (root / 'ramo_push_config.js').read_text()
    marker = 'self.ramoPushConfig = '
    if marker not in push_text:
        raise RuntimeError('Public notification configuration missing.')
    push = json.loads(push_text.split(marker, 1)[1].strip().removesuffix(';'))
    expected = json.loads(Path('config/web/firebase.public.json').read_text())['apps']['passenger']
    if push != expected:
        raise RuntimeError('Passenger public notification configuration changed.')
    rows = []
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise RuntimeError('Unexpected symbolic link.')
        if path.is_file():
            content = path.read_bytes()
            rows.append({'path': 'passenger/' + path.relative_to(root).as_posix(),
                         'bytes': len(content), 'sha256': digest(content)})
    if not rows:
        raise RuntimeError('Empty candidate.')
    manifest = {
        'format': 1, 'purpose': 'passenger-web-candidate-only-no-installer',
        'source': source, 'baselineSource': BASELINE, 'baseHref': '/passageiro/',
        'coreOrigin': 'same-origin', 'duplicateProtectionEnabledInCandidate': True,
        'apiProtectionRequiredBeforeActivation': True,
        'mapsWebKeySha256': digest(key.group(1).encode()),
        'pushConfigurationSha256': digest(json.dumps(push, sort_keys=True, separators=(',', ':')).encode()),
        'files': rows,
    }
    output = Path('artifacts/preparation-dedup')
    output.mkdir(parents=True, exist_ok=True)
    package = output / NAME
    notice = (
        'RAMO NESSA - PROTECAO CONTRA DUPLICACAO DE RESERVAS\n\n'
        'Pacote candidato somente do Passageiro Web. Nao contem instalador.\n'
        'Nao copie manualmente sobre a publicacao ativa.\n'
        'Exige a API de protecao contra duplicacao previamente testada e ativada.\n'
        'Conferir hashes e configuracao publica com a versao ativa antes da instalacao.\n'
        'Nao altera geracao/vencimento de Pix, financeiro, Motorista ou ADM.\n'
        'Nao instala, nao ativa e nao publica nada automaticamente na VPS.\n'
        'Fonte: ' + source + '\n'
    )
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr('preparation-web-manifest.json', json.dumps(manifest, indent=2) + '\n')
        archive.writestr('LEIA-ME.txt', notice)
        for row in rows:
            archive.write(root / row['path'].removeprefix('passenger/'), row['path'])
    with zipfile.ZipFile(package) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('ZIP integrity failure.')
        for row in rows:
            content = archive.read(row['path'])
            if len(content) != row['bytes'] or digest(content) != row['sha256']:
                raise RuntimeError('Candidate manifest verification failed.')
    (output / 'SHA256SUMS').write_text(digest(package.read_bytes()) + '  ' + NAME + '\n')
    print(json.dumps({'candidate': str(package), 'files': len(rows),
                      'sha256': digest(package.read_bytes()), 'deploymentPerformed': False}))


if __name__ == '__main__':
    main()
