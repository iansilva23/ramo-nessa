import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch, Mock
import warnings
import zipfile

spec = importlib.util.spec_from_file_location('pix_rollout', Path(__file__).with_name('rollout-web.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RolloutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guard = m.module(Path(os.environ['PIX_GUARD_PATH']), m.GUARD_SHA, 'pix_test_guard')

    def test_completed_previous_plan_is_required_and_binds_current_gateway(self):
        previous = {
            'source': '4de7492fd5c06db1bef33c08197c4b475e9e4298',
            'configs': {'gateway-after.private.json': m.sha(b'compose')},
            'webAfter': {'passenger/main.dart.js': {'sha256': 'old'}},
            'before': {
                'Mounts': [{'Destination': '/srv/web', 'Source': '/old/web'}],
                'HostConfig': {'Binds': ['/old/web:/srv/web:ro'], 'Mounts': []},
            },
            'identities': {'core': ['unchanged-core']},
            'other': {'core': {'Name': 'core'}},
        }
        raw = json.dumps(previous).encode()
        state = json.dumps({'phase': 'completed', 'source': previous['source']}).encode()
        h = Mock()
        h.private_file.side_effect = lambda path: (
            raw if path.name == 'plan.private.json' else
            state if path.name == 'activation.private.json' else b'compose')
        h.inspect.side_effect = lambda name: {'Id': 'active-gateway'} if name.endswith('gateway-1') else {'Id': 'unchanged-core'}
        h.identity.side_effect = lambda obj: (obj['Id'],)
        p = Mock()
        p.tree.return_value = previous['webAfter']
        with patch.object(m, 'PREVIOUS_PLAN_SHA', m.sha(raw)), \
                patch.dict(m.BASE_IDS), patch.object(m, 'CONFIG_SHA', None):
            m.configure_confirmed_previous(h, p, active=True)
            expected = h.runtime_matches.call_args.args[0]
            self.assertEqual(expected['Mounts'][0]['Source'], str(m.OLD_WEB))
            self.assertEqual(expected['HostConfig']['Binds'], [str(m.OLD_WEB) + ':/srv/web:ro'])
            self.assertEqual(m.BASE_IDS['gateway'], 'active-gateway')
            self.assertEqual(m.CONFIG_SHA, m.sha(b'compose'))
            p.tree.return_value = {}
            with self.assertRaises(m.RolloutError):
                m.configure_confirmed_previous(h, p, active=True)
        with self.assertRaises(m.RolloutError):
            m.configure_confirmed_previous(h, p, active=True)

    def test_previous_rollback_does_not_require_old_gateway_to_be_active(self):
        previous = {'source': '4de7492fd5c06db1bef33c08197c4b475e9e4298',
                    'configs': {'gateway-after.private.json': m.sha(b'compose')},
                    'webAfter': {}}
        raw = json.dumps(previous).encode()
        state = json.dumps({'phase': 'completed', 'source': previous['source']}).encode()
        h = Mock()
        h.private_file.side_effect = lambda path: raw if path.name == 'plan.private.json' else state if path.name == 'activation.private.json' else b'compose'
        p = Mock()
        p.tree.return_value = {}
        with patch.object(m, 'PREVIOUS_PLAN_SHA', m.sha(raw)), patch.object(m, 'CONFIG_SHA', None):
            m.configure_confirmed_previous(h, p, active=False)
        h.inspect.assert_not_called()
        h.runtime_matches.assert_not_called()

    def snapshot(self):
        return {'workdir': '/ops', 'model': {'services': {'gateway': {
            'image': m.GATEWAY_IMAGE, 'environment': {'EXAMPLE': 'preserved'},
            'volumes': [{'type': 'bind', 'source': str(m.OLD_WEB), 'target': '/srv/web', 'read_only': True},
                        {'type': 'bind', 'source': m.CADDY_PATH, 'target': '/etc/caddy/Caddyfile', 'read_only': True}]}}}}

    def test_only_web_bind_changes_in_compose(self):
        original = self.snapshot()
        expected = copy.deepcopy(original['model'])
        expected['services']['gateway']['volumes'][0]['source'] = str(m.WEB)
        self.assertEqual(m.model(original, True), expected)
        self.assertEqual(m.model(original, False), original['model'])
        self.assertEqual(original, self.snapshot())

    def test_writable_or_unexpected_mount_is_rejected(self):
        for key, value in [('read_only', False), ('source', '/another-release')]:
            snapshot = self.snapshot()
            snapshot['model']['services']['gateway']['volumes'][0][key] = value
            with self.assertRaises(m.RolloutError):
                m.model(snapshot, True)

    def test_another_service_cannot_be_included(self):
        snapshot = self.snapshot()
        snapshot['model']['services']['core'] = {'image': m.CORE_IMAGE}
        with self.assertRaises(m.RolloutError):
            m.model(snapshot, True)

    def test_expected_runtime_preserves_caddy_and_original(self):
        original = {'Mounts': [{'Source': str(m.OLD_WEB), 'Destination': '/srv/web'},
                               {'Source': m.CADDY_PATH, 'Destination': '/etc/caddy/Caddyfile'}],
                    'HostConfig': {'Mounts': [{'Source': str(m.OLD_WEB), 'Target': '/srv/web'}],
                                   'Binds': [str(m.OLD_WEB) + ':/srv/web:ro', m.CADDY_PATH + ':/etc/caddy/Caddyfile:ro']}}
        plan = {'before': copy.deepcopy(original)}
        result = m.expected_gateway(plan, True)
        self.assertEqual(result['Mounts'][0]['Source'], str(m.WEB))
        self.assertEqual(result['HostConfig']['Mounts'][0]['Source'], str(m.WEB))
        self.assertEqual(result['HostConfig']['Binds'][0], str(m.WEB) + ':/srv/web:ro')
        self.assertEqual(result['Mounts'][1], original['Mounts'][1])
        self.assertEqual(plan['before'], original)

    def make_package(self, path, extra=(), source=None, symlink=False):
        content = {name: b'public-shell' for name in m.SHELL}
        content.update({'main.dart.js': b'new-pix-code', 'flutter_bootstrap.js': b'loader'})
        meta = {'source': source or m.SOURCE, 'role': 'passenger', 'testsRun': m.TEST_RUN,
                'api': 'https://app.ramonessa.com.br', 'mainSha256': m.sha(content['main.dart.js'])}
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(path, 'w') as z:
                z.writestr('BUILD-INFO.json', json.dumps(meta))
                for name, data in content.items():
                    z.writestr('passenger/' + name, data)
                for name in extra:
                    z.writestr(name, b'not allowed')
                if symlink:
                    entry = zipfile.ZipInfo('passenger/link')
                    entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                    z.writestr(entry, '/etc/passwd')
        return m.sha(path.read_bytes())

    def test_package_accepts_only_matching_source_and_hash(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'bundle.zip'
            digest = self.make_package(path)
            with patch.object(m, 'PACKAGE_SHA', digest):
                self.assertEqual(m.package(self.guard, path)['main.dart.js'], b'new-pix-code')
            with self.assertRaises(m.RolloutError):
                m.package(self.guard, path)
            digest = self.make_package(path, source='another-source')
            with patch.object(m, 'PACKAGE_SHA', digest), self.assertRaises(m.RolloutError):
                m.package(self.guard, path)

    def test_unsafe_duplicate_cross_component_and_symlink_packages_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'bundle.zip'
            for extras, link in [(('passenger/../driver/main.dart.js',), False),
                                 (('driver/main.dart.js',), False),
                                 (('passenger/main.dart.js',), False), ((), True)]:
                digest = self.make_package(path, extra=extras, symlink=link)
                with patch.object(m, 'PACKAGE_SHA', digest), self.assertRaises((m.RolloutError, self.guard.PreparationError)):
                    m.package(self.guard, path)

    def test_actual_published_package(self):
        content = m.package(self.guard, Path(os.environ['PIX_PACKAGE_PATH']))
        self.assertGreater(len(content['main.dart.js']), 1000000)
        self.assertIn(b'/passageiro/', content['index.html'])
        self.assertTrue(all(not name.startswith('../') for name in content))

    def test_up_targets_only_gateway_without_pull_build_or_dependencies(self):
        h = Mock(PROJECT='ramo-nessa-staging')
        m.up(h, {'snapshot': {'workdir': '/ops'}}, 'after')
        args = h.run.call_args.args[0]
        self.assertEqual(args[-1], 'gateway')
        self.assertNotIn('core', args)
        self.assertIn('--no-deps', args)
        self.assertIn('--no-build', args)
        self.assertEqual(args[args.index('--pull') + 1], 'never')

    def transaction(self, probe_failure=False, up_failure=False, ownership_failure=False):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(m, 'ANCHOR', Path(root.name)))
        calls = []
        phases = []
        stack.enter_context(patch.object(m, 'assets'))
        stack.enter_context(patch.object(m, 'runtime'))
        stack.enter_context(patch.object(m, 'journal', side_effect=phases.append))
        def up(h, plan, phase):
            calls.append(phase)
            if phase == 'after' and up_failure:
                raise RuntimeError('simulated gateway start failure')
        stack.enter_context(patch.object(m, 'up', side_effect=up))
        stack.enter_context(patch.object(m, 'probe', side_effect=[None, RuntimeError('public hash mismatch'), None]
                                  if probe_failure else None))
        stack.enter_context(patch.object(m, 'current', side_effect=RuntimeError('foreign operation')
                                  if ownership_failure else None, return_value=(None, False)))
        stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
        return calls, phases

    def test_success_changes_only_gateway(self):
        calls, phases = self.transaction()
        m.activate(Mock(), Mock(), {})
        self.assertEqual(calls, ['after'])
        self.assertEqual(phases, ['switching', 'completed'])

    def test_public_hash_failure_rolls_back_gateway(self):
        calls, phases = self.transaction(probe_failure=True)
        with self.assertRaises(RuntimeError):
            m.activate(Mock(), Mock(), {})
        self.assertEqual(calls, ['after', 'before'])
        self.assertEqual(phases[-1], 'rolled-back')
        self.assertNotIn('completed', phases)

    def test_start_failure_rolls_back_gateway(self):
        calls, phases = self.transaction(up_failure=True)
        with self.assertRaises(RuntimeError):
            m.activate(Mock(), Mock(), {})
        self.assertEqual(calls, ['after', 'before'])
        self.assertEqual(phases[-1], 'rolled-back')

    def test_foreign_operation_is_not_overwritten_during_rollback(self):
        calls, phases = self.transaction(up_failure=True, ownership_failure=True)
        with self.assertRaises(RuntimeError):
            m.activate(Mock(), Mock(), {})
        self.assertEqual(calls, ['after'])
        self.assertEqual(phases[-1], 'requires-review')

    def test_failed_preflight_cannot_restart_anything(self):
        calls, phases = self.transaction()
        with patch.object(m, 'assets', side_effect=RuntimeError('changed baseline')), self.assertRaises(RuntimeError):
            m.activate(Mock(), Mock(), {})
        self.assertEqual(calls, [])
        self.assertEqual(phases, [])

    def test_prepare_copies_return_and_preserves_driver_without_restart(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.ExitStack() as stack:
            root = Path(folder)
            security = root / 'security'
            security.mkdir(mode=0o700)
            releases = root / 'releases'
            releases.mkdir()
            old = releases / 'old' / 'bundles'
            for app in ('driver', 'passenger'):
                (old / app).mkdir(parents=True)
                for name in m.SHELL | {'main.dart.js', 'flutter_bootstrap.js'}:
                    (old / app / name).write_bytes((app + '/' + name).encode())
            anchor = security / 'anchor'
            web = releases / 'candidate' / 'bundles'
            config = security / 'original.json'
            config.write_bytes(b'{"original":"preserved"}')
            caddy = root / 'Caddyfile'
            caddy.write_bytes(b'example.test { respond 200 }\n')
            values = {'ROOT': security, 'ANCHOR': anchor, 'WEB': web, 'OLD_WEB': old,
                      'OLD_CONFIG': config, 'CONFIG_SHA': m.sha(config.read_bytes()),
                      'CADDY_PATH': str(caddy), 'CADDY_SHA': m.sha(caddy.read_bytes()),
                      'BASE_JS': {app: m.sha((old / app / 'main.dart.js').read_bytes())
                                  for app in ('driver', 'passenger')}}
            for name, value in values.items():
                stack.enter_context(patch.object(m, name, value))
            original = self.guard.tree(old)
            payload = {n: (old / 'passenger' / n).read_bytes()
                       for n in m.SHELL | {'main.dart.js', 'flutter_bootstrap.js'}}
            payload['main.dart.js'] = b'new passenger pix'
            snapshot = self.snapshot()
            snapshot.update(configPath=str(config), configSha256=m.CONFIG_SHA)
            containers = {}
            for role, id_ in m.BASE_IDS.items():
                containers['ramo-nessa-staging-' + role + '-1'] = {
                    'Id': id_, 'Name': '/ramo-nessa-staging-' + role + '-1',
                    'Image': m.CORE_IMAGE if role == 'core' else m.GATEWAY_IMAGE,
                    'State': {'Running': True, 'Health': {'Status': 'healthy'}}}
            containers['ramo-nessa-site-institutional-site-1'] = {
                'Id': 'site-id', 'Name': '/ramo-nessa-site-institutional-site-1',
                'State': {'Running': True, 'Health': {'Status': 'healthy'}}}
            gateway = containers['ramo-nessa-staging-gateway-1']
            gateway.update(Config={'Labels': {
                'com.docker.compose.project.config_files': str(config),
                'com.docker.compose.project': 'ramo-nessa-staging',
                'com.docker.compose.service': 'gateway'}},
                Mounts=[{'Destination': '/srv/web', 'Source': str(old), 'Type': 'bind', 'RW': False},
                        {'Destination': '/etc/caddy/Caddyfile', 'Source': str(caddy), 'RW': False}],
                HostConfig={'Mounts': [], 'Binds': [str(old) + ':/srv/web:ro']})
            h = Mock(PROJECT='ramo-nessa-staging')
            h.inspect.side_effect = lambda name: copy.deepcopy(containers[name.lstrip('/')])
            h.identity.side_effect = lambda c: (c['Id'],)
            h.private_file.side_effect = lambda path: path.read_bytes()
            h.bound_hash.side_effect = lambda path: m.sha(path.read_bytes())
            commands = []
            def run(args, **kwargs):
                commands.append(args)
                if args[:3] == ['docker', 'ps', '-aq']:
                    return b'gateway-id\n'
                if args[:2] == ['docker', 'exec']:
                    self.assertEqual(args[-2:], ['cat', '/etc/caddy/Caddyfile'])
                    return caddy.read_bytes()
                self.assertEqual(args[-3:], ['config', '--format', 'json'])
                is_after = 'gateway-after.private.json' in args[args.index('-f') + 1]
                return json.dumps(m.model(snapshot, is_after)).encode()
            h.run.side_effect = run
            guard = Mock(wraps=self.guard)
            guard.snapshot.return_value = snapshot
            stack.enter_context(patch.object(m, 'package', return_value=payload))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            diagnostic = security / 'preflight'
            diagnostic.mkdir(mode=0o700)
            previous = os.umask(0o077)
            try:
                plan = m.prepare(h, guard, root / 'already-verified.zip', diagnostic)
            finally:
                os.umask(previous)
            self.assertEqual(self.guard.tree(anchor / 'before-web'), original)
            self.assertEqual(self.guard.tree(old), original)
            self.assertEqual((web / 'driver' / 'main.dart.js').read_bytes(),
                             (old / 'driver' / 'main.dart.js').read_bytes())
            self.assertEqual((web / 'passenger' / 'main.dart.js').read_bytes(), b'new passenger pix')
            self.assertEqual(config.read_bytes(), b'{"original":"preserved"}')
            self.assertEqual(stat.S_IMODE((anchor / 'plan.private.json').stat().st_mode), 0o600)
            self.assertTrue(all('up' not in command for command in commands))
            self.assertEqual(m.model(snapshot, False)['services']['gateway']['image'], m.GATEWAY_IMAGE)
            self.assertEqual(plan['other']['core']['Id'], m.BASE_IDS['core'])


if __name__ == '__main__':
    unittest.main()
