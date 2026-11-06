import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch
import tempfile,json

s=importlib.util.spec_from_file_location('privacy_prep',Path(__file__).with_name('prepare.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class ScopeTests(unittest.TestCase):
 def test_core_changes_only_image_and_enables_the_requested_feature(self):
  before={'services':{'core':{'image':m.CURRENT_CORE,'environment':{'DATABASE_URL':'private-untouched','TOKEN':'literal$$value','SELF_ACCOUNT_DELETION_ENABLED':'false'},'volumes':[{'source':'documents','target':'/var/lib/ramo-nessa'}],'read_only':True}}}
  result=m.candidate_model({'model':before},'core','candidate',Path('/candidate'))
  expected=copy.deepcopy(before);expected['services']['core']['image']='candidate';expected['services']['core']['environment']['SELF_ACCOUNT_DELETION_ENABLED']='true'
  self.assertEqual(result,expected);self.assertEqual(before['services']['core']['environment']['SELF_ACCOUNT_DELETION_ENABLED'],'false')
 def test_gateway_preserves_image_caddy_data_and_security(self):
  before={'services':{'gateway':{'image':m.GATEWAY,'environment':{'UNCHANGED':'private'},'volumes':[{'type':'bind','source':str(m.CURRENT_WEB),'target':'/srv/web','read_only':True},{'type':'bind','source':'original-caddy','target':'/etc/caddy/Caddyfile','read_only':True},{'type':'volume','source':'data','target':'/data'}],'cap_drop':['ALL']}}}
  result=m.candidate_model({'model':before},'gateway','unused',Path('/candidate'))
  expected=copy.deepcopy(before);expected['services']['gateway']['volumes'][0]['source']='/candidate'
  self.assertEqual(result,expected);self.assertEqual(before['services']['gateway']['volumes'][0]['source'],str(m.CURRENT_WEB))
 def test_wrong_active_web_is_rejected(self):
  snapshot={'model':{'services':{'gateway':{'volumes':[{'type':'bind','source':'other-release','target':'/srv/web','read_only':True}]}}}}
  with self.assertRaises(RuntimeError):m.candidate_model(snapshot,'gateway','unused',Path('/candidate'))
 def test_incomplete_previous_activation_blocks_before_any_candidate_creation(self):
  previous=SimpleNamespace(PLAN_SHA=m.CURRENT_PLAN,read_plan=lambda h:{},state=lambda h:{'phase':'requires-review'})
  h=Mock()
  with self.assertRaises(RuntimeError):m.prepare(Path('/unused'),None,previous,h)
  h.assert_not_called()

class FullPreparationTest(unittest.TestCase):
 def test_preparation_writes_return_plan_and_never_calls_up_or_migration(self):
  with tempfile.TemporaryDirectory()as d:
   root=Path(d);release=root/'releases';release.mkdir();oldweb=root/'old-web';oldweb.mkdir();(oldweb/'driver').mkdir();(oldweb/'driver/ramo_offer_tone.js').write_text('original')
   runtime={'core':{'Id':'core-id','Image':m.CURRENT_CORE},'gateway':{'Id':'gateway-id','Image':m.GATEWAY}}
   before={**runtime,'postgres':{'Id':'db-id','Image':'pg'}}
   record={'phase':'completed','afterIds':{k:v['Id']for k,v in runtime.items()}}
   previous=SimpleNamespace(PLAN_SHA=m.CURRENT_PLAN,read_plan=lambda h:{'runtimeBefore':before},state=lambda h:record,files_intact=lambda h,p:None,runtime_intact=lambda h,p,c:copy.deepcopy(runtime))
   models={'core':{'services':{'core':{'image':m.CURRENT_CORE,'environment':{'SECRET':'preserved'}}}},'gateway':{'services':{'gateway':{'image':m.GATEWAY,'volumes':[{'target':'/srv/web','source':str(oldweb),'type':'bind','read_only':True}]}}}}
   def snapshot(h,current,role,project):return {'model':copy.deepcopy(models[role]),'service':role,'project':project,'workdir':str(root)}
   def save(path,value):
    raw=value if isinstance(value,bytes)else json.dumps(value).encode();path.write_bytes(raw);return m.sha(raw)
   def extract(content,target):
    target.mkdir(parents=True)
    for name,raw in content.items():
     path=target/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw)
   def web(contents,anchor,target):
    (target/'driver').mkdir(parents=True);(target/'driver/ramo_offer_tone.js').write_text('original')
    return {'before':'unchanged'},{'candidate':'verified'}
   changed=['dist/src/server.js',*[f'dist/src/account-deletion/{n}.js'for n in ['self-account-deletion','account-deletion-routes','account-deletion-page']]]
   content={n:b'// verified'for n in changed+['dist/src/privacy/legal-document-page.js','migrations/106_account_deletion_requests.sql']}
   metadata={'files':{n:m.sha(raw)for n,raw in content.items()},'baseline':{n:'a'*64 for n in changed}}
   p=SimpleNamespace(snapshot=snapshot,verify_image_files=Mock(),schema_state=Mock(),save=save,extract=extract,derive_image=lambda *a:'sha256:candidate',verify_image_base=Mock(),prepare_web=web,compose=lambda h,project,workdir,path:json.loads(path.read_bytes()))
   calls=[];h=SimpleNamespace(PROJECT='fixture',run=lambda args,**kw:calls.append(args))
   with patch.object(m,'ROOT',root),patch.object(m,'RELEASES',release),patch.object(m,'CURRENT_WEB',oldweb),patch.object(m,'payload',return_value=(metadata,content)):
    result=m.prepare(root,p,previous,h)
   self.assertEqual(result['status'],'PRIVACY_FINAL_PREPARED');self.assertFalse(result['changesApplied']);self.assertFalse(result['databaseMigrationPerformed'])
   self.assertTrue(result['candidateSelfAccountDeletionEnabled'])
   plan=json.loads((root/m.NAME/'plan.private.json').read_bytes())
   self.assertFalse(plan['siteTouched']);self.assertEqual(plan['images']['gateway'],m.GATEWAY)
   self.assertEqual(len(calls),1);self.assertEqual(calls[0][1],'run');self.assertIn('--check',calls[0][-2] if len(calls[0])==2 else ' '.join(calls[0]))
   self.assertNotIn('up',' '.join(calls[0]));self.assertNotIn('db:migrate',' '.join(calls[0]))

if __name__=='__main__':unittest.main()
