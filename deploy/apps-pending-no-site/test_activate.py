import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE=Path(__file__).resolve().parent

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

m=load(HERE/'activate.py','apps_activation_unit')

class ActivationGuards(unittest.TestCase):
    def plan(self):
        model={'services':{'gateway':{'image':m.GATEWAY,'environment':{'SECRET':'unchanged'},'volumes':[{'type':'bind','source':m.OLD_WEB,'target':'/srv/web','read_only':True},{'type':'bind','source':'/original/Caddyfile','target':'/etc/caddy/Caddyfile','read_only':True},{'type':'volume','source':'data','target':'/data'}]}}}
        return {'snapshots':{'gateway':{'model':model,'workdir':'/private'}},'runtimeBefore':{}}

    def test_gateway_model_changes_only_two_bind_sources(self):
        p=self.plan();actual=m.expected_model(p,'gateway','after');expected=copy.deepcopy(p['snapshots']['gateway']['model'])
        expected['services']['gateway']['volumes'][0]['source']=m.NEW_WEB
        expected['services']['gateway']['volumes'][1]['source']=str(m.ANCHOR/'Caddyfile.candidate')
        self.assertEqual(actual,expected)
        self.assertEqual(m.expected_model(p,'gateway','before'),p['snapshots']['gateway']['model'])

    def test_extra_environment_or_other_scope_change_is_rejected(self):
        p=self.plan();p['snapshots']['core']={'model':{'services':{'core':{'image':m.OLD_CORE}}},'workdir':'/private'}
        wrong=m.expected_model(p,'core','after');wrong['services']['core']['environment']={'SELF_ACCOUNT_DELETION_ENABLED':'true'}
        h=SimpleNamespace(PROJECT='fixture',run=lambda cmd:json.dumps(wrong))
        with self.assertRaises(m.ActivationError):m.verify_models(h,p)

    def test_changed_migration_checksum_is_never_overwritten(self):
        p={'files':{m.MIGRATION:'a'*64}}
        with patch.object(m,'db_query',return_value=[{'filename':'104_admin_account_closure.sql','checksum':m.BASE_MIGRATION_SHA},{'filename':m.MIGRATION,'checksum':'b'*64}]):
            with self.assertRaises(m.ActivationError):m.schema(None,p)

    def test_changed_plan_is_refused_before_runtime_or_database_access(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);root.chmod(0o700)
            h=SimpleNamespace(private_file=lambda p:b'{}')
            with patch.object(m,'ANCHOR',root):
                with self.assertRaisesRegex(m.ActivationError,'checksum'):m.read_plan(h)

    def test_incomplete_attempt_cannot_be_repeated(self):
        with patch.object(m,'state',return_value={'phase':'migrating'}),patch.object(m,'up') as up,patch.object(m,'migrate') as migrate:
            with self.assertRaises(m.ActivationError):m.activate(None,{})
            up.assert_not_called();migrate.assert_not_called()

    def test_completed_attempt_is_idempotent_without_restarts_or_migrations(self):
        current={'core':{'Id':'core-after'},'gateway':{'Id':'gateway-after'}}
        record={'phase':'completed','afterIds':{s:c['Id']for s,c in current.items()}}
        with patch.object(m,'state',return_value=record),patch.object(m,'files_intact'),patch.object(m,'runtime_intact',return_value=current),patch.object(m,'public_probe'),patch.object(m,'up')as up,patch.object(m,'migrate')as migrate:
            self.assertEqual(m.activate(None,{})['status'],'APPS_WITHOUT_SITE_ALREADY_ACTIVATED')
            up.assert_not_called();migrate.assert_not_called()

    def test_runtime_rewrites_mounts_and_binds_without_changing_secrets(self):
        old={'Mounts':[{'Destination':'/srv/web','Source':m.OLD_WEB},{'Destination':'/etc/caddy/Caddyfile','Source':'/original/Caddyfile'},{'Destination':'/data','Source':'volume'}], 'HostConfig':{'Binds':[m.OLD_WEB+':/srv/web:ro','/original/Caddyfile:/etc/caddy/Caddyfile:ro','keep:/data:rw']},'Config':{'Env':['TOKEN=unchanged']}}
        p={'runtimeBefore':{'gateway':old}}
        actual=m.expected_runtime(p,'gateway',True)
        self.assertEqual(actual['Config'],old['Config'])
        self.assertEqual(actual['HostConfig']['Binds'],[m.NEW_WEB+':/srv/web:ro',str(m.ANCHOR/'Caddyfile.candidate')+':/etc/caddy/Caddyfile:ro','keep:/data:rw'])
        self.assertEqual(old['Mounts'][0]['Source'],m.OLD_WEB)

if __name__=='__main__':unittest.main()
