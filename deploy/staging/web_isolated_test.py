import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('isolated', Path(__file__).with_name('test-web-isolated.py'))
isolated = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isolated)


class IsolationContracts(unittest.TestCase):
    def setUp(self):
        self.applied = {str(index) + '.sql': 'hash-' + str(index) for index in range(86)}
        self.files = {**self.applied, isolated.MIGRATION: isolated.CHECKSUM}

    def test_only_approved_pending_migration(self):
        isolated.migration_plan(self.applied, self.files)

    def test_reject_changed_history(self):
        self.files['0.sql'] = 'different'
        with self.assertRaises(ValueError):
            isolated.migration_plan(self.applied, self.files)

    def test_reject_additional_pending_migration(self):
        self.files['086.sql'] = 'unexpected'
        with self.assertRaises(ValueError):
            isolated.migration_plan(self.applied, self.files)

    def test_reject_already_applied_085(self):
        with self.assertRaises(ValueError):
            isolated.migration_plan(self.files, self.files)

    def test_reject_changed_085(self):
        self.files[isolated.MIGRATION] = 'different'
        with self.assertRaises(ValueError):
            isolated.migration_plan(self.applied, self.files)

    def test_backup_hash_and_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'database.dump').write_bytes(b'fixture')
            entry = dict(name='database.dump', sha256=hashlib.sha256(b'fixture').hexdigest())
            self.assertEqual(isolated.backup_file(root, entry), root / 'database.dump')
            with self.assertRaises(ValueError):
                isolated.backup_file(root, {**entry, 'sha256': 'wrong'})
            with self.assertRaises(ValueError):
                isolated.backup_file(root, {**entry, 'name': '../database.dump'})


if __name__ == '__main__':
    unittest.main()
