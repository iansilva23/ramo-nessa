import copy
from contextlib import contextmanager
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

    def site_fixture(self):
        path=self.root/'site-compose.yml';raw=b'name: ramo-nessa-site\nservices: {}\n'
        path.write_bytes(raw);path.chmod(0o644)
        return path,raw

    @contextmanager
    def virtual_site_owner(self,path,owner=1000):
        # The executor user namespace cannot chown to host UID1000. Keep real I/O,
        # injecting only the owner field in lstat/fstat at the filesystem boundary.
        real_lstat=Path.lstat;real_fstat=os.fstat;state={'uid':owner,'gid':path.stat().st_gid}
        def metadata(st):
            fields={k:getattr(st,k) for k in ['st_dev','st_ino','st_uid','st_gid','st_mode','st_size','st_mtime_ns','st_ctime_ns']}
            fields['st_uid']=state['uid'];fields['st_gid']=state['gid'];return types.SimpleNamespace(**fields)
        def lstat(p,*args,**kwargs):
            st=real_lstat(p,*args,**kwargs);return metadata(st) if p==path else st
        with patch.object(Path,'lstat',lstat),patch.object(m.os,'fstat',lambda fd:metadata(real_fstat(fd))):
            yield state

    def test_site_compose_accepts_deployed_ubuntu_owner_without_changing_metadata(self):
        path,raw=self.site_fixture();before=path.stat()
        with self.virtual_site_owner(path) as owner,patch.object(m,'SITE_COMPOSE',path),patch.object(m,'SITE_COMPOSE_SHA',m.sha(raw)),patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=1000)):
            self.assertEqual(raw,m.site_compose_source(path))
        after=path.stat();self.assertEqual((before.st_uid,before.st_mode,before.st_mtime_ns),(after.st_uid,after.st_mode,after.st_mtime_ns))
        self.assertEqual(1000,owner['uid'])

    def test_site_compose_rejects_other_owner_writable_permissions_changed_content_and_symlink(self):
        path,raw=self.site_fixture()
        with self.virtual_site_owner(path) as owner,patch.object(m,'SITE_COMPOSE',path),patch.object(m,'SITE_COMPOSE_SHA',m.sha(raw)),patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=1000)):
            owner['uid']=1001
            with self.assertRaises(m.PreparationError):m.site_compose_source(path)
            owner['uid']=1000;path.chmod(0o664)
            with self.assertRaises(m.PreparationError):m.site_compose_source(path)
            path.chmod(0o644);path.write_bytes(raw+b'changed')
            with self.assertRaises(m.PreparationError):m.site_compose_source(path)
            link=self.root/'symlink.yml';link.symlink_to(path)
            with patch.object(m,'SITE_COMPOSE',link):
                with self.assertRaises(m.PreparationError):m.site_compose_source(link)

    def test_site_compose_rejects_concurrent_file_change(self):
        path,raw=self.site_fixture();before=path.stat()
        fields={k:getattr(before,k) for k in ['st_dev','st_ino','st_uid','st_mode','st_size','st_mtime_ns','st_ctime_ns']};fields['st_uid']=1000;fields['st_mtime_ns']+=1
        with self.virtual_site_owner(path),patch.object(m,'SITE_COMPOSE',path),patch.object(m,'SITE_COMPOSE_SHA',m.sha(raw)),patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=1000)),patch.object(m.os,'fstat',return_value=types.SimpleNamespace(**fields)):
            with self.assertRaises(m.PreparationError):m.site_compose_source(path)

    def test_caddy_accepts_confirmed_ubuntu_group_664_with_matching_mounted_hash_without_chmod(self):
        path,raw=self.site_fixture();path.chmod(0o664);before=path.stat();calls=[]
        h=types.SimpleNamespace(run=lambda args:(calls.append(args) or raw))
        with self.virtual_site_owner(path) as owner,patch.object(m,'CADDY_SOURCE',path),patch.object(m,'CADDY_SHA',m.sha(raw)),patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=1000,pw_gid=1000)):
            owner['gid']=1000
            self.assertEqual(raw,m.caddy_source_bytes(h,{'Name':'gateway'},path))
        after=path.stat();self.assertEqual((before.st_mode,before.st_uid,before.st_gid,before.st_mtime_ns),(after.st_mode,after.st_uid,after.st_gid,after.st_mtime_ns))
        self.assertEqual([['docker','exec','gateway','cat','/etc/caddy/Caddyfile']],calls)

    def test_caddy_rejects_wrong_owner_group_world_write_hash_and_mounted_divergence(self):
        path,raw=self.site_fixture();path.chmod(0o664);h=types.SimpleNamespace(run=lambda args:raw)
        with self.virtual_site_owner(path) as owner,patch.object(m,'CADDY_SOURCE',path),patch.object(m,'CADDY_SHA',m.sha(raw)),patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=1000,pw_gid=1000)):
            for uid,gid in [(1001,1000),(1000,1001)]:
                owner.update(uid=uid,gid=gid)
                with self.assertRaises(m.PreparationError):m.caddy_source_bytes(h,{'Name':'gateway'},path)
            owner.update(uid=1000,gid=1000);path.chmod(0o666)
            with self.assertRaises(m.PreparationError):m.caddy_source_bytes(h,{'Name':'gateway'},path)
            path.chmod(0o664)
            bad=types.SimpleNamespace(run=lambda args:b'different mounted content')
            with self.assertRaises(m.PreparationError):m.caddy_source_bytes(bad,{'Name':'gateway'},path)
            path.write_bytes(raw+b'changed')
            with self.assertRaises(m.PreparationError):m.caddy_source_bytes(h,{'Name':'gateway'},path)

    def test_caddy_rejects_symlink_and_change_during_mounted_read(self):
        path,raw=self.site_fixture();path.chmod(0o664)
        with self.virtual_site_owner(path) as owner,patch.object(m,'CADDY_SOURCE',path),patch.object(m,'CADDY_SHA',m.sha(raw)),patch.object(m.pwd,'getpwnam',return_value=types.SimpleNamespace(pw_uid=1000,pw_gid=1000)):
            owner['gid']=1000
            def race(args):path.write_bytes(raw+b'changed');return raw
            with self.assertRaises(m.PreparationError):m.caddy_source_bytes(types.SimpleNamespace(run=race),{'Name':'gateway'},path)
            link=self.root/'caddy-link';link.symlink_to(path)
            with patch.object(m,'CADDY_SOURCE',link):
                with self.assertRaises(m.PreparationError):m.caddy_source_bytes(types.SimpleNamespace(run=lambda a:raw),{'Name':'gateway'},link)

    def test_core_and_gateway_still_use_strict_private_file_guard(self):
        called=[]
        def private(path):called.append(path);raise RuntimeError('PRIVATE_GUARD_KEPT')
        h=types.SimpleNamespace(private_file=private)
        for service in ['core','gateway']:
            before={'Config':{'Labels':{'com.docker.compose.project':'ramo-nessa-staging','com.docker.compose.service':service,'com.docker.compose.project.config_files':'/opt/private/'+service+'.json','com.docker.compose.project.working_dir':'/opt/private'}}}
            with self.assertRaisesRegex(RuntimeError,'PRIVATE_GUARD_KEPT'):m.snapshot(h,before,service,'ramo-nessa-staging')
        self.assertEqual(2,len(called))

    def test_symlinks_and_noncanonical_paths_are_refused(self):
        (self.old/'unsafe').symlink_to(self.old/'driver')
        with self.assertRaises(m.PreparationError):m.tree(self.old)
        for name in ['.','/etc/passwd','../outside','a/../b','a\\b','a//b','a\nb']:
            with self.assertRaises(m.PreparationError):m.relative(name)

if __name__=='__main__':unittest.main()
