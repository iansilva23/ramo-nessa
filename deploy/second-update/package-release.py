"""Build bounded, hashed ZIP payloads from CI output, never from the VPS."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

SOURCE = os.environ['GITHUB_SHA']
BASE = '68329f8540447b6994ef8d7255fcd69b04d7d3a1'
CORE = ['dist/src/db/repositories.js', 'dist/src/drivers/driver-document-private-storage.js', 'dist/src/server.js']
NEW = ['dist/src/account-deletion/' + n + '.js' for n in ['account-deletion-page', 'account-deletion-routes', 'self-account-deletion']]
MIGRATION = 'migrations/105_self_account_deletion.sql'
ADMIN = 'apps/admin/src/site-admin.js'

def sha(raw): return hashlib.sha256(raw).hexdigest()

def package(component, root, paths, extra=None, baseline=None):
    files = {}
    modes = {}
    total = 0
    with zipfile.ZipFile('RamoNessa-Segunda-' + component + '.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(paths):
            path = root / name
            assert path.resolve().is_relative_to(root.resolve()), name
            assert path.is_file() and len(Path(name).parts) < 80
            raw = path.read_bytes()
            total += len(raw)
            assert total < 600 * 1024**2 and len(files) < 30000
            files[name] = sha(raw)
            modes[name] = path.stat().st_mode & 0o777
            archive.writestr(component + '/' + name, raw)
        archive.writestr('manifest.json', json.dumps({'source': SOURCE, 'productSource': '3f6a9f57b447c1308ec587ad0e053fada4142fc3', 'component': component, 'files': files, 'modes': modes, 'baseline': baseline or {}, **(extra or {})}))

component = sys.argv[1]
if component in ('driver', 'passenger'):
    root = Path('apps') / component / 'build/web'
    package(component, root, [str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()], {'basePath': '/motorista/' if component == 'driver' else '/passageiro/'})
elif component == 'core':
    baseline = {n: sha((Path('/tmp/ramo-second-baseline/backend/core') / n).read_bytes()) for n in CORE}
    package('core', Path('backend/core'), CORE + NEW + [MIGRATION], baseline=baseline)
    baseline_admin = subprocess.check_output(['git', 'show', BASE + ':' + ADMIN])
    package('admin', Path('apps/admin'), ['src/site-admin.js'], baseline={'src/site-admin.js': sha(baseline_admin)})
elif component == 'site':
    root = Path('apps/institutional-site/.next/standalone')
    paths = []
    for directory, dirs, names in os.walk(root, followlinks=True):
        assert len(Path(directory).relative_to(root).parts) < 80
        for name in names:
            paths.append(str((Path(directory) / name).relative_to(root)))
    package('site', root, paths)
else:
    raise ValueError('Unknown component')
