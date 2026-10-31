"""Validate every payload byte before extracting into a new private directory."""
import hashlib, json, pathlib, re, stat, sys, zipfile

def stage(archive, output, checksum):
    archive, output = pathlib.Path(archive), pathlib.Path(output)
    with archive.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if output.exists() or actual != checksum:
        raise ValueError('NEARBY_ARCHIVE_CHANGED_OR_OUTPUT_EXISTS')
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        if len(entries) > 3000 or sum(i.file_size for i in entries) > 400*1024**2:
            raise ValueError('NEARBY_ARCHIVE_LIMIT')
        names = [i.filename for i in entries]
        if len(set(names)) != len(names): raise ValueError('NEARBY_DUPLICATE_PATH')
        for i in entries:
            p = pathlib.PurePosixPath(i.filename)
            if i.is_dir() or p.is_absolute() or '..' in p.parts or str(p) != i.filename or not re.fullmatch(r'[a-zA-Z0-9_./@+ -]+', i.filename) or stat.S_ISLNK(i.external_attr >> 16):
                raise ValueError('NEARBY_UNSAFE_PATH')
        manifest = json.loads(z.read('nearby-manifest.json'))
        files = manifest.get('files', [])
        expected = {f['path']: f for f in files}
        if len(expected) != len(files) or set(names) != set(expected) | {'nearby-manifest.json'}:
            raise ValueError('NEARBY_INCOMPLETE_MANIFEST')
        for path, f in expected.items():
            if not path.startswith(('core/dist/src/', 'passenger/')) or len(z.read(path)) != f['bytes'] or hashlib.sha256(z.read(path)).hexdigest() != f['sha256']:
                raise ValueError('NEARBY_PAYLOAD_CHECKSUM')
        output.mkdir(mode=0o700)
        for i in entries:
            target = output / i.filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(i.filename))
            target.chmod(0o600)

if __name__ == '__main__':
    if len(sys.argv) != 4: raise ValueError('archive output checksum required')
    stage(*sys.argv[1:])
