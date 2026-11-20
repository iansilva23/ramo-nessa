#!/usr/bin/env python3
"""Switch two verified PWAs and the visual ADM overlay using the existing gateway only."""

import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import types
import zipfile

SOURCE = 'd47c6c91a3fc158c47ed21d881c2bec1ed401c25'
NAME = 'marca-oficial-' + SOURCE[:12]
ROOT = Path('/opt/ramo-nessa-security')
ANCHOR = ROOT / NAME
RELEASES = Path('/opt/ramo-nessa-web/releases')
WEB = RELEASES / NAME / 'bundles'
PREVIOUS = ROOT / 'pix-complete-web-b06e61c8db8e'
BASE_WEB = RELEASES / PREVIOUS.name / 'bundles'
BASE_PLAN = '3378164c5b6e3f447b063e270dd1f9ae4ccce5b21ca290d318950388f0a3c278'
BASE_IMAGE = 'sha256:26576e05e681ab18d1e7af5b9f0b43b1e6de966a04668900852a4f7c93679c73'
CORE_IMAGE = 'sha256:44d2d2053eee1b67a9545fde7968cdc4cce91808109b5a2db8609972df791f48'
CADDY = ROOT / 'apps-pending-9eb6aa071db4/Caddyfile.candidate'
CADDY_SHA = 'df3f304e8ae067e85d9ca66cc96b7941a72dc52119df72424f1426cb0cc37d73'
GATEWAY = 'ramo-nessa-staging-gateway-1'
CORE = 'ramo-nessa-staging-core-1'
OTHERS = (CORE, 'ramo-nessa-staging-postgres-1', 'ramo-nessa-staging-google-maps-mock-1',
          'ramo-nessa-site-institutional-site-1')
GUARD = ROOT / 'active-screen-lock-e2dfhu83/activate-lock-candidate.py'
GUARD_SHA = '71268d209c4483b13c23ad3117e74196a65245e118f1bc9317f4bde3ee8b762f'
PREP_SHA = 'aa586db1ce856ab7d86d6cefc4380847024a096750451dd281db9e651da65393'
GATEWAY_BEFORE = {
    'index.html': '69a2b6b8d414eaa20622281dc60489535c19aebcabd76c0059bc3ba9186fb87a',
    'styles.css': '0130bc2a34d13b43b47a028528e97278c05ffb2e80ad1f37f1ad101081ac9b95',
    'favicon.svg': 'e7451817abe2692785e37cd4688e94318bcedc37b0e870c7f40e3464fb4af046',
}
ROLES = {
    'passenger': ('passageiro', 'Passageiro', 'fe3fde6f82dba20b5af4c8ddb572ba9bd4a255305f46fdc0944d1f57c6f4e6a1',
                  'ba74f7311a806744a342d5a29913faabfb7626f6aad6bd750eb38d3461f132d2'),
    'driver': ('motorista', 'Motorista', '4577d5f984227d7c93df462e956f91c738b5c0e204b729fd670045e4204de71f',
               '87df2000f578ec3e58ac00b3cdaae4ca8d033112a7e6b47c0606d03d463b5480'),
}
SHELL = ('ramo_push_config.js', 'ramo_web_push.js', 'ramo_push_worker.js',
         'ramo_install_tutorial_ios.gif', 'ramo_card_fields.js', 'ramo_offer_tone.js')
ICONS = ('Icon-192.png', 'Icon-512.png', 'Icon-maskable-192.png', 'Icon-maskable-512.png', 'apple-touch-icon.png')


class RolloutError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise RolloutError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def verified(path, digest):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size < 100 * 1024**2,
            'Arquivo inválido: ' + path.name)
    raw = path.read_bytes()
    require(sha(raw) == digest, 'Hash divergente: ' + path.name)
    return raw


def module(path, digest, name):
    result = types.ModuleType(name)
    result.__file__ = str(path)
    exec(compile(verified(path, digest), str(path), 'exec'), result.__dict__)
    return result


