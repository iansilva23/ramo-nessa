#!/usr/bin/env python3
"""Read-only operational facts for enabling account deletion and publishing truthful notices.
Never reads/prints credentials, customer identifiers, documents, or backup contents.
"""
import json
import os
import subprocess
import sys

CORE='ramo-nessa-staging-core-1'
GATEWAY='ramo-nessa-staging-gateway-1'
CORE_IMAGE='sha256:e4427c167ac583e68f144fbc7bee9b06faa99e677fd1b8ed88e346ab1fad7f7b'
GATEWAY_IMAGE='sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
WEB='/opt/ramo-nessa-web/releases/apps-pending-9eb6aa071db4/bundles'

PROBE=r"""
import{createPostgresPool}from'/app/dist/src/db/postgres.js';
import{resolveDbPoolMax}from'/app/dist/src/config/runtime-config.js';
import{createPrivateDocumentStorageFromEnv}from'/app/dist/src/drivers/driver-document-private-storage.js';
import{access,constants}from'node:fs/promises';
const pool=createPostgresPool(process.env.DATABASE_URL);const c=await pool.connect();
try{
 await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='5s'");
 const schema=await c.query("SELECT filename,checksum FROM schema_migrations WHERE filename IN ('105_self_account_deletion.sql','106_account_deletion_requests.sql') ORDER BY filename");
 const counts=await c.query("SELECT (SELECT count(*)::int FROM driver_documents) AS private_documents,(SELECT count(*)::int FROM passenger_saved_cards) AS saved_cards,(SELECT count(*)::int FROM self_account_deletions WHERE status='processing') AS existing_cleanups");
 const legal=await c.query("SELECT document_type,version,status,effective_at FROM legal_documents ORDER BY document_type,version DESC");
 await c.query('COMMIT');
 let writable=null;if(process.env.DOCUMENT_STORAGE_LOCAL_DIR){try{await access(process.env.DOCUMENT_STORAGE_LOCAL_DIR,constants.W_OK);writable=true;}catch{writable=false;}}
 const storage=createPrivateDocumentStorageFromEnv();
 const env=process.env;
 console.log(JSON.stringify({dbPoolMax:resolveDbPoolMax(),selfDeletionEnabled:env.SELF_ACCOUNT_DELETION_ENABLED==='true',storage:{mode:env.DOCUMENT_STORAGE_LOCAL_DIR?'local':env.DOCUMENT_STORAGE_BASE_URL?'http':'none',deleteImplemented:typeof storage?.delete==='function',localWritable:writable},schema:schema.rows,counts:counts.rows[0],legalDocuments:legal.rows,configuredEnvironmentNames:Object.keys(env).filter(k=>/FIREBASE|ASAAS|MERCADO_PAGO|RESEND|GOOGLE_MAPS/.test(k)&&Boolean(env[k]?.trim())).sort(),configuredByKnownNames:{firebase:Boolean(env.FIREBASE_SERVICE_ACCOUNT_FILE||env.FIREBASE_PROJECT_ID),asaas:Boolean(env.ASAAS_API_KEY_FILE||env.ASAAS_API_KEY),mercadoPago:Boolean(env.MERCADO_PAGO_ACCESS_TOKEN||env.MERCADO_PAGO_ACCESS_TOKEN_TEST||env.MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION),maps:Boolean(env.GOOGLE_MAPS_SERVER_API_KEY),resend:Boolean(env.RESEND_API_KEY||env.PASSWORD_RECOVERY_EMAIL_API_KEY)}}));
}finally{c.release();await pool.end();}
"""

def command(args):
    result=subprocess.run(args,capture_output=True,timeout=40)
    if result.returncode:
        raise RuntimeError('Leitura não concluída; nenhuma alteração foi aplicada.')
    return result.stdout


def collect():
    core,gateway=json.loads(command(['docker','inspect',CORE,GATEWAY]))
    assert core['Image']==CORE_IMAGE and gateway['Image']==GATEWAY_IMAGE,'Versão ativa mudou.'
    mounts=[m for m in gateway['Mounts'] if m['Destination']=='/srv/web']
    assert len(mounts)==1 and mounts[0]['Source']==WEB,'Web ativa mudou.'
    assert all(c['State']['Running'] and c['State'].get('Health',{}).get('Status')=='healthy' for c in (core,gateway)), 'Serviço não saudável.'
    facts=json.loads(command(['docker','exec',CORE,'node','--input-type=module','-e',PROBE]))
    # Unit names only, never systemd environment or service command lines.
    timers=subprocess.run(['systemctl','list-timers','--all','--no-pager','--no-legend'],capture_output=True,text=True,timeout=15)
    timer_names=sorted({part for line in timers.stdout.splitlines() for part in line.split() if part.endswith('.timer') and 'ramo' in part.lower() and any(word in part.lower() for word in ('backup','retention','privacy','purge'))})
    return {'status':'PRIVACY_FINALIZATION_READ_ONLY','coreImage':core['Image'],'gatewayImage':gateway['Image'],'facts':facts,'relatedTimerNames':timer_names,'changesApplied':False,'servicesRestarted':False,'accountDeleted':False,'paymentsChanged':False}

if __name__=='__main__':
    try:
        assert os.geteuid()==0,'Execute com sudo python3.'
        print(json.dumps(collect(),indent=2,ensure_ascii=False))
    except (AssertionError,RuntimeError,ValueError,KeyError,OSError,subprocess.SubprocessError) as error:
        sys.exit('Inventário interrompido sem alterações. Verifique a versão e o acesso ao Docker.')
