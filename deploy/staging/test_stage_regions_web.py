import hashlib, importlib.util, json, tempfile, unittest, zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('stage',Path(__file__).with_name('stage-regions-web.py'))
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)

class WebArtifactTests(unittest.TestCase):
    def fixture(self, root, extra=None, bad_hash=False, source=None, direct=False, dangling=False):
        source=source or stage.SOURCE
        records={};contents={}
        for role,route in [('passenger','/passageiro/'),('driver','/motorista/')]:
            files={n:b'fixture' for n in ['main.dart.js','flutter_bootstrap.js','manifest.json','ramo_push_config.js','ramo_push_worker.js','ramo_web_push.js','ramo_entry_gate.js','ramo_entry_gate.css']}
            files['index.html']=('<base href="'+route+'">').encode()
            if direct:
                del files['ramo_entry_gate.js'];del files['ramo_entry_gate.css']
            if dangling: files['index.html']+=b'<script src="ramo_entry_gate.js"></script>'
            records[role]={'files':[{'path':n,'bytes':len(b),'sha256':'0'*64 if bad_hash else hashlib.sha256(b).hexdigest()} for n,b in files.items()]}
            contents.update({role+'/'+n:b for n,b in files.items()})
        contents['release.json']=json.dumps({'schemaVersion':1,'commit':source,'expectedOrigin':'https://app.ramonessa.com.br','expectedProject':'ramo-nessa','structuralCheck':True,'providerHomologation':False,'roles':records}).encode()
        contents['source-commit.txt']=source.encode()
        if extra: contents.update(extra)
        archive=root/'web.zip'
        with zipfile.ZipFile(archive,'w') as z:
            for n,b in contents.items():z.writestr(n,b)
        return archive,hashlib.sha256(archive.read_bytes()).hexdigest()
    def test_both_roles_verified_before_staging_and_cannot_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive,sha=self.fixture(root);out=root/'bundles'
            result=stage.validate_and_stage(archive,sha,out)
            self.assertEqual(result['files'],18);self.assertFalse(result['providerHomologation'])
            self.assertEqual((out/'passenger/index.html').stat().st_mode & 0o777,0o644)
            with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,out)
    def test_direct_entry_bundle_has_no_gate_assets(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive,sha=self.fixture(root,direct=True);out=root/'bundles'
            self.assertEqual(stage.validate_and_stage(archive,sha,out)['files'],14)
            self.assertFalse((out/'passenger/ramo_entry_gate.js').exists())
    def test_direct_entry_rejects_dangling_gate_import(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive,sha=self.fixture(root,direct=True,dangling=True)
            with self.assertRaisesRegex(ValueError,'Referência'):stage.validate_and_stage(archive,sha,root/'bundles')
            self.assertFalse((root/'bundles').exists())
    def test_new_reviewed_source_is_explicit_and_does_not_change_legacy_default(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);source='c'*40;archive,sha=self.fixture(root,source=source)
            with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,root/'wrong')
            self.assertFalse((root/'wrong').exists())
            result=stage.validate_and_stage(archive,sha,root/'new',source)
            self.assertEqual(result['sourceCommit'],source)
            self.assertNotEqual(stage.SOURCE,source)
    def test_rejects_invalid_reviewed_source(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive,sha=self.fixture(root)
            with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,root/'bad','not-a-commit')
            self.assertFalse((root/'bad').exists())
    def test_rejects_wrong_archive_hash_before_creating_output(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive,sha=self.fixture(root)
            with self.assertRaises(ValueError):stage.validate_and_stage(archive,'0'*64,root/'bundles')
            self.assertFalse((root/'bundles').exists())
    def test_rejects_traversal_and_undeclared_files_before_creating_output(self):
        for extra in [{'../escaped':b'x'},{'passenger/undeclared.js':b'x'},{'/absolute':b'x'}]:
            with tempfile.TemporaryDirectory() as d:
                root=Path(d);archive,sha=self.fixture(root,extra)
                with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,root/'bundles')
                self.assertFalse((root/'bundles').exists())
    def test_rejects_manifest_file_tampering(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);archive,sha=self.fixture(root,bad_hash=True)
            with self.assertRaises(ValueError):stage.validate_and_stage(archive,sha,root/'bundles')
            self.assertFalse((root/'bundles').exists())
if __name__=='__main__':unittest.main()

