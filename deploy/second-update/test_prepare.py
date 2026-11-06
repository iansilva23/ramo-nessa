import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('second_prepare', Path(__file__).with_name('prepare.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.old = self.root / 'active'
        self.payloads = {}
        self.contents = {}
        for role, route in m.ROUTES.items():
            content = {'index.html': b'approved provider shell', 'ramo_push_config.js': b'approved push',
                       'main.dart.js': b'new code de20bf289d6db3ad15fdb14b', 'flutter_bootstrap.js': b'new bootstrap'}
            self.contents[role] = ({'basePath':'/'+route+'/'},content)
            for name, raw in content.items():
                path = self.old / role / name
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(b'old code' if name == 'main.dart.js' else raw)
            (self.old / role / 'optional-future.js').write_bytes(b'preserve me')
        self.patch = patch.object(m,'BASE_WEB',self.old)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def bundle(self, files=None, source=m.SOURCE, duplicate=False):
        files = files or {'file.js':b'safe'}
        path=self.root/'fixture.zip'
        with zipfile.ZipFile(path,'w') as z:
            z.writestr('manifest.json',json.dumps({'source':source,'productSource':m.PRODUCT_SOURCE,'component':'core','files':{k:m.sha(v) for k,v in files.items()}}))
            for k,v in files.items():z.writestr('core/'+k,v)
            if duplicate:z.writestr('core/file.js',b'safe')
        self.payloads['core']=(path.name,m.sha(path.read_bytes()))
        return path

    def test_web_preparation_preserves_active_backup_and_optional_features(self):
        anchor=self.root/'anchor';anchor.mkdir()
        before=m.tree(self.old)
        old,new=m.prepare_web(self.contents,anchor,self.root/'candidate')
        self.assertEqual(before,m.tree(self.old))
        self.assertEqual(before,m.tree(anchor/'before-web'))
        self.assertEqual(before,old)
        self.assertEqual(new,m.tree(self.root/'candidate'))
        self.assertEqual(b'preserve me',(self.root/'candidate/driver/optional-future.js').read_bytes())

    def test_provider_or_cinema_change_is_refused_before_copy(self):
        anchor=self.root/'anchor';anchor.mkdir()
        for role,name in [('driver','ramo_push_config.js'),('passenger','index.html')]:
            bad=copy.deepcopy(self.contents);bad[role][1][name]=b'different'
            with self.assertRaises(m.PreparationError):m.prepare_web(bad,anchor,self.root/'candidate')
        bad=copy.deepcopy(self.contents);bad['driver'][1]['main.dart.js']=b'without cinema id'
        with self.assertRaises(m.PreparationError):m.prepare_web(bad,anchor,self.root/'candidate')
        self.assertFalse((anchor/'before-web').exists())

    def test_hash_source_traversal_and_duplicate_entries_are_refused(self):
        for files,source in [({'../escape':b'x'},m.SOURCE),({'file.js':b'safe'},'f'*40)]:
            self.bundle(files,source)
            with patch.object(m,'PAYLOAD',self.payloads):
                with self.assertRaises(m.PreparationError):m.payload(self.root,'core')
        with self.assertWarns(UserWarning):self.bundle(duplicate=True)
        with patch.object(m,'PAYLOAD',self.payloads):
            with self.assertRaises(m.PreparationError):m.payload(self.root,'core')
        p=self.bundle();p.write_bytes(p.read_bytes()+b'tamper')
        with patch.object(m,'PAYLOAD',self.payloads):
            with self.assertRaises(m.PreparationError):m.payload(self.root,'core')

    def test_changed_baseline_refuses_without_creating_anchor(self):
        inv=types.SimpleNamespace(collect_all=lambda:{'baselineSha256':'changed','activeWebRoot':str(self.old)})
        with patch.object(m,'ROOT',self.root):
            with self.assertRaises(m.PreparationError):m.prepare(self.root,None,inv)
        self.assertFalse((self.root/m.NAME).exists())

    def test_compose_preparation_only_resolves_configuration(self):
        calls=[]
        h=types.SimpleNamespace(run=lambda args:(calls.append(args) or b'{"services":{}}'))
        m.compose(h,'project','/safe','/safe/config.json')
        self.assertEqual('config',calls[0][-3]);self.assertNotIn('up',calls[0])
        self.assertIn('/dev/null',calls[0])

    def test_schema_probe_is_read_only_and_rejects_missing_or_changed_prerequisites(self):
        calls=[]
        def run(args,timeout=None):
            calls.append(args)
            return json.dumps([{'filename':'104_admin_account_closure.sql','checksum':m.BASE_MIGRATION_SHA}]).encode()
        h=types.SimpleNamespace(run=run)
        self.assertEqual('pending',m.schema_state(h,{'Name':'core'},'a'*64)['migration105'])
        self.assertIn('BEGIN READ ONLY',calls[0][-1])
        for rows in [[],[{'filename':'104_admin_account_closure.sql','checksum':'wrong'}],[{'filename':'104_admin_account_closure.sql','checksum':m.BASE_MIGRATION_SHA},{'filename':'105_self_account_deletion.sql','checksum':'wrong'}]]:
            bad=types.SimpleNamespace(run=lambda *a,**kw:json.dumps(rows).encode())
            with self.assertRaises(m.PreparationError):m.schema_state(bad,{'Name':'core'},'a'*64)

    def test_symlinks_and_noncanonical_paths_are_refused(self):
        (self.old/'unsafe').symlink_to(self.old/'driver')
        with self.assertRaises(m.PreparationError):m.tree(self.old)
        for name in ['.','/etc/passwd','../outside','a/../b','a\\b','a//b','a\nb']:
            with self.assertRaises(m.PreparationError):m.relative(name)

if __name__=='__main__':unittest.main()
