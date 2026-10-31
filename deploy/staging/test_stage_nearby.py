import hashlib, importlib.util, json, pathlib, tempfile, unittest, zipfile
spec=importlib.util.spec_from_file_location('stage_nearby',pathlib.Path(__file__).with_name('stage-nearby.py'))
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
class Extraction(unittest.TestCase):
    def payload(self, root, name='passenger/main.dart.js', corrupt=False):
        z=root/'payload.zip'; data=b'synthetic'; m={'files':[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}]}
        with zipfile.ZipFile(z,'w') as archive:
            archive.writestr(name,b'changed' if corrupt else data)
            archive.writestr('nearby-manifest.json',json.dumps(m))
        with z.open('rb') as stream: checksum=hashlib.file_digest(stream,'sha256').hexdigest()
        return z,checksum
    def test_verified_extract(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);z,sha=self.payload(root);stage.stage(z,root/'out',sha)
            self.assertEqual((root/'out/passenger/main.dart.js').read_bytes(),b'synthetic')
    def test_traversal_corruption_and_wrong_checksum(self):
        for name,corrupt,checksum in [('passenger/../outside',False,False),('passenger/main.dart.js',True,False),('passenger/main.dart.js',False,True)]:
            with tempfile.TemporaryDirectory() as d:
                root=pathlib.Path(d);z,sha=self.payload(root,name,corrupt)
                with self.assertRaises(ValueError):stage.stage(z,root/'out','0'*64 if checksum else sha)
                self.assertFalse((root/'out').exists())
if __name__=='__main__': unittest.main()
