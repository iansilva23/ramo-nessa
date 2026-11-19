import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('pix_abandon_rollout', Path(__file__).with_name('rollout.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RolloutTests(unittest.TestCase):
    def test_prepare_saves_private_return_config_without_restarting(self):
        guard = m.module(Path(os.environ['PIX_GUARD_PATH']), m.GUARD_SHA, 'prepare_test_guard')
        with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
            root = Path(tmp)
            anchor = root / 'anchor'
            diagnostic = root / 'preflight'
            diagnostic.mkdir()
            stack.enter_context(patch.object(m, 'ROOT', root))
            stack.enter_context(patch.object(m, 'ANCHOR', anchor))
            stack.enter_context(patch.object(m, 'CONFIG_SHA', m.sha(b'compose')))
            before = {'Id': m.CORE_ID, 'Image': m.BASE, 'Name': '/ramo-nessa-staging-core-1',
                      'Config': {'Labels': {'com.docker.compose.project.config_files': str(m.CONFIG)}},
                      'State': {'Running': True, 'Health': {'Status': 'healthy'}}}
            previous = json.dumps({'source': 'db71dbd92a6840d48cc5b3ce31dd9ac2016250ad', 'webAfter': {}}).encode()
            stack.enter_context(patch.object(m, 'PREVIOUS_PLAN', m.sha(previous)))
            baseline = {name: m.sha(name.encode()) for name in m.BEFORE}
            stack.enter_context(patch.object(m, 'BEFORE', baseline))
            h = Mock(PROJECT='ramo-nessa-staging')
            def inspect(name):
                if name.endswith('core-1'):
                    return copy.deepcopy(before)
                return {'Id': name, 'Name': '/' + name,
                        'State': {'Running': True, 'Health': {'Status': 'healthy'}},
                        'Mounts': [{'Destination': '/srv/web', 'Source': str(m.WEB), 'RW': False},
                                   {'Destination': '/etc/caddy/Caddyfile', 'Source': '/Caddyfile'}]}
            h.inspect.side_effect = inspect
            h.identity.side_effect = lambda c: (c['Id'],)
            def private_file(path):
                if path == m.CONFIG:
                    return b'compose'
                if path.name == 'plan.private.json':
                    return previous
                return json.dumps({'phase': 'completed', 'source': 'db71dbd92a6840d48cc5b3ce31dd9ac2016250ad'}).encode()
            h.private_file.side_effect = private_file
            commands = []
            def run(args, **kwargs):
                commands.append(args)
                if args[:3] == ['docker', 'exec', before['Name']]:
                    return args[-1].removeprefix('/app/dist/src/').encode()
                return b''
            h.run.side_effect = run
            h.bound_hash.return_value = 'caddy-digest'
            p = Mock(wraps=guard)
            p.tree.return_value = {}
            p.snapshot.return_value = self.plan()['snapshot']
            p.derive_image.return_value = 'sha256:candidate'
            p.verify_image_files.return_value = None
            for name in ['assets', 'runtime']:
                stack.enter_context(patch.object(m, name))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            old = os.umask(0o077)
            try:
                plan = m.prepare(h, p, Path(__file__).with_name('payload').resolve(), diagnostic)
            finally:
                os.umask(old)
            import stat
            for name in ['plan.private.json', 'core-before.private.json', 'core-after.private.json']:
                self.assertEqual(stat.S_IMODE((anchor / name).stat().st_mode), 0o600)
            before_model = json.loads((anchor / 'core-before.private.json').read_bytes())
            after_model = json.loads((anchor / 'core-after.private.json').read_bytes())
            after_model['services']['core']['image'] = m.BASE
            self.assertEqual(after_model, before_model)
            self.assertEqual(plan['before']['Id'], m.CORE_ID)
            for name in m.AFTER:
                self.assertEqual(m.sha((anchor / 'build-core/payload/dist/src' / name).read_bytes()), m.AFTER[name])
            self.assertFalse(any('up' in command for command in commands))

    def plan(self):
        return {'candidate': 'sha256:candidate', 'source': m.SOURCE,
                'before': {'Name': '/ramo-nessa-staging-core-1'},
                'snapshot': {'workdir': '/private/ops', 'model': {'services': {'core': {
                    'image': m.BASE, 'environment': {'EXAMPLE': 'preserved'},
                    'volumes': [{'source': '/private/credential', 'target': '/run/secret', 'read_only': True}],
                    'ports': [{'target': 8080, 'published': '8080'}]}}}},
                'web': {}, 'other': {}, 'identities': {}}

    def test_model_changes_only_core_image(self):
        plan = self.plan()
        expected = copy.deepcopy(plan['snapshot']['model'])
        expected['services']['core']['image'] = plan['candidate']
        self.assertEqual(m.model(plan, True), expected)
        self.assertEqual(m.model(plan, False), plan['snapshot']['model'])
        plan['snapshot']['model']['services']['gateway'] = {}
        with self.assertRaises(m.RolloutError):
            m.model(plan, True)

    def test_actual_payload_and_strict_scope(self):
        folder = Path(__file__).with_name('payload').resolve()
        content = m.payload(folder)
        self.assertEqual(set(content), {'dist/src/' + x for x in m.AFTER})
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'payload'
            import shutil
            shutil.copytree(folder, target)
            (target / 'extra.js').write_text('unexpected')
            with self.assertRaises(m.RolloutError):
                m.payload(target)
            (target / 'extra.js').unlink()
            (target / 'server.js').write_text('wrong')
            with self.assertRaises(m.RolloutError):
                m.payload(target)
            (target / 'server.js').unlink()
            (target / 'server.js').symlink_to(folder / 'server.js')
            with self.assertRaises(m.RolloutError):
                m.payload(target)

    def test_up_only_core_without_dependencies_pull_or_build(self):
        h = Mock(PROJECT='ramo-nessa-staging')
        m.up(h, self.plan(), 'after')
        args = h.run.call_args.args[0]
        self.assertEqual(args[-1], 'core')
        for option in ['--no-deps', '--no-build', '--force-recreate']:
            self.assertIn(option, args)
        self.assertEqual(args[args.index('--pull') + 1], 'never')
        self.assertEqual(args[args.index('-f') + 1], str(m.ANCHOR / 'core-after.private.json'))

    def test_success_verifies_and_changes_only_core(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(m, 'ANCHOR', Path(tmp)))
            calls = {name: stack.enter_context(patch.object(m, name))
                     for name in ['assets', 'runtime', 'probe', 'up', 'journal', 'rollback']}
            h = Mock()
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            m.activate(h, Mock(), self.plan())
            self.assertEqual(calls['up'].call_count, 1)
            self.assertEqual(calls['up'].call_args.args[-1], 'after')
            calls['rollback'].assert_not_called()
            h.inactive.assert_called_once()
            self.assertEqual(calls['journal'].call_args.args, ('completed',))

    def test_preflight_failure_cannot_restart(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(m, 'ANCHOR', Path(tmp)))
            stack.enter_context(patch.object(m, 'assets', side_effect=RuntimeError('changed')))
            up = stack.enter_context(patch.object(m, 'up'))
            rollback = stack.enter_context(patch.object(m, 'rollback'))
            with self.assertRaises(RuntimeError):
                m.activate(Mock(), Mock(), self.plan())
            up.assert_not_called()
            rollback.assert_not_called()

    def test_active_rides_prevent_switching(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(m, 'ANCHOR', Path(tmp)))
            for name in ['assets', 'runtime', 'probe']:
                stack.enter_context(patch.object(m, name))
            up = stack.enter_context(patch.object(m, 'up'))
            h = Mock()
            h.inactive.side_effect = RuntimeError('active ride')
            with self.assertRaises(RuntimeError):
                m.activate(h, Mock(), self.plan())
            up.assert_not_called()

    def test_start_and_public_probe_failure_restore_core(self):
        for failure in ['start', 'probe']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
                stack.enter_context(patch.object(m, 'ANCHOR', Path(tmp)))
                for name in ['assets', 'runtime', 'journal']:
                    stack.enter_context(patch.object(m, name))
                stack.enter_context(patch.object(m, 'probe', side_effect=[None, RuntimeError('probe')] if failure == 'probe' else None))
                stack.enter_context(patch.object(m, 'up', side_effect=RuntimeError('start') if failure == 'start' else None))
                rollback = stack.enter_context(patch.object(m, 'rollback'))
                stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
                with self.assertRaises(RuntimeError):
                    m.activate(Mock(), Mock(), self.plan())
                rollback.assert_called_once()

    def test_rollback_failure_is_recorded_for_review(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(m, 'ANCHOR', Path(tmp)))
            for name in ['assets', 'runtime', 'probe']:
                stack.enter_context(patch.object(m, name))
            journal = stack.enter_context(patch.object(m, 'journal'))
            stack.enter_context(patch.object(m, 'up', side_effect=RuntimeError('start')))
            stack.enter_context(patch.object(m, 'rollback', side_effect=RuntimeError('return')))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            with self.assertRaises(RuntimeError):
                m.activate(Mock(), Mock(), self.plan())
            self.assertEqual(journal.call_args.args, ('requires-review',))

    def test_foreign_deployment_is_not_overwritten(self):
        h = Mock(PROJECT='ramo-nessa-staging')
        h.run.return_value = b'current-core'
        h.inspect.return_value = {'Config': {'Labels': {
            'com.docker.compose.project': h.PROJECT, 'com.docker.compose.service': 'core',
            'com.docker.compose.project.config_files': '/another/deployment.json'}}}
        with self.assertRaises(m.RolloutError):
            m.current(h, self.plan())

    def test_rollback_ownership_failure_cannot_restart(self):
        with patch.object(m, 'assets'), patch.object(m, 'current', side_effect=RuntimeError('foreign')), patch.object(m, 'up') as up:
            with self.assertRaises(RuntimeError):
                m.rollback(Mock(), Mock(), self.plan())
            up.assert_not_called()

    def test_rollback_does_not_restore_database(self):
        with contextlib.ExitStack() as stack:
            for name in ['assets', 'runtime', 'probe', 'journal']:
                stack.enter_context(patch.object(m, name))
            stack.enter_context(patch.object(m, 'current', return_value=(None, False)))
            up = stack.enter_context(patch.object(m, 'up'))
            m.rollback(Mock(), Mock(), self.plan())
            self.assertEqual(up.call_args.args[-1], 'before')


if __name__ == '__main__':
    unittest.main()
