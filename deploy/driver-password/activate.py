#!/usr/bin/env python3
"""Reversible password-login overlay on the verified running Core + Driver Web."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time

import patch_runtime as patch
import web_release as web
from isolated import test_candidate

ROOT=Path('/opt/ramo-nessa-security')
HELPER=ROOT/'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
HELPER_HASH='71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
BASE='sha256:449ead609890bc47d4274d4bc3e1df545ba87f5a732881efeb4037482a2e4083'
FLAG='WHATSAPP_OTP_ABUSE_CONTROLS'
APP='/app/dist/src/'
PACKAGE=Path(__file__).resolve().parent
BASE_CODE={APP+'server.js':'c9a402a06a76d998fbfaf5b9e00d6221b698615ec7ef2dcee820fdab0923299b',APP+'matching/postgres-ride-matching-repository.js':'52769175b3a53c214bc6dbfcd2bffabf197eecaf4f8489c6e82d2e6f326a7cb6',APP+'rides/pending-dispatch-service.js':'4e8257fe9314e2b2bab1f3d77b04742b68670117010b45b32ea02d8a7c0b565a'}


def require(ok,msg):
    if not ok: raise RuntimeError(msg)


def digest(raw): return hashlib.sha256(raw).hexdigest()


def helper():
    require(HELPER.is_file() and not HELPER.is_symlink() and digest(HELPER.read_bytes())==HELPER_HASH,'Âncora de segurança ausente/divergente; nada alterado.')
    s=importlib.util.spec_from_file_location('prior',HELPER)
    h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
    return h


def snapshot(h,name,service):
    c=h.inspect(name);labels=c['Config'].get('Labels') or {}
    require(c['State']['Running'] and c['State'].get('Health',{}).get('Status') in (None,'healthy'),'Serviço ativo sem saúde.')
    require(labels.get('com.docker.compose.project')==h.PROJECT and labels.get('com.docker.compose.service')==service,'Origem Compose divergente.')
    path=labels.get('com.docker.compose.project.config_files','');wd=labels.get('com.docker.compose.project.working_dir','')
    require(path.startswith('/') and wd.startswith('/') and ',' not in path,'Compose não autocontido.')
    raw=h.private_file(Path(path));model=json.loads(raw)
    require(service in model.get('services',{}) and not model['services'][service].get('env_file'),'Ambiente externo exige revisão.')
    resolved=resolve(h,path,wd)
    only=lambda m:{**copy.deepcopy(m),'services':{'core':copy.deepcopy(m['services'][service])}}
    h.assert_environment(only(resolved),c,h.inspect(c['Image'],True))
    h.assert_mount_plan(only(resolved),c)
    h.runtime_matches(c,c,c['Image'])
    # Work from a single-service model; no command can start another service.
    source={**copy.deepcopy(model),'services':{service:copy.deepcopy(model['services'][service])}}
    source['services'][service]['image']=c['Image']
    return {'container':c,'configPath':path,'workdir':wd,'sourceHash':digest(raw),'model':source,'resolved':{**copy.deepcopy(resolved),'services':{service:copy.deepcopy(resolved['services'][service])}}}


def resolve(h,path,wd):
    return json.loads(h.run(['docker','compose','--project-directory',str(wd),'--project-name',h.PROJECT,'--env-file','/dev/null','-f',str(path),'config','--format','json']))


def up(h,p,service,version):
    h.run(['docker','compose','--project-directory',p[service]['workdir'],'--project-name',h.PROJECT,'--env-file','/dev/null',
           '-f',str(h.DIRECTORY/(service+'-'+version+'.compose.private.json')),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate',service],timeout=150)


def expected_runtime(p,service,candidate):
    c=copy.deepcopy(p[service]['container'])
    if candidate and service=='core':
        env={x.split('=',1)[0]:x.split('=',1)[1] for x in c['Config']['Env']};env[FLAG]='disabled'
        c['Config']['Env']=[k+'='+v for k,v in env.items()]
    if candidate and service=='gateway':
        old,new=p['oldWebRoot'],p['newWebRoot']
        for m in c['Mounts']:
            if m['Destination']=='/srv/web':m['Source']=new
        c['HostConfig']['Binds']=[new+x[len(old):] if x.startswith(old+':') else x for x in c['HostConfig'].get('Binds') or []]
        for m in c['HostConfig'].get('Mounts') or []:
            if m.get('Target')=='/srv/web':m['Source']=new
    return c


def intact(h,p):
    for service in ['core','gateway']:
        require(digest(h.private_file(Path(p[service]['configPath'])))==p[service]['sourceHash'],'Configuração original mudou; exige revisão.')
    for name,sha in p['anchorFiles'].items():
        require('/' not in name and digest(h.private_file(h.DIRECTORY/name))==sha,'Âncora alterada; exige revisão.')
    for path,sha in p['bindHashes'].items():require(h.bound_hash(Path(path))==sha,'Integração alterada; exige revisão.')
    require(web.tree(Path(p['oldWebRoot']))==p['webHashes']['before'],'Web original alterada; exige revisão.')
    require(web.tree(Path(p['newWebRoot']))==p['webHashes']['after'],'Web candidata alterada; exige revisão.')
    for c in p['otherContainers']:
        require(h.identity(c)==h.identity(h.inspect(c['Name'])),'Outro serviço mudou; exige revisão.')


def healthy(h,name,image):
    for n in range(100):
        c=h.inspect(name);require(c['Image']==image,'Outra versão instalada; interrompendo.')
        if c['State']['Running'] and c['State'].get('Health',{}).get('Status')=='healthy':return c
        if n and n%20==0:print('Aguardando saúde de '+name+'...',flush=True)
        time.sleep(1)
    raise RuntimeError('Serviço não ficou saudável; iniciando retorno.')


def verify(h,p,candidate):
    intact(h,p)
    for service in ['core','gateway']:
        before=p[service]['container'];img=p['candidateId'] if candidate and service=='core' else before['Image']
        h.runtime_matches(expected_runtime(p,service,candidate),healthy(h,before['Name'],img),img)
    h.assert_code(h.NAMES[0],p['candidateHashes'] if candidate else p['originalHashes'])
    probe=h.PROBE
    if candidate:
        probe += "\nfor(const [path,status] of [['/v1/driver/me/login-credentials',401],['/v1/auth/driver/password/login',405]]){const r=await fetch(base+path,{signal:AbortSignal.timeout(5000)});await r.body?.cancel();if(r.status!==status)throw Error('Driver login probe failed');}"
    h.run(['docker','exec',h.NAMES[0],'node','--input-type=module','-e',probe],timeout=35)
    root=Path(p['newWebRoot'] if candidate else p['oldWebRoot'])
    checks=[]
    for role,prefix in [('driver','motorista'),('passenger','passageiro')]:
        for file in ['index.html','main.dart.js','flutter_bootstrap.js','ramo_push_config.js']:
            require((root/role/file).is_file(),'Bundle Web incompleto.')
            checks.append([prefix+'/'+('' if file=='index.html' else file),digest((root/role/file).read_bytes())])
    js="import {createHash} from 'node:crypto';const checks="+json.dumps(checks)+";for(const [path,hash] of checks){const r=await fetch('https://app.ramonessa.com.br/'+path+'?login-release='+Date.now(),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok||createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')!==hash)throw Error('Served Web mismatch');}"
    h.run(['docker','exec',h.NAMES[0],'node','--input-type=module','-e',js],timeout=140)


def rollback(h,p):
    intact(h,p)
    # Refuse unrelated later releases, including mount changes on the same gateway image.
    changed={}
    for service in ['gateway','core']:
        before=p[service]['container']
        existing=h.run(['docker','ps','-aq','--filter','name=^/'+before['Name'].lstrip('/')+'$']).strip()
        if not existing:
            changed[service]=True
            continue
        c=h.inspect(before['Name'])
        if service=='core':
            require(c['Image'] in [before['Image'],p['candidateId']],'Outra atualização da API; retorno recusado.')
            candidate=c['Image']==p['candidateId']
        else:
            require(c['Image']==before['Image'],'Outra imagem do gateway; retorno recusado.')
            roots=[m['Source'] for m in c['Mounts'] if m['Destination']=='/srv/web']
            require(len(roots)==1 and roots[0] in [p['oldWebRoot'],p['newWebRoot']],'Outra publicação Web; retorno recusado.')
            candidate=roots[0]==p['newWebRoot']
        comparable=copy.deepcopy(c);comparable['State']['Running']=True
        h.runtime_matches(expected_runtime(p,service,candidate),comparable,c['Image'],healthy=False)
        changed[service]=candidate
    for service in ['gateway','core']:
        if changed[service]:up(h,p,service,'before')
    verify(h,p,False)


def load_package():
    release=json.loads((PACKAGE/'release.json').read_text())
    require(release['schema']==1 and release['baseImage']==BASE,'Pacote de outra versão.')
    for name,sha in release['files'].items():
        p=PACKAGE/name
        require(not p.is_symlink() and p.is_file() and '..' not in Path(name).parts and not Path(name).is_absolute() and digest(p.read_bytes())==sha,'Pacote inválido/divergente.')
    core=json.loads((PACKAGE/'core/manifest.json').read_text());bundle=json.loads((PACKAGE/'web-manifest.json').read_text())
    require(core['source']==bundle['source']==release['source'],'Fontes dos pacotes divergem.')
    for name,sha in core['files'].items():require(digest((PACKAGE/'core'/name).read_bytes())==sha,'Core divergente do manifesto.')
    return release,bundle


def activate(h):
    release,bundle=load_package()
    core,gateway=snapshot(h,h.NAMES[0],'core'),snapshot(h,h.NAMES[1],'gateway')
    others=[h.inspect(n) for n in h.NAMES[2:]]
    original=h.inspect(core['container']['Image'],True);base=h.inspect(BASE,True)
    require(original['Config']==base['Config'] and original['RootFS']['Layers'][:len(base['RootFS']['Layers'])]==base['RootFS']['Layers'],'API fora da linhagem revisada; nenhuma alteração.')
    h.assert_code(h.NAMES[0],BASE_CODE)
    env=h.environment(core['container']['Config']['Env'])
    require(env.get('OTP_PROVIDER')=='entrar-whatsapp' and env.get('ALLOW_DEV_OTP','false')=='false','Provedor OTP divergente.')
    for m in core['container']['Mounts']:require(not (m['Destination']=='/app' or m['Destination'].startswith('/app/dist')),'Código sobreposto por volume; exige revisão.')
    h.inactive()
    require(shutil.disk_usage(ROOT).free>=2*1024**3,'Menos de 2 GB livres; operação não iniciada.')
    available=next((int(x.split()[1])*1024 for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')),0)
    require(available>=768*1024**2,'Menos de 768 MB disponíveis; operação não iniciada.')
    directory=Path(tempfile.mkdtemp(prefix='driver-password-',dir=ROOT));h.DIRECTORY=directory
    print('Preparando e testando em: '+str(directory),flush=True)
    payload=directory/'payload';shutil.copytree(PACKAGE,payload)
    for p in [payload,*payload.rglob('*')]:p.chmod(0o755 if p.is_dir() else 0o644)
    # Read the installed modules, then patch wiring without replacing unrelated runtime changes.
    originals={}
    def installed(path):
        raw=h.run(['docker','exec',h.NAMES[0],'cat',APP+path]);originals[APP+path]=digest(raw);return raw.decode()
    server=patch.server(installed('server.js'))
    repos=patch.repositories(installed('db/repositories.js'))
    passenger=installed('auth/passenger-password-auth-service.js');otp=installed('auth/phone-otp-service.js')
    require(passenger==(payload/'core/before-passenger-password-auth-service.js').read_text(),'Segurança do passageiro mudou; alteração recusada.')
    oldotp=(payload/'core/before-phone-otp-service.js').read_text()
    require(otp in [oldotp,patch.previous_otp(oldotp),(payload/'core/phone-otp-service.js').read_text()],'Módulo OTP desconhecido; alteração recusada.')
    (payload/'core/server.js').write_text(server);(payload/'core/repositories.js').write_text(repos)
    for f in ['server.js','repositories.js']:(payload/'core'/f).chmod(0o644)
    names=['driver-password-auth-service','driver-password-auth-store','driver-password-auth-routes','passenger-password-auth-service','phone-otp-service']
    targets={name+'.js':APP+'auth/'+name+'.js' for name in names}
    targets.update({'server.js':APP+'server.js','repositories.js':APP+'db/repositories.js','101_driver_password_login.sql':'/app/migrations/101_driver_password_login.sql'})
    tag='ramo-nessa-driver-password-base:'+directory.name.removeprefix('driver-password-')
    h.run(['docker','image','tag',original['Id'],tag])
    (payload/'Dockerfile').write_text('FROM '+tag+'\n'+''.join('COPY core/'+name+' '+dest+'\n' for name,dest in targets.items()))
    candidate_tag=tag.replace('-base:',':')
    h.run(['docker','build','--pull=false','--network=none','-t',candidate_tag,str(payload)],timeout=180)
    candidate=h.inspect(candidate_tag,True)
    require(candidate['Config']==original['Config'] and candidate['RootFS']['Layers'][:len(original['RootFS']['Layers'])]==original['RootFS']['Layers'],'Configuração da imagem candidata divergiu.')
    candidate_hashes={**BASE_CODE,**{dest:digest((payload/'core'/name).read_bytes()) for name,dest in targets.items()}}
    for name in ['server.js','db/repositories.js',*[f'auth/{n}.js' for n in names]]:
        h.run(['docker','run','--rm','--pull=never','--network=none','--read-only','--entrypoint','node',candidate['Id'],'--check',APP+name])
    print('Testando a imagem exata com PostgreSQL descartável e WhatsApp simulado...',flush=True)
    test_result=test_candidate(h,candidate['Id'],h.inspect(h.NAMES[2])['Image'],payload)
    mounts=[m for m in gateway['container']['Mounts'] if m['Destination']=='/srv/web']
    require(len(mounts)==1 and mounts[0]['Type']=='bind' and mounts[0]['RW'] is False,'Mount Web exige revisão.')
    oldroot=Path(mounts[0]['Source']);newroot=Path('/opt/ramo-nessa-web/releases')/directory.name/'bundles'
    require(newroot.parent.parent.is_dir() and not newroot.parent.exists(),'Diretório Web exige revisão.')
    newroot.parent.mkdir(mode=0o755);newroot.parent.chmod(0o755)
    hashes=web.prepare(oldroot,payload/'driver',newroot,bundle)
    for service,info in [('core',core),('gateway',gateway)]:
        before=copy.deepcopy(info['model']);after=copy.deepcopy(before)
        if service=='core':
            after['services'][service]['image']=candidate['Id'];after['services'][service].setdefault('environment',{})[FLAG]='disabled'
        else:
            mount=[m for m in after['services'][service].get('volumes',[]) if m.get('target')=='/srv/web']
            require(len(mount)==1 and mount[0]['type']=='bind' and mount[0].get('read_only') is True,'Plano Web divergente.')
            mount[0]['source']=str(newroot)
        h.save(service+'-before.compose.private.json',before);h.save(service+'-after.compose.private.json',after)
        rb=resolve(h,directory/(service+'-before.compose.private.json'),info['workdir'])
        expected=copy.deepcopy(info['resolved']);expected['services'][service]['image']=info['container']['Image']
        require(rb==expected,'Plano anterior diverge do serviço ativo.')
        if service=='core':expected['services'][service]['image']=candidate['Id'];expected['services'][service].setdefault('environment',{})[FLAG]='disabled'
        else:
            [m for m in expected['services'][service]['volumes'] if m['target']=='/srv/web'][0]['source']=str(newroot)
        require(resolve(h,directory/(service+'-after.compose.private.json'),info['workdir'])==expected,'Plano altera opções fora do escopo.')
    for name in ['activate.py','otp_controls.py','patch_runtime.py','isolated.py','web_release.py']:h.save(name,(PACKAGE/name).read_bytes())
    bindings={}
    for info in [core,gateway]:
        for m in info['container']['Mounts']:
            if m['Type']=='bind' and m['Destination']!='/srv/web':bindings[m['Source']]=h.bound_hash(Path(m['Source']))
    files=['core-before.compose.private.json','core-after.compose.private.json','gateway-before.compose.private.json','gateway-after.compose.private.json','activate.py','otp_controls.py','patch_runtime.py','isolated.py','web_release.py']
    p={'source':release['source'],'core':core,'gateway':gateway,'originalHashes':{**BASE_CODE,**originals},'candidateHashes':candidate_hashes,
       'candidateId':candidate['Id'],'oldWebRoot':str(oldroot),'newWebRoot':str(newroot),'webHashes':hashes,'bindHashes':bindings,
       'otherContainers':others,'anchorFiles':{f:digest(h.private_file(directory/f)) for f in files},'isolatedTests':test_result}
    h.save('plan.private.json',p)
    intact(h,p)
    for info in [core,gateway]:require(h.identity(h.inspect(info['container']['Name']))==h.identity(info['container']),'Serviço mudou durante o preparo; nada ativado.')
    h.inactive();h.journal('prepared')
    print('RETORNO: sudo python3 '+str(directory/'activate.py')+' rollback '+str(directory),flush=True)
    # Apply only the additive migration using the existing environment/connection.
    # The migration and script are passed through stdin; no host/container credential file.
    migration=(payload/'core/101_driver_password_login.sql').read_text()
    code=(payload/'migrate-one.mjs').read_text().replace("await readFile('/release/core/'+filename,'utf8')",json.dumps(migration))
    h.run(['docker','exec','-i',h.NAMES[0],'node','--input-type=module','-'],input=code.encode(),timeout=45)
    h.inactive();intact(h,p);h.journal('switching')
    print('Aplicando API e login Web. Pode haver breve interrupção...',flush=True)
    def install():
        up(h,p,'core','after');healthy(h,h.NAMES[0],candidate['Id']);up(h,p,'gateway','after')
    try:h.switch_release(install,lambda:verify(h,p,True),lambda:rollback(h,p),lambda:verify(h,p,False))
    except BaseException:
        try:verify(h,p,False);h.journal('rolled-back')
        except BaseException:h.journal('requires-review')
        raise
    h.journal('completed')
    print('REATIVAR CONTROLES EXTRAS WHATSAPP: sudo python3 '+str(directory/'otp_controls.py')+' enabled '+str(directory),flush=True)
    print(json.dumps({'status':'DRIVER_PASSWORD_LOGIN_ACTIVATED','source':p['source'],'anchor':str(directory),
                     'driverWebUpdated':True,'passengerWebUnchanged':True,'passwordSecurity':'same-as-passenger',
                     'extraWhatsAppControls':'disabled','normalPasswordLoginSendsOTP':False,'isolatedTests':test_result,
                     'databaseRestorePerformed':False,'physicalDeviceValidationPerformed':False},indent=2),flush=True)


def main():
    require(os.geteuid()==0,'Execute com sudo python3.')
    os.umask(0o077);h=helper()
    with (ROOT/'screen-lock-activation.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if len(sys.argv)==3 and sys.argv[1]=='rollback':
            d=Path(sys.argv[2]);require(d.parent==ROOT and d.name.startswith('driver-password-') and d.is_dir() and not d.is_symlink() and d.stat().st_uid==0 and d.stat().st_mode&0o077==0,'Âncora inválida.')
            h.DIRECTORY=d;p=json.loads(h.private_file(d/'plan.private.json'));h.inactive();rollback(h,p);h.journal('rolled-back')
            print('VERSÃO ANTERIOR RESTAURADA. Credenciais/tabelas aditivas preservadas.')
        elif len(sys.argv)==1:activate(h)
        else:raise RuntimeError('Uso: activate.py | activate.py rollback DIRETORIO')

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('Operação não concluída: '+(str(error) if isinstance(error,RuntimeError) else 'falha operacional; consulte os registros privados da âncora.')+' Não repita automaticamente.',file=sys.stderr)
        sys.exit(1)
