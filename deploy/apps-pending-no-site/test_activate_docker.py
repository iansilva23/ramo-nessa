"""Disposable PostgreSQL/Caddy rehearsal: no real names, users, credentials or providers."""
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

HERE=Path(__file__).resolve().parent
REPO=HERE.parent.parent

def load(path,name):
    s=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

m=load(HERE/'activate.py','apps_activation_docker')
g=load(HERE.parent/'android-lock/activate-lock-candidate.py','apps_runtime_docker')
p=load(HERE/'prepare-guard.py','apps_plan_docker')


def command(args,input=None,timeout=180):
    r=subprocess.run(args,input=input,capture_output=True,timeout=timeout)
    if r.returncode:
        raise AssertionError(r.stderr.decode(errors='replace')[-7000:])
    return r.stdout


@unittest.skipUnless(os.environ.get('RAMO_APPS_DOCKER_REHEARSAL')=='1' and shutil.which('docker'), 'Disposable Docker rehearsal enabled only in CI')
class AppActivationRehearsal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build=tempfile.TemporaryDirectory();root=Path(cls.build.name)
        cls.base_tag='ramo-apps-rehearsal:'+uuid.uuid4().hex[:12]
        cls.candidate_tag=cls.base_tag+'-candidate'
        (root/'Dockerfile').write_text('''FROM node:22-alpine
WORKDIR /app
RUN npm install --prefix /fixture --no-audit --no-fund pg@8.16.3
COPY postgres.js /app/dist/src/db/postgres.js
COPY server.mjs /fixture/server.mjs
COPY migrations /fixture/migrations
RUN printf '{"type":"module"}' > /app/package.json && printf 'old' > /fixture/version
USER node
CMD ["node","/fixture/server.mjs"]
''')
        (root/'postgres.js').write_text("import pg from '/fixture/node_modules/pg/lib/index.js';export function createPostgresPool(url){return new pg.Pool({connectionString:url});}\n")
        (root/'server.mjs').write_text('''import http from 'node:http';import fs from 'node:fs';import{createPostgresPool}from'/app/dist/src/db/postgres.js';
const pool=process.env.DATABASE_URL?createPostgresPool(process.env.DATABASE_URL):null;
const candidate=fs.readFileSync('/fixture/version','utf8')==='candidate';
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/ready'||url.pathname==='/health'){if(pool)await pool.query('SELECT 1');res.end('ready');return;}
 if(/^\\/v1\\/auth\\/(driver|passenger)\\/recovery\\/channels$/.test(url.pathname)){res.setHeader('content-type','application/json');res.end(JSON.stringify({channels:['email','whatsapp']}));return;}
 if(candidate&&url.pathname==='/v1/me/account-deletion'){res.setHeader('content-type','application/json');res.end(JSON.stringify({available:process.env.SELF_ACCOUNT_DELETION_ENABLED==='true'}));return;}
 if(candidate&&url.pathname==='/v1/account-deletion/page'){res.setHeader('content-type','text/html');res.end('<html><h1>Excluir minha conta</h1></html>');return;}
 res.writeHead(404).end();
}catch{res.writeHead(503).end('not ready');}}).listen(8080,'0.0.0.0');
''')
        shutil.copytree(REPO/'backend/core/migrations',root/'migrations')
        command(['docker','build','--label','ramo.apps.rehearsal=true','-t',cls.base_tag,str(root)],timeout=360)
        cls.base=json.loads(command(['docker','image','inspect',cls.base_tag]))[0]['Id']
        (root/'Dockerfile').write_text('FROM '+cls.base_tag+'\nCOPY version /fixture/version\n')
        (root/'version').write_text('candidate')
        command(['docker','build','--pull=false','--network=none','-t',cls.candidate_tag,str(root)])
        cls.candidate=json.loads(command(['docker','image','inspect',cls.candidate_tag]))[0]['Id']
        command(['docker','pull','caddy:2.11.7-alpine'])
        cls.gateway_image=json.loads(command(['docker','image','inspect','caddy:2.11.7-alpine']))[0]['Id']

    @classmethod
    def tearDownClass(cls):
        command(['docker','image','rm',cls.candidate_tag,cls.base_tag]);cls.build.cleanup()

    def setUp(self):
        self.project='ramo-apps-rehearsal-'+uuid.uuid4().hex[:8]
        assert self.project!='ramo-nessa-staging'
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.addCleanup(self.temp.cleanup);self.addCleanup(self.cleanup_docker)
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.security=self.root/'security';self.security.mkdir(mode=0o700)
        self.anchor=self.security/'fixture-anchor';self.anchor.mkdir(mode=0o700)
        self.old=self.root/'old';self.old.mkdir();self.new=self.root/'candidate';self.new.mkdir()
        for role in ('driver','passenger'):
            for base in (self.old,self.new):
                folder=base/role;folder.mkdir()
                for name in ('index.html','main.dart.js','ramo_push_config.js'):(folder/name).write_text(role+(' old ' if base==self.old else ' new ')+name)
        (self.new/'driver/assets/assets/audio').mkdir(parents=True)
        (self.new/'driver/assets/assets/audio/nova_corrida.mp3').write_bytes(b'original fixture audio')
        (self.new/'driver/ramo_offer_tone.js').write_bytes(b'fixture audio bridge')
        (self.old/'admin').mkdir();(self.old/'admin/index.html').write_text('UNCHANGED ADM')
        shutil.copytree(self.old/'admin',self.new/'admin')
        shutil.copytree(self.old,self.anchor/'before-web')
        self.caddy=self.root/'Caddyfile';self.caddy.write_text('''{
 admin off
 auto_https off
}
:8080 {
 handle /ready {
  reverse_proxy core:8080
 }
 handle /v1/* {
  reverse_proxy core:8080
 }
 handle_path /motorista/* {
  root * /srv/web/driver
  file_server
 }
 handle_path /passageiro/* {
  root * /srv/web/passenger
  file_server
 }
}
''')
        candidate_caddy=self.caddy.read_text().replace(' handle /v1/*',' handle /excluir-conta {\n  rewrite * /v1/account-deletion/page\n  reverse_proxy core:8080\n }\n handle /v1/*',1)
        (self.anchor/'Caddyfile.candidate').write_text(candidate_caddy)
        (self.anchor/'Caddyfile.candidate').chmod(0o644)
        self.names={s:self.project+'-'+s for s in ('core','gateway','postgres','google-maps-mock')}
        self.net=self.project+'-network'
        command(['docker','network','create','--internal','--label','com.docker.compose.project='+self.project,self.net])
        net={'fixture':{'name':self.net,'external':True}}
        health={'test':['CMD','node','-e',"fetch('http://127.0.0.1:8080/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],'interval':'1s','timeout':'3s','retries':30}
        others={'name':self.project,'services':{'postgres':{'image':'postgres:16-alpine','container_name':self.names['postgres'],'environment':{'POSTGRES_USER':'postgres','POSTGRES_DB':'postgres','POSTGRES_PASSWORD':'fixture-only'},'networks':{'fixture':None},'volumes':[{'type':'volume','source':'data','target':'/var/lib/postgresql/data'}],'healthcheck':{'test':['CMD','pg_isready','-U','postgres'],'interval':'1s','timeout':'3s','retries':30}},'google-maps-mock':{'image':self.base,'container_name':self.names['google-maps-mock'],'networks':{'fixture':None},'healthcheck':health}},'networks':net,'volumes':{'data':{}}}
        self.original={}
        self.original['others']=self.security/'others.json';self.original['others'].write_text(json.dumps(others))
        core={'name':self.project,'services':{'core':{'image':self.base,'container_name':self.names['core'],'environment':{'DATABASE_URL':'postgresql://postgres:fixture-only@postgres:5432/postgres','SELF_ACCOUNT_DELETION_ENABLED':'false','LITERAL':'untouched$$value'},'networks':{'fixture':None},'volumes':[{'type':'volume','source':'documents','target':'/var/lib/ramo-nessa'}],'healthcheck':health,'read_only':True,'tmpfs':['/tmp']}},'networks':net,'volumes':{'documents':{}}}
        gateway={'name':self.project,'services':{'gateway':{'image':self.gateway_image,'container_name':self.names['gateway'],'environment':{},'networks':{'fixture':None},'volumes':[{'type':'bind','source':str(self.old),'target':'/srv/web','read_only':True},{'type':'bind','source':str(self.caddy),'target':'/etc/caddy/Caddyfile','read_only':True}],'healthcheck':{'test':['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:8080/ready'],'interval':'1s','timeout':'3s','retries':30}}},'networks':net}
        for name,model in [('core',core),('gateway',gateway)]:
            self.original[name]=self.security/(name+'.json');self.original[name].write_text(json.dumps(model));self.original[name].chmod(0o600)
        for name in ('others','core','gateway'):
            command(self.compose(self.original[name])+['up','-d','--no-build','--wait','--wait-timeout','90'],timeout=150)
        self.site_name=self.project+'-site'
        command(['docker','run','-d','--name',self.site_name,'--label','com.docker.compose.project='+self.project+'-site','--network=none','node:22-alpine','tail','-f','/dev/null'])
        init="""import{createPostgresPool}from'/app/dist/src/db/postgres.js';import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';const pool=createPostgresPool(process.env.DATABASE_URL);const c=await pool.connect();try{await c.query('CREATE TABLE schema_migrations(filename text PRIMARY KEY,checksum text,applied_at timestamptz NOT NULL DEFAULT now())');for(const f of readdirSync('/fixture/migrations').filter(n=>n.endsWith('.sql')&&n<'105').sort()){const sql=readFileSync('/fixture/migrations/'+f,'utf8');await c.query('BEGIN');await c.query(sql);await c.query('INSERT INTO schema_migrations(filename,checksum)VALUES($1,$2)',[f,createHash('sha256').update(sql).digest('hex')]);await c.query('COMMIT');}}finally{c.release();await pool.end();}"""
        command(['docker','exec',self.names['core'],'node','--input-type=module','-e',init],timeout=90)
        self.sql('CREATE TABLE ci_financial(id int PRIMARY KEY, amount int); INSERT INTO ci_financial VALUES(1,900),(2,100);')
        self.stack.enter_context(patch.multiple(g,PROJECT=self.project,DIRECTORY=self.anchor,NAMES=[self.names[k]for k in ('core','gateway','postgres','google-maps-mock')]))
        self.runtime={k:g.inspect(name)for k,name in self.names.items()}
        snapshots={k:p.snapshot(g,self.runtime[k],k,self.project)for k in ('core','gateway')}
        files={}
        for key in snapshots:
            for phase in ('before','after'):
                model=copy.deepcopy(snapshots[key]['model'])
                if phase=='after':
                    model['services'][key]['image']=self.candidate if key=='core'else self.gateway_image
                    if key=='gateway':
                        for v in model['services'][key]['volumes']:
                            if v['target']=='/srv/web':v['source']=str(self.new)
                            if v['target']=='/etc/caddy/Caddyfile':v['source']=str(self.anchor/'Caddyfile.candidate')
                name=key+'-'+phase+'.private.json';files[name]=p.save(self.anchor/name,model)
        sql=(REPO/'backend/core/migrations'/m.MIGRATION).read_bytes()
        files[m.MIGRATION]=p.save(self.anchor/m.MIGRATION,sql)
        files['Caddyfile.candidate']=m.sha((self.anchor/'Caddyfile.candidate').read_bytes())
        plan={'schema':1,'source':m.SOURCE,'baselineSha256':m.BASELINE,'snapshots':snapshots,'runtimeBefore':self.runtime,'images':{'core':self.candidate,'gateway':self.gateway_image},'oldWeb':str(self.old),'newWeb':str(self.new),'beforeWebFiles':m.tree(self.old),'candidateWebFiles':m.tree(self.new),'schemaState':{'migration104':'verified','migration105':'pending'},'files':files,'siteTouched':False,'selfAccountDeletionEnabled':False,'activationImplemented':False}
        digest=p.save(self.anchor/'plan.private.json',plan)
        p.save(self.anchor/'prepared.private.json',{'status':'APPS_WITHOUT_SITE_PREPARED','planSha256':digest})
        self.stack.enter_context(patch.multiple(m,ROOT=self.security,ANCHOR=self.anchor,PLAN_SHA=digest,OLD_WEB=str(self.old),NEW_WEB=str(self.new),OLD_CORE=self.base,NEW_CORE=self.candidate,GATEWAY=self.gateway_image,CADDY_SHA=m.sha(self.caddy.read_bytes()),PUBLIC_BASE='http://gateway:8080',SITE_PROJECT=self.project+'-site'))
        self.plan=m.read_plan(g)
        self.before={k:c['Id']for k,c in self.runtime.items()};self.site_before=g.inspect(self.site_name)['Id']
        self.old_umask=os.umask(0o077);self.addCleanup(lambda:os.umask(self.old_umask))

    def compose(self,path):return ['docker','compose','--project-name',self.project,'--project-directory',str(self.root),'--env-file','/dev/null','-f',str(path)]
    def sql(self,sql):return command(['docker','exec',self.names['postgres'],'psql','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',sql])
    def cleanup_docker(self):
        assert self.project.startswith('ramo-apps-rehearsal-')and self.project!='ramo-nessa-staging'
        for project in (self.project,self.project+'-site'):
            ids=command(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project]).decode().split()
            if ids:command(['docker','rm','-f',*ids])
            volumes=command(['docker','volume','ls','-q','--filter','label=com.docker.compose.project='+project]).decode().split()
            if volumes:command(['docker','volume','rm',*volumes])
            nets=command(['docker','network','ls','-q','--filter','label=com.docker.compose.project='+project]).decode().split()
            if nets:command(['docker','network','rm',*nets])
    def assert_untouched(self):
        for role in ('postgres','google-maps-mock'):self.assertEqual(self.before[role],g.inspect(self.names[role])['Id'])
        self.assertEqual(self.site_before,g.inspect(self.site_name)['Id'])
        self.assertEqual((self.new/'admin/index.html').read_text(),'UNCHANGED ADM')
        self.assertEqual(self.sql('SELECT count(*) FROM ci_financial;'),b'2\n')

    def test_active_ride_blocks_then_real_activation_backup_restore_and_manual_return(self):
        self.sql("INSERT INTO rides(passenger_id,state,payment_status,origin_zone_id,destination_zone_id,category,price_period,passengers,pricing_rule_id,base_amount_cents,pickup_compensation_cents,total_amount_cents,platform_commission_cents,driver_net_cents)VALUES('ci-passenger','IN_PROGRESS','PAID','a','b','car','day',1,'ci',1000,0,1000,100,900);")
        with self.assertRaisesRegex(RuntimeError,'corridas'):m.activate(g,self.plan)
        self.assertFalse((self.anchor/'activation.private.json').exists())
        self.assertFalse((self.anchor/'database-before.dump').exists())
        self.sql('DELETE FROM rides;')
        result=m.activate(g,self.plan);self.assertEqual(result['status'],'APPS_WITHOUT_SITE_ACTIVATED')
        self.assertTrue(result['databaseMigrationPerformed']);self.assertFalse(result['siteTouched'])
        self.assertEqual(self.sql("SELECT count(*) FROM schema_migrations WHERE filename='105_self_account_deletion.sql';"),b'1\n')
        ids={s:g.inspect(n)['Id']for s,n in self.names.items()}
        self.assertEqual(m.activate(g,self.plan)['status'],'APPS_WITHOUT_SITE_ALREADY_ACTIVATED')
        self.assertEqual(ids,{s:g.inspect(n)['Id']for s,n in self.names.items()})
        # Verify the actual backup by restoring ONLY into a disposable fixture DB.
        self.sql('CREATE DATABASE ci_restored;')
        with (self.anchor/'database-before.dump').open('rb')as source:
            r=subprocess.run(['docker','exec','-i',self.names['postgres'],'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','postgres','-d','ci_restored'],stdin=source,capture_output=True,timeout=60)
        self.assertEqual(r.returncode,0,r.stderr.decode())
        restored=command(['docker','exec',self.names['postgres'],'psql','-U','postgres','-d','ci_restored','-At','-c','SELECT amount FROM ci_financial ORDER BY id;'])
        self.assertEqual(restored,b'900\n100\n')
        self.sql('UPDATE ci_financial SET amount=999 WHERE id=1;')
        m.rollback(g,self.plan)
        self.assertEqual(g.inspect(self.names['core'])['Image'],self.base)
        self.assertEqual(self.sql('SELECT amount FROM ci_financial WHERE id=1;'),b'999\n')
        self.assertTrue(m.schema(g,self.plan)) # Additive schema retained; no financial restore.
        self.assert_untouched()

    def test_post_switch_failure_restores_both_services_without_reverting_data(self):
        public=m.public_probe
        def failure(h,p,candidate):
            if candidate:raise m.ActivationError('injected post-switch failure')
            return public(h,p,candidate)
        with patch.object(m,'public_probe',side_effect=failure):
            with self.assertRaisesRegex(m.ActivationError,'restaurados e conferidos'):m.activate(g,self.plan)
        self.assertEqual(m.state(g)['phase'],'rolled-back')
        self.assertEqual(g.inspect(self.names['core'])['Image'],self.base)
        self.assertEqual(self.sql('SELECT amount FROM ci_financial ORDER BY id;'),b'900\n100\n')
        with self.assertRaises(m.ActivationError):m.activate(g,self.plan)
        self.assert_untouched()

    def test_failure_after_core_switch_restores_core_without_recreating_original_gateway(self):
        up=m.up
        def failure(h,p,service,phase):
            up(h,p,service,phase)
            if service=='core'and phase=='after':raise m.ActivationError('injected after Core switch')
        with patch.object(m,'up',side_effect=failure):
            with self.assertRaisesRegex(m.ActivationError,'restaurados e conferidos'):m.activate(g,self.plan)
        self.assertEqual(g.inspect(self.names['core'])['Image'],self.base)
        self.assertEqual(g.inspect(self.names['gateway'])['Id'],self.before['gateway'])
        self.assert_untouched()

    def test_sql_failure_rolls_back_the_whole_migration_without_restarting_services(self):
        original=self.plan['files'][m.MIGRATION]
        sql=(self.anchor/m.MIGRATION).read_bytes()+b'\nINVALID SQL STATEMENT;'
        (self.anchor/m.MIGRATION).write_bytes(sql);self.plan['files'][m.MIGRATION]=m.sha(sql)
        # Fixture only: re-pin this deliberately invalid plan to test SQL atomicity.
        digest=m.sha(json.dumps(self.plan,indent=2).encode()+b'\n')
        (self.anchor/'plan.private.json').write_text(json.dumps(self.plan,indent=2)+'\n')
        (self.anchor/'prepared.private.json').write_text(json.dumps({'status':'APPS_WITHOUT_SITE_PREPARED','planSha256':digest}))
        with patch.object(m,'PLAN_SHA',digest):
            with self.assertRaisesRegex(m.ActivationError,'restaurados e conferidos'):m.activate(g,self.plan)
        self.assertEqual(self.sql("SELECT to_regclass('public.self_account_deletions') IS NULL;"),b't\n')
        for role in ('core','gateway'):self.assertEqual(self.before[role],g.inspect(self.names[role])['Id'])
        self.assert_untouched()

if __name__=='__main__':unittest.main()
