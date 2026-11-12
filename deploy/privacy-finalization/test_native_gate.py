import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

root=Path(__file__).resolve().parent.parent.parent
s=importlib.util.spec_from_file_location('native_gate',root/'tooling/release/check-final-readiness.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class NativeGateTests(unittest.TestCase):
 def test_current_state_blocks_final_native_generation_including_queued_screen(self):
  pending=m.blockers(root/'tooling/release/final-readiness.json')
  self.assertIn('passenger_vehicle_selection_restored',pending)
  self.assertIn('account_deletion_enabled_and_verified',pending)
 def test_only_explicit_verified_booleans_can_clear_the_gate(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d)/'state.json';p.write_text(json.dumps({k:'true' for k in m.REQUIRED}))
   self.assertEqual(set(m.blockers(p)),m.REQUIRED)
   p.write_text(json.dumps({k:True for k in m.REQUIRED}))
   self.assertEqual(m.blockers(p),[])

if __name__=='__main__':unittest.main()
