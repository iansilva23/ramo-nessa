import ast
import importlib.util
from pathlib import Path
import unittest
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('restore_approved',HERE/'restore-approved-visuals.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RenderRestoreTest(unittest.TestCase):
 def test_only_reference_assignments_change(self):
  template=(HERE/'activate-web.py').read_text()
  values={'ANCHOR':Path('/safe/anchor'),'PLAN_SHA':'a'*64,'SOURCE':m.SOURCE,'BASELINE':'b'*64,'OLD_WEB':'/old','NEW_WEB':'/new','CORE_IMAGE':'core','GATEWAY_IMAGE':'gateway'}
  raw=m.render(template,values)
  tree=ast.parse(raw)
  functions=[ast.dump(n,include_attributes=False) for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))]
  expected=[ast.dump(n,include_attributes=False) for n in ast.parse(template).body if isinstance(n,(ast.FunctionDef,ast.ClassDef))]
  self.assertEqual(expected,functions)
  assignments={n.targets[0].id:n.value for n in tree.body if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)}
  self.assertEqual(m.SOURCE,ast.literal_eval(assignments['SOURCE']))
  self.assertEqual('a'*64,ast.literal_eval(assignments['PLAN_SHA']))
 def test_original_activator_reference_is_pinned(self):
  self.assertEqual('39a14705517a300111e9ae11b6f5a7d1ab64d935fb3f370bb15c4f9290ae053f',m.OLD_ACTIVATOR_SHA)
  self.assertEqual(m.OLD_ACTIVATOR_SHA,m.sha((HERE/'activate-web.py').read_bytes()))
if __name__=='__main__':unittest.main()
