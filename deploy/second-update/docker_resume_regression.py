"""Real Docker regression for the confirmed directory/symlink COPY collision. CI fixtures only."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import types
import uuid

spec=importlib.util.spec_from_file_location('second_docker_resume',Path(__file__).with_name('prepare.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def run(args,timeout=180):
    r=subprocess.run(args,capture_output=True,timeout=timeout)
    if r.returncode:
        raise RuntimeError(r.stderr.decode(errors='replace')[-2500:])
    return r.stdout

def inspect(name,image=True):
    return json.loads(run(['docker','image','inspect',name]))[0]

with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);fixture=root/'fixture';fixture.mkdir()
    fixture.joinpath('Dockerfile').write_text('''FROM alpine:3.22
RUN addgroup -g 1000 node && adduser -D -u 1000 -G node node && mkdir -p /app/node_modules/.pnpm/pkg/node_modules/@scope /app/node_modules/.pnpm/pkg/node_modules/old-target /var/lib/ramo-site && echo old > /app/node_modules/.pnpm/pkg/node_modules/old-target/old.js && ln -s ../old-target /app/node_modules/.pnpm/pkg/node_modules/@scope/sourcemap-codec && echo preserve-data > /var/lib/ramo-site/fixture-data && chown -R node:node /app /var/lib/ramo-site
WORKDIR /app
ENV KEEP_LITERAL=unchanged
USER node
CMD ["sh"]
''')
    tag='ramo-resume-fixture:'+uuid.uuid4().hex
    run(['docker','build','-t',tag,str(fixture)])
    base=inspect(tag)
    build=root/'candidate';leaf=build/'payload/node_modules/.pnpm/pkg/node_modules/@scope/sourcemap-codec';leaf.mkdir(parents=True);(leaf/'new.js').write_text('new-module')
    build.joinpath('Dockerfile.bad').write_text('FROM '+tag+'\nCOPY --chown=node:node payload/ /app/\n')
    bad=subprocess.run(['docker','build','--pull=false','--network=none','-f',str(build/'Dockerfile.bad'),str(build)],capture_output=True,timeout=120)
    assert bad.returncode != 0 and b'cannot copy to non-directory' in bad.stderr+bad.stdout, 'Fixture failed to reproduce the real collision'
    helper=types.SimpleNamespace(inspect=inspect,run=run)
    candidate=m.derive_image(helper,base['Id'],'ci-'+uuid.uuid4().hex+'-site',build,[('payload/','/app/')])
    result=run(['docker','run','--rm','--network=none','--read-only','--entrypoint','sh',candidate,'-ec','test "$(id -u)" = 1000; test "$(cat /app/node_modules/.pnpm/pkg/node_modules/@scope/sourcemap-codec/new.js)" = new-module; test "$(cat /var/lib/ramo-site/fixture-data)" = preserve-data; test ! -e /app/node_modules/.pnpm/pkg/node_modules/old-target; printf passed'])
    assert result==b'passed'
    original=run(['docker','run','--rm','--network=none','--read-only','--entrypoint','sh',base['Id'],'-ec','test -L /app/node_modules/.pnpm/pkg/node_modules/@scope/sourcemap-codec; test "$(cat /app/node_modules/.pnpm/pkg/node_modules/old-target/old.js)" = old; printf unchanged'])
    assert original==b'unchanged'
    assert inspect(base['Id'])['Config']==base['Config']
    print(json.dumps({'realDockerCollisionReproduced':True,'cleanDerivedImagePassed':True,'originalImageUnchanged':True,'runtimeUserPreserved':True,'dataDirectoryPreserved':True}))
