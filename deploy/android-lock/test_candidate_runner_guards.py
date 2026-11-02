import importlib.util
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("candidate_runner",HERE/"test-lock-candidate.py")
runner=importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

class CandidateRunnerGuards(unittest.TestCase):
    def test_config_id_is_accepted(self):
        self.assertTrue(runner.image_matches({"Id":"sha256:expected"},"sha256:expected"))
    def test_manifest_digest_is_distinct_from_config_id(self):
        self.assertTrue(runner.image_matches({"Id":"sha256:config","RepoDigests":["local/image@sha256:manifest"]},"sha256:manifest"))
    def test_descriptor_digest_is_accepted(self):
        self.assertTrue(runner.image_matches({"Id":"sha256:config","Descriptor":{"digest":"sha256:manifest"}},"sha256:manifest"))
    def test_wrong_image_is_rejected(self):
        self.assertFalse(runner.image_matches({"Id":"sha256:other","RepoDigests":["local/image@sha256:other"]},"sha256:expected"))
    def test_embedded_payload_matches_reviewed_file(self):
        self.assertEqual(runner.TEST_SOURCE,(HERE/"lock-candidate.test.mjs").read_text())

if __name__=="__main__":
    unittest.main()

