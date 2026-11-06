"""Render reviewed legal content; reject incomplete factual inputs before any publication."""
import hashlib
import json
from pathlib import Path
import re
import sys

CATEGORIES={'conta_e_acesso','documentos_e_perfil','cartoes','localizacao_atual','corridas_e_financeiro','atendimento','logs','backups'}


def render(config, template_root):
    facts=json.loads((template_root/'legal-facts.json').read_text())
    config={**facts,**config}
    def required(name):
        value=config.get(name)
        if not isinstance(value,str) or not value.strip() or len(value)>10000:
            raise ValueError('Campo factual pendente: '+name)
        return value.strip()
    name,address=required('legalName'),required('registeredAddress')
    providers=required('providerDescription')
    transfers=required('internationalProcessingDescription')
    rows=config.get('retention')
    if not isinstance(rows,list) or {row.get('category') for row in rows if isinstance(row,dict)}!=CATEGORIES or len(rows)!=len(CATEGORIES):
        raise ValueError('Tabela de conservação incompleta.')
    descriptions=[]
    for row in rows:
        for key in ('category','period','basis','endAction'):
            if not isinstance(row.get(key),str) or not row[key].strip():raise ValueError('Conservação sem '+key)
        descriptions.append(row['category']+': '+row['period']+' Motivo: '+row['basis']+' Destino: '+row['endAction'])
    values={'RAZAO_SOCIAL':name,'ENDERECO':address,'PROVEDORES':providers,'TRANSFERENCIAS':transfers,'RETENCAO':'\n\n'.join(descriptions)}
    result={}
    for kind in ('terms_of_use','privacy_policy'):
        text=(template_root/(kind+'.template.md')).read_text()
        for token,value in values.items():text=text.replace('{{'+token+'}}',value)
        if re.search(r'\{\{[^}]+\}\}|\[PENDENTE\]|\[A CONFIRMAR\]',text,re.I):raise ValueError('Texto ainda contém campo não confirmado.')
        if not 50<=len(text)<=30000:raise ValueError('Documento fora do limite da API existente.')
        result[kind]=text
    return result

if __name__=='__main__':
    config=json.loads(Path(sys.argv[1]).read_text())
    result=render(config,Path(__file__).resolve().parent)
    output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=False)
    manifest={}
    for kind,text in result.items():
        (output/(kind+'.md')).write_text(text)
        manifest[kind]=hashlib.sha256(text.encode()).hexdigest()
    (output/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Documentos renderizados. Nenhuma publicação executada; versão e vigência serão atribuídas na publicação.')
