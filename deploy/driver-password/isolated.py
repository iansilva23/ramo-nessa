"""Run the exact candidate against disposable PostgreSQL without a public network."""
import json
import secrets
import time
from pathlib import Path


def test_candidate(h, candidate, postgres_image, payload):
    nonce = secrets.token_hex(8)
    network, db = 'ramo-driver-login-' + nonce, 'ramo-driver-login-' + nonce + '-pg'
    runner = network + '-runner'
    label = 'br.com.ramonessa.driver-login-test=' + nonce
    created_network = created_db = False
    result = None
    try:
        h.run(['docker','network','create','--internal','--label',label,network])
        created_network = True
        # No host ports, production volumes, credentials or production network.
        h.run(['docker','run','-d','--pull=never','--name',db,'--label',label,
               '--network',network,'--network-alias','test-pg','--memory=256m','--cpus=0.5','--pids-limit=128',
               '--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=256m',
               '-e','POSTGRES_USER=driver_test','-e','POSTGRES_PASSWORD=synthetic-test-only',
               '-e','POSTGRES_DB=driver_test',postgres_image], timeout=60)
        created_db = True
        for _ in range(60):
            try:
                ready = h.run(['docker','exec',db,'pg_isready','-U','driver_test','-d','driver_test'])
                # Ignore the temporary initdb server; PID 1 must be final postgres.
                if b'accepting connections' in ready and h.run(['docker','exec',db,'cat','/proc/1/comm']).strip() == b'postgres':
                    break
            except RuntimeError:
                pass
            time.sleep(1)
        else: raise RuntimeError('Banco descartável não ficou pronto.')
        command = ['docker','run','--rm','--pull=never','--network',network,'--label',label,
                   '--name',runner,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
                   '--memory=512m','--cpus=0.75','--pids-limit=128','--tmpfs','/tmp:rw,nosuid,size=64m,mode=1777',
                   '--mount','type=bind,src='+str(payload)+',dst=/release,readonly',
                   '-e','NODE_ENV=test','-e','DB_SSL=false','-e','DB_POOL_MAX=3',
                   '-e','DATABASE_URL=postgresql://driver_test:synthetic-test-only@test-pg:5432/driver_test',
                   '--entrypoint','node',candidate]
        h.run(command+['/release/test-migrations.mjs'], timeout=100)
        report=h.run(command+['--test','--test-concurrency=1','--test-reporter=tap',
                              '/release/driver_password_auth.test.mjs','/release/driver_password_postgres.test.mjs','/release/candidate-http.test.mjs'], timeout=100)
        h.save('candidate-tests.private.log', report)
        h.require(all(x in report.decode().splitlines() for x in ['# tests 14','# pass 14','# fail 0','# skipped 0']), 'Testes da candidata não passaram integralmente.')
        # Import the surgically patched repository module and check its actual pool wiring.
        h.run(command+['--input-type=module','-e',"import {createRepositories} from '/app/dist/src/db/repositories.js';const r=createRepositories();if(!r.driverPasswordAuthStore)throw Error('Store missing');await r.readinessCheck();await r.driverPasswordAuthStore.findByIdentifier('does-not-exist');await r.close();"],timeout=30)
        result={'testsPassed':14,'productionDatabaseUsed':False,'realWhatsAppSent':False}
    finally:
        existing = h.run(['docker','ps','-aq','--filter','name=^/'+runner+'$']).strip()
        if existing:
            h.require((h.inspect(runner)['Config'].get('Labels') or {}).get('br.com.ramonessa.driver-login-test')==nonce,'Executor de teste divergente.')
            h.run(['docker','rm','-fv',runner])
        if created_db:
            h.require((h.inspect(db)['Config'].get('Labels') or {}).get('br.com.ramonessa.driver-login-test')==nonce,'Recurso de teste divergente.')
            h.run(['docker','rm','-fv',db])
        if created_network:
            info=json.loads(h.run(['docker','network','inspect',network]))[0]
            h.require((info.get('Labels') or {}).get('br.com.ramonessa.driver-login-test')==nonce,'Rede de teste divergente.')
            h.run(['docker','network','rm',network])
    return {**result,'testResourcesRemoved':True}
