#!/usr/bin/env python3
"""Restore only the approved Guide/Driver presentation using the rehearsed installers."""
import ast
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
sys.dont_write_bytecode=True
SOURCE='68329f8540447b6994ef8d7255fcd69b04d7d3a1'
ROOT=Path('/opt/ramo-nessa-security')
OLD_ANCHOR=ROOT/'restore-guide-cinema-6047ec587faa'
OLD_ACTIVATOR_SHA='5a5cea3e198eff3bd1d15b8871417eb13898be810492c01dadc049de99b8de71'
PREPARER_SHA='b06bb4d6e4b3141a694f017d12e44ef598a84913e7aaa692bc6a902c2358e752'
INVENTORY_SHA='cb995c91b4cda7f17c94940ae45f4b0284a0374b6613625d2f49fcb186cd5b55'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def require(ok,message):
 if not ok:raise RuntimeError(message)
def load(path,expected,name):
 require(path.is_file() and not path.is_symlink() and sha(path.read_bytes())==expected,'Ferramenta divergente; operação interrompida.')
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def render(template,values):
 """Change only literal deployment references; executable functions stay byte-identical."""
 parsed=ast.parse(template)
 original={n.targets[0].id:n for n in parsed.body if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name)}
 lines=template.splitlines(keepends=True)
 for key,value in values.items():
  node=original[key]
  require(node.lineno==node.end_lineno,'Constante operacional inesperada.')
  expression='Path('+repr(str(value))+')' if key=='ANCHOR' else repr(value)
  lines[node.lineno-1]=key+' = '+expression+'\n'
 candidate=''.join(lines)
 rewritten=ast.parse(candidate)
 # Exclude only the explicitly authorized reference assignments in the AST comparison.
 def code(tree):
  return ast.dump(ast.Module(body=[n for n in tree.body if not (isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id in values)],type_ignores=[]),include_attributes=False)
 require(code(parsed)==code(rewritten),'Código do ativador seria alterado; operação recusada.')
 return candidate.encode()

def require_driver_unchanged(before,after):
 driver=lambda records:{key:value for key,value in records.items() if key.startswith('driver/')}
 require(bool(driver(before)) and driver(before)==driver(after),'O Motorista seria alterado; aplicação recusada.')

def main():
 require(os.geteuid()==0,'Execute com sudo python3.')
 require(sys.argv[1:]==['restaurar'],'Uso: restaurar.py restaurar.')
 os.umask(0o077)
 package=Path(__file__).resolve().parent
 old=load(OLD_ANCHOR/'activate-web.py',OLD_ACTIVATOR_SHA,'previous_verified_activation')
 prep=load(package/'prepare-web.py',PREPARER_SHA,'verified_restore_preparer')
 inventory=load(package/'inspect-active.py',INVENTORY_SHA,'verified_restore_inventory')
 h=old.load_guard()
 fd=os.open(ROOT/'screen-lock-activation.lock',os.O_RDWR|os.O_NOFOLLOW)
 with os.fdopen(fd,'r+') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  previous=old.read_plan(h)
  state=old.state(h)
  require(state and state['phase']=='completed','A publicação anterior não está concluída; conferir estado.')
  old.files_intact(h,previous)
  gateway=old.verify_runtime(h,previous,True)
  require(gateway['Id']==state.get('gatewayAfterId'),'O gateway mudou depois da atualização; não sobrescrever.')
  h.inactive()
  metadata=json.loads((package/'RESTORE-MANIFEST.json').read_text())
  require(metadata['source']==SOURCE and set(metadata['payloads'])=={'driver','passenger'},'Fonte da restauração divergente.')
  for role,item in metadata['payloads'].items():
   require(Path(item['file']).name==item['file'],'Nome de pacote inválido.')
   require(sha((package/item['file']).read_bytes())==item['sha256'],'Pacote de restauração divergente.')
  prep.SOURCE=SOURCE
  prep.BASE_WEB=Path(previous['newWeb'])
  prep.BASELINE=inventory.collect()['baselineSha256']
  prep.NAME='restore-exact-guide-'+SOURCE[:12]
  prep.PAYLOAD={r:(x['file'],x['sha256']) for r,x in metadata['payloads'].items()}
  result=prep.prepare(package,h,inventory)
  anchor=Path(result['anchor'])
  checked=json.loads((anchor/'plan.private.json').read_text())
  require_driver_unchanged(checked['beforeWebFiles'],checked['candidateWebFiles'])
  template=(OLD_ANCHOR/'activate-web.py').read_text()
  raw=render(template,{'ANCHOR':anchor,'PLAN_SHA':result['planSha256'],'SOURCE':SOURCE,'BASELINE':result['baselineSha256'],
    'OLD_WEB':previous['newWeb'],'NEW_WEB':result['candidateWeb'],'CORE_IMAGE':result['coreImage'],'GATEWAY_IMAGE':result['gatewayImage']})
  prep.private_save(anchor/'activate-web.py',raw)
  print(json.dumps({'status':'RESTORE_EXACT_GUIDE_PREPARED','anchor':str(anchor),'planSha256':result['planSha256'],'activatorSha256':sha(raw),'source':SOURCE}),flush=True)
  new=load(anchor/'activate-web.py',sha(raw),'restore_activation')
  plan=new.read_plan(h)
  applied=new.activate(h,plan)
  applied['restoration']='exact-passenger-guide-from-pre-redesign-9e913c89'
  applied['driverBytesUnchanged']=True
  print(json.dumps(applied,indent=2,ensure_ascii=False),flush=True)

if __name__=='__main__':
 try:main()
 except BaseException:
  print('Restauração interrompida. Preserve a saída e a âncora; não repita automaticamente. Nenhum detalhe privado foi exibido.',file=sys.stderr)
  sys.exit(1)
