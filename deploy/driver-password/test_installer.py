import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import activate as a
import web_release as w
import otp_controls as otp

class WebContract(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory();self.root=Path(self.t.name)
        self.old=self.root/'old';self.new=self.root/'new';self.target=self.root/'target'
        for p in [self.old/'driver',self.old/'passenger',self.new]:p.mkdir(parents=True)
        self.index='<base href="/motorista/"><script src="https://maps.googleapis.com/maps/api/js?key=AIza'+'a'*35+'"></script><script src="ramo_push_config.js"></script><script src="ramo_web_push.js"></script><script src="flutter_bootstrap.js"></script>'
        push='// public\nself.ramoPushConfig = '+json.dumps({k:'synthetic' for k in ['apiKey','appId','projectId','messagingSenderId','vapidKey']})+';\n'
        for root in [self.old/'driver',self.new]:
            for name,value in {'index.html':self.index,'ramo_push_config.js':push,'ramo_web_push.js':'old bridge','main.dart.js':'old compiled','flutter_bootstrap.js':'old bootstrap','flutter_service_worker.js':'old sw'}.items():(root/name).write_text(value)
        (self.old/'driver/index.html').write_text(self.index+'<script src="notification-audio.js"></script>')
        (self.old/'driver/notification-audio.js').write_text('audio extension')
        (self.old/'passenger/main.dart.js').write_text('passenger unchanged')
        (self.new/'main.dart.js').write_text('new compiled')
        (self.new/'flutter_bootstrap.js').write_text('new bootstrap')
        (self.new/'ramo_web_push.js').write_text('different build bridge')
    def tearDown(self):self.t.cleanup()
    def test_overlay_preserves_shell_audio_passenger_and_push(self):
        report=w.prepare(self.old,self.new,self.target,{'files':w.tree(self.new)})
        self.assertTrue(report['passengerUnchanged'])
        self.assertEqual((self.target/'driver/main.dart.js').read_text(),'new compiled')
        self.assertEqual((self.target/'driver/flutter_bootstrap.js').read_text(),'new bootstrap')
        self.assertEqual((self.target/'driver/index.html').read_bytes(),(self.old/'driver/index.html').read_bytes())
        self.assertEqual((self.target/'driver/notification-audio.js').read_text(),'audio extension')
        self.assertEqual((self.target/'driver/ramo_web_push.js').read_text(),'old bridge')
        self.assertEqual((self.target/'passenger/main.dart.js').read_text(),'passenger unchanged')
    def test_maps_mismatch_refuses_before_copy(self):
        (self.new/'index.html').write_text(self.index.replace('a'*35,'b'*35))
        with self.assertRaises(RuntimeError):w.prepare(self.old,self.new,self.target,{'files':w.tree(self.new)})
        self.assertFalse(self.target.exists())
    def test_bundle_tampering_refuses_before_copy(self):
        manifest={'files':w.tree(self.new)};(self.new/'main.dart.js').write_text('tampered')
        with self.assertRaises(RuntimeError):w.prepare(self.old,self.new,self.target,manifest)
        self.assertFalse(self.target.exists())
    def test_symlinks_refused(self):
        (self.old/'driver/link').symlink_to('/etc/passwd')
        with self.assertRaises(RuntimeError):w.tree(self.old)

class RollbackContract(unittest.TestCase):
    def plan(self):
        def c(name,img):return {'Name':'/'+name,'Image':img,'State':{'Running':True},'Config':{'Env':['A=literal$dollar']},'HostConfig':{'Binds':['/old:/srv/web:ro']},'Mounts':[{'Destination':'/srv/web','Source':'/old'}]}
        return {'core':{'container':c('core','old-core')},'gateway':{'container':c('gateway','gateway-img')},'candidateId':'new-core','oldWebRoot':'/old','newWebRoot':'/new'}
    def test_otp_toggle_changes_only_one_environment_value(self):
        p=self.plan();before=p['core']['container'];enabled=otp.with_flag(before,'enabled')
        self.assertIn('WHATSAPP_OTP_ABUSE_CONTROLS=enabled',enabled['Config']['Env'])
        self.assertIn('A=literal$dollar',enabled['Config']['Env'])
        restored=copy.deepcopy(enabled);restored['Config']['Env']=[v for v in restored['Config']['Env'] if not v.startswith('WHATSAPP_OTP_ABUSE_CONTROLS=')]
        self.assertEqual(before,restored)
    def test_exact_runtime_delta(self):
        p=self.plan();expected=a.expected_runtime(p,'core',True)
        self.assertIn('WHATSAPP_OTP_ABUSE_CONTROLS=disabled',expected['Config']['Env'])
        self.assertIn('A=literal$dollar',expected['Config']['Env'])
        gateway=a.expected_runtime(p,'gateway',True)
        self.assertEqual(gateway['HostConfig']['Binds'],['/new:/srv/web:ro'])
        self.assertEqual(gateway['Mounts'][0]['Source'],'/new')
        self.assertEqual(p['gateway']['container']['Mounts'][0]['Source'],'/old')
    def test_stopped_candidate_restores_gateway_before_core(self):
        p=self.plan();core=a.expected_runtime(p,'core',True);core['Image']='new-core';core['State']['Running']=False
        gateway=a.expected_runtime(p,'gateway',True)
        calls=[]
        h=SimpleNamespace(run=lambda *args,**kwargs:b'exists',inspect=lambda name:core if name=='/core' else gateway,runtime_matches=lambda before,current,*args,**kwargs:None)
        with patch.object(a,'intact'),patch.object(a,'verify'),patch.object(a,'up',side_effect=lambda h,p,s,v:calls.append(s)):
            a.rollback(h,p)
        self.assertEqual(calls,['gateway','core'])
    def test_rollback_refuses_unrelated_gateway_image_before_any_mutation(self):
        p=self.plan();gateway=a.expected_runtime(p,'gateway',True);gateway['Image']='unrelated'
        h=SimpleNamespace(run=lambda *args,**kwargs:b'exists',inspect=lambda name:gateway)
        with patch.object(a,'intact'),patch.object(a,'up') as up:
            with self.assertRaises(RuntimeError):a.rollback(h,p)
            up.assert_not_called()
    def test_missing_candidate_can_be_restored(self):
        p=self.plan();calls=[]
        h=SimpleNamespace(run=lambda *args,**kwargs:b'')
        with patch.object(a,'intact'),patch.object(a,'verify'),patch.object(a,'up',side_effect=lambda h,p,s,v:calls.append(s)):
            a.rollback(h,p)
        self.assertEqual(calls,['gateway','core'])

if __name__=='__main__':unittest.main()
