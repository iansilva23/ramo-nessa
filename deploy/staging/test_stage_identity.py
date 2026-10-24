import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
spec = importlib.util.spec_from_file_location('stage_identity', Path(__file__).with_name('stage-identity.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Extraction(unittest.TestCase):
    def build(self, root, name='driver/index.html', duplicate=False, wrong=False):
        archive = root / 'release.zip'
        payload = b'fixture'
        m = {'source': 'e36963c02716511da855f89a529175da04b51eff', 'files': [{'path': name, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}]}
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('identity-manifest.json', json.dumps(m))
            z.writestr(name, b'changed' if wrong else payload)
            if duplicate: z.writestr(name, payload)
        return archive, hashlib.sha256(archive.read_bytes()).hexdigest()
    def test_valid_payload_and_archive_checksum(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive, checksum = self.build(root)
            with self.assertRaises(ValueError): mod.stage(archive, root/'bad', '0'*64)
            mod.stage(archive, root/'out', checksum)
            self.assertEqual((root/'out/driver/index.html').read_bytes(), b'fixture')
    def test_driver_bundle_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive, checksum = self.build(root, name='driver/index.html')
            mod.stage(archive, root/'out', checksum)
            self.assertEqual((root/'out/driver/index.html').read_bytes(), b'fixture')
    def test_traversal_duplicates_and_payload_changes(self):
        for options in [{'name': '../outside'}, {'name': '/absolute'}, {'name': 'outside/index.html'}, {'name': 'driver/../outside'}, {'name': 'driver\\bad'}, {'duplicate': True}, {'wrong': True}]:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); archive, checksum = self.build(root, **options)
                with self.assertRaises(ValueError): mod.stage(archive, root/'out', checksum)
                self.assertFalse((root/'out').exists())

if __name__ == '__main__': unittest.main()
