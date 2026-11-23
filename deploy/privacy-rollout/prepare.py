"""Prepare the tested privacy overlay and Web bundles; never migrate or restart services."""
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT=Path('/opt/ramo-nessa-security')
RELEASES=Path('/opt/ramo-nessa-web/releases')
SOURCE='2925c1a15a208e4404e662eab92aef13960c1f78'
NAME='privacy-final-'+SOURCE[:12]
CURRENT=ROOT/'apps-pending-9eb6aa071db4'
CURRENT_PLAN='8c2ad065da4439f823f46aceae5f73eef7e2d43a31bbc8a15f6aa3c3dd1f8763'
CURRENT_CORE='sha256:e4427c167ac583e68f144fbc7bee9b06faa99e677fd1b8ed88e346ab1fad7f7b'
CURRENT_WEB=Path('/opt/ramo-nessa-web/releases/apps-pending-9eb6aa071db4/bundles')
GATEWAY='sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
PACKAGES={'core':'37e8bffe0752f2773eca812e70c218c1dc086dad399414a523fd4f4511aa4e7b','driver':'684fd27734aa6e73a989c1e1d89fa0339bfe757568da5a4836d37cb2d5dae0fa','passenger':'976f2ed1644d1c4900f01dcda1c0dda914ba869f7699e86574ea27c3ea24b16c'}
STAGE='initialization'


def require(ok,message):
    if not ok:raise RuntimeError(message)


def sha(raw):return hashlib.sha256(raw).hexdigest()


def stage(name):
    global STAGE
    STAGE=name;print('Verificação: '+name,flush=True)


def load(path,expected,name):
    require(path.is_file() and not path.is_symlink() and sha(path.read_bytes())==expected,'Ferramenta de segurança divergente.')
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def download(path,url,expected):
    with path.open('xb')as out:
        r=subprocess.run(['curl','-fLsS','--retry','2','--max-time','180','--max-filesize',str(600*1024**2),url],stdout=out,stderr=subprocess.PIPE)
    require(r.returncode==0 and sha(path.read_bytes())==expected,'Pacote não passou na integridade.')


def payload(path,role,p):
    require(path.is_file() and not path.is_symlink() and sha(path.read_bytes())==PACKAGES[role],'Checksum do pacote divergente.')
    with zipfile.ZipFile(path)as z:
        items=z.infolist();names=z.namelist()
        require(len(items)<30000 and len(names)==len(set(names)) and sum(i.file_size for i in items)<600*1024**2 and all(not i.is_dir()and not stat.S_ISLNK(i.external_attr>>16)for i in items),'ZIP excessivo ou com links.')
        meta=json.loads(z.read('manifest.json'))
        require(meta['source']==SOURCE and meta['productSource']==SOURCE and meta['component']==role,'Origem do pacote divergente.')
        require(set(names)=={'manifest.json',*(role+'/'+n for n in meta['files'])},'Manifesto incompleto.')
        content={}
        for name,digest in meta['files'].items():
            p.relative(name);raw=z.read(role+'/'+name);require(sha(raw)==digest,'Conteúdo do pacote divergente.');content[name]=raw
        return meta,content


def candidate_model(snapshot,role,image,web):
    model=copy.deepcopy(snapshot['model']);settings=model['services'][role]
    if role=='core':
        settings['image']=image
        settings.setdefault('environment',{})['SELF_ACCOUNT_DELETION_ENABLED']='true'
    else:
        web_mount,=[v for v in settings['volumes']if v['target']=='/srv/web' and v['type']=='bind'and v.get('read_only')]
        require(web_mount['source']==str(CURRENT_WEB),'Web ativa mudou.')
        web_mount['source']=str(web)
    return model


