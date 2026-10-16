import copy, hashlib, importlib.util, json, stat, tempfile, unittest, zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('refresh_stage',Path(__file__).with_name('stage-web-refresh.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class RefreshStageTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
 def fixture(self):
  manifest={'schemaVersion':1,'commit':module.TARGET,'expectedProject':'ramo-nessa','expectedOrigin':'https://app.ramonessa.com.br','roles':{}}
  approved={'apps':{}}
  for role in ['passenger','driver']:
   root=self.root/role;root.mkdir();config={'role':role};approved['apps'][role]=config
   payload=('// fixture\nself.ramoPushConfig = '+json.dumps(config)+';\n').encode()
   entries=[]
   for path,content in [('ramo_push_config.js',payload),('.last_build_id',b'metadata')]:
    (root/path).write_bytes(content);entries.append({'path':path,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
   digest=hashlib.sha256()
   for entry in entries:digest.update((entry['path']+'\0'+entry['sha256']+'\0'+str(entry['bytes'])+'\n').encode())
   manifest['roles'][role]={'files':entries,'treeSha256':digest.hexdigest()}
  return manifest,approved
 def test_all_files_including_build_metadata_required(self):
  manifest,approved=self.fixture();result=module.verify_tree(self.root,manifest,approved)
  self.assertEqual(result['runtimeFileCounts'],{'passenger':2,'driver':2});self.assertEqual(result['omittedBuildMetadata'],[])
  (self.root/'driver/.last_build_id').unlink()
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
 def test_runtime_changes_and_extra_files_rejected(self):
  manifest,approved=self.fixture();file=self.root/'passenger/ramo_push_config.js';original=file.read_bytes();file.write_bytes(original+b'x')
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
  file.write_bytes(original);(self.root/'driver/extra.js').write_text('extra')
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
 def test_wrong_role_or_commit_rejected(self):
  manifest,approved=self.fixture();wrong=copy.deepcopy(manifest);wrong['commit']='f'*40
  with self.assertRaises(ValueError):module.verify_tree(self.root,wrong,approved)
  approved['apps']['driver']={'role':'passenger'}
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
 def test_zip_links_and_traversal_rejected(self):
  for path in ['../escape','/absolute','driver/../escape','driver/a\\b']:
   with self.assertRaises(ValueError):module.relative(path)
  path=self.root/'bad.zip'
  with zipfile.ZipFile(path,'w') as archive:
   entry=zipfile.ZipInfo('driver/link');entry.create_system=3;entry.external_attr=(stat.S_IFLNK|0o777)<<16;archive.writestr(entry,'/private')
  with zipfile.ZipFile(path) as archive:
   with self.assertRaises(ValueError):module.zip_entries(archive)
 def test_wrong_zip_cannot_create_staging_destination(self):
  path=self.root/'fake.zip';path.write_bytes(b'wrong');destination=self.root/'release'
  with self.assertRaises(ValueError):module.stage(path,destination,self.root/'config.json')
  self.assertFalse(destination.exists())

if __name__=='__main__':unittest.main()
