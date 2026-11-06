import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('activate_redesign',HERE/'activate-web.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.anchor=Path(self.temp.name)
        self.patch=patch.object(m,'ANCHOR',self.anchor);self.patch.start()
        self.p={'runtimeBefore':{'gateway':{'Id':'original','Name':'/gateway','Image':m.GATEWAY_IMAGE,
            'State':{'StartedAt':'original-time','Running':True,'Health':{'Status':'healthy'}},
            'Config':{'Labels':{'com.docker.compose.project':'fixture','com.docker.compose.service':'gateway',
                'com.docker.compose.project.config_files':'/original.json'}},
            'HostConfig':{'Binds':[m.OLD_WEB+':/srv/web:ro','/keep:/keep:ro']},
            'Mounts':[{'Destination':'/srv/web','Source':m.OLD_WEB,'Type':'bind','RW':False}]}},
            'gateway':{'path':'/original.json'}}
        self.current=copy.deepcopy(self.p['runtimeBefore']['gateway'])
        self.h=type('Guard',(),{'PROJECT':'fixture','run':staticmethod(lambda *a,**k:b'present'),
            'inspect':staticmethod(lambda *a,**k:copy.deepcopy(self.current)),
            'identity':staticmethod(lambda c:(c['Id'],c['Image'],c['State']['StartedAt'],c['State']['Running'])),
            'inactive':staticmethod(lambda:None),
            'private_file':staticmethod(lambda p:p.read_bytes())})()

    def tearDown(self):
        self.patch.stop();self.temp.cleanup()

    def test_expected_mount_change_keeps_other_bind(self):
        after=m.expected_gateway(self.p,True)
        self.assertEqual(m.NEW_WEB,after['Mounts'][0]['Source'])
        self.assertEqual(m.NEW_WEB+':/srv/web:ro',after['HostConfig']['Binds'][0])
        self.assertEqual('/keep:/keep:ro',after['HostConfig']['Binds'][1])
        self.assertEqual(m.OLD_WEB,self.p['runtimeBefore']['gateway']['Mounts'][0]['Source'])

    def test_owned_gateway_refuses_later_image(self):
        self.current['Image']='another-image'
        with self.assertRaises(m.ActivationError):m.owned_gateway(self.h,self.p)

    def test_owned_gateway_refuses_another_config_even_with_same_image(self):
        self.current['Config']['Labels']['com.docker.compose.project.config_files']='/later-deploy.json'
        with self.assertRaises(m.ActivationError):m.owned_gateway(self.h,self.p)

    def test_owned_gateway_refuses_unknown_mount(self):
        self.current['Mounts'][0]['Source']='/later-release'
        with self.assertRaises(m.ActivationError):m.owned_gateway(self.h,self.p)

    def test_changed_plan_hash_refuses_before_loading(self):
        (self.anchor/'plan.private.json').write_text('PRIVATE_DO_NOT_PRINT')
        self.anchor.chmod(0o700)
        with self.assertRaises(m.ActivationError):m.read_plan(self.h)

    def test_recorded_partial_activation_is_not_repeated(self):
        with patch.object(m,'state',return_value={'phase':'switching'}),patch.object(m,'up') as up:
            with self.assertRaises(m.ActivationError):m.activate(self.h,self.p)
            up.assert_not_called()

    def test_completed_activation_is_idempotent(self):
        with patch.object(m,'state',return_value={'phase':'completed','gatewayAfterId':'same'}),\
             patch.object(m,'files_intact'),patch.object(m,'verify_runtime',return_value={'Id':'same'}),patch.object(m,'up') as up:
            result=m.activate(self.h,self.p)
            self.assertEqual('APP_REDESIGN_WEB_ALREADY_ACTIVATED',result['status'])
            up.assert_not_called()

    def test_completed_activation_refuses_recreated_gateway(self):
        with patch.object(m,'state',return_value={'phase':'completed','gatewayAfterId':'same'}),\
             patch.object(m,'files_intact'),patch.object(m,'verify_runtime',return_value={'Id':'different'}),patch.object(m,'up') as up:
            with self.assertRaises(m.ActivationError):m.activate(self.h,self.p)
            up.assert_not_called()

    def test_atomic_journal_keeps_recovery_identity(self):
        m.journal(self.h,'switching',gatewayBeforeId='before')
        m.journal(self.h,'completed',gatewayAfterId='after')
        record=m.state(self.h)
        self.assertEqual('before',record['gatewayBeforeId'])
        self.assertEqual('after',record['gatewayAfterId'])
        self.assertEqual(m.PLAN_SHA,record['planSha256'])
        self.assertEqual(0o600,(self.anchor/'activation.private.json').stat().st_mode&0o777)

    def test_public_probe_has_only_gets_and_no_provider_credentials(self):
        self.assertNotIn('POST',m.public_probe.__code__.co_consts)
        files={role+'/'+name:{'sha256':'a'*64} for role in ['driver','passenger'] for name in ['index.html','main.dart.js','ramo_push_config.js']}
        calls=[]
        h=type('Probe',(),{'run':staticmethod(lambda args,**k:calls.append(args))})()
        m.public_probe(h,{'candidateWebFiles':files,'runtimeBefore':{'core':{'Name':'core'}}},True)
        script=calls[0][-1]
        self.assertIn('/ready',script)
        self.assertNotIn('method:',script)
        self.assertNotIn('authorization',script.lower())


if __name__=='__main__':unittest.main()