def load_web(p, inputs, role):
    route, label, digest, js = ROLES[role]
    path = inputs / f'RamoNessa-{label}-PWA-Marca-Oficial-Homologacao.zip'
    verified(path, digest)
    with zipfile.ZipFile(path) as archive:
        items = archive.infolist()
        require(len(items) < 2000 and len(items) == len(set(archive.namelist()))
                and sum(i.file_size for i in items) < 160 * 1024**2
                and all(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16) for i in items),
                'ZIP PWA inválido.')
        meta = json.loads(archive.read('BUILD-INFO.json'))
        require((meta['source'], meta['role'], meta['path'], meta['mainSha256']) ==
                (SOURCE, role, f'/{route}/', js), 'Pacote PWA de outra versão.')
        files = {}
        for name in archive.namelist():
            if name == 'BUILD-INFO.json':
                continue
            require(name.startswith(route + '/'), 'Componente PWA inesperado.')
            relative = str(p.relative(name[len(route) + 1:]))
            files[relative] = archive.read(name)
    require(sha(files['main.dart.js']) == js and
            all('icons/' + icon in files for icon in ICONS), 'PWA incompleto.')
    return files


def check_shell(old, files):
    before = (old / 'index.html').read_bytes()
    after = before.replace(b'href="manifest.json"', b'href="manifest.json?v=marca-oficial-1"')
    after = after.replace(b'rel="apple-touch-icon" href="icons/Icon-192.png"',
                          b'rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png?v=marca-oficial-1"')
    after = after.replace(b'type="image/png" href="icons/Icon-192.png"',
                          b'type="image/png" href="icons/Icon-192.png?v=marca-oficial-1"')
    require(after != before and after == files['index.html'], 'Shell PWA mudou além das referências de marca.')
    old_manifest = json.loads((old / 'manifest.json').read_bytes())
    new_manifest = json.loads(files['manifest.json'])
    old_manifest.pop('icons')
    new_manifest.pop('icons')
    require(old_manifest == new_manifest, 'Identidade ou configuração do PWA divergente.')
    for name in SHELL:
        if (old / name).exists() or name in files:
            require(name in files and (old / name).read_bytes() == files[name], 'Configuração ativa divergente: ' + name)


def patch_adm(active, inputs):
    approved = verified(inputs / 'adm-index.html',
                        'c87c306de09382311e90c03f54ff6a5199bf66548baded2db60cae09ecd0e2be')
    favicon = verified(inputs / 'adm-favicon.svg',
                       'd1bede4c9622bed63af0198f0baf5e8abeaeb99d45f88183d8a194eef1379195')
    require({n: sha(v) for n, v in active.items()} == GATEWAY_BEFORE, 'A revisão ativa do ADM mudou.')
    old = re.compile(rb'<svg class="brand-mark"[^>]*>.*?</svg>\n[ ]+<span>RAMO NESSA</span>', re.S)
    new = re.findall(rb'<img class="brand-mark" src="data:image/png;base64,[A-Za-z0-9+/=]+" alt="Ramo Nessa">', approved)
    require(len(new) == len(old.findall(active['index.html'])) == 3, 'A marca do ADM tem outra estrutura.')
    tags = iter(new)
    index = old.sub(lambda _match: next(tags), active['index.html'])
    before_favicon = b'href="favicon.svg"'
    require(index.count(before_favicon) == 1, 'Favicon ADM divergente.')
    marker = b'.brand-mark {\n  width: 34px;\n  height: 34px;\n  flex: 0 0 auto;\n}'
    require(active['styles.css'].count(marker) == 1, 'Estilo da marca ADM divergente.')
    return {'index.html': index.replace(before_favicon, b'href="favicon.svg?v=marca-oficial-1"'),
            'styles.css': active['styles.css'].replace(marker, marker.replace(b'width: 34px', b'width: auto')),
            'favicon.svg': favicon}


def gateway_expected(before, candidate):
    result = copy.deepcopy(before)
    if candidate:
        mount, = [m for m in result['Mounts'] if m['Destination'] == '/srv/web']
        mount['Source'] = str(WEB)
        for m in result['HostConfig'].get('Mounts') or []:
            if m.get('Target') == '/srv/web':
                m['Source'] = str(WEB)
        if result['HostConfig'].get('Binds'):
            result['HostConfig']['Binds'] = [
                str(WEB) + item[len(str(BASE_WEB)):] if item.startswith(str(BASE_WEB) + ':/srv/web:') else item
                for item in result['HostConfig']['Binds']]
    return result


