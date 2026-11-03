import copy
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock

HERE = Path(__file__).parent
ROOT = HERE.parent.parent

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

m = load('whatsapp_activation', HERE / 'activate-whatsapp.py')
contracts = load('previous_contracts', ROOT / 'deploy/android-lock/test_activate_lock_candidate.py')

class WhatsAppActivationTests(unittest.TestCase):
    def helper(self):
        return load('previous_activation_test', ROOT / 'deploy/android-lock/activate-lock-candidate.py')

    def test_exact_helper_is_preserved(self):
        self.assertEqual(m.digest((ROOT / 'deploy/android-lock/activate-lock-candidate.py').read_bytes()), m.HELPER_HASH)

    def plan(self):
        return {'configPath':'/config','workdir':'/work','originalImage':m.EXPECTED,
                'candidateId':'candidate','originalHashes':{}}

    def test_runtime_permits_only_explicit_whatsapp_flag(self):
        h = self.helper()
        before, _, _ = contracts.fixture()
        before['Image'] = m.EXPECTED
        after = copy.deepcopy(before)
        after['Image'] = 'candidate'
        after['Config']['Env'].append(m.FLAG + '=disabled')
        m.configure(h, Path('/anchor'), self.plan())
        h.runtime_matches(before, after, 'candidate')
        for field in ['OTHER_SETTING=changed', 'PRIVATE_TEST=changed']:
            bad = copy.deepcopy(after)
            bad['Config']['Env'] = [x for x in bad['Config']['Env'] if x.split('=')[0] != field.split('=')[0]] + [field]
            with self.assertRaises(RuntimeError):
                h.runtime_matches(before, bad, 'candidate')
        self.assertNotIn(m.FLAG + '=disabled', before['Config']['Env'])

    def test_original_environment_still_required_for_rollback(self):
        h = self.helper()
        before, _, _ = contracts.fixture()
        before['Image'] = m.EXPECTED
        m.configure(h, Path('/anchor'), self.plan())
        h.runtime_matches(before, before, m.EXPECTED)
        bad = copy.deepcopy(before)
        bad['Config']['Env'].append(m.FLAG + '=disabled')
        with self.assertRaises(RuntimeError):
            h.runtime_matches(before, bad, m.EXPECTED)

    def test_unknown_active_image_is_rejected_before_build_or_mutation(self):
        h = self.helper()
        h.inspect = Mock(return_value={'Image':'unrelated','State':{'Running':True}})
        h.run = Mock(side_effect=AssertionError('Must not execute mutation'))
        with tempfile.NamedTemporaryFile() as test_file:
            with self.assertRaises(RuntimeError):
                m.activate(h, Path(test_file.name))
        h.run.assert_not_called()

    def test_patch_rejects_unknown_or_already_patched_module(self):
        for content in ['different module', m.FLAG + ' already here']:
            with self.assertRaises(RuntimeError):
                m.patch(content)

    def test_failed_candidate_restores_previous_release(self):
        h = self.helper()
        install, restore, verify_restore = Mock(), Mock(), Mock()
        check = Mock(side_effect=RuntimeError('health failed'))
        with self.assertRaises(RuntimeError):
            h.switch_release(install, check, restore, verify_restore)
        restore.assert_called_once()
        verify_restore.assert_called_once()

    def test_failed_rollback_is_not_reported_as_restored(self):
        h = self.helper()
        with self.assertRaisesRegex(RuntimeError, 'NÃO confirmado'):
            h.switch_release(Mock(), Mock(side_effect=RuntimeError()), Mock(side_effect=RuntimeError()), Mock())

if __name__ == '__main__':
    unittest.main()
