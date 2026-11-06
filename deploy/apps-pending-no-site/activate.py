#!/usr/bin/env python3
"""Activate the operator-confirmed app/Core plan; leave the site and deletion flag unchanged."""
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
import time
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True
ROOT = Path('/opt/ramo-nessa-security')
ANCHOR = ROOT / 'apps-pending-9eb6aa071db4'
PLAN_SHA = '8c2ad065da4439f823f46aceae5f73eef7e2d43a31bbc8a15f6aa3c3dd1f8763'
SOURCE = '9eb6aa071db458c57c6298cfd656ad2bd2ba3227'
BASELINE = 'd9cdbf24cd35d58d3026c00f005b28b0fc6f746036605654f38b120b42373aa6'
OLD_WEB = '/opt/ramo-nessa-web/releases/restore-exact-guide-68329f854044/bundles'
NEW_WEB = '/opt/ramo-nessa-web/releases/apps-pending-9eb6aa071db4/bundles'
OLD_CORE = 'sha256:f607fce3d8d840cfb375436896f028268936baa0d3d50d0c4afa1959e1476d78'
NEW_CORE = 'sha256:e4427c167ac583e68f144fbc7bee9b06faa99e677fd1b8ed88e346ab1fad7f7b'
GATEWAY = 'sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
HELPER = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
HELPER_SHA = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
CADDY_SHA = '785c04aae3fde022b62038fe360add985ab34120c095141b3808cc0efe92db87'
MIGRATION = '105_self_account_deletion.sql'
BASE_MIGRATION_SHA = '6f3eaf321e7ff641ff98908ee24455c0c3d2bb31a87ae3d2e44a6a1900c40165'
PUBLIC_BASE = 'https://app.ramonessa.com.br'
SITE_PROJECT = 'ramo-nessa-site'
STAGE = 'initialization'


class ActivationError(Exception):
    pass


def require(ok, message):
    if not ok:
        raise ActivationError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def file_sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        while part := stream.read(1024**2):
            result.update(part)
    return result.hexdigest()


def stage(name):
    global STAGE
    STAGE = name
    print('Verificação: '+name, flush=True)


def tree(root):
    require(root.is_dir() and not root.is_symlink() and root.resolve() == root, 'Árvore Web inválida.')
    result, total = {}, 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        require(all(not (Path(directory)/n).is_symlink() for n in dirs), 'Link inesperado na Web.')
        for name in files:
            path = Path(directory)/name
            info = path.lstat()
            require(stat.S_ISREG(info.st_mode), 'Arquivo Web não regular.')
            total += info.st_size
            require(total < 1200*1024**2 and len(result) < 30000, 'Web excessiva.')
            result[str(path.relative_to(root))] = {'sha256': file_sha(path), 'bytes': info.st_size}
    return result


def load_guard():
    require(HELPER.is_file() and not HELPER.is_symlink() and sha(HELPER.read_bytes()) == HELPER_SHA, 'Helper de segurança divergente.')
    spec = importlib.util.spec_from_file_location('apps_activation_guard', HELPER)
    h = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(h)
    h.DIRECTORY = ANCHOR
    return h


def read_plan(h):
    info = ANCHOR.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o077 and ANCHOR.resolve() == ANCHOR, 'Âncora privada inválida.')
    raw = h.private_file(ANCHOR/'plan.private.json')
    require(sha(raw) == PLAN_SHA, 'Plano difere do checksum confirmado por Ian.')
    p = json.loads(raw)
    require(p.get('schema') == 1 and p.get('source') == SOURCE and p.get('baselineSha256') == BASELINE and p.get('oldWeb') == OLD_WEB and p.get('newWeb') == NEW_WEB, 'Plano de outra versão.')
    require(p.get('siteTouched') is False and p.get('selfAccountDeletionEnabled') is False, 'Escopo/flag do plano divergente.')
    require(p['images'] == {'core': NEW_CORE, 'gateway': GATEWAY} and p['runtimeBefore']['core']['Image'] == OLD_CORE and p['runtimeBefore']['gateway']['Image'] == GATEWAY, 'Imagens do plano divergentes.')
    require(set(p['snapshots']) == {'core','gateway'} and {'core','gateway','postgres'} <= set(p['runtimeBefore']), 'Serviços do plano divergentes.')
    prepared = json.loads(h.private_file(ANCHOR/'prepared.private.json'))
    require(prepared == {'status':'APPS_WITHOUT_SITE_PREPARED','planSha256':PLAN_SHA}, 'Preparação concluída não confirmada.')
    return p


