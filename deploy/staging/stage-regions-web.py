"""Verify the approved two-role Web artifact before staging any public file."""
import argparse, hashlib, io, json, os, re, stat, zipfile
from pathlib import Path, PurePosixPath

SOURCE = 'fa5ad133c06721b5d9e48468a5e61a7fbd384c95'
ARCHIVE_SHA256 = 'ea823ef57c06ce1026565e0dbde74a0a72bb1125988761793900eea7b67445cb'

def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result: raise ValueError('Campo JSON duplicado.')
        result[key] = value
    return result

def safe_path(value):
    if not isinstance(value, str) or not value or any(c in value for c in ('\\', '\x00', ':')):
        raise ValueError('Caminho inválido.')
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in ('.', '..') for p in path.parts) or path.as_posix() != value:
        raise ValueError('Caminho inseguro.')
    return value

def validate_and_stage(archive, expected_sha, output):
    if not re.fullmatch('[a-f0-9]{64}', expected_sha): raise ValueError('Checksum inválido.')
    fd = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 128 * 1024**2: raise ValueError('ZIP inválido ou grande demais.')
        data = stream.read(128 * 1024**2 + 1)
    if hashlib.sha256(data).hexdigest() != expected_sha: raise ValueError('ZIP diferente do pacote aprovado.')
    with zipfile.ZipFile(io.BytesIO(data)) as bundle:
        entries = bundle.infolist()
        if not entries or len(entries) > 5000: raise ValueError('Quantidade de arquivos inválida.')
        names, folded, total = set(), set(), 0
        for entry in entries:
            name = safe_path(entry.filename)
            if name in names or name.casefold() in folded: raise ValueError('Arquivo duplicado.')
            names.add(name); folded.add(name.casefold()); total += entry.file_size
            if entry.is_dir() or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG) or entry.flag_bits & 1:
                raise ValueError('Entrada especial ou criptografada.')
            if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) or entry.file_size > 128 * 1024**2:
                raise ValueError('Compressão ou tamanho inválido.')
        if total > 512 * 1024**2 or not {'release.json', 'source-commit.txt'} <= names:
            raise ValueError('Manifesto ausente ou pacote grande demais.')
        if bundle.getinfo('release.json').file_size > 2 * 1024**2: raise ValueError('Manifesto grande demais.')
        manifest = json.loads(bundle.read('release.json'), object_pairs_hook=unique)
        expected = {'schemaVersion': 1, 'commit': SOURCE, 'expectedOrigin': 'https://app.ramonessa.com.br', 'expectedProject': 'ramo-nessa', 'structuralCheck': True, 'providerHomologation': False}
        if not isinstance(manifest, dict) or any(type(manifest.get(k)) is not type(v) or manifest.get(k) != v for k, v in expected.items()):
            raise ValueError('Manifesto diferente da referência aprovada.')
        if bundle.read('source-commit.txt').decode().strip() != SOURCE or set(manifest.get('roles', {})) != {'passenger', 'driver'}:
            raise ValueError('Origem ou aplicativos divergentes.')
        declared, contents = {}, {}
        for role in ('passenger', 'driver'):
            records = manifest['roles'][role].get('files')
            if not isinstance(records, list) or not records: raise ValueError('Lista de arquivos inválida.')
            for item in records:
                if not isinstance(item, dict) or set(item) != {'path', 'bytes', 'sha256'}: raise ValueError('Registro inválido.')
                name = role + '/' + safe_path(item['path'])
                if name in declared or type(item['bytes']) is not int or item['bytes'] < 0 or not re.fullmatch('[a-f0-9]{64}', item.get('sha256', '')):
                    raise ValueError('Registro duplicado ou inválido.')
                declared[name] = item
        if names != {'release.json', 'source-commit.txt', *declared}: raise ValueError('Conteúdo fora do manifesto.')
        for name, item in declared.items():
            if bundle.getinfo(name).file_size != item['bytes']: raise ValueError('Tamanho divergente.')
            raw = bundle.read(name)
            if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']: raise ValueError('Hash divergente.')
            contents[name] = raw
        required = {'index.html', 'main.dart.js', 'flutter_bootstrap.js', 'manifest.json', 'ramo_push_config.js', 'ramo_push_worker.js', 'ramo_web_push.js', 'ramo_entry_gate.js', 'ramo_entry_gate.css'}
        for role, route in (('passenger', '/passageiro/'), ('driver', '/motorista/')):
            if not {role + '/' + p for p in required} <= contents.keys(): raise ValueError('Arquivo obrigatório ausente.')
            html = contents[role + '/index.html']
            if ('<base href="' + route + '">').encode() not in html: raise ValueError('Caminho Web inválido.')
            if any(marker in html for marker in (b'__RAMO_GOOGLE_MAPS_WEB_KEY__', b'WEB_KEY_NOT_CONFIGURED_FOR_CI')):
                raise ValueError('Pacote de revisão sem Maps não pode ser ativado.')
        output = Path(output)
        if output.exists() or output.is_symlink(): raise ValueError('Destino já existe.')
        output.mkdir(mode=0o755); output.chmod(0o755)
        for name, raw in contents.items():
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw); target.chmod(0o644)
        for path in output.rglob('*'):
            if path.is_dir(): path.chmod(0o755)
        return {'sourceCommit': SOURCE, 'archiveSha256': expected_sha, 'files': len(contents), 'expandedBytes': total, 'bundleRoot': str(output), 'providerHomologation': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try: print(json.dumps(validate_and_stage(args.archive, ARCHIVE_SHA256, args.output)))
    except Exception as error: raise SystemExit(str(error))
