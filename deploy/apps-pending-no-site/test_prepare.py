import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

HERE = Path(__file__).resolve().parent

def load(path, name):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

m=load(HERE/'prepare.py','apps_prepare_test')
p=load(HERE/'prepare-guard.py','apps_guard_test')

class PreparationTests(unittest.TestCase):
    def test_only_audio_bridge_can_change_driver_shell(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'index.html').write_bytes(b'<html>\n</html>')
            payload={'index.html':b'<html>\n'+m.BRIDGE+b'</html>','main.dart.js':b'de20bf289d6db3ad15fdb14b','ramo_offer_tone.js':b'bridge'}
            m.shell(root,payload,'driver')
            payload['index.html']+=b'changed map key'
            with self.assertRaises(RuntimeError):m.shell(root,payload,'driver')

    def test_passenger_shell_must_be_identical(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'index.html').write_bytes(b'original')
            m.shell(root,{'index.html':b'original'},'passenger')
            with self.assertRaises(RuntimeError):m.shell(root,{'index.html':b'changed'},'passenger')

    def test_archive_traversal_and_bad_hash_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'driver.zip'
            for unsafe in ['../escape','/absolute','a/../../escape']:
                raw=b'x';manifest={'source':m.SOURCE,'component':'driver','basePath':'/motorista/','files':{unsafe:m.sha(raw)}}
                with zipfile.ZipFile(path,'w') as z:
                    z.writestr('manifest.json',json.dumps(manifest));z.writestr('driver/'+unsafe,raw)
                with patch.dict(m.PACKAGES,driver=m.sha(path.read_bytes())):
                    with self.assertRaises((RuntimeError,p.PreparationError)):m.read_web(path,'driver',p)
            with patch.dict(m.PACKAGES,driver='f'*64):
                with self.assertRaises((RuntimeError,p.PreparationError)):m.read_web(path,'driver',p)

    def test_full_preparation_never_restarts_migrates_or_touches_site(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);old=root/'old';old.mkdir();releases=root/'releases';releases.mkdir();payloads={}
            for role in ('driver','passenger'):
                folder=old/role;folder.mkdir()
                (folder/'index.html').write_bytes(b'<html>\n</html>')
                (folder/'main.dart.js').write_bytes(b'old-'+role.encode())
                (folder/'ramo_push_config.js').write_bytes(b'push')
                payloads[role]={'index.html':b'<html>\n'+(m.BRIDGE if role=='driver' else b'')+b'</html>','main.dart.js':b'new-de20bf289d6db3ad15fdb14b','ramo_push_config.js':b'push','flutter_bootstrap.js':b'bootstrap'}
                if role=='driver':payloads[role]['ramo_offer_tone.js']=b'bridge'
            before=p.tree(old)
            runtime={'core':{'Image':m.OLD_CORE,'Config':{'Env':['SELF_ACCOUNT_DELETION_ENABLED=false']}},'gateway':{'Image':m.GATEWAY,'Config':{'Env':[]}},'postgres':{'Image':'postgres'}}
            state={'baselineSha256':m.BASELINE,'activeWebRoot':str(old),'services':{k:{'name':k,'running':True,'health':'healthy'} for k in runtime}}
            snapshots={k:{'service':k,'project':'ramo-nessa-staging','workdir':str(root),'model':{'services':{k:{'image':runtime[k]['Image'],**({'volumes':[{'target':'/srv/web','source':str(old),'read_only':True},{'target':'/etc/caddy/Caddyfile','source':'old-caddy','read_only':True}]} if k=='gateway' else {})}}}} for k in ('core','gateway')}
            sql=b'CREATE TABLE test();';caddy=b'  @api path /v1/* /health /ready\n';commands=[]
            guard=SimpleNamespace(inspect=lambda name:copy.deepcopy(runtime[name]),environment=lambda env:dict(line.split('=',1) for line in env),run=lambda cmd,**kw:commands.append(cmd))
            with patch.object(m,'ROOT',root),patch.object(m,'RELEASES',releases),patch.object(m,'OLD_WEB',old),patch.object(m,'read_web',side_effect=lambda path,role,guard:payloads[role]),patch.object(p,'snapshot',side_effect=lambda h,r,key,project:copy.deepcopy(snapshots[key])),patch.object(p,'payload',return_value=({'files':{}},{'migrations/105_self_account_deletion.sql':sql})),patch.object(p,'verify_image_base'),patch.object(p,'verify_image_files'),patch.object(p,'schema_state',return_value={'migration105':'pending'}),patch.object(p,'caddy_source_bytes',return_value=caddy),patch.object(p,'CADDY_SHA',m.sha(caddy)),patch.object(p,'compose',side_effect=lambda h,project,workdir,path:json.loads(path.read_bytes())):
                result=m.prepare(root,p,SimpleNamespace(collect=lambda:copy.deepcopy(state)),guard)
            self.assertEqual(result['status'],'APPS_WITHOUT_SITE_PREPARED')
            self.assertFalse(result['changesApplied']);self.assertFalse(result['databaseMigrationPerformed'])
            self.assertEqual(p.tree(old),before)
            plan=json.loads((root/m.NAME/'plan.private.json').read_bytes())
            self.assertEqual(plan['images'],{'core':m.CORE,'gateway':m.GATEWAY})
            after=json.loads((root/m.NAME/'gateway-after.private.json').read_bytes())
            expected=copy.deepcopy(snapshots['gateway']['model'])
            expected['services']['gateway']['volumes'][0]['source']=str(releases/m.NAME/'bundles')
            expected['services']['gateway']['volumes'][1]['source']=str(root/m.NAME/'Caddyfile.candidate')
            self.assertEqual(after,expected)
            self.assertEqual(len(commands),1)
            self.assertEqual(commands[0][1],'run');self.assertIn('validate',commands[0])
            self.assertNotIn('up',commands[0]);self.assertNotIn('institutional-site',str(commands))

if __name__=='__main__':unittest.main()
