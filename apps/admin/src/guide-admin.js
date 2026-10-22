import {guideTemplates,guideActionLabels,newGuideData,guideHasDraft,guideStatus} from './guide-model.js';
import {createPricingGeofenceMap} from './pricing-geofence-map.js';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const btn=(text,action,primary=false)=>{const b=el('button',text,'button '+(primary?'button--primary':'button--ghost'));b.type='button';b.addEventListener('click',action);return b;};
const uid=()=>crypto.randomUUID();
function field(label,value='',type='text',options={}){const w=el('label',label,'gl-field'),i=el(type==='textarea'?'textarea':type==='select'?'select':'input');if(i.tagName==='INPUT')i.type=type;
 if(options.items)for(const [v,n] of options.items){const o=el('option',n);o.value=v;i.append(o);}i.value=value??'';i.name=options.name??label;i.setAttribute('aria-label',label);
 for(const [k,v]of Object.entries(options))if(k!=='items'&&k!=='hint')i[k]=v;w.append(i);if(options.hint)w.append(el('small',options.hint));return {w,i};}
export function createGuideAdmin({root,api,getToken,hasScope,onError=()=>{}}){
 const abort=new AbortController(),dialogs=new Set(),urls=new Set(),imageCache=new Map();let data=null,locality=null,category=null,filter='all',query='',disposed=false,busy=false;
 const get=n=>root.querySelector('[data-guide="'+n+'"]'),canWrite=()=>hasScope('communications:write');
 const rows=()=>data?.entities??[],find=id=>rows().find(r=>r.id===id),sorted=items=>[...items].sort((a,b)=>a.draft.order-b.draft.order||a.draft.name.localeCompare(b.draft.name,'pt-BR'));
 const notify=(text='',error=false)=>{if(disposed)return;const n=get('message');n.textContent=text;n.hidden=!text;n.classList.toggle('is-error',error);};
 const error=e=>{notify(e.message??'Não foi possível concluir.',true);if(e.status===401)onError(e);};
 function dialog(title){const d=el('dialog',null,'gl-editor'),head=el('header',null,'gl-editor-head'),body=el('div',null,'gl-editor-body'),h=el('h2',title);h.id='gl-'+uid();d.setAttribute('aria-labelledby',h.id);head.append(h,btn('Fechar',()=>d.close()));d.append(head,body);document.body.append(d);dialogs.add(d);d.addEventListener('close',()=>{dialogs.delete(d);d.remove();},{once:true});d.showModal();return {d,body};}
 async function load(){if(disposed)return;try{root.setAttribute('aria-busy','true');const result=await api.guide(getToken());if(disposed)return;data=result;render();}catch(e){error(e);}finally{root.removeAttribute('aria-busy');}}
 async function write(body){if(busy||disposed)return null;busy=true;try{const result=await api.saveGuide(getToken(),{...body,expectedRevision:data.revision});if(disposed)return null;data=result;render();return result;}catch(e){error(e);if(e.status===409){const fresh=await api.guide(getToken());if(!disposed)data=fresh;}throw e;}finally{busy=false;}}
 async function operation(e,op){try{if(await write({id:e.id,op}))notify(op==='publish'?'Publicado no aplicativo.':op==='unpublish'?'Conteúdo oculto no aplicativo.':'Alteração salva.');}catch{}}
 function empty(target,title,copy,action){const n=el('div',null,'gl-empty');n.append(el('span','◇','gl-empty-icon'),el('h3',title),el('p',copy));if(action&&canWrite())n.append(btn('+ Adicionar',action,true));target.append(n);}
 function render(){if(disposed||!data)return;const ls=sorted(rows().filter(e=>e.kind==='locality'&&!e.archived));if(!ls.some(e=>e.id===locality))locality=ls[0]?.id??null;
  const loc=find(locality),cs=sorted(rows().filter(e=>e.kind==='category'&&e.parentId===locality&&!e.archived));if(!cs.some(e=>e.id===category))category=cs[0]?.id??null;
  get('localities').replaceChildren();for(const l of ls){const b=btn(l.draft.name,()=>{locality=l.id;category=null;query='';get('search').value='';render();});b.classList.add('gl-locality');b.setAttribute('aria-pressed',String(l.id===locality));get('localities').append(b);}
  get('categories').replaceChildren();for(const c of cs){const b=btn('',()=>{category=c.id;query='';get('search').value='';render();});b.classList.add('gl-category');b.setAttribute('aria-current',c.id===category?'page':'false');b.append(el('span',c.draft.name),el('small',rows().filter(e=>e.parentId===c.id&&!e.archived).length+' itens · '+guideStatus(c)));get('categories').append(b);}
  if(!cs.length)empty(get('categories'),'Sua primeira categoria','Escolha um modelo e adicione conteúdos.',()=>edit(null,'category'));
  const archived=rows().filter(e=>e.archived&&(e.kind==='locality'||e.kind==='category'&&e.parentId===locality));
  if(archived.length){const section=el('details',null,'gl-archived');section.append(el('summary','Arquivados ('+archived.length+')'));for(const e of archived)section.append(btn('Restaurar '+e.draft.name,()=>void operation(e,'restore')));get('categories').append(section);}
  const cat=find(category);get('heading').textContent=cat?.draft.name??'Seu Guia começa aqui';get('breadcrumb').textContent=loc?.draft.name??'LOCALIDADES';get('description').textContent=cat?guideTemplates.find(t=>t[0]===cat.draft.template)?.[2]??'Conteúdos selecionados por você.':'Adicione uma localidade e suas categorias.';
  for(const n of ['add-category','edit-locality'])get(n).disabled=!loc||!canWrite();for(const n of ['add-item','edit-category'])get(n).disabled=!cat||!canWrite();get('add-locality').disabled=!canWrite();
  get('status').replaceChildren();for(const [id,label] of [['all','Todos'],['published','Publicados'],['drafts','Rascunhos'],['hidden','Ocultos']]){const b=btn(label,()=>{filter=id;renderItems();});b.dataset.status=id;b.setAttribute('aria-pressed',String(filter===id));get('status').append(b);}renderItems();
 }
 function renderItems(){const target=get('items');target.replaceChildren();get('status').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.status===filter)));
  const all=sorted(rows().filter(e=>e.parentId===category&&e.kind==='item'));const items=all.filter(e=>(filter==='hidden'?e.archived:!e.archived)&&(filter!=='published'||e.published)&&(filter!=='drafts'||guideHasDraft(e))&&e.draft.name.toLocaleLowerCase('pt-BR').includes(query));
  if(!items.length)empty(target,query?'Nenhum resultado':filter==='drafts'?'Tudo em dia':'Espaço para novas descobertas',query?'Tente outro nome.':'Adicione um conteúdo, salve como rascunho e publique quando estiver pronto.',category?()=>edit(null,'item'):null);
  for(const e of items){const card=el('article',null,'gl-row'),photo=el('div',null,'gl-thumb');if(e.draft.image)void imageInto(photo,e.draft.image,e.draft.imagePosition);else photo.append(el('span','◇'));
   const text=el('div',null,'gl-row-copy');text.append(el('span',guideStatus(e),'gl-badge'+(e.published?' is-live':'')),el('h3',e.draft.name),el('p',e.draft.summary));const actions=el('div',null,'gl-row-actions');
   actions.append(btn('Editar',()=>edit(e)),btn('Prévia',()=>preview(e)));if(canWrite()){const extra=el('details',null,'gl-more');extra.append(el('summary','Mais ações'));const menu=el('div',null,'gl-more-menu');
    menu.append(btn('Duplicar',()=>edit({...structuredClone(e),id:uid(),published:null,archived:false,draft:{...structuredClone(e.draft),name:e.draft.name+' — cópia'}},e.kind,true)),btn(e.archived?'Restaurar':'Arquivar',()=>void operation(e,e.archived?'restore':'archive')));
    if(e.published)menu.append(btn('Despublicar',()=>void operation(e,'unpublish')));else if(!e.archived)menu.append(btn('Publicar',()=>void operation(e,'publish')));
    const active=all.filter(r=>!r.archived),index=active.indexOf(e);if(!e.archived)for(const [offset,label] of [[-1,'Mover para cima'],[1,'Mover para baixo']]){const b=btn(label,()=>void reorder(e,active,index,offset));b.disabled=!active[index+offset];menu.append(b);}extra.append(menu);actions.append(extra);}
   card.append(photo,text,actions);target.append(card);
  }
 }
 async function reorder(e,active,index,offset){const reordered=[...active];[reordered[index],reordered[index+offset]]=[reordered[index+offset],reordered[index]];try{await write({op:'reorder',id:e.id,ids:reordered.map(r=>r.id)});notify('Ordem atualizada. Conteúdos em rascunho continuam privados.');}catch{}}

 async function imageInto(target,url,position=50){try{let pending=imageCache.get(url);if(!pending){pending=(async()=>{const payload=await api.guideImage(getToken(),url.split('/').at(-1));if(disposed)return null;const blob=URL.createObjectURL(new Blob([payload.bytes],{type:payload.contentType}));urls.add(blob);return blob;})();imageCache.set(url,pending);}const blob=await pending;if(!blob||disposed||!target.isConnected)return;const img=el('img');img.src=blob;img.alt='';img.style.objectPosition='50% '+position+'%';target.replaceChildren(img);}catch{imageCache.delete(url);target.textContent='Foto indisponível';}}

 function edit(original,kind='item',duplicate=false){if(!canWrite())return;kind=original?.kind??kind;const e=original?structuredClone(original):{id:uid(),kind,parentId:kind==='locality'?null:kind==='category'?locality:category,draft:newGuideData(),published:null,archived:false};
  if(!original)e.draft.order=rows().filter(r=>r.parentId===e.parentId&&r.kind===kind).length;const d=e.draft,parent=find(e.parentId),model=kind==='category'?d.template:parent?.draft.template;
  const m=dialog((original&&!duplicate?'Editar ':'Adicionar ')+(kind==='locality'?'localidade':kind==='category'?'categoria':'conteúdo')),form=el('form',null,'gl-form'),feedback=el('p',null,'gl-feedback');feedback.setAttribute('role','alert');feedback.hidden=true;
  const report=err=>{feedback.textContent=err.message??String(err);feedback.hidden=false;};m.body.append(form);form.append(feedback);
  function bind(label,key,type='text',options={}){const f=field(label,type==='checkbox'?'':d[key],type,options);if(type==='checkbox'){f.i.checked=!!d[key];f.i.addEventListener('change',()=>d[key]=f.i.checked);}else f.i.addEventListener('input',()=>{d[key]=type==='number'||type==='range'?(f.i.value===''?null:Number(f.i.value)):f.i.value;});return f;}
  const top=el('section',null,'gl-form-section');top.append(el('h3','Informações principais'));form.append(top);
  if(kind!=='locality'){const photo=el('div',null,'gl-photo-editor'),preview=el('div',null,'gl-photo-preview'),upload=field('Foto','', 'file',{accept:'image/jpeg,image/png,image/webp'});upload.w.classList.add('gl-upload-control');upload.w.append(btn('Escolher foto',()=>upload.i.click()),el('small','JPEG, PNG ou WebP · até 8 MB'));photo.append(preview,upload.w);top.append(photo);if(d.image)void imageInto(preview,d.image,d.imagePosition);
   const crop=bind('Enquadramento vertical','imagePosition','range',{min:0,max:100});photo.append(crop.w);crop.w.hidden=!d.image;crop.i.addEventListener('input',()=>{const img=preview.querySelector('img');if(img)img.style.objectPosition='50% '+d.imagePosition+'%';});
   upload.i.addEventListener('change',async()=>{const file=upload.i.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw Error('Use uma foto de até 8 MB.');upload.i.disabled=true;const result=await api.uploadGuideImage(getToken(),{bytes:new Uint8Array(await file.arrayBuffer()),contentType:file.type});d.image=result.url;crop.w.hidden=false;await imageInto(preview,d.image,d.imagePosition);}catch(err){report(err);}finally{upload.i.disabled=false;}});
   photo.append(btn('Remover foto',()=>{d.image='';crop.w.hidden=true;preview.replaceChildren();}));
  }
  const name=bind('Nome *','name','text',{required:true,maxLength:120});top.append(name.w);if(kind!=='locality')top.append(bind('Descrição curta','summary','textarea',{maxLength:280,rows:2}).w);
  let currentModel=model;
  if(kind==='category'){
   const section=el('section',null,'gl-form-section');section.append(el('h3','Modelo da página'),el('p','Escolha uma estrutura pronta. Seu conteúdo permanece salvo ao trocar de modelo.'));const choices=el('div',null,'gl-template-grid');
   for(const [id,label,copy,icon]of guideTemplates){const choice=btn('',()=>{d.template=id;d.icon=icon;currentModel=id;choices.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===id)));notice.hidden=false;});choice.dataset.model=id;choice.setAttribute('aria-pressed',String(d.template===id));const sketch=el('span',null,'gl-template-sketch gl-sketch-'+id);sketch.append(el('i'),el('i'),el('i'));choice.append(sketch,el('strong',label),el('small',copy));choices.append(choice);}const notice=el('p','Os dados de outros modelos serão preservados. Confira a prévia antes de publicar.','gl-hint');notice.hidden=true;section.append(choices,notice);form.append(section);
  }
  if(kind==='item'){
   const actionsSection=el('section',null,'gl-form-section'),actionList=el('div',null,'gl-action-list'),locationSection=el('section',null,'gl-form-section');actionsSection.append(el('h3','Botões de ação'),el('p','Adicione somente os contatos e caminhos que este conteúdo precisa.'),actionList);form.append(actionsSection,locationSection);locationSection.hidden=!d.actions.some(a=>a.type==='route');
   const add=field('Adicionar botão','','select',{items:[['','Escolher uma ação…'],...Object.entries(guideActionLabels)]});actionsSection.append(add.w);add.i.addEventListener('change',()=>{if(!add.i.value)return;d.actions.push({id:uid(),type:add.i.value,label:guideActionLabels[add.i.value],primary:!d.actions.length,enabled:true});add.i.value='';renderActions();});
   let map=null;const location=bind('Endereço ou referência','address');const lat=bind('Latitude','latitude','number',{step:'any',min:-90,max:90}),lng=bind('Longitude','longitude','number',{step:'any',min:-180,max:180});locationSection.append(el('h3','Localização do destino'),location.w);
   const search=field('Encontrar no mapa','','search',{placeholder:'Nome do lugar ou endereço'}),result=el('div',null,'gl-search-results');locationSection.append(search.w,btn('Pesquisar local',async()=>{try{result.textContent='Buscando…';const res=await api.guidePlaces(getToken(),search.i.value);result.replaceChildren();if(!res.items.length)result.append(el('p','Nenhum local encontrado. Use o mapa ou as coordenadas.'));for(const place of res.items)result.append(btn(place.name+' · '+place.address,()=>{d.address=place.address||place.name;location.i.value=d.address;d.latitude=place.latitude;d.longitude=place.longitude;lat.i.value=place.latitude;lng.i.value=place.longitude;map?.setSelection({latitude:d.latitude,longitude:d.longitude,radiusKm:0.001},{recenter:true});result.replaceChildren();}));}catch(err){report(err);result.replaceChildren();}}),result);
   const coords=el('details');coords.append(el('summary','Informar coordenadas'));const grid=el('div',null,'gl-grid-2');grid.append(lat.w,lng.w);coords.append(grid);locationSection.append(coords);const mapRoot=el('div',null,'pricing-geofence-map gl-location-map'),tiles=el('div',null,'pricing-geofence-map__tiles'),overlay=el('div',null,'pricing-geofence-map__overlay'),controls=el('div',null,'pricing-geofence-map__controls'),plus=btn('+',()=>{}),minus=btn('−',()=>{});plus.setAttribute('aria-label','Aproximar mapa');minus.setAttribute('aria-label','Afastar mapa');controls.append(plus,minus);const credit=el('a','© OpenStreetMap','pricing-geofence-map__attribution');credit.href='https://www.openstreetmap.org/copyright';credit.target='_blank';credit.rel='noreferrer';mapRoot.append(tiles,overlay,controls,credit);locationSection.append(mapRoot,el('small','Toque no mapa para marcar o destino. O Guia não solicita corridas automaticamente.'));
   function ensureMap(){if(locationSection.hidden)return;requestAnimationFrame(()=>{if(!map){map=createPricingGeofenceMap({root:mapRoot,tiles,overlay,zoomIn:plus,zoomOut:minus,onChange:p=>{d.latitude=p.latitude;d.longitude=p.longitude;lat.i.value=p.latitude;lng.i.value=p.longitude;}});if(d.latitude!=null&&d.longitude!=null)map.setSelection({latitude:d.latitude,longitude:d.longitude,radiusKm:0.001},{recenter:true});}map.render();});}
   for(const i of [lat.i,lng.i])i.addEventListener('change',()=>{if(d.latitude!=null&&d.longitude!=null&&Math.abs(d.latitude)<=90&&Math.abs(d.longitude)<=180)map?.setSelection({latitude:d.latitude,longitude:d.longitude,radiusKm:0.001},{recenter:true});});
   function renderActions(){actionList.replaceChildren();locationSection.hidden=!d.actions.some(a=>a.type==='route');ensureMap();
    d.actions.forEach((a,index)=>{const card=el('div',null,'gl-action-card'),head=el('div',null,'gl-action-head');head.append(el('strong',guideActionLabels[a.type]),btn('Remover',()=>{d.actions.splice(index,1);renderActions();}));card.append(head);
     const change=(label,key,type='text',opts={})=>{const f=field(label,a[key]??'',type,opts);f.i.addEventListener('input',()=>a[key]=f.i.value);card.append(f.w);return f;};
     change('Rótulo do botão','label','text',{maxLength:48});
     if(a.type==='instagram'||a.type==='website')change(a.type==='instagram'?'Link do Instagram':'Link do site','url','url',{placeholder:'https://',maxLength:2048});
     if(a.type==='whatsapp'){change('WhatsApp com país e DDD','phone','tel',{placeholder:'55 88 99999-9999'});change('Mensagem pronta','message','textarea',{maxLength:500,rows:2});}
     if(a.type==='internal')change('Página de destino','targetId','select',{items:[['','Escolha uma página'],...rows().filter(t=>t.published&&!t.archived&&t.kind!=='locality'&&t.id!==e.id).map(t=>[t.id,t.draft.name])]});
     if(a.type==='route')card.append(el('p','Destino: a localização cadastrada abaixo.','gl-hint'));
     const tools=el('div',null,'gl-action-tools');for(const [key,label]of [['primary','Principal'],['enabled','Ativo']]){const w=el('label',label),i=el('input');i.type='checkbox';i.checked=a[key];i.addEventListener('change',()=>a[key]=i.checked);w.prepend(i);tools.append(w);}for(const [offset,label]of [[-1,'Subir botão'],[1,'Descer botão']]){const b=btn(label,()=>{[d.actions[index],d.actions[index+offset]]=[d.actions[index+offset],a];renderActions();});b.disabled=!d.actions[index+offset];tools.append(b);}card.append(tools);actionList.append(card);
    });}
   renderActions();m.d.addEventListener('close',()=>map?.destroy(),{once:true});
  }
  const extra=el('details',null,'gl-options');extra.append(el('summary','Opções adicionais'));form.append(extra);
  extra.append(bind('Descrição completa','description','textarea',{maxLength:8000,rows:4}).w);
  if(kind==='category'){const f=field('Filtros (um por linha)',d.filters.join('\n'),'textarea',{rows:3});f.i.addEventListener('input',()=>d.filters=f.i.value.split('\n').map(v=>v.trim()).filter(Boolean));extra.append(f.w);}
  if(kind==='item'){
   const tags=field('Filtros deste conteúdo (um por linha)',d.tags.join('\n'),'textarea',{rows:2,hint:(parent?.draft.filters??[]).join(' · ')});tags.i.addEventListener('input',()=>d.tags=tags.i.value.split('\n').map(v=>v.trim()).filter(Boolean));extra.append(tags.w,bind('Destaque','featured','checkbox').w,bind('Selo','badge','text',{maxLength:60}).w);
   if(['tours','events','venues'].includes(currentModel))extra.append(bind('Horários ou programação','schedule','text',{maxLength:180}).w);
   if(currentModel==='events')extra.append(bind('Data do evento','date','date').w);
   if(currentModel==='gastronomy')extra.append(bind('Tipo de culinária','cuisine','text',{maxLength:100}).w);
   if(currentModel==='tours'){extra.append(bind('Duração','duration','text',{maxLength:100}).w);for(const [key,label]of [['highlights','Pontos do roteiro'],['included','O que inclui'],['excluded','O que não inclui']]){const f=field(label,d[key].join('\n'),'textarea',{rows:3,hint:'Um por linha.'});f.i.addEventListener('input',()=>d[key]=f.i.value.split('\n').filter(Boolean));extra.append(f.w);}const price=field('Preço (R$)',d.priceCents==null?'':d.priceCents/100,'number',{min:0,step:0.01});price.i.addEventListener('input',()=>d.priceCents=price.i.value===''?null:Math.round(Number(price.i.value)*100));extra.append(bind('Rótulo do preço','priceLabel').w,price.w,bind('Complemento do preço','priceSuffix').w);}
   if(currentModel==='rules')extra.append(bind('Ícone','icon','select',{items:[['eco','Meio ambiente'],['car','Trânsito'],['trash','Descarte de lixo'],['volume','Som'],['pets','Animais'],['water','Praias'],['info','Informação']]}).w,bind('Fonte oficial','source').w,bind('Link oficial','sourceUrl','url',{placeholder:'https://'}).w,bind('Data de atualização','updatedOn','date').w);
   if(!d.actions.some(a=>a.type==='route'))extra.append(bind('Local ou referência (opcional)','address').w);
  }
  const order=bind('Ordem de exibição','order','number',{min:0,max:100000,step:1});
  if(original&&kind==='category'){
    const controls=el('div',null,'gl-action-tools'),buttons=[];
    const peers=()=>sorted(rows().filter(r=>r.kind==='category'&&r.parentId===e.parentId&&!r.archived));
    const refresh=()=>{const list=peers(),at=list.findIndex(r=>r.id===e.id);for(const [b,offset]of buttons)b.disabled=busy||at<0||!list[at+offset];};
    for(const [offset,label]of [[-1,'Mover categoria para cima'],[1,'Mover categoria para baixo']]){const b=btn(label,async()=>{const list=peers(),at=list.findIndex(r=>r.id===e.id);if(at<0||!list[at+offset])return;buttons.forEach(([button])=>button.disabled=true);await reorder(e,list,at,offset);d.order=find(e.id)?.draft.order??d.order;order.i.value=d.order;refresh();});buttons.push([b,offset]);controls.append(b);}refresh();extra.append(controls);
  }
  extra.append(order.w);
  const footer=el('footer',null,'gl-editor-footer'),save=btn('Salvar rascunho',()=>void submit(false)),publish=btn('Publicar',()=>void submit(true),true);footer.append(btn('Pré-visualizar',()=>preview(e)),save,publish);form.append(footer);
  if(original&&!duplicate){const management=el('details',null,'gl-options');management.append(el('summary','Gerenciar conteúdo'));if(e.published)management.append(btn('Despublicar',async()=>{await operation(e,'unpublish');m.d.close();}));management.append(btn(e.archived?'Restaurar':'Arquivar',async()=>{await operation(e,e.archived?'restore':'archive');m.d.close();}),btn('Versões anteriores',()=>void history(e,report,m.d)));form.append(management);}
  async function submit(live){if(!form.reportValidity()||busy)return;save.disabled=publish.disabled=true;feedback.hidden=true;try{const result=await write({op:'save',id:e.id,kind:e.kind,parentId:e.parentId,data:d});if(!result)return;if(live)await write({op:'publish',id:e.id});notify(live?'Publicado. O aplicativo já pode exibir este conteúdo.':'Rascunho salvo. A versão pública continua preservada.');if(kind==='locality')locality=e.id;if(kind==='category')category=e.id;m.d.close();render();}catch(err){report(err);}finally{save.disabled=publish.disabled=false;}}
  form.addEventListener('submit',ev=>{ev.preventDefault();void submit(false);});name.i.focus();
 }
 async function history(e,report,parentDialog){try{const result=await api.guideHistory(getToken()),m=dialog('Versões anteriores');for(const h of result.items){const old=h.state.entities.find(r=>r.id===e.id);if(!old?.published)continue;const line=el('div',null,'gl-history-line');line.append(el('span',new Date(h.createdAt).toLocaleString('pt-BR')+' · '+h.actor),btn('Restaurar como rascunho',async()=>{try{await write({op:'save',id:e.id,kind:e.kind,parentId:e.parentId,data:old.published});m.d.close();parentDialog.close();edit(find(e.id));notify('Versão recuperada como rascunho. Confira a prévia e publique quando estiver pronto.');}catch(err){report(err);}}));m.body.append(line);}if(!m.body.children.length)m.body.append(el('p','Nenhuma versão publicada anterior.'));}catch(err){report(err);}}
 function preview(e){
  const m=dialog('Pré-visualização'),phone=el('div',null,'gl-phone-preview'),d=e.draft,model=e.kind==='category'?d.template:find(e.parentId)?.draft.template;
  phone.dataset.template=model??'home';phone.append(el('span','PRÉVIA · NÃO PUBLICADO','gl-preview-label'));
  function photo(data,cls){const n=el('div',null,cls);if(data.image)void imageInto(n,data.image,data.imagePosition);return n;}
  function actionButtons(data){const actions=el('div',null,'gl-preview-actions');for(const a of data.actions.filter(a=>a.enabled&&a.type!=='none')){const b=btn(a.label||guideActionLabels[a.type],()=>{},a.primary);b.disabled=true;actions.append(b);}return actions;}
  function card(item,featured=false){const data=item.draft,row=el('article',null,featured?'gl-preview-featured':'gl-preview-list-row'),content=el('div',null,'gl-preview-copy');
   if(model!=='rules')row.append(photo(data,featured?'gl-preview-featured-photo':'gl-preview-list-photo'));else row.append(el('span','◇','gl-preview-rule-icon'));
   if(data.badge)content.append(el('small',data.badge,'gl-preview-pill'));content.append(el('h3',data.name));
   for(const text of [data.date,data.duration,data.address,data.cuisine,data.schedule])if(text)content.append(el('small',text,'gl-preview-meta'));
   if(data.summary)content.append(el('p',data.summary));row.append(content);if(data.actions.some(a=>a.enabled&&a.type!=='none'))row.append(actionButtons(data));return row;
  }
  if(e.kind==='locality'){
   phone.append(el('h2','Guia Local'),el('p','Experiências selecionadas pela Ramo Nessa Agência.'),el('strong',d.name,'gl-preview-pill'));
   const grid=el('div',null,'gl-preview-grid');for(const c of sorted(rows().filter(r=>r.parentId===e.id&&!r.archived))){const tile=el('article',null,'gl-preview-category');tile.append(photo(c.draft,'gl-preview-category-photo'),el('h3',c.draft.name),el('p',c.draft.summary));grid.append(tile);}phone.append(grid);
  }else{
   phone.append(photo(d,'gl-preview-cover'),el('h2',d.name),el('p',d.summary));
   if(e.kind==='category'){
    if(d.filters.length){const filters=el('div',null,'gl-preview-filters');for(const f of ['Todos',...d.filters])filters.append(el('span',f));phone.append(filters);}
    const items=sorted(rows().filter(r=>r.parentId===e.id&&!r.archived));
    if(model==='rules')phone.append(el('h3','Informações importantes'));
    if(model==='highlights'){
     const featured=items.filter(i=>i.draft.featured);if(featured.length){phone.append(el('h3','★ Destaques'),card(featured[0],true));if(featured.length>1){const strip=el('div',null,'gl-preview-mini');for(const item of featured.slice(1))strip.append(card(item));phone.append(strip);}phone.append(el('h3','Outras experiências'));}
     for(const item of items.filter(i=>!featured.length||!i.draft.featured))phone.append(card(item));
    }else for(const item of items)phone.append(card(item));
    if(!items.length)phone.append(el('p','Adicione os conteúdos desta categoria para completar a prévia.'));
   }else{
    for(const text of [d.date,d.duration,d.address,d.cuisine,d.schedule])if(text)phone.append(el('p',text));
    if(d.priceCents!=null)phone.append(el('strong',[d.priceLabel,(d.priceCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),d.priceSuffix].filter(Boolean).join(' '),'gl-preview-price'));
    if(d.description)phone.append(el('p',d.description));for(const [key,label]of [['highlights','Pontos do roteiro'],['included','O que inclui'],['excluded','O que não inclui']])if(d[key].length){phone.append(el('h3',label));const list=el('ul');for(const text of d[key])list.append(el('li',text));phone.append(list);}
    if(d.source)phone.append(el('p','Fonte: '+d.source));if(d.updatedOn)phone.append(el('small','Atualizado em '+d.updatedOn));phone.append(actionButtons(d));
   }
  }m.body.append(phone);
 }

 async function agencySettings(){
  try{const content=await api.communications(getToken());if(disposed)return;const m=dialog('Divulgação e Instagram'),form=el('form',null,'gl-form'),section=el('section',null,'gl-form-section'),promotion=structuredClone(content.agencyPromotion),feedback=el('p',null,'gl-feedback');feedback.hidden=true;feedback.setAttribute('role','alert');section.append(el('h3','Divulgação no mapa'),el('p','As configurações existentes estão preservadas. Salvar aqui altera a divulgação nos aplicativos.'),feedback);form.append(section);form.addEventListener('submit',ev=>ev.preventDefault());m.body.append(form);
   const enabled=field('Divulgação ativa','','checkbox');enabled.i.checked=promotion.enabled;enabled.i.addEventListener('change',()=>promotion.enabled=enabled.i.checked);section.append(enabled.w);
   for(const [key,label,maxLength]of [['title','Título',80],['subtitle','Subtítulo',120],['description','Descrição',600],['ctaLabel','Texto do botão',40],['ctaUrl','Link do botão',500]]){const f=field(label,promotion[key]??'',key==='description'?'textarea':key==='ctaUrl'?'url':'text',{maxLength,required:key!=='ctaUrl'});f.i.addEventListener('input',()=>promotion[key]=f.i.value);section.append(f.w);}
   const save=btn('Salvar divulgação',async()=>{if(!form.reportValidity())return;save.disabled=true;try{await api.updateAgencyPromotion(getToken(),promotion);feedback.textContent='Divulgação salva.';feedback.hidden=false;}catch(err){feedback.textContent=err.message;feedback.hidden=false;error(err);}finally{save.disabled=!canWrite();}},true);save.disabled=!canWrite();section.append(save);
   const social=el('section',null,'gl-form-section'),handle=field('Usuário do Instagram',content.socialLinks?.instagramHandle??'','text',{maxLength:31,placeholder:'@ramonessa'});social.append(el('h3','Instagram oficial'),handle.w);const saveSocial=btn('Salvar Instagram',async()=>{saveSocial.disabled=true;try{await api.updateSocialLinks(getToken(),{instagramHandle:handle.i.value.trim()});notify('Instagram oficial salvo.');m.d.close();}catch(err){feedback.textContent=err.message;feedback.hidden=false;error(err);}finally{saveSocial.disabled=!canWrite();}},true);saveSocial.disabled=!canWrite();social.append(saveSocial);form.append(social);
  }catch(err){error(err);}
 }
 get('agency-settings').addEventListener('click',()=>void agencySettings(),{signal:abort.signal});

 get('refresh').addEventListener('click',()=>void load(),{signal:abort.signal});get('add-locality').addEventListener('click',()=>edit(null,'locality'),{signal:abort.signal});get('add-category').addEventListener('click',()=>edit(null,'category'),{signal:abort.signal});get('add-item').addEventListener('click',()=>edit(null,'item'),{signal:abort.signal});get('edit-locality').addEventListener('click',()=>edit(find(locality)),{signal:abort.signal});get('edit-category').addEventListener('click',()=>edit(find(category)),{signal:abort.signal});get('search').addEventListener('input',ev=>{query=ev.target.value.toLocaleLowerCase('pt-BR');renderItems();},{signal:abort.signal});
 void load();return {destroy(){disposed=true;abort.abort();dialogs.forEach(d=>d.close());urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();imageCache.clear();}};
}
