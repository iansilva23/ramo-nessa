"""Check redaction and refusal of an unsafe or changing runtime using fixtures only."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('inspect_active', Path(__file__).with_name('inspect-active.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuntimeInventoryTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        compose = root / 'active.private.json'
        compose.write_text('{"secret":"PRIVATE_COMPOSE_VALUE"}')
        for role in ('driver', 'passenger'):
            (root / role).mkdir()
            for file in ('index.html', 'main.dart.js', 'ramo_push_config.js'):
                (root / role / file).write_text('PRIVATE_PUBLIC_CONFIG_VALUE')
        result = {}
        for service in ('core', 'gateway'):
            result[service] = {
                'Id': service + '-id', 'Name': service, 'Image': 'sha256:image',
                'State': {'StartedAt': 'now', 'Running': True, 'Health': {'Status': 'healthy'}},
                'Config': {'Env': ['SECRET=PRIVATE_ENV_VALUE'], 'Labels': {
                    'com.docker.compose.project.config_files': str(compose),
                }},
                'HostConfig': {'SecretOption': 'PRIVATE_HOST_VALUE'},
                'Mounts': [{'Type': 'bind', 'Source': str(root), 'Destination': '/srv/web', 'RW': False}],
            }
        return result

    def test_output_contains_hashes_and_no_configuration_values(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory)
            with patch.object(module, 'containers', return_value=fixture):
                data = module.collect()
            serialized = json.dumps(data)
            for secret in ('PRIVATE_COMPOSE_VALUE', 'PRIVATE_PUBLIC_CONFIG_VALUE', 'PRIVATE_ENV_VALUE', 'PRIVATE_HOST_VALUE'):
                self.assertNotIn(secret, serialized)
            self.assertFalse(data['changesApplied'])
            self.assertFalse(data['rollbackPrepared'])
            self.assertEqual(64, len(data['baselineSha256']))

    def test_refuses_symlink_in_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory)
            (Path(directory) / 'driver' / 'unsafe').symlink_to(Path(directory) / 'active.private.json')
            with patch.object(module, 'containers', return_value=fixture):
                with self.assertRaises(module.InventoryError):
                    module.collect()

    def test_refuses_concurrent_container_change(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = self.fixture(directory)
            after = copy.deepcopy(fixture)
            after['core']['Id'] = 'different-container'
            with patch.object(module, 'containers', side_effect=[fixture, after]):
                with self.assertRaises(module.InventoryError):
                    module.collect()

    def test_failure_does_not_print_private_exception_details(self):
        with patch.object(module, 'collect', side_effect=OSError('PRIVATE_ERROR_VALUE')):
            output = io.StringIO()
            with contextlib.redirect_stderr(output):
                self.assertEqual(1, module.main())
            self.assertNotIn('PRIVATE_ERROR_VALUE', output.getvalue())


if __name__ == '__main__':
    unittest.main()
