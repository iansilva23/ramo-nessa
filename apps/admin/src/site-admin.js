import { AdminApiError } from './api.js';
export function createSiteAdmin({root,getToken,hasScope,onError}) {
  const abort=new AbortController(), urls=new Set();let stopped=false,busy=false,model=null,dirty=false,page=1,tab='leads';
  const workspace=root.querySelector('#site-workspace'),status=root.querySelector('#site-status');
  const node=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
  const listen=(n,event,fn)=>n.addEventListener(event,fn,{signal:abort.signal});
  function message(t){if(!stopped)status.textContent=t;}
  async function request(path,{method='GET',body,file}={}){
    const response=await fetch('/site-management/'+path,{method,headers:{authorization:'Bearer '+getToken(),...(body?{'content-type':'application/json'}:{}),...(file?{'content-type':file.type||'application/octet-stream'}:{})},body:file??(body?JSON.stringify(body):undefined),credentials:'omit',cache:'no-store',redirect:'error',signal:abort.signal});
    const data=await response.json();if(!response.ok)throw new AdminApiError(data.message||'Falha na operação.',{status:response.status});return data;
  }
  async function perform(action){if(busy||stopped)return;busy=true;root.setAttribute('aria-busy','true');message('Processando…');try{await action();}catch(e){if(!stopped){message(e.message||'Não foi possível concluir.');if(e.status===401)onError?.(e);}}finally{busy=false;root.removeAttribute('aria-busy');}}
  function button(text,fn,allowed=true){const b=node('button',text,'button button--ghost-dark');b.type='button';b.disabled=!allowed;listen(b,'click',()=>void perform(fn));return b;}
  function field(label,value,{multiline=false,max=250,type='text'}={}){const wrap=node('label','','field');wrap.append(node('span',label));const input=node(multiline?'textarea':'input');if(!multiline)input.type=type;input.value=value;input.maxLength=max;wrap.append(input);return {wrap,input};}
  function disposeUrls(){for(const u of urls)URL.revokeObjectURL(u);urls.clear();}
  function clear(){disposeUrls();workspace.replaceChildren();}
  async function showLeads(){
    clear();const toolbar=node('form','','site-admin-toolbar');const query=field('Buscar nome ou telefone','',{max:100,type:'search'});const filter=node('select');filter.setAttribute('aria-label','Situação');
    const labels={new:'Novo',contacted:'Em contato',approved:'Aprovado no pré-cadastro',closed:'Encerrado'};
    for(const [v,l] of Object.entries({'':'Todas as situações',...labels})){const o=node('option',l);o.value=v;filter.append(o);}
    const search=node('button','Buscar','button');toolbar.append(query.wrap,filter,search);workspace.append(toolbar);const list=node('div','','site-leads');workspace.append(list);
    async function load(){const result=await request('leads?'+new URLSearchParams({q:query.input.value,status:filter.value,page:String(page)}));if(stopped)return;list.replaceChildren(node('p',`${result.total} interessado(s) · página ${page}`));
      if(!result.items.length)list.append(node('p','Nenhuma solicitação encontrada.'));
      for(const lead of result.items){const card=node('article','','site-admin-card');card.append(node('h2',lead.name),node('p',`${lead.phone} · ${lead.region} · ${lead.vehicle}`),node('p',new Date(lead.created_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})));
        const select=node('select');select.setAttribute('aria-label','Situação de '+lead.name);for(const [v,l]of Object.entries(labels)){const o=node('option',l);o.value=v;select.append(o);}select.value=lead.status;
        const notes=field('Observações internas',lead.notes,{multiline:true,max:2000});select.disabled=notes.input.disabled=!hasScope('drivers:profile:write');
        card.append(select,notes.wrap,button('Salvar acompanhamento',async()=>{await request('leads/'+lead.id,{method:'PUT',body:{status:select.value,notes:notes.input.value,expectedRevision:lead.revision}});await load();message('Acompanhamento salvo.');},hasScope('drivers:profile:write')));list.append(card);
      }
      const pager=node('div','','site-admin-toolbar');pager.append(button('Anterior',async()=>{page--;await load();},page>1),button('Próxima',async()=>{page++;await load();},page*30<result.total));list.append(pager);message('Interessados carregados. A aprovação aqui não ativa uma conta de motorista.');
    }
    listen(toolbar,'submit',e=>{e.preventDefault();page=1;void perform(load);});await load();
  }
  async function loadContent(){const data=await request('content');if(stopped)return;model=data;dirty=false;renderEditor();message('Conteúdo carregado. As mudanças ficam em rascunho até publicar.');}
  function bind(parent,label,obj,key,options={}){const f=field(label,obj[key],options);f.input.disabled=!hasScope('communications:write');listen(f.input,'input',()=>{obj[key]=f.input.value;dirty=true;message('Alterações ainda não salvas.');});parent.append(f.wrap);return f.input;}
  function upload(parent,label,kind,obj,key){const f=field(label,'',{type:'file'});f.input.removeAttribute('maxlength');f.input.accept=kind==='apk'?'.apk':'.png,.jpg,.jpeg,.webp';f.input.disabled=!hasScope('communications:write');const note=node('p',kind==='apk'?'APK até 150 MB. Envie a versão assinada para distribuição.':'PNG, JPEG ou WebP até 8 MB.');parent.append(f.wrap,note);
    listen(f.input,'change',()=>void perform(async()=>{const file=f.input.files?.[0];if(!file)return;if(file.size>(kind==='apk'?150:8)*1024*1024)throw new Error('Arquivo maior que o limite.');const data=await request('uploads/'+kind,{method:'POST',file});obj[key]=data.path;dirty=true;renderEditor();message('Arquivo enviado para o rascunho. Salve e publique para disponibilizar.');}));
  }
  async function previewImage(img,path){if(!path.startsWith('/media/')){img.src='https://ramonessa.com.br'+path;return;}
    const response=await fetch(path,{headers:{authorization:'Bearer '+getToken()},credentials:'omit',cache:'no-store',signal:abort.signal});if(!response.ok)return;const u=URL.createObjectURL(await response.blob());if(stopped){URL.revokeObjectURL(u);return;}urls.add(u);img.src=u;
  }
  function renderPreview(){clear();const c=model.draft;workspace.append(node('p','Prévia do conteúdo do rascunho. O site mantém o layout e as animações atuais.'));
    for(const [title,accent,description,image]of [[c.heroTitle,c.heroAccent,c.heroDescription,c.heroImage],[c.driverTitle,c.driverAccent,c.driverDescription,c.driverIcon],[c.downloadTitle,c.downloadAccent,'',c.appIcon]]){const card=node('article','','site-admin-card site-content-preview');const img=node('img');img.alt='Prévia da imagem';void previewImage(img,image).catch(()=>{});card.append(img,node('h2',title+' '+accent),node('p',description));workspace.append(card);}
    for(const app of c.apps){const card=node('article','','site-admin-card');card.append(node('h3',app.label+' '+app.version));for(const [k,l]of [['apkHref','APK'],['webHref','Web'],['playStoreHref','Google Play'],['appStoreHref','App Store']])card.append(node('p',`${l}: ${app[k]||'Em breve'}`));workspace.append(card);}
    workspace.append(button('Voltar à edição',()=>renderEditor()));message(dirty?'Prévia com alterações ainda não salvas.':'Prévia do rascunho salvo.');
  }
  function renderEditor(){
    clear();const c=model.draft,allowed=hasScope('communications:write');const actions=node('div','','site-admin-toolbar');
    actions.append(button('Salvar rascunho',async()=>{await request('draft',{method:'PUT',body:{content:c,expectedRevision:model.revision}});await loadContent();message('Rascunho salvo. O site público ainda não mudou.');},allowed),button('Prévia',()=>renderPreview()),button('Publicar rascunho',async()=>{
      if(dirty)throw new Error('Salve o rascunho antes de publicar.');if(!window.confirm('Publicar este rascunho no site?')){message('Publicação cancelada.');return;}
      await request('publish',{method:'POST',body:{expectedRevision:model.revision}});await loadContent();message('Site publicado.');
    },allowed));workspace.append(actions);
    const textCard=node('article','','site-admin-card');textCard.append(node('h2','Textos do site'));
    for(const [key,label,max]of [['heroTitle','Título principal',70],['heroAccent','Destaque do título',40],['heroDescription','Descrição principal',220],['driverTitle','Título para motoristas',70],['driverAccent','Destaque para motoristas',40],['driverDescription','Descrição para motoristas',250],['downloadTitle','Título dos downloads',80],['downloadAccent','Destaque dos downloads',50]])bind(textCard,label,c,key,{max,multiline:key.endsWith('Description')});workspace.append(textCard);
    const images=node('article','','site-admin-card');images.append(node('h2','Imagens'));
    for(const [key,label]of [['heroImage','Foto principal'],['appIcon','Ícone passageiro'],['driverIcon','Ícone motorista']]){images.append(node('p',`${label}: ${c[key]}`));upload(images,'Trocar '+label.toLowerCase(),'image',c,key);}
    bind(images,'Descrição da foto para acessibilidade',c,'heroImageAlt',{max:180});bind(images,'Créditos e licença da foto',c,'photoCredit',{max:180});bind(images,'Link dos créditos',c,'photoCreditUrl',{max:2048});workspace.append(images);
    for(const app of c.apps){const card=node('article','','site-admin-card');card.append(node('h2','Aplicativo '+app.label));bind(card,'Versão',app,'version',{max:40});for(const [k,l]of [['apkHref','Link do APK'],['webHref','Versão web'],['playStoreHref','Google Play'],['appStoreHref','App Store']])bind(card,l,app,k,{max:2048});upload(card,'Enviar APK '+app.label,'apk',app,'apkHref');card.append(node('p','Campo vazio mantém a opção em breve. Um novo APK não atualiza sozinho os aplicativos já instalados.'));workspace.append(card);}
    const history=node('article','','site-admin-card');history.append(node('h2','Versões anteriores'),node('p','Restaurar carrega a versão no rascunho. Confira e publique para voltar ao ar.'));
    for(const release of model.releases)history.append(button('Restaurar versão '+release.id+' · '+new Date(release.created_at).toLocaleString('pt-BR'),async()=>{if(dirty&&!window.confirm('Descartar as alterações não salvas?'))return;await request('restore',{method:'POST',body:{id:release.id,expectedRevision:model.revision}});await loadContent();message('Versão recuperada no rascunho.');},allowed));workspace.append(history);
    const audit=node('details','','site-admin-card');audit.append(node('summary','Histórico de alterações'));for(const entry of model.audit)audit.append(node('p',`${new Date(entry.created_at).toLocaleString('pt-BR')} · ${entry.action} · usuário ${entry.actor}`));workspace.append(audit);
  }
  const tabs=root.querySelector('#site-tabs');
  if(hasScope('drivers:profile:read'))tabs.append(button('Interessados em ser motorista',async()=>{if(dirty&&!window.confirm('Descartar alterações não salvas?'))return;dirty=false;tab='leads';await showLeads();}));
  if(hasScope('communications:read'))tabs.append(button('Conteúdo e aplicativos',async()=>{if(tab==='content'&&dirty)return;tab='content';await loadContent();}));
  const unload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload,{signal:abort.signal});
  void perform(async()=>{if(hasScope('drivers:profile:read'))await showLeads();else{tab='content';await loadContent();}});
  return {destroy(){stopped=true;abort.abort();disposeUrls();}};
}
