"""Extract only the six reviewed compiled files. No service or database access."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

SOURCE = '731d524d55ecfab945605c00611abd067bc955c5'
ZIP_SHA = 'd32112d01b48c2c72af6a70ebab3bc8f565c3c87d6e3ac5fc2c42314f507d2eb'
BASE = 'fd2e9deff407ab687d7085abf12c87ff0256856c08a809332860797e09bcd245'
NEXT = '28d8faa762d6da73c3a7bf0fa26f1fbe6e653cf9aa202be7c268d9f45aba5509'
LOCK = '3c131484e89086f9de48ab3ba97bb62be54baa407c0d34fa52629a55bd2a403e'
FILES = {'dist/src/' + name + suffix for name in (
    'server.js', 'places/google-places-service.js', 'places/google-primary-places.js'
) for suffix in ('', '.map')}


def stage(archive, output):
    archive, output = Path(archive), Path(output)
    if not archive.is_file() or archive.is_symlink() or archive.stat().st_size > 2_000_000:
        raise ValueError('Invalid Core archive')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ZIP_SHA:
        raise ValueError('Core archive checksum mismatch')
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        if len(infos) != 7 or {i.filename for i in infos} != FILES | {'core-patch-manifest.json'}:
            raise ValueError('Unexpected archive entries')
        if any(i.file_size > 4_000_000 or i.flag_bits & 1 or (i.external_attr >> 16) & 0o170000 == 0o120000 for i in infos):
            raise ValueError('Unsupported archive entry')
        manifest = json.loads(z.read('core-patch-manifest.json'))
        expected = {'format': 1, 'source': SOURCE, 'baselineSourceSha256': BASE,
                    'candidateSourceSha256': NEXT, 'packageLockSha256': LOCK,
                    'financialCodePreserved': True, 'migrationsUnchanged': True}
        if any(manifest.get(k) != v for k, v in expected.items()):
            raise ValueError('Unexpected build provenance')
        entries = manifest['files']
        if len(entries) != 6 or {f['path'] for f in entries} != FILES:
            raise ValueError('Unexpected patch manifest')
        payload = {}
        for item in entries:
            raw = z.read(item['path'])
            if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
                raise ValueError('Compiled file checksum mismatch')
            payload[item['path']] = raw
        output.mkdir(mode=0o700, parents=False, exist_ok=False)
        for name, raw in payload.items():
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        (output / 'core-patch-manifest.json').write_bytes(z.read('core-patch-manifest.json'))
    return manifest


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: stage-google-core.py archive.zip new-directory')
    result = stage(*sys.argv[1:])
    print(json.dumps({'source': result['source'], 'files': len(result['files'])}))