def files_intact(h, p, candidate=True):
    for name, digest in p['files'].items():
        require(Path(name).name == name and sha(h.private_file(ANCHOR/name)) == digest, 'Arquivo preparado mudou: '+Path(name).name)
    for info in p['snapshots'].values():
        require(sha(h.private_file(Path(info['configPath']))) == info['configSha256'], 'Configuração operacional original mudou.')
    before = p['runtimeBefore']['gateway']
    caddy, = [m for m in before['Mounts'] if m['Destination'] == '/etc/caddy/Caddyfile']
    require(h.bound_hash(Path(caddy['Source'])) == CADDY_SHA, 'Caddyfile original mudou.')
    require(tree(Path(OLD_WEB)) == p['beforeWebFiles'] and tree(ANCHOR/'before-web') == p['beforeWebFiles'], 'Web anterior ou cópia de retorno mudou.')
    if candidate:
        require(tree(Path(NEW_WEB)) == p['candidateWebFiles'], 'Web candidata mudou.')


def expected_model(p, service, phase):
    model = copy.deepcopy(p['snapshots'][service]['model'])
    if phase == 'after':
        settings = model['services'][service]
        if service == 'core':
            settings['image'] = NEW_CORE
        else:
            for target, source in [('/srv/web',NEW_WEB),('/etc/caddy/Caddyfile',str(ANCHOR/'Caddyfile.candidate'))]:
                mounts = [m for m in settings['volumes'] if m['target'] == target]
                require(len(mounts) == 1 and mounts[0].get('read_only') and mounts[0]['type'] == 'bind', 'Mount candidato inesperado.')
                mounts[0]['source'] = source
    return model


def compose_args(h, p, service, phase):
    info = p['snapshots'][service]
    return ['docker','compose','--project-directory',info['workdir'],'--project-name',h.PROJECT,'--env-file','/dev/null','-f',str(ANCHOR/(service+'-'+phase+'.private.json'))]


def verify_models(h, p):
    for service in ('core','gateway'):
        for phase in ('before','after'):
            actual = json.loads(h.run(compose_args(h,p,service,phase)+['config','--format','json']))
            require(actual == expected_model(p,service,phase), 'Compose mudaria opções além do plano: '+service)
    original = h.inspect(OLD_CORE, True)
    candidate = h.inspect(NEW_CORE, True)
    require(candidate['Id'] == NEW_CORE and candidate['Config'] == original['Config'] and candidate['RootFS']['Layers'][:len(original['RootFS']['Layers'])] == original['RootFS']['Layers'], 'Imagem candidata não preserva configuração/base.')
    require(h.inspect(GATEWAY,True)['Id'] == GATEWAY, 'Imagem original do gateway indisponível.')


def expected_runtime(p, service, candidate):
    result = copy.deepcopy(p['runtimeBefore'][service])
    if candidate and service == 'gateway':
        changes = {'/srv/web':NEW_WEB,'/etc/caddy/Caddyfile':str(ANCHOR/'Caddyfile.candidate')}
        previous = {m['Source']: changes[m['Destination']] for m in result['Mounts'] if m['Destination'] in changes}
        for m in result['Mounts']:
            if m['Destination'] in changes:
                m['Source'] = changes[m['Destination']]
        for m in result['HostConfig'].get('Mounts') or []:
            if m.get('Target') in changes:
                m['Source'] = changes[m['Target']]
        result['HostConfig']['Binds'] = [next((new+value[len(old):] for old,new in previous.items() if value.startswith(old+':')),value) for value in result['HostConfig'].get('Binds') or []]
    return result


