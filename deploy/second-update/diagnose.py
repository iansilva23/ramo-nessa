"""Replay only read-only preparation checks; never invoke prepare or change services."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import traceback

sys.dont_write_bytecode = True
PREPARER_SHA = '7f625a9ecbc18692efa6da0fa9c56609904991fc17eaafaf163035efda1b22e4'
ROOT = Path('/opt/ramo-nessa-security')
SAFE_GUARDS = {
    'Arquivo operacional inválido; nenhuma substituição autorizada.',
    'Ambiente privado inválido.', 'Ambiente Compose precisa de revisão.',
    'Compose difere do ambiente ativo. Nenhum valor privado foi exibido.',
    'Plano contém opções que exigem revisão.', 'Tipo de volume exige revisão.',
    'Volumes resolvidos diferem dos volumes ativos.', 'Formato de rede exige revisão.',
    'Redes resolvidas diferem das redes ativas.',
    'A migração-base 104 não foi confirmada. Nenhuma migração aplicada; revisar antes de continuar.',
    'Migração 105 existente diverge; não alterar o histórico.',
}

class DiagnosisError(Exception):
    pass

def require(value, message):
    if not value:
        raise DiagnosisError(message)

def load(path, expected, name):
    require(path.is_file() and not path.is_symlink() and hashlib.sha256(path.read_bytes()).hexdigest() == expected, 'DIAGNOSTIC_INPUT_HASH_MISMATCH')
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def read_operation(args, allowed_probe):
    if len(args) == 3 and args[:2] == ['docker','inspect']:
        return 'container-inspect'
    if len(args) == 4 and args[:3] == ['docker','image','inspect']:
        return 'image-inspect'
    if args[:2] == ['docker','compose'] and args[-3:] == ['config','--format','json'] and all(x not in args for x in ['up','run','down','build','restart','rm','create']):
        return 'compose-config'
    if len(args) == 5 and args[:2] == ['docker','exec'] and args[3] == 'cat' and args[4].startswith(('/app/dist/','/srv/admin/src/')):
        return 'compiled-code-read'
    if len(args) == 7 and args[:2] == ['docker','exec'] and args[3:6] == ['node','--input-type=module','-e'] and args[6] == allowed_probe and 'BEGIN READ ONLY' in allowed_probe:
        return 'schema-read-only'
    raise DiagnosisError('NON_READ_ONLY_COMMAND_REFUSED')

class Diagnosis:
    def __init__(self, private_directory):
        self.directory = private_directory
        self.phase = 'initialization'
        self.operation = None
        self.report = {'status':'SECOND_UPDATE_DIAGNOSIS_RUNNING','checks':[],
                       'changesApplied':False,'servicesRestarted':False,
                       'imagesBuilt':False,'databaseMigrationPerformed':False}

    def stage(self, name, action):
        self.phase = name
        self.operation = None
        result = action()
        self.report['checks'].append(name)
        return result

    def runner(self, original, probe):
        def run(args, **kwargs):
            self.operation = read_operation(args, probe)
            return original(args, **kwargs)
        return run

    def failure(self, error):
        self.report.update(status='SECOND_UPDATE_DIAGNOSIS_STOPPED', failedPhase=self.phase,
                           errorType=type(error).__name__, operation=self.operation,
                           privateDiagnosticDirectory=str(self.directory))
        if isinstance(error, DiagnosisError):
            self.report['reason'] = str(error)
        elif str(error) in SAFE_GUARDS:
            self.report['reason'] = str(error)
        elif isinstance(error, BlockingIOError):
            self.report['reason'] = 'DEPLOYMENT_LOCK_BUSY'
        elif isinstance(error, OSError):
            self.report['errno'] = error.errno
        elif isinstance(error, KeyError) and error.args and error.args[0] in {'Config','Image','Name','Env','State','HostConfig','Mounts','services','core','gateway','institutional-site','volumes','networks','source','target','name'}:
            self.report['missingField'] = error.args[0]
        log = self.directory/'command.private.log'
        if log.is_file():
            with log.open('rb') as stream:
                stream.seek(max(0,log.stat().st_size-8192))
                tail = stream.read().decode(errors='replace')
            for marker, reason in [('No such file or directory','COMPILED_FILE_OR_RUNTIME_PATH_MISSING'),('ERR_MODULE_NOT_FOUND','NODE_MODULE_NOT_FOUND'),('password authentication failed','DATABASE_AUTHENTICATION_FAILED'),('ECONNREFUSED','DATABASE_CONNECTION_REFUSED'),('column "checksum" does not exist','MIGRATION_CHECKSUM_COLUMN_MISSING')]:
                if marker in tail:
                    self.report['commandFailureCategory'] = reason
                    break
        with (self.directory/'exception.private.log').open('a') as out:
            traceback.print_exc(file=out)
        return self.report

def run_checks(d, m, inventory, h, package):
    current = d.stage('runtime-inventory', inventory.collect_all)
    d.report['baselineSha256'] = current['baselineSha256']
    require(current['baselineSha256'] == m.BASELINE, 'RUNTIME_BASELINE_CHANGED')
    d.report['anchorExists'] = (m.ROOT/m.NAME).exists()
    d.report['candidateWebExists'] = (m.RELEASES/m.NAME/'bundles').exists()
    if (m.ROOT/m.NAME).is_dir():
        anchor = m.ROOT/m.NAME
        d.report['previousWebBackupExists'] = (anchor/'before-web').exists()
        phase = anchor/'phase.private.json'
        if phase.is_file() and not phase.is_symlink() and phase.stat().st_uid == 0:
            value = json.loads(phase.read_bytes()).get('phase')
            d.report['anchorPhase'] = value if value in ('preparing','prepared','activated') else 'other'
    import shutil
    d.report['freeBytes'] = shutil.disk_usage(m.RELEASES).free
    core_meta = None
    for component in m.PAYLOAD:
        meta, content = d.stage('payload:'+component, lambda component=component:m.payload(package,component))
        if component == 'core':
            core_meta = meta
        if component in m.ROUTES:
            def shell_check():
                for name in ('index.html','ramo_push_config.js','ramo_web_push.js','ramo_push_worker.js','manifest.json','ramo_card_fields.js'):
                    if name in content:
                        require((m.BASE_WEB/component/name).is_file() and (m.BASE_WEB/component/name).read_bytes() == content[name], 'WEB_SHELL_OR_PROVIDER_MISMATCH')
                if component == 'driver':
                    require(b'de20bf289d6db3ad15fdb14b' in content['main.dart.js'], 'DRIVER_CINEMA_MAP_ID_MISSING')
            d.stage('web-shell:'+component,shell_check)
        del content
    runtime = {}
    for key, entry in {**current['services'],'site':current['site']}.items():
        runtime[key] = d.stage('inspect:'+key,lambda entry=entry:h.inspect(entry['name']))
    env = d.stage('core-environment-shape',lambda:h.environment(runtime['core']['Config'].get('Env')))
    d.report['selfAccountDeletionFlagEnabled'] = env.get('SELF_ACCOUNT_DELETION_ENABLED','').lower() == 'true'
    d.report['compiledCodeChecks'] = []
    for component, runtime_key, prefix in [('core','core','/app/'),('admin','gateway','/srv/admin/')]:
        meta = core_meta if component == 'core' else m.payload(package,component)[0]
        for name, expected in meta['baseline'].items():
            def read_code():
                raw = h.run(['docker','exec',runtime[runtime_key]['Name'],'cat',prefix+str(m.relative(name))])
                observed = m.sha(raw)
                d.report['compiledCodeChecks'].append({'component':component,'file':name,'expectedSha256':expected,'observedSha256':observed})
                require(observed == expected,'ACTIVE_COMPILED_CODE_DIFFERS')
            d.stage('compiled-code:'+component+':'+name,read_code)
    d.report['schemaState'] = d.stage('database-schema-read-only',lambda:m.schema_state(h,runtime['core'],core_meta['files']['migrations/105_self_account_deletion.sql']))
    for key, service, project in [('core','core','ramo-nessa-staging'),('gateway','gateway','ramo-nessa-staging'),('site','institutional-site','ramo-nessa-site')]:
        labels = runtime[key]['Config'].get('Labels') or {}
        path = Path(labels.get('com.docker.compose.project.config_files',''))
        if path.is_file():
            st = path.lstat()
            d.report.setdefault('composeFileMetadata',{})[key] = {'ownerUid':st.st_uid,'mode':oct(stat.S_IMODE(st.st_mode)),'symlink':path.is_symlink()}
        d.stage('compose-snapshot:'+key,lambda key=key,service=service,project=project:m.snapshot(h,runtime[key],service,project))
    def check_caddy():
        mounts = [v for v in runtime['gateway']['Mounts'] if v['Destination'] == '/etc/caddy/Caddyfile']
        require(len(mounts)==1,'CADDY_MOUNT_AMBIGUOUS')
        path = Path(mounts[0]['Source'])
        require(path.resolve()==path and stat.S_ISREG(path.lstat().st_mode) and not path.stat().st_mode & 0o022,'CADDY_FILE_PERMISSIONS_OR_PATH')
        text = path.read_text()
        require(text.count('  @api path /v1/* /health /ready')==1 and '/excluir-conta' not in text,'CADDY_ROUTE_MARKER_DIFFERS')
    d.stage('caddy-read-only',check_caddy)
    d.stage('active-web-tree-read-only',lambda:m.tree(m.BASE_WEB))
    after = d.stage('final-runtime-inventory',inventory.collect_all)
    require(after['baselineSha256']==current['baselineSha256'],'RUNTIME_CHANGED_DURING_DIAGNOSIS')
    d.report.update(status='SECOND_UPDATE_READ_ONLY_CHECKS_PASSED',privateDiagnosticDirectory=str(d.directory))
    return d.report

def main():
    require(os.geteuid()==0 and len(sys.argv)==2,'USE_SUDO_AND_EXISTING_PACKAGE_DIRECTORY')
    os.umask(0o077)
    package = Path(sys.argv[1])
    require(package.parent==Path('/tmp') and package.resolve()==package and package.is_dir() and re.fullmatch(r'ramo-segunda-preparo\.[A-Za-z0-9]{6}',package.name),'INVALID_EXISTING_PACKAGE_DIRECTORY')
    m = load(package/'prepare.py',PREPARER_SHA,'second_prepare_diagnostic_target')
    inventory = m.load_module(package/'inspect-active.py',m.INVENTORY_SHA,'second_diagnostic_inventory')
    h = m.load_module(m.HELPER,m.HELPER_SHA,'second_diagnostic_guard')
    directory = Path(tempfile.mkdtemp(prefix='second-update-diagnosis-',dir=ROOT))
    d = Diagnosis(directory)
    h.DIRECTORY = directory
    probe = next(c for c in m.schema_state.__code__.co_consts if isinstance(c,str) and 'BEGIN READ ONLY' in c)
    h.run = d.runner(h.run,probe)
    try:
        d.phase='deployment-lock'
        descriptor=os.open(ROOT/'screen-lock-activation.lock',os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(descriptor,'r') as lock:
            fcntl.flock(lock,fcntl.LOCK_SH|fcntl.LOCK_NB)
            result = run_checks(d,m,inventory,h,package)
    except Exception as error:
        result = d.failure(error)
    print(json.dumps(result,indent=2,ensure_ascii=False))

if __name__=='__main__':
    try:
        main()
    except Exception:
        sys.exit('Diagnóstico não iniciado. Confira o diretório informado e os hashes dos arquivos; nenhum serviço foi alterado.')
