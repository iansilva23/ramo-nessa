import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import unittest

p=Path(__file__).with_name('inspect-readiness.py')
s=importlib.util.spec_from_file_location('privacy_readiness',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class ReadinessTests(unittest.TestCase):
 def containers(self):
  return [{'Image':m.CORE_IMAGE,'State':{'Running':True,'Health':{'Status':'healthy'}},'Config':{'Env':['SECRET=never-print-this']}},{'Image':m.GATEWAY_IMAGE,'State':{'Running':True,'Health':{'Status':'healthy'}},'Mounts':[{'Destination':'/srv/web','Source':m.WEB}]}]
 def test_inventory_never_exposes_container_environment_and_only_executes_read_only_probe(self):
  calls=[]
  def command(args):
   calls.append(args)
   return json.dumps(self.containers() if args[1]=='inspect' else {'dbPoolMax':4,'schema':[]}).encode()
  with patch.object(m,'command',side_effect=command),patch.object(m.subprocess,'run',return_value=SimpleNamespace(stdout='timer ramo-backup.timer')):
   result=m.collect()
  self.assertFalse(result['changesApplied']);self.assertFalse(result['accountDeleted'])
  self.assertNotIn('never-print-this',json.dumps(result))
  self.assertEqual(len(calls),2);self.assertEqual(calls[1][1],'exec')
  self.assertIn('BEGIN READ ONLY',calls[1][-1]);self.assertNotIn('DELETE FROM',calls[1][-1])
 def test_wrong_active_image_stops_before_database_access(self):
  values=self.containers();values[0]['Image']='unrecognized'
  with patch.object(m,'command',return_value=json.dumps(values))as command:
   with self.assertRaises(AssertionError):m.collect()
   self.assertEqual(command.call_count,1)

if __name__=='__main__':unittest.main()