def others_intact(h,p):
    for service,before in p['runtimeBefore'].items():
        if service in ('core','gateway'):
            continue
        require(h.identity(h.inspect(before['Name'])) == h.identity(before), 'Outro serviço mudou; não sobrescrever.')


def site_identity(h):
    ids = h.run(['docker','ps','-aq','--filter','label=com.docker.compose.project='+SITE_PROJECT]).decode().split()
    return sorted([list(h.identity(h.inspect(value))) for value in ids])


def owned(h,p,service,allow_missing=False):
    before = p['runtimeBefore'][service]
    ids = h.run(['docker','ps','-aq','--filter','name=^/'+before['Name'].lstrip('/')+'$']).strip()
    if not ids:
        require(allow_missing, 'Serviço ausente: '+service)
        return None
    current = h.inspect(before['Name'])
    labels = current['Config'].get('Labels') or {}
    config = labels.get('com.docker.compose.project.config_files')
    allowed_configs = {p['snapshots'][service]['configPath'],*(str(ANCHOR/(service+'-'+phase+'.private.json')) for phase in ('before','after'))}
    require(labels.get('com.docker.compose.project') == h.PROJECT and labels.get('com.docker.compose.service') == service and config in allowed_configs, 'Serviço passou a pertencer a outra publicação: '+service)
    candidate = config == str(ANCHOR/(service+'-after.private.json'))
    expected_image = NEW_CORE if service == 'core' and candidate else before['Image']
    require(current['Image'] == expected_image, 'Outra imagem está ativa; retorno recusado: '+service)
    # Verify mounts/security/environment even when an unsuccessful candidate is stopped.
    checked = copy.deepcopy(current)
    checked['State']['Running'] = True
    h.runtime_matches(expected_runtime(p,service,candidate),checked,expected_image,healthy=False)
    return current


def runtime_intact(h,p,candidate):
    others_intact(h,p)
    result = {}
    for service in ('core','gateway'):
        current = owned(h,p,service)
        image = NEW_CORE if service == 'core' and candidate else p['runtimeBefore'][service]['Image']
        h.runtime_matches(expected_runtime(p,service,candidate),current,image)
        result[service] = current
    record = state(h)
    if record and 'siteBefore' in record:
        require(site_identity(h) == record['siteBefore'], 'Site mudou durante a operação; conferir sem recriá-lo.')
    return result


def public_probe(h,p,candidate):
    files = p['candidateWebFiles'] if candidate else p['beforeWebFiles']
    expected = {'/'+route+'/'+name:files[role+'/'+name]['sha256'] for role,route in [('driver','motorista'),('passenger','passageiro')] for name in ('index.html','main.dart.js','ramo_push_config.js')}
    if candidate:
        expected['/motorista/ramo_offer_tone.js'] = files['driver/ramo_offer_tone.js']['sha256']
        expected['/motorista/assets/assets/audio/nova_corrida.mp3'] = files['driver/assets/assets/audio/nova_corrida.mp3']['sha256']
    script = '''
import {createHash} from 'node:crypto';
const base=BASE, expected=FILES;
async function get(path){const r=await fetch(base+path,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});if(r.status!==200)throw Error('HTTP probe failed');return r;}
await(await get('/ready')).arrayBuffer();
for(const [path,digest]of Object.entries(expected)){const r=await get(path+'?apps='+Date.now());if(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')!==digest)throw Error('Web hash mismatch');}
for(const role of ['driver','passenger']){const d=await(await get('/v1/auth/'+role+'/recovery/channels')).json();if(JSON.stringify(d.channels?.slice().sort())!=='["email","whatsapp"]')throw Error('Recovery channels missing');}
if(CANDIDATE){const d=await(await get('/v1/me/account-deletion')).json();if(d.available!==false)throw Error('Deletion must remain unavailable');const r=await get('/excluir-conta');if(!r.headers.get('content-type')?.includes('text/html')||!(await r.text()).includes('Excluir minha conta'))throw Error('External account page missing');}
'''.replace('BASE',json.dumps(PUBLIC_BASE)).replace('FILES',json.dumps(expected)).replace('CANDIDATE',json.dumps(candidate))
    h.run(['docker','exec',p['runtimeBefore']['core']['Name'],'node','--input-type=module','-e',script],timeout=175)