def phase_file(candidate):
    return ANCHOR / ('gateway-after.private.json' if candidate else 'gateway-before.private.json')


def compose(h, snapshot, candidate):
    return ['docker', 'compose', '--project-directory', snapshot['workdir'], '--project-name', h.PROJECT,
            '--env-file', '/dev/null', '-f', str(phase_file(candidate))]


def update_gateway(h, plan, candidate):
    h.run(compose(h, plan['snapshot'], candidate) + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never',
          '--force-recreate', '--wait', '--wait-timeout', '90', 'gateway'], timeout=125)


def verify_other(h, plan):
    for name, identity in plan['other'].items():
        require(h.identity(h.inspect(name)) == tuple(identity), 'Outro serviço mudou: ' + name)


def status(h, plan):
    ids = h.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + GATEWAY + '$']).split()
    if not ids:
        return None, None
    require(len(ids) == 1, 'Gateway não identificado.')
    live = h.inspect(GATEWAY)
    labels = live['Config']['Labels']
    cfg = labels.get('com.docker.compose.project.config_files')
    require(labels.get('com.docker.compose.project') == h.PROJECT and
            labels.get('com.docker.compose.service') == 'gateway' and
            cfg in (plan['snapshot']['configPath'], str(phase_file(False)), str(phase_file(True))),
            'Gateway pertence a outra implantação.')
    candidate = cfg == str(phase_file(True))
    comparable = copy.deepcopy(live)
    comparable['State']['Running'] = True
    h.runtime_matches(gateway_expected(plan['before'], candidate), comparable,
                      plan['image'] if candidate else BASE_IMAGE, healthy=False)
    return live, candidate


def ensure_live(h, plan, candidate):
    live, actual = status(h, plan)
    require(live is not None and actual == candidate and live['State']['Running']
            and live['State'].get('Health', {}).get('Status') == 'healthy', 'Saúde do gateway não confirmada.')
    verify_other(h, plan)
    return live


def verify_public(h, plan, candidate):
    web = plan['webAfter' if candidate else 'webBefore']
    adm = plan['admAfter' if candidate else 'admBefore']
    probes = {'/ready': None, '/administrodo/': adm['index.html'],
              **{'/administrodo/' + name: digest for name, digest in adm.items() if name != 'index.html'}}
    for role, (route, _, _, _) in ROLES.items():
        paths = ['main.dart.js', 'index.html', 'manifest.json']
        if candidate:
            paths += ['icons/' + icon for icon in ICONS]
        probes.update({f'/{route}/{name}': web[f'{role}/{name}']['sha256'] for name in paths})
    script = """
import {createHash} from 'node:crypto';
await Promise.all(Object.entries(JSON.parse(process.argv[1])).map(async ([path, digest]) => {
  const r = await fetch('https://app.ramonessa.com.br' + path + '?marca=' + Date.now(),
    {cache:'no-store', redirect:'error', signal:AbortSignal.timeout(18000)});
  if (r.status !== 200) throw Error('HTTP ' + r.status + ' ' + path);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (digest && createHash('sha256').update(bytes).digest('hex') !== digest) throw Error('Hash ' + path);
}));
"""
    h.run(['docker', 'exec', CORE, 'node', '--input-type=module', '-e', script, json.dumps(probes)], timeout=40)


def intact(h, p, plan, candidate):
    for new, digest in zip((False, True), plan['configs']):
        require(sha(h.private_file(phase_file(new))) == digest, 'Configuração de reversão/ativação mudou.')
    require(h.bound_hash(CADDY) == CADDY_SHA and p.tree(BASE_WEB) == plan['webBefore'],
            'Caddyfile ou release anterior mudou.')
    if candidate:
        require(p.tree(WEB) == plan['webAfter'], 'Árvore candidata mudou.')
        p.verify_image_base(h, plan['image'], BASE_IMAGE)
        p.verify_image_files(h, plan['image'], plan['admAfter'], '/srv/admin/')


