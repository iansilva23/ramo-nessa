#!/usr/bin/env python3
"""CI-only: build a source baseline, overlay package and exercise the exact image."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import patch_runtime as patch
from isolated import test_candidate

ROOT=Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('helper',ROOT/'deploy/android-lock/activate-lock-candidate.py')
h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
with tempfile.TemporaryDirectory(prefix='driver-login-ci-') as temp:
    root=Path(temp);h.DIRECTORY=root
    private_run=h.run
    def ci_run(*args,**kwargs):
        try:return private_run(*args,**kwargs)
        except RuntimeError:
            # CI rehearsal contains synthetic data only. Production keeps logs private.
            log=root/'command.private.log'
            if log.exists():print(log.read_text(errors='replace')[-20000:],flush=True)
            raise
    h.run=ci_run
    package=Path(sys.argv[1]).resolve();nonce=root.name
    context=root/'baseline';context.mkdir()
    archive=subprocess.Popen(['git','archive','5fa387e563074522a68adf3b3df9e7e18a4d0be6','backend/core'],cwd=ROOT,stdout=subprocess.PIPE)
    subprocess.run(['tar','-x','-C',str(context)],stdin=archive.stdout,check=True);archive.stdout.close();assert archive.wait()==0
    base='ramo-driver-password-ci-base:'+nonce;candidate='ramo-driver-password-ci:'+nonce
    print('Building baseline and actual overlaid runtime...',flush=True)
    h.run(['docker','build','-t',base,str(context/'backend/core')],timeout=600)
    payload=root/'payload';shutil.copytree(package,payload)
    for name,fn in [('server',patch.server),('db/repositories',patch.repositories)]:
        js=h.run(['docker','run','--rm','--entrypoint','cat',base,'/app/dist/src/'+name+'.js']).decode()
        (payload/'core'/(name.split('/')[-1]+'.js')).write_text(fn(js))
    names=['driver-password-auth-service','driver-password-auth-store','driver-password-auth-routes','passenger-password-auth-service','phone-otp-service']
    targets={n+'.js':'/app/dist/src/auth/'+n+'.js' for n in names}
    targets.update({'server.js':'/app/dist/src/server.js','repositories.js':'/app/dist/src/db/repositories.js'})
    (payload/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY core/'+name+' '+dest+'\n' for name,dest in targets.items()))
    for p in [payload,*payload.rglob('*')]:p.chmod(0o755 if p.is_dir() else 0o644)
    h.run(['docker','build','--network=none','--pull=false','-t',candidate,str(payload)],timeout=120)
    subprocess.run(['docker','pull','postgres:16'],check=True)
    result=test_candidate(h,candidate,'postgres:16',payload)
    print(json.dumps(result),flush=True)