def prepare(package,p,previous,h):
    stage('verify-previous-completed-activation')
    old=previous.read_plan(h)
    require(previous.PLAN_SHA==CURRENT_PLAN and previous.state(h)['phase']=='completed','Publicação anterior não concluída.')
    previous.files_intact(h,old);runtime=previous.runtime_intact(h,old,True)
    record=previous.state(h)
    require({k:v['Id']for k,v in runtime.items()}==record['afterIds'],'Serviços mudaram desde a ativação confirmada.')
    require(runtime['core']['Image']==CURRENT_CORE and runtime['gateway']['Image']==GATEWAY,'Imagens ativas divergentes.')
    others={k:v for k,v in old['runtimeBefore'].items()if k not in ('core','gateway')}
    runtime={**runtime,**others}
    snapshots={k:p.snapshot(h,runtime[k],k,h.PROJECT)for k in ('core','gateway')}
    contents={k:payload(package/('RamoNessa-Privacidade-'+k+'.zip'),k,p)for k in PACKAGES}
    meta,core=contents['core']
    baseline=meta['baseline']
    require(set(baseline)=={'dist/src/server.js',*[f'dist/src/account-deletion/{n}.js'for n in ['self-account-deletion','account-deletion-routes','account-deletion-page']]},'Overlay fora do escopo.')
    require(set(core)==set(baseline)|{'dist/src/privacy/legal-document-page.js','migrations/106_account_deletion_requests.sql'},'Overlay incompleto.')
    stage('verify-live-core-and-read-only-schema')
    p.verify_image_files(h,CURRENT_CORE,baseline,'/app/')
    p.schema_state(h,runtime['core'],'58ef8dcb2ebd69ca465cc9bae611c6273b30ca923d43e385759ad099e2c41aeb')
    anchor=ROOT/NAME;web=RELEASES/NAME/'bundles'
    require(not anchor.exists()and not web.parent.exists(),'Preparo já existe; não repetir automaticamente.')
    require(shutil.disk_usage(ROOT).free>=2*1024**3,'Espaço insuficiente.')
    anchor.mkdir(mode=0o700);h.DIRECTORY=anchor
    p.save(anchor/'phase.private.json',{'stage':'building','changesApplied':False})
    stage('build-verified-core-overlay-without-network')
    build=anchor/'build-core';build.mkdir()
    p.extract(core,build/'payload')
    image=p.derive_image(h,CURRENT_CORE,NAME+'-core',build,[('payload/','/app/')])
    p.verify_image_base(h,image,CURRENT_CORE);p.verify_image_files(h,image,meta['files'],'/app/')
    h.run(['docker','run','--rm','--pull=never','--network=none','--read-only','--entrypoint','sh',image,'-ec','for f do node --check "$f"; done','privacy-check',*['/app/'+n for n in core if n.endswith('.js')]],timeout=60)
    stage('stage-verified-web-and-return-copy')
    web.parent.mkdir(mode=0o755);web.parent.chmod(0o755)
    p.BASE_WEB=CURRENT_WEB
    before,after=p.prepare_web({k:contents[k]for k in ('driver','passenger')},anchor,web)
    require((web/'driver/ramo_offer_tone.js').read_bytes()==(CURRENT_WEB/'driver/ramo_offer_tone.js').read_bytes(),'Ponte do áudio mudou fora do plano.')
    stage('prepare-only-core-gateway-configurations')
    files={}
    for role,info in snapshots.items():
        for phase in ('before','after'):
            model=copy.deepcopy(info['model'])if phase=='before'else candidate_model(info,role,image,web)
            name=role+'-'+phase+'.private.json';files[name]=p.save(anchor/name,model)
            require(p.compose(h,info['project'],info['workdir'],anchor/name)==model,'Configuração mudou após releitura.')
    migration='106_account_deletion_requests.sql'
    files[migration]=p.save(anchor/migration,core['migrations/'+migration])
    plan={'schema':1,'source':SOURCE,'previousPlanSha256':CURRENT_PLAN,'snapshots':snapshots,'runtimeBefore':runtime,'images':{'core':image,'gateway':GATEWAY},'oldWeb':str(CURRENT_WEB),'newWeb':str(web),'beforeWebFiles':before,'candidateWebFiles':after,'files':files,'candidateSelfAccountDeletionEnabled':True,'siteTouched':False,'legalDocumentsPublished':False,'activationImplemented':False}
    previous.runtime_intact(h,old,True)
    require({k:v['Id']for k,v in previous.runtime_intact(h,old,True).items()}==record['afterIds'],'Serviço mudou durante o preparo.')
    digest=p.save(anchor/'plan.private.json',plan)
    result={'status':'PRIVACY_FINAL_PREPARED','source':SOURCE,'anchor':str(anchor),'planSha256':digest,'coreCandidate':image,'candidateSelfAccountDeletionEnabled':True,'changesApplied':False,'servicesRestarted':False,'databaseMigrationPerformed':False,'accountDeleted':False,'siteTouched':False,'legalDocumentsPublished':False}
    p.save(anchor/'prepared.private.json',result)
    return result


def main():
    require(os.geteuid()==0 and sys.argv[1:]==['prepare'],'Uso: sudo python3 prepare.py prepare')
    os.umask(0o077)
    previous=load(CURRENT/'activate-apps.py','f76255e16c72422e953b9616cdd89f19995e6627c83fbf6df52ae0344e9aaf0b','previous_privacy_activation')
    h=previous.load_guard()
    with (ROOT/'screen-lock-activation.lock').open('r+')as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix='ramo-privacy-package-')as temp:
            temp=Path(temp)
            download(temp/'guard.py','https://raw.githubusercontent.com/iansilva23/ramo-nessa/d00df3f5d49d030944b319bef3508e113821ef08/deploy/apps-pending-no-site/prepare-guard.py','aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393')
            p=load(temp/'guard.py','aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393','privacy_prepare_guard')
            for role,digest in PACKAGES.items():
                name='RamoNessa-Privacidade-'+role+'.zip'
                download(temp/name,'https://github.com/iansilva23/ramo-nessa/releases/download/privacy-final-'+SOURCE[:12]+'/'+name,digest)
            print(json.dumps(prepare(temp,p,previous,h),indent=2),flush=True)

if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps({'status':'PRIVACY_FINAL_PREPARATION_STOPPED','stage':STAGE,'changesApplied':False,'servicesRestarted':False,'databaseMigrationPerformed':False}),flush=True)
        sys.exit('Preparo interrompido; preserve o estágio e não repita automaticamente.')
