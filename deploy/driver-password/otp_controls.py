#!/usr/bin/env python3
"""Toggle only extra WhatsApp controls after the driver-password release."""
import copy
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile
import activate as a


def with_flag(container,value):
    result=copy.deepcopy(container)
    env={x.split('=',1)[0]:x.split('=',1)[1] for x in result['Config']['Env']}
    env[a.FLAG]=value
    result['Config']['Env']=[k+'='+v for k,v in env.items()]
    return result


def main():
    a.require(os.geteuid()==0 and len(sys.argv)==3 and sys.argv[1] in ['enabled','disabled'],'Uso: sudo python3 otp_controls.py enabled|disabled ANCORA_DO_LOGIN')
    os.umask(0o077);flag=sys.argv[1];root=Path(sys.argv[2]);h=a.helper()
    a.require(root.parent==a.ROOT and root.name.startswith('driver-password-') and not root.is_symlink() and root.stat().st_uid==0 and root.stat().st_mode&0o077==0,'Âncora inválida.')
    with (a.ROOT/'screen-lock-activation.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        h.DIRECTORY=root;p=json.loads(h.private_file(root/'plan.private.json'));a.intact(h,p)
        current=h.inspect(h.NAMES[0]);env=h.environment(current['Config']['Env'])
        a.require(current['Image']==p['candidateId'] and env.get(a.FLAG) in ['enabled','disabled'],'Outra atualização da API; alteração recusada.')
        reference=with_flag(a.expected_runtime(p,'core',True),env[a.FLAG])
        h.runtime_matches(reference,current,p['candidateId'])
        h.runtime_matches(a.expected_runtime(p,'gateway',True),h.inspect(h.NAMES[1]),p['gateway']['container']['Image'])
        h.assert_code(h.NAMES[0],p['candidateHashes'])
        if env[a.FLAG]==flag:
            print('CONTROLES WHATSAPP JÁ ESTÃO '+flag.upper()+'. Login e senha preservados.');return
        info=a.snapshot(h,h.NAMES[0],'core');h.inactive()
        directory=Path(tempfile.mkdtemp(prefix='driver-otp-controls-',dir=a.ROOT));h.DIRECTORY=directory
        before=info['model'];after=copy.deepcopy(before);after['services']['core'].setdefault('environment',{})[a.FLAG]=flag
        h.save('before.compose.private.json',before);h.save('after.compose.private.json',after)
        expected=a.resolve(h,directory/'before.compose.private.json',info['workdir']);expected['services']['core'].setdefault('environment',{})[a.FLAG]=flag
        a.require(a.resolve(h,directory/'after.compose.private.json',info['workdir'])==expected,'Plano alterou mais que os controles WhatsApp.')
        h.save('plan.private.json',{'before':current,'sourcePath':info['configPath'],'sourceHash':info['sourceHash'],'flag':flag,'driverLoginAnchor':str(root)})
        def up(version):
            h.run(['docker','compose','--project-directory',info['workdir'],'--project-name',h.PROJECT,'--env-file','/dev/null','-f',str(directory/(version+'.compose.private.json')),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','core'],timeout=150)
        def intact():
            a.require(a.digest(h.private_file(Path(info['configPath'])))==info['sourceHash'],'Configuração original mudou.')
            active=h.DIRECTORY
            try:
                h.DIRECTORY=root;a.intact(h,p)
            finally:h.DIRECTORY=active
            for c in [p['gateway']['container'],*p['otherContainers']]:
                if c['Name']==p['gateway']['container']['Name']:
                    h.runtime_matches(a.expected_runtime(p,'gateway',True),h.inspect(c['Name']),c['Image'])
                else:a.require(h.identity(c)==h.identity(h.inspect(c['Name'])),'Outro serviço mudou.')
        def verify(candidate):
            intact();live=a.healthy(h,h.NAMES[0],p['candidateId'])
            h.runtime_matches(with_flag(current,flag) if candidate else current,live,p['candidateId']);h.assert_code(h.NAMES[0],p['candidateHashes'])
            h.run(['docker','exec',h.NAMES[0],'node','--input-type=module','-e',h.PROBE],timeout=25)
        def restore():
            intact();exists=h.run(['docker','ps','-aq','--filter','name=^/'+h.NAMES[0]+'$']).strip()
            if exists:
                c=h.inspect(h.NAMES[0]);a.require(c['Image']==p['candidateId'],'Outra imagem instalada; retorno recusado.')
                value=h.environment(c['Config']['Env']).get(a.FLAG);a.require(value in [env[a.FLAG],flag],'Outra configuração instalada.')
                comparable=copy.deepcopy(c);comparable['State']['Running']=True
                h.runtime_matches(with_flag(current,value),comparable,p['candidateId'],healthy=False)
            up('before')
        intact();h.inactive();h.journal('switching')
        h.switch_release(lambda:up('after'),lambda:verify(True),restore,lambda:verify(False));h.journal('completed')
        print(json.dumps({'status':'WHATSAPP_EXTRA_CONTROLS_'+flag.upper(),'driver':True,'passenger':True,'driverPasswordSecurityChanged':False,'OTPVerificationPreserved':True,'realWhatsAppSent':False,'anchor':str(directory)},indent=2))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print(str(e) if isinstance(e,RuntimeError) else 'Alteração não concluída; consulte a âncora privada. Não repita automaticamente.',file=sys.stderr);sys.exit(1)
