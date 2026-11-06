"""Disposable Docker/PostgreSQL rehearsal; no production names, data or providers."""
import contextlib
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import uuid
import zipfile

HERE=Path(__file__).resolve().parent

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

prep=load(HERE/'prepare-web.py','rehearsal_prepare')
activate=load(HERE/'activate-web.py','rehearsal_activate')
inventory=load(HERE/'inspect-active.py','rehearsal_inventory')
guard=load(HERE.parent/'android-lock/activate-lock-candidate.py','rehearsal_guard')


def command(args,input=None,timeout=180):
    return subprocess.run(args,input=input,capture_output=True,check=True,timeout=timeout).stdout


@unittest.skipUnless(os.environ.get('RAMO_REDESIGN_DOCKER_REHEARSAL')=='1' and shutil.which('docker'),
                     'Disposable Docker rehearsal explicitly enabled only in CI')
class DockerActivationRehearsal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build=tempfile.TemporaryDirectory()
        context=Path(cls.build.name)
        cls.image='ramo-redesign-rehearsal:'+uuid.uuid4().hex[:10]
        (context/'Dockerfile').write_text('''FROM node:22-alpine
RUN npm install --prefix /fixture --no-audit --no-fund pg@8.16.3
COPY server.mjs /fixture/server.mjs
COPY postgres.js /app/dist/src/db/postgres.js
RUN printf '{"type":"module"}' > /app/package.json
CMD ["node","/fixture/server.mjs"]
''')
        (context/'postgres.js').write_text("import pg from '/fixture/node_modules/pg/lib/index.js'; export function createPostgresPool(url){return new pg.Pool({connectionString:url});}\n")
        (context/'server.mjs').write_text('''import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/ready'){res.end('ready');return;}
 if(/^\\/v1\\/auth\\/(driver|passenger)\\/recovery\\/channels$/.test(url.pathname)){
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({channels:['email','whatsapp']}));return;
 }
 const match=/^\\/(motorista|passageiro)\\/(.*)$/.exec(url.pathname);
 if(!match){res.writeHead(404).end();return;}
 const role=match[1]==='motorista'?'driver':'passenger';
 const root=path.resolve(process.env.WEB_ROOT||'/srv/web',role);
 const target=path.resolve(root,match[2]||'index.html');
 if(!target.startsWith(root+'/')){res.writeHead(400).end();return;}
 try{res.end(fs.readFileSync(target));}catch{res.writeHead(404).end();}
}).listen(8080,'0.0.0.0');
''')
        command(['docker','build','--label','ramo.redesign.rehearsal=true','-t',cls.image,str(context)],timeout=360)

    @classmethod
    def tearDownClass(cls):
        command(['docker','image','rm',cls.image])
        cls.build.cleanup()

    def setUp(self):
        self.project='ramo-redesign-rehearsal-'+uuid.uuid4().hex[:8]
        assert self.project!='ramo-nessa-staging'
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.clean_docker)
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.security=self.root/'security';self.security.mkdir(mode=0o700)
        self.releases=self.root/'releases';self.releases.mkdir()
        self.old=self.root/'active';self.old.mkdir()
        self.package=self.root/'package';self.package.mkdir()
        self.payloads={}
        for role in ('driver','passenger'):
            directory=self.old/role;directory.mkdir()
            for name in ('index.html','main.dart.js','ramo_push_config.js','flutter_bootstrap.js'):
                (directory/name).write_bytes((role+' old '+name).encode());(directory/name).chmod(0o644)
            files={name:(directory/name).read_bytes() for name in ('index.html','main.dart.js','ramo_push_config.js','flutter_bootstrap.js')}
            files['main.dart.js']=(role+' new compiled').encode()
            filename=role+'.zip'
            with zipfile.ZipFile(self.package/filename,'w') as archive:
                archive.writestr('manifest.json',json.dumps({'source':prep.SOURCE,'role':role,
                    'basePath':'/'+prep.ROUTES[role]+'/', 'files':{k:prep.sha(v) for k,v in files.items()}}))
                for name,raw in files.items():archive.writestr(role+'/'+name,raw)
            self.payloads[role]=(filename,prep.sha((self.package/filename).read_bytes()))
        (self.old/'admin').mkdir();(self.old/'admin/index.html').write_bytes(b'APPROVED ADM KEEP')
        self.network=self.project+'-network'
        command(['docker','network','create','--internal','--label','com.docker.compose.project='+self.project,self.network])
        net={'fixture':{'name':self.network,'external':True}}
        health={'test':['CMD','node','-e',"fetch('http://127.0.0.1:8080/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],
            'interval':'1s','timeout':'3s','retries':30}
        common={'image':self.image,'environment':{'TOKEN':'literal$$value','WEB_ROOT':'/srv/web'},
            'networks':{'fixture':None},'volumes':[{'type':'bind','source':str(self.old),'target':'/srv/web','read_only':True}],
            'healthcheck':health,'restart':'no'}
        self.names={s:self.project+'-'+s for s in ('core','gateway','postgres','google-maps-mock')}
        services={s:{**copy.deepcopy(common),'container_name':self.names[s]} for s in ('core','google-maps-mock')}
        services['core']['environment']['DATABASE_URL']='postgresql://postgres:fixture-only@postgres:5432/postgres'
        services['postgres']={'image':'postgres:16-alpine','container_name':self.names['postgres'],
            'environment':{'POSTGRES_PASSWORD':'fixture-only'},'networks':{'fixture':None},
            'volumes':[{'type':'volume','source':'data','target':'/var/lib/postgresql/data'}],
            'healthcheck':{'test':['CMD','pg_isready','-U','postgres'],'interval':'1s','timeout':'3s','retries':30}}
        self.other=self.security/'others.json';self.other.write_text(json.dumps({'name':self.project,'services':services,'networks':net,'volumes':{'data':{}}}));self.other.chmod(0o600)
        gateway=copy.deepcopy(common);gateway['container_name']=self.names['gateway']
        self.gateway=self.security/'original-gateway.json';self.gateway.write_text(json.dumps({'name':self.project,'services':{'gateway':gateway},'networks':net}));self.gateway.chmod(0o600)
        for file in (self.other,self.gateway):
            command(self.compose(file)+['up','-d','--no-build','--wait','--wait-timeout','90'],timeout=150)
        self.sql("CREATE TABLE ledger(id int primary key, amount int); INSERT INTO ledger VALUES (1,900),(2,100); CREATE TABLE rides(state text,payment_expires_at timestamptz,driver_hold_expires_at timestamptz);")
        self.ledger=self.sql('SELECT id,amount FROM ledger ORDER BY id;')
        self.stack.enter_context(patch.multiple(guard,PROJECT=self.project,NAMES=[self.names[k] for k in ('core','gateway','postgres','google-maps-mock')]))
        self.stack.enter_context(patch.object(inventory,'PROJECT',self.project))
        baseline=inventory.collect()['baselineSha256']
        self.stack.enter_context(patch.multiple(prep,ROOT=self.security,RELEASES=self.releases,BASE_WEB=self.old,BASELINE=baseline,NAME='fixture-anchor',PAYLOAD=self.payloads))
        old_umask=os.umask(0o077)
        try:result=prep.prepare(self.package,guard,inventory)
        finally:os.umask(old_umask)
        self.anchor=Path(result['anchor'])
        self.stack.enter_context(patch.multiple(activate,ROOT=self.security,ANCHOR=self.anchor,PLAN_SHA=result['planSha256'],
            BASELINE=baseline,OLD_WEB=str(self.old),NEW_WEB=result['candidateWeb'],CORE_IMAGE=result['coreImage'],
            GATEWAY_IMAGE=result['gatewayImage'],PUBLIC_BASE='http://gateway:8080'))
        self.plan=activate.read_plan(guard)
        self.before={s:guard.inspect(n)['Id'] for s,n in self.names.items()}

    def compose(self,path):
        return ['docker','compose','--project-name',self.project,'--project-directory',str(self.root),
                '--env-file','/dev/null','-f',str(path)]

    def sql(self,statement):
        return command(['docker','exec',self.names['postgres'],'psql','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',statement])

    def clean_docker(self):
        assert self.project.startswith('ramo-redesign-rehearsal-') and self.project!='ramo-nessa-staging'
        ids=command(['docker','ps','-aq','--filter','label=com.docker.compose.project='+self.project]).decode().split()
        if ids:command(['docker','rm','-f',*ids])
        volumes=command(['docker','volume','ls','-q','--filter','label=com.docker.compose.project='+self.project]).decode().split()
        if volumes:command(['docker','volume','rm',*volumes])
        networks=command(['docker','network','ls','-q','--filter','label=com.docker.compose.project='+self.project]).decode().split()
        if networks:command(['docker','network','rm',*networks])

    def assert_others_and_data(self):
        for s in ('core','postgres','google-maps-mock'):
            self.assertEqual(self.before[s],guard.inspect(self.names[s])['Id'])
        self.assertEqual(self.ledger,self.sql('SELECT id,amount FROM ledger ORDER BY id;'))
        self.assertEqual(b'APPROVED ADM KEEP',(Path(activate.NEW_WEB)/'admin/index.html').read_bytes())

    def test_real_active_ride_blocks_then_activation_and_manual_return_preserve_data(self):
        self.sql("INSERT INTO rides(state) VALUES ('IN_PROGRESS');")
        with self.assertRaisesRegex(RuntimeError,'corridas'):
            activate.activate(guard,self.plan)
        self.assertEqual(self.before['gateway'],guard.inspect(self.names['gateway'])['Id'])
        self.assertFalse((self.anchor/'activation.private.json').exists())
        self.sql('DELETE FROM rides;')
        result=activate.activate(guard,self.plan)
        self.assertEqual('APP_REDESIGN_WEB_ACTIVATED',result['status'])
        after=guard.inspect(self.names['gateway'])['Id'];self.assertNotEqual(self.before['gateway'],after)
        self.assert_others_and_data()
        again=activate.activate(guard,self.plan)
        self.assertEqual('APP_REDESIGN_WEB_ALREADY_ACTIVATED',again['status'])
        self.assertEqual(after,guard.inspect(self.names['gateway'])['Id'])
        activate.rollback(guard,self.plan)
        self.assertEqual(str(self.old),activate.mount_source(guard.inspect(self.names['gateway'])))
        self.assertEqual('rolled-back',activate.state(guard)['phase'])
        self.assert_others_and_data()

    def test_real_failure_after_switch_automatically_restores_verified_old_web(self):
        probe=activate.public_probe
        def failure(h,p,candidate):
            if candidate:raise activate.ActivationError('Injected post-switch verification failure')
            return probe(h,p,candidate)
        with patch.object(activate,'public_probe',side_effect=failure):
            with self.assertRaisesRegex(activate.ActivationError,'restaurada e conferida'):
                activate.activate(guard,self.plan)
        self.assertEqual('rolled-back',activate.state(guard)['phase'])
        self.assertEqual(str(self.old),activate.mount_source(guard.inspect(self.names['gateway'])))
        self.assert_others_and_data()
        with self.assertRaises(activate.ActivationError):activate.activate(guard,self.plan)


if __name__=='__main__':unittest.main()
