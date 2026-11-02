import hashlib, importlib.util, json, stat, tempfile, unittest, warnings, zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location("stage_passenger",Path(__file__).with_name("stage-guide-appearance-web.py"))
stage=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)

class PassengerStageTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        self.files={name:b"fixture" for name in ("index.html","manifest.json","main.dart.js","flutter_bootstrap.js","ramo_push_config.js","ramo_push_worker.js","ramo_web_push.js")}
        self.files["index.html"]=b'<base href="/passageiro/">'
        self.files["main.dart.js"]=b"anticipationMinimumCents anticipationFeeCents expectedMinimumCents expectedFeeCents"
    def package(self,edit=None,extra=None,modify=None):
        manifest={"schemaVersion":1,"role":"passenger","sourceCommit":stage.SOURCE,"expectedOrigin":"https://app.ramonessa.com.br","expectedProject":"ramo-nessa","basePath":"/passageiro/","guideAppearanceModes":["light","dark"],"browserLoginChromium":True,"browserLoginWebKit":True,"realProviderAcceptance":False,"publicConfigSha256":"a"*64,"files":[{"path":p,"bytes":len(c),"sha256":hashlib.sha256(c).hexdigest()} for p,c in self.files.items()]}
        if edit: edit(manifest)
        archive=self.root/"passenger.zip"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore",UserWarning)
            with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED) as z:
                z.writestr("release.passenger.json",json.dumps(manifest))
                for path,content in self.files.items():
                    z.writestr("passenger/"+path,modify(path,content) if modify else content)
                if extra:
                    for path,content in extra:z.writestr(path,content)
        return archive,hashlib.sha256(archive.read_bytes()).hexdigest()
    def test_removed_entry_gate_cannot_return(self):
        self.files["ramo_entry_gate.js"]=b"blocked"
        archive,sha=self.package()
        with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,self.root/"staged")
    def test_valid_archive_is_staged_with_public_permissions(self):
        archive,sha=self.package()
        result=stage.validate_and_stage(archive,sha,self.root/"staged")
        self.assertEqual(result["files"],len(self.files))
        for path,content in self.files.items():
            self.assertEqual((self.root/"staged"/path).read_bytes(),content)
            self.assertEqual(stat.S_IMODE((self.root/"staged"/path).stat().st_mode),0o644)
        self.assertEqual(stat.S_IMODE((self.root/"staged").stat().st_mode),0o755)
    def test_checksum_mismatch_creates_no_destination(self):
        archive,_=self.package()
        with self.assertRaises(ValueError):stage.validate_and_stage(archive,"0"*64,self.root/"staged")
        self.assertFalse((self.root/"staged").exists())
    def test_unsafe_paths_and_entries_never_escape(self):
        for path in ("passenger/../../escape","/absolute","passenger\\escape","passenger/.","passenger//double","."):
            with self.subTest(path=path):
                archive,sha=self.package(extra=[(path,b"bad")])
                with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,self.root/"staged")
                self.assertFalse((self.root/"staged").exists())
    def test_extra_driver_or_duplicate_entries_are_refused(self):
        for path in ("driver/index.html","passenger/index.html"):
            archive,sha=self.package(extra=[(path,b"bad")])
            with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,self.root/"staged")
    def test_symlink_is_refused(self):
        info=zipfile.ZipInfo("passenger/link")
        info.create_system=3
        info.external_attr=(stat.S_IFLNK|0o777)<<16
        archive,sha=self.package(extra=[(info,b"/etc/passwd")])
        with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,self.root/"staged")
    def test_wrong_source_role_origin_or_unverified_browser_evidence_is_refused(self):
        for key,value in (("sourceCommit","0"*40),("role","driver"),("expectedOrigin","https://other.invalid"),("basePath","/motorista/"),("browserLoginWebKit",False),("guideAppearanceModes",["dark"])):
            archive,sha=self.package(edit=lambda m:m.update({key:value}))
            with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,self.root/"staged")
            self.assertFalse((self.root/"staged").exists())
    def test_hash_is_checked_before_writing(self):
        archive,sha=self.package(modify=lambda p,c:b"changed" if p=="main.dart.js" else c)
        with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,self.root/"staged")
        self.assertFalse((self.root/"staged").exists())
    def test_existing_destination_is_preserved(self):
        archive,sha=self.package()
        output=self.root/"staged"
        output.mkdir()
        (output/"keep").write_text("unchanged")
        with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,output)
        self.assertEqual((output/"keep").read_text(),"unchanged")

if __name__=="__main__":
    unittest.main()