def db_query(h,p,body):
    script = "import{createPostgresPool}from'/app/dist/src/db/postgres.js';const pool=createPostgresPool(process.env.DATABASE_URL);const c=await pool.connect();try{"+body+"}finally{c.release();await pool.end();}"
    return json.loads(h.run(['docker','exec',p['runtimeBefore']['core']['Name'],'node','--input-type=module','-e',script],timeout=60))


def schema(h,p):
    rows = db_query(h,p,"await c.query('BEGIN READ ONLY');await c.query(\"SET LOCAL statement_timeout='5s'\");const r=await c.query(\"SELECT filename,checksum FROM schema_migrations WHERE filename IN ('104_admin_account_closure.sql','105_self_account_deletion.sql')\");await c.query('COMMIT');console.log(JSON.stringify(r.rows));")
    values = {r['filename']:r['checksum'] for r in rows}
    require(values.get('104_admin_account_closure.sql') == BASE_MIGRATION_SHA, 'Esquema104 não confirmado.')
    digest = p['files'][MIGRATION]
    require(MIGRATION not in values or values[MIGRATION] == digest, 'Migração105 existente diverge; não alterar histórico.')
    return MIGRATION in values


def backup(h,p):
    stage('database-backup')
    core_env = h.environment(p['runtimeBefore']['core']['Config'].get('Env'))
    url = urlsplit(core_env.get('DATABASE_URL',''))
    pg = p['runtimeBefore']['postgres']
    aliases = {pg['Name'].lstrip('/'),'postgres'}
    for network in pg['NetworkSettings']['Networks'].values():
        aliases.update(network.get('Aliases') or [])
        aliases.add(network.get('IPAddress',''))
    require(url.hostname in aliases, 'Banco do Core não corresponde ao PostgreSQL inventariado.')
    info = db_query(h,p,"const r=await c.query('SELECT current_database() AS name,pg_database_size(current_database())::text AS bytes');console.log(JSON.stringify(r.rows[0]));")
    require(info['name'] == unquote(url.path.lstrip('/')), 'Banco ativo diverge da conexão inventariada.')
    require(shutil.disk_usage(ANCHOR).free >= max(2*1024**3,int(info['bytes'])*2+128*1024**2), 'Espaço insuficiente para backup seguro.')
    path = ANCHOR/'database-before.dump'
    args = ['docker','exec',pg['Name'],'sh','-ec','export PGPASSWORD="${POSTGRES_PASSWORD:-}"; exec pg_dump --format=custom --no-owner --no-acl --username "${POSTGRES_USER:-postgres}" --dbname "$1"','apps-backup',info['name']]
    with path.open('xb') as out:
        r = subprocess.run(args,stdout=out,stderr=subprocess.PIPE,timeout=180,env={'PATH':os.environ.get('PATH','/usr/bin:/bin')})
        out.flush();os.fsync(out.fileno())
    if r.returncode:
        (ANCHOR/'backup-error.private.log').write_bytes(r.stderr)
    require(r.returncode == 0 and path.stat().st_size > 0, 'Cópia do banco não foi concluída; nenhuma troca iniciada.')
    with path.open('rb') as source:
        r = subprocess.run(['docker','exec','-i',pg['Name'],'pg_restore','--list'],stdin=source,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60,env={'PATH':os.environ.get('PATH','/usr/bin:/bin')})
    require(r.returncode == 0 and b'schema_migrations' in r.stdout, 'Cópia do banco não passou na leitura de verificação.')
    proof = {'sha256':file_sha(path),'bytes':path.stat().st_size,'format':'pg_dump-custom','contentsListed':True,'restored':False}
    h.save('database-backup.private.json',proof)
    return proof


