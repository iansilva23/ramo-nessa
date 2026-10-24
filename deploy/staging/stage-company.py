"""Strict extraction of a hash-pinned company release; no service/SQL access."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile


def stage(archive, output, checksum):
    archive, output = Path(archive), Path(output)
    if not re.fullmatch('[a-f0-9]{64}', checksum) or archive.is_symlink() or not archive.is_file() or archive.stat().st_size > 250 * 1024**2:
        raise ValueError('Invalid archive')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != checksum:
        raise ValueError('Archive checksum mismatch')
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) > 3000 or len({i.filename for i in infos}) != len(infos) or sum(i.file_size for i in infos) > 350 * 1024**2:
            raise ValueError('Unsupported archive size/duplicates')
        if any(i.flag_bits & 1 or i.file_size > 50 * 1024**2 or (i.external_attr >> 16) & 0o170000 == 0o120000 for i in infos):
            raise ValueError('Unsupported archive entry')
        manifest = json.loads(z.read('company-manifest.json'))
        if manifest.get('source') != '25d429e11b282be8832538ebd11d41123526fd5a':
            raise ValueError('Unexpected source')
        entries = manifest['files']
        names = [f['path'] for f in entries]
        if len(set(names)) != len(names) or set(names) | {'company-manifest.json'} != {i.filename for i in infos}:
            raise ValueError('Unexpected entries')
        payload = {}
        for f in entries:
            p = PurePosixPath(f['path'])
            if p.is_absolute() or '..' in p.parts or str(p) != f['path'] or p.parts[0] not in {'core', 'migration', 'admin'} or '\\' in f['path']:
                raise ValueError('Invalid path')
            raw = z.read(f['path'])
            if len(raw) != f['bytes'] or hashlib.sha256(raw).hexdigest() != f['sha256']:
                raise ValueError('File checksum mismatch')
            payload[f['path']] = raw
        output.mkdir(mode=0o700, parents=False, exist_ok=False)
        for name, raw in payload.items():
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        (output / 'company-manifest.json').write_bytes(z.read('company-manifest.json'))
    return {'source': manifest['source'], 'files': len(payload)}


if __name__ == '__main__':
    print(json.dumps(stage(*sys.argv[1:])))
