import importlib.util
from pathlib import Path
import unittest
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('restore_exact',HERE/'restore-exact-guide.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DriverPreservation(unittest.TestCase):
 def test_passenger_change_does_not_block_identical_driver(self):
  m.require_driver_unchanged({'driver/main.dart.js':{'sha256':'a','mode':420},'passenger/main.dart.js':{'sha256':'b'}},{'driver/main.dart.js':{'sha256':'a','mode':420},'passenger/main.dart.js':{'sha256':'c'}})
 def test_driver_changes_fail_before_activation(self):
  before={'driver/main.dart.js':{'sha256':'a','mode':420}}
  for after in [{},{'driver/main.dart.js':{'sha256':'b','mode':420}},{'driver/main.dart.js':{'sha256':'a','mode':384}},{**before,'driver/extra':{}}]:
   with self.subTest(after=after),self.assertRaises(RuntimeError):m.require_driver_unchanged(before,after)
 def test_only_confirmed_runtime_is_accepted(self):
  self.assertEqual(str(m.OLD_ANCHOR),'/opt/ramo-nessa-security/restore-guide-cinema-6047ec587faa')
  self.assertEqual(m.OLD_ACTIVATOR_SHA,'5a5cea3e198eff3bd1d15b8871417eb13898be810492c01dadc049de99b8de71')
if __name__=='__main__':unittest.main()