def migrate(h,p):
    stage('apply-only-migration105')
    sql = h.private_file(ANCHOR/MIGRATION).decode()
    script = '''
await c.query('BEGIN');
try{await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='30s'");await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ramo-nessa-schema-migrations',0))");
const b=await c.query("SELECT checksum FROM schema_migrations WHERE filename='104_admin_account_closure.sql'");if(b.rows[0]?.checksum!==BASECHECK)throw Error('Base schema changed');
const r=await c.query('SELECT checksum FROM schema_migrations WHERE filename=$1',[NAME]);let applied=false;
if(r.rows.length){if(r.rows[0].checksum!==CHECKSUM)throw Error('Migration checksum mismatch');}
else{await c.query(SQL);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[NAME,CHECKSUM]);applied=true;}
await c.query('COMMIT');console.log(JSON.stringify({applied}));
}catch(error){await c.query('ROLLBACK');throw error;}
'''.replace('BASECHECK',json.dumps(BASE_MIGRATION_SHA)).replace('NAME',json.dumps(MIGRATION)).replace('CHECKSUM',json.dumps(p['files'][MIGRATION])).replace('SQL',json.dumps(sql))
    return db_query(h,p,script)['applied']


def state(h):
    file = ANCHOR/'activation.private.json'
    if not file.exists():
        return None
    record = json.loads(h.private_file(file))
    require(record.get('planSha256') == PLAN_SHA and record.get('source') == SOURCE, 'Registro de outra atualização.')
    require(record.get('scriptSha256') == sha(h.private_file(ANCHOR/'activate-apps.py')) == sha(Path(__file__).read_bytes()), 'Ativador difere do registrado na âncora.')
    return record


def journal(h,phase,**values):
    record = state(h) or {}
    record.update({'phase':phase,'source':SOURCE,'planSha256':PLAN_SHA,'scriptSha256':sha(Path(__file__).read_bytes()),'at':time.time(),**values})
    tmp = ANCHOR/'activation.incomplete'
    tmp.write_text(json.dumps(record,indent=2)+'\n')
    with tmp.open('rb') as stream:
        os.fsync(stream.fileno())
    os.replace(tmp,ANCHOR/'activation.private.json')


def up(h,p,service,phase):
    h.run(compose_args(h,p,service,phase)+['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90',service],timeout=125)


def rollback(h,p,automatic=False):
    record = state(h)
    require(record and record['phase'] in ('backing-up','migrating','switching-core','switching-gateway','completed','restoring','requires-review','rolled-back'), 'Nenhuma ativação desta âncora para retornar.')
    files_intact(h,p,candidate=False)
    others_intact(h,p)
    verify_models(h,p)
    current = {s:owned(h,p,s,allow_missing=True) for s in ('core','gateway')}
    if not automatic and current['core'] and current['core']['State']['Running']:
        h.inactive()
    journal(h,'restoring')
    for service in ('gateway','core'):
        c = current[service]
        if c is None or c['Config']['Labels']['com.docker.compose.project.config_files'] == str(ANCHOR/(service+'-after.private.json')) or c['State'].get('Health',{}).get('Status') != 'healthy':
            up(h,p,service,'before')
    restored = runtime_intact(h,p,False)
    public_probe(h,p,False)
    files_intact(h,p,candidate=False)
    journal(h,'rolled-back',restoredIds={s:c['Id'] for s,c in restored.items()},databaseRestored=False)