def journal(phase):
    tmp = ANCHOR / 'activation.incomplete'
    with tmp.open('w') as out:
        json.dump({'source': SOURCE, 'phase': phase}, out)
        out.flush()
        os.fsync(out.fileno())
    os.replace(tmp, ANCHOR / 'activation.private.json')


def rollback(h, p, plan):
    intact(h, p, plan, False)
    verify_other(h, plan)
    live, candidate = status(h, plan)
    journal('restoring')
    if live is None or candidate or not live['State']['Running']:
        update_gateway(h, plan, False)
    ensure_live(h, plan, False)
    verify_public(h, plan, False)
    journal('rolled-back')


def prepare(h, p, inputs):
    print('Conferindo a base da VPS e os arquivos da marca oficial.', flush=True)
    prior = json.loads(verified(PREVIOUS / 'plan.private.json', BASE_PLAN))
    state = json.loads(h.private_file(PREVIOUS / 'activation.private.json'))
    require(state['phase'] == 'completed' and state['source'] == prior['source'], 'Base Pix não confirmada.')
    before = h.inspect(GATEWAY)
    snapshot = p.snapshot(h, before, 'gateway', h.PROJECT)
    require(snapshot['configPath'] == str(PREVIOUS / 'gateway-after.private.json') and
            snapshot['configSha256'] == prior['configs']['gateway-after.private.json'] and
            before['Image'] == BASE_IMAGE and before['State']['Running'] and
            before['State'].get('Health', {}).get('Status') == 'healthy', 'Gateway diferente da base confirmada.')
    mount, = [m for m in before['Mounts'] if m['Destination'] == '/srv/web']
    require(mount['Source'] == str(BASE_WEB) and mount['Type'] == 'bind' and not mount['RW'],
            'Montagem Web divergente.')
    caddy, = [m for m in before['Mounts'] if m['Destination'] == '/etc/caddy/Caddyfile']
    require(caddy['Source'] == str(CADDY) and not caddy['RW'] and h.bound_hash(CADDY) == CADDY_SHA,
            'Caddyfile ativo mudou.')
    require(sha(h.run(['docker', 'exec', GATEWAY, 'cat', '/etc/caddy/Caddyfile'])) == CADDY_SHA,
            'Caddyfile montado difere do host.')
    other = {name: h.identity(h.inspect(name)) for name in OTHERS}
    require(other[CORE][1] == CORE_IMAGE and all(value[3] for value in other.values()),
            'Core ou serviços vizinhos diferem da base.')
    web_before = p.tree(BASE_WEB)
    require(web_before == prior['webAfter'], 'Arquivos da release anterior mudaram.')
    files = {role: load_web(p, inputs, role) for role in ROLES}
    for role, content in files.items():
        check_shell(BASE_WEB / role, content)
    active_adm = {name: h.run(['docker', 'exec', GATEWAY, 'cat', '/srv/admin/' + name])
                  for name in GATEWAY_BEFORE}
    require(not any(m['Destination'] in ('/', '/srv') or m['Destination'].startswith('/srv/admin')
                    for m in before['Mounts']), 'Uma montagem externa cobre o ADM.')
    adm = patch_adm(active_adm, inputs)
    require(min(shutil.disk_usage(ROOT).free, shutil.disk_usage(RELEASES).free) >= 1024**3,
            'Espaço insuficiente para preparação e reversão.')
    require(not WEB.parent.exists(), 'Já existe um diretório para esta revisão.')
    WEB.parent.mkdir(mode=0o755)
    WEB.parent.chmod(0o755)
    shutil.copytree(BASE_WEB, WEB)
    web_after = copy.deepcopy(web_before)
    for role, content in files.items():
        p.extract(content, WEB / role)
        web_after.update({role + '/' + name: {'sha256': sha(raw), 'bytes': len(raw)}
                          for name, raw in content.items()})
    require(p.tree(WEB) == web_after, 'Arquivos preparados divergem.')
    build = ANCHOR / 'admin-overlay'
    build.mkdir()
    p.extract(adm, build)
    image = p.derive_image(h, BASE_IMAGE, NAME + '-gateway', build,
                           [(name, '/srv/admin/' + name) for name in adm])
    adm_after = {name: sha(raw) for name, raw in adm.items()}
    models = [copy.deepcopy(snapshot['model']) for _ in range(2)]
    candidate = models[1]['services']['gateway']
    candidate['image'] = image
    bind, = [m for m in candidate['volumes'] if m['target'] == '/srv/web']
    bind['source'] = str(WEB)
    digests = []
    for new, model in zip((False, True), models):
        digests.append(p.save(phase_file(new), model))
        normalized = json.loads(h.run(compose(h, snapshot, new) + ['config', '--format', 'json']))
        require(normalized == model, 'Compose normalizado divergiu.')
    plan = {'source': SOURCE, 'before': before, 'snapshot': snapshot, 'other': other, 'configs': digests,
            'webBefore': web_before, 'webAfter': web_after, 'admBefore': GATEWAY_BEFORE,
            'admAfter': adm_after, 'image': image}
    p.save(ANCHOR / 'plan.private.json', plan)
    return plan


