import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

HERE = Path(__file__).resolve().parent

def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

m = module(HERE / 'prepare-web.py', 'prepare_redesign')
h = module(HERE.parent / 'android-lock/activate-lock-candidate.py', 'prepare_test_guard')


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.old_umask = os.umask(0o077)
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.old = self.root / 'active'
        self.payload = self.root / 'payload'
        self.payload.mkdir()
        self.payloads = {}
        for role in m.ROUTES:
            directory = self.old / role
            directory.mkdir(parents=True)
            (directory / 'assets').mkdir()
            for name, raw in self.content(role).items():
                target = directory / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw if name != 'main.dart.js' else b'old compiled app')
                target.chmod(0o644)
            (directory / 'legacy-optional.js').write_bytes(b'future optional feature')
            self.make_bundle(role)
        (self.old / 'admin').mkdir()
        (self.old / 'admin/index.html').write_bytes(b'approved admin')
        self.overrides = patch.multiple(m, BASE_WEB=self.old, PAYLOAD=self.payloads)
        self.overrides.start()

    def tearDown(self):
        self.overrides.stop()
        self.temporary.cleanup()
        os.umask(self.old_umask)

    def content(self, role):
        return {'index.html': b'approved shell with provider configuration',
                'main.dart.js': b'new compiled '+role.encode(),
                'flutter_bootstrap.js': b'new bootstrap',
                'ramo_push_config.js': b'PRIVATE_PUBLIC_CONFIG_KEEP',
                'manifest.json': b'approved pwa metadata',
                'assets/new.png': b'new approved asset'}

    def make_bundle(self, role, *, path='main.dart.js', source=m.SOURCE, duplicate=False):
        content = self.content(role)
        if path != 'main.dart.js':
            content[path] = content.pop('main.dart.js')
        filename = role + '.zip'
        with zipfile.ZipFile(self.payload / filename, 'w') as archive:
            archive.writestr('manifest.json', json.dumps({'schema': 1, 'source': source, 'role': role,
                'basePath': '/'+m.ROUTES[role]+'/', 'files': {k:m.sha(v) for k,v in content.items()}}))
            for name, raw in content.items():
                archive.writestr(role+'/'+name, raw)
            if duplicate:
                archive.writestr(role+'/main.dart.js', content['main.dart.js'])
        self.payloads[role] = (filename, m.sha((self.payload / filename).read_bytes()))

    def test_stage_keeps_active_tree_admin_and_optional_files(self):
        initial = m.tree(self.old)
        before, after = m.prepare_web(self.payload, self.old, self.root/'backup', self.root/'candidate')
        self.assertEqual(initial, m.tree(self.old))
        self.assertEqual(initial, before)
        self.assertEqual(initial, m.tree(self.root/'backup'))
        self.assertEqual(after['admin/index.html'], initial['admin/index.html'])
        self.assertEqual(after['driver/legacy-optional.js'], initial['driver/legacy-optional.js'])
        self.assertEqual(b'new compiled driver', (self.root/'candidate/driver/main.dart.js').read_bytes())

    def test_refuses_changed_provider_before_creating_copy(self):
        (self.old/'driver/ramo_push_config.js').write_bytes(b'different active provider')
        with self.assertRaises(m.PreparationError):
            m.prepare_web(self.payload, self.old, self.root/'backup', self.root/'candidate')
        self.assertFalse((self.root/'backup').exists())
        self.assertFalse((self.root/'candidate').exists())

    def test_refuses_payload_hash_tampering(self):
        path=self.payload/self.payloads['driver'][0]
        path.write_bytes(path.read_bytes()+b'tampered')
        with self.assertRaises(m.PreparationError): m.bundle(self.payload, 'driver')

    def test_refuses_wrong_source(self):
        self.make_bundle('driver', source='f'*40)
        with self.assertRaises(m.PreparationError): m.bundle(self.payload, 'driver')

    def test_refuses_traversal_even_when_outer_hash_matches(self):
        self.make_bundle('driver', path='../outside')
        with self.assertRaises(m.PreparationError): m.bundle(self.payload, 'driver')

    def test_refuses_duplicate_zip_entries(self):
        with self.assertWarns(UserWarning): self.make_bundle('driver', duplicate=True)
        with self.assertRaises(m.PreparationError): m.bundle(self.payload, 'driver')

    def test_refuses_links_in_active_tree(self):
        (self.old/'driver/unsafe').symlink_to(self.old/'admin')
        with self.assertRaises(m.PreparationError): m.tree(self.old)

    def model(self):
        return {'name': h.PROJECT, 'services': {'gateway': {'image':'gateway:active',
            'environment': {'LITERAL':'pay$$value'},
            'networks':{'external':None},
            'volumes':[{'type':'bind','source':str(self.old),'target':'/srv/web','read_only':True}]}},
            'networks':{'external':{'name':'fixture_external','external':True}}}

    def test_plan_changes_only_bind_source_and_keeps_dollars(self):
        original=self.model()
        candidate=m.before_after(original,self.root/'candidate')
        restored=copy.deepcopy(candidate)
        restored['services']['gateway']['volumes'][0]['source']=str(self.old)
        self.assertEqual(original,restored)
        self.assertEqual('pay$$value',candidate['services']['gateway']['environment']['LITERAL'])

    def test_refuses_baseline_change_before_writing_anchor(self):
        inv=types.SimpleNamespace(collect=lambda:{'baselineSha256':'different','activeWebRoot':str(self.old)})
        with self.assertRaises(m.PreparationError): m.prepare(self.payload,h,inv)
        self.assertFalse((self.root/m.NAME).exists())

    def test_full_prepare_only_uses_read_only_docker_commands(self):
        ops=self.root/'operations';ops.mkdir()
        releases=self.root/'releases';releases.mkdir()
        model=self.model()
        config=ops/'gateway.json';config.write_text(json.dumps(model));config.chmod(0o600)
        runtime={}
        for service in ('core','gateway','postgres','google-maps-mock'):
            runtime[service]={'Id':service+'-id','Name':service,'Image':'sha256:'+service,
                'State':{'StartedAt':'now','Running':True,'Health':{'Status':'healthy'}},
                'Config':{'Env':['LITERAL=pay$value'] if service=='gateway' else ['SECRET=DO_NOT_PRINT'],
                    'Labels':{'com.docker.compose.project':h.PROJECT,'com.docker.compose.service':service,
                        'com.docker.compose.project.config_files':str(config),
                        'com.docker.compose.project.working_dir':str(ops)}},
                'HostConfig':{},'NetworkSettings':{'Networks':{'fixture_external':{}}},'Mounts':[]}
        runtime['gateway']['Mounts']=[{'Type':'bind','Source':str(self.old),'Destination':'/srv/web','RW':False}]
        inventory=types.SimpleNamespace(collect=lambda:{'baselineSha256':m.BASELINE,'activeWebRoot':str(self.old),
            'services':{s:{'name':s,'running':True,'health':'healthy'} for s in runtime}})
        def inspect(name,image=False):
            return {'Config':{'Env':[]}} if image else copy.deepcopy(runtime[name])
        commands=[]
        def run(args,**kwargs):
            commands.append(args)
            self.assertEqual(['config','--format','json'],args[-3:])
            return json.dumps(json.loads(Path(args[args.index('-f')+1]).read_text())).encode()
        with patch.multiple(m,ROOT=ops,RELEASES=releases), patch.multiple(h,inspect=inspect,run=run):
            result=m.prepare(self.payload,h,inventory)
        self.assertEqual('APP_REDESIGN_WEB_PREPARED',result['status'])
        self.assertFalse(result['changesApplied'])
        self.assertFalse(result['servicesRestarted'])
        self.assertNotIn('DO_NOT_PRINT',json.dumps(result))
        self.assertEqual(3,len(commands))
        self.assertNotIn('up',sum(commands,[]))
        anchor=Path(result['anchor'])
        self.assertEqual(0o700,anchor.stat().st_mode&0o777)
        self.assertEqual(0o600,(anchor/'plan.private.json').stat().st_mode&0o777)
        self.assertEqual(result['planSha256'],m.sha((anchor/'plan.private.json').read_bytes()))
        self.assertEqual(b'approved admin',(Path(result['candidateWeb'])/'admin/index.html').read_bytes())
        with patch.multiple(m,ROOT=ops,RELEASES=releases), patch.multiple(h,inspect=inspect,run=run):
            with self.assertRaises(m.PreparationError): m.prepare(self.payload,h,inventory)

    @unittest.skipUnless(shutil.which('docker'),'Docker unavailable locally; real Compose roundtrip runs in CI')
    def test_real_compose_roundtrip_preserves_dollars_and_only_web_mount_changes(self):
        original=self.model()
        previous=self.root/'before.json';previous.write_text(json.dumps(original))
        candidate=self.root/'after.json';candidate.write_text(json.dumps(m.before_after(original,self.root/'candidate')))
        a=m.compose(h,str(self.root),previous)
        b=m.compose(h,str(self.root),candidate)
        self.assertEqual(a['services']['gateway']['environment'],b['services']['gateway']['environment'])
        b['services']['gateway']['volumes'][0]['source']=str(self.old)
        self.assertEqual(a,b)


if __name__=='__main__': unittest.main()
