import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('activation', Path(__file__).with_name('activate-lock-candidate.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    runtime = {
        'Id': 'container-original', 'Name': '/' + m.NAMES[0], 'Image': m.OLD,
        'State': {'Running': True, 'StartedAt': 'before', 'Health': {'Status': 'healthy'}},
        'Config': {'Env': ['PATH=/usr/bin', 'PRIVATE_TEST=one$two$$three'],
                   'User': 'node', 'Cmd': ['node', 'server.js']},
        'Mounts': [{'Type': 'bind', 'Source': '/tmp/private-test', 'Destination': '/secret', 'RW': False},
                   {'Type': 'volume', 'Name': 'ramo_driver_docs', 'Source': '/docker/ramo_driver_docs',
                    'Destination': '/documents', 'RW': True}],
        'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'}, 'Memory': 0},
        'NetworkSettings': {'Networks': {'ramo_network': {'IPAddress': '172.20.0.2'}}},
    }
    model = {'name': m.PROJECT, 'services': {'core': {
        'image': m.OLD, 'environment': {'PRIVATE_TEST': 'one$$two$$$$three'},
        'volumes': [{'type': 'bind', 'source': '/tmp/private-test', 'target': '/secret', 'read_only': True},
                    {'type': 'volume', 'source': 'docs', 'target': '/documents'}],
        'networks': {'default': {}}, 'restart': 'unless-stopped'}},
        'volumes': {'docs': {'name': 'ramo_driver_docs', 'external': True}},
        'networks': {'default': {'name': 'ramo_network', 'external': True}}}
    image = {'Id': m.OLD, 'Config': {'Env': ['PATH=/usr/bin']}}
    return runtime, model, image