def activate(h,p):
    record = state(h)
    if record:
        require(record['phase'] == 'completed', 'Ativação já iniciada ou retornada; não repetir automaticamente.')
        files_intact(h,p)
        current = runtime_intact(h,p,True)
        require({s:c['Id'] for s,c in current.items()} == record['afterIds'], 'Serviço foi recriado depois da ativação.')
        public_probe(h,p,True)
        return {'status':'APPS_WITHOUT_SITE_ALREADY_ACTIVATED','source':SOURCE,'servicesRestarted':False,'siteTouched':False}
    stage('verify-confirmed-plan-and-runtime')
    files_intact(h,p)
    verify_models(h,p)
    current = runtime_intact(h,p,False)
    for service,before in p['runtimeBefore'].items():
        require(h.identity(h.inspect(before['Name'])) == h.identity(before), 'Serviço mudou desde o preparo: '+service)
    h.inactive()
    schema(h,p)
    public_probe(h,p,False)
    files_intact(h,p)
    h.inactive()
    saved = ANCHOR/'activate-apps.py'
    script = Path(__file__).read_bytes()
    if saved.exists():
        require(sha(h.private_file(saved)) == sha(script), 'Outro ativador foi salvo na âncora.')
    else:
        h.save('activate-apps.py',script)
    journal(h,'backing-up',siteBefore=site_identity(h),beforeIds={s:c['Id'] for s,c in current.items()})
    applied = False
    try:
        backup(h,p)
        # The backup is read-only; check activity and files again just before mutation.
        files_intact(h,p)
        others_intact(h,p)
        for service in ('core','gateway'):
            require(h.identity(owned(h,p,service)) == h.identity(current[service]), 'Serviço mudou durante o backup.')
        h.inactive()
        journal(h,'migrating')
        applied = migrate(h,p)
        journal(h,'switching-core',migrationApplied=applied)
        stage('activate-core')
        h.inactive()
        up(h,p,'core','after')
        require(schema(h,p), 'Migração105 não confirmada após a troca.')
        journal(h,'switching-gateway')
        stage('activate-gateway-web-and-route')
        up(h,p,'gateway','after')
        stage('verify-public-apps-and-disabled-deletion')
        updated = runtime_intact(h,p,True)
        public_probe(h,p,True)
        files_intact(h,p)
        journal(h,'completed',afterIds={s:c['Id'] for s,c in updated.items()},migrationApplied=applied)
    except BaseException:
        failed = STAGE
        try:
            stage('restore-original-services')
            rollback(h,p,automatic=True)
        except BaseException:
            journal(h,'requires-review',failedStage=failed)
            raise ActivationError('Ativação interrompida; retorno NÃO confirmado. Preserve a âncora e não repita.') from None
        raise ActivationError('Ativação interrompida em '+failed+'; serviços anteriores restaurados e conferidos. Banco não foi restaurado. Não repetir automaticamente.') from None
    return {'status':'APPS_WITHOUT_SITE_ACTIVATED','source':SOURCE,'anchor':str(ANCHOR),'planSha256':PLAN_SHA,'coreImage':NEW_CORE,'gatewayImage':GATEWAY,'onlyCoreAndGatewayRecreated':True,'databaseMigrationPerformed':applied,'databaseRestorePerformed':False,'databaseBackupVerified':True,'selfAccountDeletionEnabled':False,'siteTouched':False,'mobileDeviceValidationPerformed':False}


def main():
    require(os.geteuid() == 0 and sys.argv[1:] in (['verify'],['activate'],['rollback']), 'Uso: sudo python3 activate.py verify|activate|rollback')
    os.umask(0o077)
    h = load_guard()
    with (ROOT/'screen-lock-activation.lock').open('r+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        p = read_plan(h)
        if sys.argv[1] == 'activate':
            result = activate(h,p)
        elif sys.argv[1] == 'rollback':
            rollback(h,p)
            result = {'status':'APPS_WITHOUT_SITE_ROLLED_BACK','siteTouched':False,'databaseRestorePerformed':False}
        else:
            files_intact(h,p)
            verify_models(h,p)
            record = state(h)
            require(record is None or record['phase'] in ('completed','rolled-back'), 'Transição incompleta; conferir registro.')
            candidate = bool(record and record['phase']=='completed')
            runtime_intact(h,p,candidate)
            public_probe(h,p,candidate)
            result = {'status':'APPS_WITHOUT_SITE_PLAN_VERIFIED','activeCandidate':candidate,'changesAppliedByThisCommand':False}
        print(json.dumps(result,indent=2,ensure_ascii=False),flush=True)


if __name__ == '__main__':
    try:
        main()
    except ActivationError as error:
        sys.exit(str(error))
    except BaseException:
        print(json.dumps({'status':'APPS_WITHOUT_SITE_ACTIVATION_STOPPED','stage':STAGE,'siteTouched':False}),flush=True)
        sys.exit('Operação interrompida; preserve a âncora e não repita automaticamente.')
