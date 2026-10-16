import copy,hashlib,importlib.util,json,stat,tempfile,unittest,zipfile
from pathlib import Path
p=Path(__file__).with_name("stage-configured-web.py")
spec=importlib.util.spec_from_file_location("stage_web",p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class StageTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.addCleanup(self.tmp.cleanup)
 def fixture(self,metadata=False):
  approved={"apps":{}};manifest={"schemaVersion":1,"commit":module.TARGET,"expectedProject":"ramo-nessa","expectedOrigin":"https://app.ramonessa.com.br","roles":{}}
  for role in ("passenger","driver"):
   root=self.root/role;root.mkdir();config={"role":role};approved["apps"][role]=config
   payload=("// fixture\nself.ramoPushConfig = "+json.dumps(config)+";\n").encode();(root/"ramo_push_config.js").write_bytes(payload)
   entries=[{"path":"ramo_push_config.js","bytes":len(payload),"sha256":hashlib.sha256(payload).hexdigest()}]
   if metadata:
    size,digest=module.OMITTED[(role,".last_build_id")];entries.append({"path":".last_build_id","bytes":size,"sha256":digest})
   digest=hashlib.sha256()
   for f in entries:digest.update((f["path"]+"\0"+f["sha256"]+"\0"+str(f["bytes"])+"\n").encode())
   manifest["roles"][role]={"files":entries,"treeSha256":digest.hexdigest()}
  return manifest,approved
 def test_all_runtime_hashes_and_known_packaging_metadata_are_verified(self):
  manifest,approved=self.fixture(True);result=module.verify_tree(self.root,manifest,approved)
  self.assertEqual(result["runtimeFileCounts"],{"passenger":1,"driver":1});self.assertEqual(len(result["omittedBuildMetadata"]),2)
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved,allow_omitted=False)
 def test_missing_changed_or_extra_runtime_files_are_rejected(self):
  manifest,approved=self.fixture();f=self.root/"passenger/ramo_push_config.js";original=f.read_bytes();f.unlink()
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
  f.write_bytes(original+b"x")
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
  f.write_bytes(original);(self.root/"driver/extra.js").write_text("unexpected")
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
 def test_wrong_provenance_or_approved_configuration_are_rejected(self):
  manifest,approved=self.fixture();wrong=copy.deepcopy(manifest);wrong["commit"]="a"*40
  with self.assertRaises(ValueError):module.verify_tree(self.root,wrong,approved)
  approved["apps"]["driver"]={"role":"passenger"}
  with self.assertRaises(ValueError):module.verify_tree(self.root,manifest,approved)
 def test_zip_traversal_duplicate_and_symlinks_are_rejected(self):
  for name in ("../escape","/absolute","passenger/../escape","passenger/a\\b"):
   with self.assertRaises(ValueError):module.relative(name)
  archive=self.root/"unsafe.zip"
  with zipfile.ZipFile(archive,"w") as z:
   info=zipfile.ZipInfo("passenger/link");info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(info,"/etc/passwd")
  with zipfile.ZipFile(archive) as z:
   with self.assertRaises(ValueError):module.zip_entries(z)
 def test_wrong_archive_hash_never_creates_destination(self):
  archive=self.root/"fake.zip";archive.write_bytes(b"not approved");destination=self.root/"out"
  with self.assertRaises(ValueError):module.stage(archive,destination,self.root/"unused")
  self.assertFalse(destination.exists())
if __name__=="__main__":unittest.main()