def activate(h, p, plan):
    intact(h, p, plan, True)
    live = ensure_live(h, plan, False)
    require(live['Id'] == plan['before']['Id'], 'Gateway mudou durante a preparação.')
    verify_public(h, plan, False)
    require(ensure_live(h, plan, False)['Id'] == live['Id'], 'Gateway mudou antes da troca.')
    journal('switching')
    try:
        print('Publicando os dois PWAs e o ADM. Só o gateway será recriado.', flush=True)
        update_gateway(h, plan, True)
        ensure_live(h, plan, True)
        verify_public(h, plan, True)
        journal('completed')
    except BaseException:
        try:
            rollback(h, p, plan)
        except BaseException:
            journal('requires-review')
            print('MARCA_OFICIAL_RETORNO_NAO_CONFIRMADO', flush=True)
            raise
        print('MARCA_OFICIAL_REVERTIDA', flush=True)
        raise
    print('MARCA_OFICIAL_PUBLICADA ' + SOURCE, flush=True)


def main():
    require(os.geteuid() == 0 and len(sys.argv) == 4 and sys.argv[1] in ('apply', 'rollback'),
            'Uso: sudo python3 -I rollout.py apply|rollback prepare-guard.py pasta-dos-arquivos')
    os.umask(0o077)
    info = ROOT.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022
            and ROOT.resolve() == ROOT, 'Diretório operacional inválido.')
    h = module(GUARD, GUARD_SHA, 'gateway_guard')
    p = module(Path(sys.argv[2]), PREP_SHA, 'prepare_guard')
    fd = os.open(ROOT / 'screen-lock-activation.lock', os.O_RDWR | os.O_NOFOLLOW)
    with os.fdopen(fd, 'r+') as lock:
        info = os.fstat(lock.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'Lock operacional inválido.')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if sys.argv[1] == 'apply':
            require(not ANCHOR.exists(), 'Já existe um registro para esta versão.')
            ANCHOR.mkdir(mode=0o700)
            h.DIRECTORY = ANCHOR
            activate(h, p, prepare(h, p, Path(sys.argv[3])))
        else:
            require(ANCHOR.is_dir() and ANCHOR.resolve() == ANCHOR and ANCHOR.stat().st_uid == 0
                    and not ANCHOR.stat().st_mode & 0o077, 'Âncora privada inválida.')
            h.DIRECTORY = ANCHOR
            plan = json.loads(h.private_file(ANCHOR / 'plan.private.json'))
            require(plan['source'] == SOURCE and (ANCHOR / 'activation.private.json').is_file(),
                    'Nenhuma ativação identificada para retorno.')
            rollback(h, p, plan)
            print('MARCA_OFICIAL_REVERTIDA', flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException as failure:
        print('MARCA_OFICIAL_INTERROMPIDA: ' +
              (str(failure) if isinstance(failure, RolloutError) else type(failure).__name__),
              flush=True)
        sys.exit(1)
