"""Keep the active Web shell, audio, Maps, push and all non-driver files."""
import hashlib
import json
from pathlib import Path
import re
import shutil


def require(ok, message):
    if not ok: raise RuntimeError(message)


def tree(root):
    require(root.is_dir() and not root.is_symlink(),'Pacote Web ausente.')
    files={}
    for p in sorted(root.rglob('*')):
        require(not p.is_symlink(),'Link no pacote Web exige revisão.')
        if p.is_file(): files[str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
        else: require(p.is_dir(),'Tipo de arquivo Web exige revisão.')
    return files


def push(raw):
    m=re.fullmatch(r'//[^\n]*\nself\.ramoPushConfig = ([\s\S]+);\s*',raw)
    require(m is not None,'Push Web em formato inesperado.')
    value=json.loads(m[1])
    require(isinstance(value,dict) and all(isinstance(value.get(k),str) and value[k] for k in ['apiKey','appId','projectId','messagingSenderId','vapidKey']),'Push Web incompleto.')
    return value


def maps(raw):
    m=re.search(r'https://maps\.googleapis\.com/maps/api/js\?key=([^"\s<>]+)',raw)
    require(m is not None and re.fullmatch(r'AIza[A-Za-z0-9_-]{35}',m[1]),'Maps Web não configurado.')
    return m[1]


def prepare(old, incoming, target, manifest):
    require(not target.exists(),'Diretório da nova versão já existe.')
    old_files, new_files = tree(old), tree(incoming)
    require(new_files==manifest['files'],'Bundle Web difere do manifesto.')
    before=(old/'driver/index.html').read_text()
    after=(incoming/'index.html').read_text()
    require('<base href="/motorista/">' in before and maps(before)==maps(after),'Base/Maps Web divergem da versão ativa.')
    require(push((old/'driver/ramo_push_config.js').read_text())==push((incoming/'ramo_push_config.js').read_text()),'Projeto de push diverge da versão ativa.')
    for name in ['flutter_bootstrap.js','ramo_push_config.js','ramo_web_push.js']:
        require(name in before,'Shell ativo exige revisão.')
    # Overlay only compiled Flutter output/assets. Keep the exact old index and
    # existing public scripts, service workers, PWA entry gate and audio hooks.
    keep={'index.html','manifest.json','favicon.png'}
    def shell(name):
        return name in keep or (('/' not in name) and not name.startswith('main.dart.') and name not in {'main.dart.js','main.dart.wasm','main.dart.mjs','flutter.js','flutter_bootstrap.js','flutter_service_worker.js'} and not name.endswith('.map'))
    shutil.copytree(old,target)
    for name in new_files:
        dst=target/'driver'/name
        if shell(name) and dst.exists(): continue
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(incoming/name,dst)
        dst.chmod(0o644)
    for d in [target,*[p for p in target.rglob('*') if p.is_dir()]]: d.chmod(0o755)
    final=tree(target)
    require({k:v for k,v in old_files.items() if not k.startswith('driver/')}=={k:v for k,v in final.items() if not k.startswith('driver/')},'Arquivos de outro app foram alterados.')
    require(final.get('driver/index.html')==old_files.get('driver/index.html'),'Shell ativo foi alterado.')
    for name,value in new_files.items():
        if not (shell(name) and 'driver/'+name in old_files):
            require(final['driver/'+name]==value,'Flutter compilado divergente.')
    return {'before':old_files,'after':final,'retainedShell':True,'passengerUnchanged':True}