class ActivationContractTests(unittest.TestCase):
    def test_only_image_changes_in_private_clone(self):
        _, model, _ = fixture()
        original = copy.deepcopy(model)
        model['services']['postgres'] = {'image': 'postgres:16'}
        original['services']['postgres'] = {'image': 'postgres:16'}
        after = m.image_only(model, m.NEXT)
        self.assertEqual(model, original)
        self.assertEqual(after['services']['core']['environment'], original['services']['core']['environment'])
        after['services']['core']['image'] = m.OLD
        self.assertEqual(after, original)

    def test_dollar_secrets_survive_resolved_comparison(self):
        runtime, model, image = fixture()
        m.assert_environment(model, runtime, image)
        runtime['Config']['Env'][1] = 'PRIVATE_TEST=different-secret-do-not-print'
        with self.assertRaises(RuntimeError) as caught:
            m.assert_environment(model, runtime, image)
        self.assertNotIn('different-secret', str(caught.exception))

    def test_env_file_refused(self):
        _, model, _ = fixture()
        model['services']['core']['env_file'] = ['/tmp/other.env']
        with self.assertRaises(RuntimeError):
            m.image_only(model, m.NEXT)

    def test_unexpected_project_refused(self):
        _, model, _ = fixture()
        model['name'] = 'other'
        with self.assertRaises(RuntimeError):
            m.image_only(model, m.NEXT)

    def test_external_volumes_and_networks_match_actual_mounts(self):
        runtime, model, _ = fixture()
        m.assert_mount_plan(model, runtime)
        for mutation in ('secret-read-write', 'new-database-volume', 'other-network', 'missing-secret'):
            bad = copy.deepcopy(model)
            if mutation == 'secret-read-write':
                bad['services']['core']['volumes'][0]['read_only'] = False
            elif mutation == 'new-database-volume':
                bad['volumes']['docs']['name'] = 'empty-documents'
            elif mutation == 'other-network':
                bad['networks']['default']['name'] = 'other'
            else:
                bad['services']['core']['volumes'].pop(0)
            with self.subTest(mutation=mutation), self.assertRaises(RuntimeError):
                m.assert_mount_plan(bad, runtime)

    def test_recreated_core_preserves_runtime_except_identity_and_ip(self):
        before, _, _ = fixture()
        after = copy.deepcopy(before)
        after.update(Id='new', Image=m.NEXT)
        after['State']['StartedAt'] = 'after'
        after['NetworkSettings']['Networks']['ramo_network']['IPAddress'] = '172.20.0.3'
        m.runtime_matches(before, after, m.NEXT)
        for mutation in ('provider-key', 'mount', 'restart', 'unhealthy', 'other-image'):
            bad = copy.deepcopy(after)
            if mutation == 'provider-key':
                bad['Config']['Env'].append('UNEXPECTED_PROVIDER_TOKEN=never-print-this')
            elif mutation == 'mount':
                bad['Mounts'][1]['Source'] = '/other-volume'
            elif mutation == 'restart':
                bad['HostConfig']['RestartPolicy']['Name'] = 'no'
            elif mutation == 'unhealthy':
                bad['State']['Health']['Status'] = 'unhealthy'
            else:
                bad['Image'] = 'other-release'
            with self.subTest(mutation=mutation), self.assertRaises(RuntimeError) as caught:
                m.runtime_matches(before, bad, m.NEXT)
            self.assertNotIn('never-print', str(caught.exception))

    def test_failed_install_or_verification_restores_before_reporting_failure(self):
        for failure_at in ('install', 'verify'):
            calls = []

            def step(name):
                calls.append(name)
                if name == failure_at:
                    raise RuntimeError('synthetic')

            with self.subTest(failure_at=failure_at), self.assertRaisesRegex(RuntimeError, 'restaurada e conferida'):
                m.switch_release(lambda: step('install'), lambda: step('verify'),
                                 lambda: step('restore'), lambda: step('check-restore'))
            self.assertEqual(calls[-2:], ['restore', 'check-restore'])

    def test_operator_interrupt_also_attempts_rollback(self):
        calls = []
        with self.assertRaisesRegex(RuntimeError, 'restaurada e conferida'):
            m.switch_release(lambda: (_ for _ in ()).throw(KeyboardInterrupt()), lambda: None,
                             lambda: calls.append('restored'), lambda: calls.append('verified'))
        self.assertEqual(calls, ['restored', 'verified'])

    def test_failed_rollback_is_never_reported_as_success(self):
        with self.assertRaisesRegex(RuntimeError, 'NÃO confirmado'):
            m.switch_release(lambda: None, lambda: (_ for _ in ()).throw(RuntimeError()),
                             lambda: (_ for _ in ()).throw(RuntimeError()), lambda: None)

    def test_success_does_not_restore(self):
        calls = []
        m.switch_release(lambda: calls.append('install'), lambda: calls.append('verified'),
                         lambda: self.fail('must not restore'), lambda: self.fail('must not restore'))
        self.assertEqual(calls, ['install', 'verified'])

    def test_rollback_refuses_unrelated_release_before_compose_mutation(self):
        current, _, _ = fixture()
        current['Image'] = 'newer-unrelated-release'
        with patch.object(m, 'intact'), patch.object(m, 'run', return_value=b'current'), \
                patch.object(m, 'inspect', return_value=current), patch.object(m, 'up') as up:
            with self.assertRaisesRegex(RuntimeError, 'retorno recusado'):
                m.rollback({'candidateId': m.NEXT})
            up.assert_not_called()

    def test_probe_has_no_real_driver_identity_or_state_changing_credentials(self):
        self.assertIn('Bearer invalid-screen-lock-probe', m.PROBE)
        self.assertIn("'POST',401", m.PROBE)
        self.assertNotIn('x-dev-driver-id', m.PROBE)

    @unittest.skipUnless(shutil.which('docker'), 'Docker unavailable locally; exercised by CI')
    def test_real_compose_roundtrip_preserves_literal_dollar_values(self):
        _, model, _ = fixture()
        with tempfile.TemporaryDirectory() as tmp, patch.object(m, 'WORKDIR', Path(tmp)):
            before = Path(tmp) / 'before.json'
            after = Path(tmp) / 'after.json'
            before.write_text(json.dumps(model))
            after.write_text(json.dumps(m.image_only(model, m.NEXT)))
            # This parses Compose only; never creates a container, volume or network.
            a = json.loads(subprocess.check_output(m.compose_args(before) + ['config', '--format', 'json']))
            b = json.loads(subprocess.check_output(m.compose_args(after) + ['config', '--format', 'json']))
            self.assertEqual(b, m.image_only(a, m.NEXT))
            runtime, _, image = fixture()
            m.assert_environment(a, runtime, image)


if __name__ == '__main__':
    unittest.main()
