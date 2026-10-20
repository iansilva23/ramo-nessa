import {createPricingCoverageMap,createPricingGeofenceMap} from './pricing-geofence-map.js';
import {icons,formatMoney,inputMoney,moneyInputCents,overlappingRegions,formatRate,nextTabIndex} from './regions-pricing-model.js';

const CATEGORY_LABELS={moto:'Mototáxi',car:'Táxi',buggy:'Buggy',delivery:'Entregas',comfort_black:'4x4 Comfort/Black'};
function node(tag,text,className){
  const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;
}
function vehicleIcon(key){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');
  svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icons[key]??icons.car);svg.append(path);return svg;
}
function button(text,onClick,primary=false){
  const b=node('button',text,'button '+(primary?'button--primary':'button--ghost'));b.type='button';b.addEventListener('click',onClick);return b;
}
function field(label,type='text',value='',options={}){
  const wrap=node('label',null,'rp-field'),caption=node('span',label);let input;
  if(type==='select'){
    input=node('select');for(const [key,name] of options.items??[]){const option=node('option',name);option.value=key;input.append(option);}
  }else{input=node('input');input.type=type;}
  input.value=String(value??'');
  for(const [key,v]of Object.entries(options))if(key!=='items'&&key!=='hint')input[key]=v;
  wrap.append(caption,input);if(options.hint)wrap.append(node('small',options.hint));return {wrap,input};
}
function check(label,checked=false){
  const wrap=node('label',null,'rp-check'),input=node('input');input.type='checkbox';input.checked=checked;
  wrap.append(input,node('span',label));return {wrap,input};
}
const asMoney=input=>moneyInputCents(input.value);
const id=prefix=>prefix+'-'+crypto.randomUUID();
const regionArea=r=>({zoneId:r.zoneId,localityId:r.id,label:r.name,centerLatitude:r.latitude,centerLongitude:r.longitude,radiusKm:r.radiusKm});
export function createRegionsPricingAdmin({root,api,getToken,hasScope,onError=()=>{}}){
  const abort=new AbortController(),dialogs=new Set();let disposed=false,busy=false,data=null,coverage=null,tab='regions';
  const get=name=>root.querySelector('[data-rp="'+name+'"]');
  // Explicit IDs document the accessible tab/panel relationship.
  const tabIds=['rp-tab-regions','rp-tab-categories','rp-tab-rates','rp-tab-settings'];
  const tabs=tabIds.map(name=>root.querySelector('#'+name));
  const canWrite=()=>hasScope('pricing:write')&&data?.prepared===true;
  const operations=()=>data?.operations??{regions:[],categories:[],rates:[]};
  const active=rows=>rows.filter(r=>!r.archived);
  const message=(text='',danger=false)=>{
    const target=get('message');if(!target||disposed)return;
    target.textContent=text;target.classList.toggle('is-error',danger);target.hidden=!text;
  };
  function error(error){
    if(disposed)return;message(error.message||'Não foi possível concluir. Tente novamente.',true);
    if(error.status===401&&error.code!=='ADMIN_LOGIN_INVALID')onError(error);
  }
  function setTab(name){
    tab=name;
    tabs.forEach(b=>{if(!b)return;const selected=b.dataset.rpTab===name;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    root.querySelectorAll('[role="tabpanel"]').forEach(p=>{p.hidden=p.id!=='rp-panel-'+name;});
    if(name==='regions')requestAnimationFrame(()=>coverage?.render());
    if(name==='settings')void loadHistory();
  }
  tabs.forEach((b,index)=>{
    b?.addEventListener('click',()=>setTab(b.dataset.rpTab),{signal:abort.signal});
    b?.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
      const target=tabs[nextTabIndex(index,event.key,tabs.length)];setTab(target.dataset.rpTab);target.focus();
    },{signal:abort.signal});
  });
  function modal(title,subtitle=''){
    const d=node('dialog',null,'rp-dialog'),header=node('header',null,'rp-dialog-header'),body=node('div',null,'rp-dialog-body');
    const heading=node('div');const h=node('h2',title);h.id=id('dialog-title');d.setAttribute('aria-labelledby',h.id);
    heading.append(h);if(subtitle)heading.append(node('p',subtitle));
    const x=button('Fechar',()=>d.close());x.classList.add('rp-close');header.append(heading,x);
    const feedback=node('div',null,'rp-dialog-message');feedback.setAttribute('role','alert');feedback.hidden=true;
    body.append(feedback);d.append(header,body);document.body.append(d);dialogs.add(d);
    d.addEventListener('close',()=>{dialogs.delete(d);d.remove();},{once:true});
    d.showModal();
    return {dialog:d,body,feedback,showError:e=>{feedback.textContent=e.message??String(e);feedback.hidden=false;feedback.scrollIntoView({block:'nearest'});}};
  }
  async function confirmCredentials(){
    return new Promise(resolve=>{
      const m=modal('Confirmar alteração','Use sua senha e um novo código do autenticador.');
      const form=node('form'),password=field('Sua senha','password','',{required:true,autocomplete:'current-password',minLength:12,maxLength:256}),
        code=field('Código MFA','text','',{required:true,inputMode:'numeric',autocomplete:'one-time-code',pattern:'[0-9]{6}',maxLength:6});
      const submit=node('button','Confirmar e salvar','button button--primary');submit.type='submit';
      form.append(password.wrap,code.wrap,node('p','Se acabou de entrar, aguarde o próximo código do autenticador.','rp-hint'),submit);
      m.body.append(form);let answered=false;
      form.addEventListener('submit',event=>{
        event.preventDefault();if(!form.reportValidity())return;
        const confirmation={password:password.input.value,totpCode:code.input.value};answered=true;
        password.input.value='';code.input.value='';m.dialog.close();resolve(confirmation);
      });
      m.dialog.addEventListener('close',()=>{password.input.value='';code.input.value='';if(!answered)resolve(null);},{once:true});
      password.input.focus();
    });
  }
  async function save(mutation,holder={}){
    if(busy||disposed)return false;
    const fingerprint=JSON.stringify(mutation);
    if(holder.fingerprint!==fingerprint){
      holder.fingerprint=fingerprint;holder.request={requestId:crypto.randomUUID(),expectedRevision:data.revision,mutation};
    }
    busy=true;root.setAttribute('aria-busy','true');
    try{
      let response;
      try{response=await api.savePricingManagement(getToken(),holder.request);}
      catch(err){
        if(err.code!=='REAUTH_REQUIRED')throw err;
        const confirmation=await confirmCredentials();if(!confirmation)return false;
        try{response=await api.savePricingManagement(getToken(),{...holder.request,confirmation});}
        finally{confirmation.password='';confirmation.totpCode='';}
      }
      if(disposed)return false;data=response;render();message('Alteração salva. A operação já usa a nova configuração.');return true;
    }catch(err){error(err);throw err;}
    finally{busy=false;if(!disposed)root.removeAttribute('aria-busy');}
  }
  function actions(row,edit,archiveKind){
    const wrap=node('div',null,'rp-card-actions'),editButton=button('Editar',()=>edit(row));
    editButton.disabled=!canWrite();const remove=button('Excluir',()=>archive(row,archiveKind));remove.classList.add('rp-delete');remove.disabled=!canWrite();
    wrap.append(editButton,remove);return wrap;
  }
  function archivedItems(rows,kind,restore){
    const archived=rows.filter(r=>r.archived);if(!archived.length)return null;
    const details=node('details',null,'rp-archived');details.append(node('summary',archived.length+' '+kind+' arquivadas'));
    for(const item of archived){
      const line=node('div',null,'rp-history-line');line.append(node('span',item.name));
      const b=button('Restaurar',async()=>{try{await save(restore(item));}catch{/* feedback retained */}});b.disabled=!canWrite();line.append(b);details.append(line);
    }
    return details;
  }
  function render(){
    if(disposed||!data)return;const ops=operations();
    const regions=active(ops.regions),categories=active(ops.categories),rates=active(ops.rates);
    get('stats').replaceChildren();
    for(const [value,label]of [[regions.filter(r=>r.enabled).length,'regiões ativas'],[categories.length,'categorias'],[rates.filter(r=>r.enabled).length,'tarifas ativas']]){
      const card=node('div',null,'rp-stat');card.append(node('strong',String(value)),node('span',label));get('stats').append(card);
    }
    get('day-hour').value=data.periodPolicy.dayStartHour;get('night-hour').value=data.periodPolicy.nightStartHour;
    for(const name of ['add-region','add-category','add-rate'])get(name).disabled=!canWrite();
    get('settings-form').querySelectorAll('input,button').forEach(n=>n.disabled=!canWrite());
    get('simulate').disabled=!data.prepared;
    const selectedRegion=get('rate-region').value,selectedCategory=get('rate-category').value;
    for(const [control,rows,label]of [[get('rate-region'),regions,'Todas as regiões'],[get('rate-category'),categories,'Todas as categorias']]){
      const selected=control===get('rate-region')?selectedRegion:selectedCategory;control.replaceChildren();
      const all=node('option',label);all.value='';control.append(all);
      rows.forEach(r=>{const option=node('option',r.name);option.value=r.id;control.append(option);});control.value=selected;
    }
    renderRegions();renderCategories();renderRates();
    coverage?.setAreas(regions.filter(r=>r.enabled).map(regionArea));
    const overlaps=regions.reduce((total,r)=>total+overlappingRegions(r,regions).length,0)/2;
    get('overlap-count').textContent=overlaps?' · '+overlaps+' sobreposições':'';
    if(!data.prepared)message('Seu catálogo atual está preservado. A nova organização será liberada após a preparação autorizada das três regiões, sem tarifas anteriores.');
    setTab(tab);
  }
  function empty(target,title,copy){
    const card=node('div',null,'rp-empty');card.append(node('span','＋','rp-empty-mark'),node('h3',title),node('p',copy));target.append(card);
  }
  function renderRegions(){
    const target=get('regions'),ops=operations(),filter=get('region-filter').value.trim().toLocaleLowerCase('pt-BR');target.replaceChildren();
    const rows=active(ops.regions).filter(r=>(r.name+' '+r.municipality).toLocaleLowerCase('pt-BR').includes(filter));
    if(!rows.length)empty(target,data.prepared?'Sua próxima região começa aqui':'Catálogo atual preservado',data.prepared?'Adicione o lugar, ajuste a cobertura e selecione os serviços.':'A preparação será executada somente com autorização.');
    rows.forEach(r=>{
      const card=node('article',null,'rp-region-card'),top=node('div',null,'rp-card-top'),mark=node('span',null,'rp-place-mark');mark.append(vehicleIcon('car'));
      const names=node('div');names.append(node('h3',r.name),node('p',r.municipality+' · '+r.state));
      top.append(mark,names);
      const configured=ops.rates.filter(rate=>rate.enabled&&!rate.archived&&(rate.originRegionId===r.id||rate.destinationRegionId===r.id)).length;
      card.append(top,node('span',!r.enabled?'Desativada':configured?'Ativa':'Sem tarifas',configured&&r.enabled?'rp-badge is-active':'rp-badge'));
      const categories=r.categoryIds.map(c=>ops.categories.find(v=>v.id===c)?.name).filter(Boolean);
      card.append(node('p',r.radiusKm.toLocaleString('pt-BR')+' km de cobertura','rp-region-radius'),node('p',categories.join(' · ')||'Nenhuma categoria selecionada','rp-hint'),actions(r,openRegion,'region'));
      target.append(card);
    });
    const archived=archivedItems(ops.regions,'regiões',r=>({kind:'region.save',region:{...r,archived:false,enabled:false}}));if(archived)target.append(archived);
  }
  function renderCategories(){
    const target=get('categories'),ops=operations();target.replaceChildren();
    active(ops.categories).forEach(c=>{
      const card=node('article',null,'rp-category-card'),icon=node('div',null,'rp-vehicle');icon.append(vehicleIcon(c.icon));
      const supported=data.supportedCategoryIds.includes(c.id);
      card.append(icon,node('span',!supported?'Aguardando suporte':c.enabled?'Ativa':'Desativada',c.enabled&&supported?'rp-badge is-active':'rp-badge'),
        node('h3',c.name),node('p',c.description||'Serviço configurável por região.','rp-hint'));
      card.append(node('p',c.maxPassengers+' passageiro'+(c.maxPassengers===1?'':'s')+' · '+ops.regions.filter(r=>r.enabled&&!r.archived&&r.categoryIds.includes(c.id)).length+' regiões','rp-category-info'));
      card.append(actions(c,openCategory,'category'));target.append(card);
    });
    const archived=archivedItems(ops.categories,'categorias',c=>({kind:'category.save',category:{...c,archived:false,enabled:false}}));if(archived)target.append(archived);
  }
  function renderRates(){
    const target=get('rates'),ops=operations(),region=get('rate-region').value,category=get('rate-category').value;target.replaceChildren();
    const rows=active(ops.rates).filter(r=>(!region||[r.originRegionId,r.destinationRegionId].includes(region))&&(!category||category===r.categoryId));
    if(!rows.length)empty(target,'Você define os preços','Cadastre uma tarifa fixa ou por quilômetro. Sem tarifa válida, a corrida fica indisponível.');
    rows.forEach(r=>{
      const card=node('article',null,'rp-rate-card'),a=ops.regions.find(x=>x.id===r.originRegionId),b=ops.regions.find(x=>x.id===r.destinationRegionId),
        c=ops.categories.find(x=>x.id===r.categoryId),heading=node('div',null,'rp-rate-route');
      heading.append(node('span',r.kind==='fixed'?'PREÇO FIXO':'POR QUILÔMETRO','rp-eyebrow'),node('h3',a?.name+' '+(r.bidirectional?'↔':'→')+' '+b?.name),node('p',c?.name+' · '+r.name));
      const prices=node('div',null,'rp-rate-prices');
      for(const [period,label]of [['day','Dia'],['night','Noite']]){const line=node('div');line.append(node('small',label),node('strong',formatRate(r,period)));prices.append(line);}
      card.append(heading,prices,node('span',r.enabled?'Ativa':'Desativada',r.enabled?'rp-badge is-active':'rp-badge'),actions(r,openRate,'rate'));target.append(card);
    });
    const archived=archivedItems(ops.rates,'tarifas',r=>({kind:'rate.save',rate:{...r,archived:false,enabled:false}}));if(archived)target.append(archived);
  }
  async function archive(row,kind){
    const m=modal('Excluir '+(kind==='region'?'região':kind==='category'?'categoria':'tarifa'));
    const ops=operations(),dependents=ops.rates.filter(r=>r.enabled&&!r.archived&&
      (kind==='region'?[r.originRegionId,r.destinationRegionId].includes(row.id):kind==='category'?r.categoryId===row.id:false)).length;
    m.body.append(node('p','“'+row.name+'” sairá da operação. '+(dependents?dependents+' tarifas relacionadas serão desativadas. ':'')+'O histórico será preservado.'));
    const holder={},submit=button('Excluir com segurança',async()=>{
      submit.disabled=true;try{if(await save({kind:kind+'.archive',id:row.id},holder))m.dialog.close();}catch(err){m.showError(err);}finally{submit.disabled=false;}
    },true);m.body.append(submit);
  }
  function tariffFields(container,initial={},regionOptions=operations().regions.filter(r=>!r.archived),categoryOptions=operations().categories.filter(c=>!c.archived)){
    const grid=node('div',null,'rp-form-grid');
    const name=field('Nome da tarifa','text',initial.name??'',{required:true,maxLength:100});
    const kind=field('Forma de cobrança','select',initial.kind??'fixed',{items:[['fixed','Preço fixo'],['distance','Por quilômetro']]});
    const category=field('Categoria','select',initial.categoryId??categoryOptions[0]?.id??'',{items:categoryOptions.map(c=>[c.id,c.name]),required:true});
    const origin=field('Origem','select',initial.originRegionId??regionOptions[0]?.id??'',{items:regionOptions.map(r=>[r.id,r.name]),required:true});
    const destination=field('Destino','select',initial.destinationRegionId??regionOptions[0]?.id??'',{items:regionOptions.map(r=>[r.id,r.name]),required:true});
    const both=check('Usar o mesmo preço na volta',initial.bidirectional??true),enabled=check('Tarifa ativa',initial.enabled??true);
    grid.append(name.wrap,kind.wrap,category.wrap,origin.wrap,destination.wrap);container.append(grid,both.wrap);
    const periodGrid=node('div',null,'rp-form-grid'),periodInputs={};
    for(const [key,label]of [['day','Dia'],['night','Noite']]){
      const box=node('fieldset',null,'rp-period-box'),legend=node('legend',label),use=check('Atender neste período',initial[key]!=null);
      const price=field('Preço (R$)','number',inputMoney(initial[key]?.amountCents),{min:'0.01',step:'0.01',inputMode:'decimal'});
      const minimum=field('Valor mínimo (R$)','number',inputMoney(initial[key]?.minimumCents),{min:'0',step:'0.01',inputMode:'decimal'});
      function sync(){price.input.disabled=!use.input.checked;minimum.input.disabled=!use.input.checked;price.input.required=use.input.checked;minimum.wrap.hidden=kind.input.value!=='distance';}
      use.input.addEventListener('change',sync);kind.input.addEventListener('change',sync);sync();
      price.input.addEventListener('input',()=>{if(kind.input.value==='distance'&&minimum.input.value==='')minimum.input.value='0.00';});
      box.append(legend,use.wrap,price.wrap,minimum.wrap);periodGrid.append(box);periodInputs[key]={use,price,minimum};
    }
    container.append(periodGrid);
    const advanced=node('details',null,'rp-advanced');advanced.append(node('summary','Passageiros e adicionais'));
    const included=field('Passageiros incluídos','number',initial.includedPassengers??1,{min:'1',max:'4',step:'1',required:true});
    const extra=field('Adicional por passageiro extra (R$)','number',inputMoney(initial.perExtraPassengerCents??0),{min:'0',step:'0.01',inputMode:'decimal'});
    const extras=node('div',null,'rp-extra-list');let extraRows=[];
    const addExtra=(current={})=>{
      const row=node('div',null,'rp-extra-row'),name=field('Nome do adicional','text',current.name??'',{required:true,maxLength:80}),
        price=field('Valor (R$)','number',inputMoney(current.amountCents),{required:true,min:'0',step:'0.01',inputMode:'decimal'}),
        period=field('Quando cobrar','select',current.period??'all',{items:[['all','Dia e noite'],['day','Só de dia'],['after_22','Só à noite']]});
      const entry={row,name,price,period};const remove=button('Remover',()=>{extraRows=extraRows.filter(r=>r!==entry);row.remove();});
      row.append(name.wrap,price.wrap,period.wrap,remove);extraRows.push(entry);extras.append(row);
    };
    for(const item of initial.extras??[])addExtra(item);
    const add=button('Adicionar cobrança extra',()=>{if(extraRows.length<10)addExtra();});
    advanced.append(included.wrap,extra.wrap,extras,add);container.append(advanced,enabled.wrap);
    const stableId=initial.id??id('rate');
    return {
      category,origin,destination,
      read(){
        const readPeriod=key=>{const p=periodInputs[key];return p.use.input.checked?{amountCents:asMoney(p.price.input),minimumCents:kind.input.value==='distance'?moneyInputCents(p.minimum.input.value||'0'):0}:null;};
        return {id:stableId,name:name.input.value.trim(),kind:kind.input.value,categoryId:category.input.value,originRegionId:origin.input.value,destinationRegionId:destination.input.value,
          bidirectional:both.input.checked,enabled:enabled.input.checked,archived:false,day:readPeriod('day'),night:readPeriod('night'),
          includedPassengers:Number(included.input.value),perExtraPassengerCents:asMoney(extra.input),
          extras:extraRows.map(r=>({name:r.name.input.value.trim(),amountCents:asMoney(r.price.input),period:r.period.input.value}))};
      },
    };
  }
  function openRate(initial={}){
    const m=modal(initial.id?'Editar tarifa':'Adicionar tarifa','O valor fixo tem prioridade sobre a cobrança por quilômetro.');
    const form=node('form'),controls=tariffFields(form,initial),holder={},submit=node('button','Salvar tarifa','button button--primary');submit.type='submit';form.append(submit);m.body.append(form);
    form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;submit.disabled=true;
      try{if(await save({kind:'rate.save',rate:controls.read()},holder))m.dialog.close();}catch(err){m.showError(err);}finally{submit.disabled=false;}
    });
  }
  function openCategory(initial={}){
    const fresh=!initial.id,m=modal(fresh?'Adicionar categoria':'Editar categoria');
    const form=node('form'),name=field('Nome','text',initial.name??'',{required:true,maxLength:100}),
      description=field('Descrição curta','text',initial.description??'',{maxLength:300}),
      icon=field('Ícone','select',initial.icon??'car',{items:Object.entries(CATEGORY_LABELS)}),
      capacity=field('Quantidade máxima de passageiros','number',initial.maxPassengers??1,{min:'1',max:'4',step:'1',required:true}),
      four=check('Exigir veículo 4x4 em trajetos de Jericoacoara',initial.requiresFourByFourOnJeriBoundary??false),
      enabled=check('Categoria ativa',initial.enabled??false),holder={};
    const supported=!fresh&&data.supportedCategoryIds.includes(initial.id);
    enabled.input.disabled=!supported;
    form.append(name.wrap,description.wrap,icon.wrap,capacity.wrap,four.wrap,enabled.wrap);
    if(!supported)form.append(node('p','Novos tipos ficam desativados até terem suporte real de veículos, motoristas e aplicativos.','rp-hint'));
    const stableId=initial.id??id('category'),submit=node('button','Salvar categoria','button button--primary');submit.type='submit';form.append(submit);m.body.append(form);
    form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;submit.disabled=true;
      try{if(await save({kind:'category.save',category:{id:stableId,name:name.input.value,description:description.input.value,icon:icon.input.value,
        maxPassengers:Number(capacity.input.value),requiresFourByFourOnJeriBoundary:four.input.checked,enabled:supported&&enabled.input.checked,archived:false}},holder))m.dialog.close();
      }catch(err){m.showError(err);}finally{submit.disabled=false;}
    });
  }
  function openRegion(initial={}){
    const fresh=!initial.id,stableId=initial.id??id('region'),ops=operations(),m=modal(fresh?'Adicionar região':'Editar região','Quatro passos para configurar o atendimento.');
    const form=node('form'),steps=node('ol',null,'rp-wizard-steps'),panels=[],labels=['Localização','Operação','Tarifas','Confirmar'];
    labels.forEach((label,i)=>{steps.append(node('li',String(i+1)+' '+label));const panel=node('section');panel.hidden=i!==0;panel.append(node('h3',label));panels.push(panel);});form.append(steps,...panels);
    const name=field('Nome da região','text',initial.name??'',{required:true,maxLength:100}),
      search=field('Pesquisar no mapa','search','',{placeholder:'Ex.: Preá, Cruz, Ceará',maxLength:160}),
      municipality=field('Município','text',initial.municipality??'',{required:true,maxLength:100}),
      state=field('Estado','select',initial.state??'CE',{items:['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf=>[uf,uf])}),
      radius=field('Raio de cobertura (km)','number',initial.radiusKm??'',{required:true,min:'0.05',max:'100',step:'0.05',inputMode:'decimal'});
    const municipalityChoices=node('datalist');municipalityChoices.id=id('municipalities');
    municipality.input.setAttribute('list',municipalityChoices.id);
    for(const name of new Set(['Cruz','Jijoca de Jericoacoara',...ops.regions.map(r=>r.municipality)])){
      const option=node('option');option.value=name;municipalityChoices.append(option);
    }
    panels[0].append(municipalityChoices);
    const searchRow=node('div',null,'rp-search-row'),searchButton=button('Buscar',()=>void findPlaces()),results=node('div',null,'rp-search-results');
    searchRow.append(search.wrap,searchButton);panels[0].append(name.wrap,searchRow,results);
    const grid=node('div',null,'rp-form-grid');grid.append(municipality.wrap,state.wrap,radius.wrap);panels[0].append(grid);
    const mapRoot=node('div',null,'pricing-geofence-map rp-editor-map'),tiles=node('div',null,'pricing-geofence-map__tiles'),overlay=node('div',null,'pricing-geofence-map__overlay'),
      zoom=node('div',null,'pricing-geofence-map__controls'),plus=button('+',()=>{}),minus=button('−',()=>{});
    plus.setAttribute('aria-label','Aproximar mapa');minus.setAttribute('aria-label','Afastar mapa');zoom.append(plus,minus);
    const attr=node('a','© OpenStreetMap','pricing-geofence-map__attribution');attr.href='https://www.openstreetmap.org/copyright';attr.target='_blank';attr.rel='noreferrer';
    mapRoot.append(tiles,overlay,zoom,attr);mapRoot.tabIndex=0;mapRoot.setAttribute('role','region');mapRoot.setAttribute('aria-label','Posicionar região no mapa');
    const coords=node('p',fresh?'Clique no mapa ou selecione um resultado da busca.':'','rp-hint'),overlaps=node('p',null,'rp-overlap-note');
    panels[0].append(mapRoot,coords,overlaps,node('p','Arraste o alfinete para mover a região. Arraste a borda para ajustar o raio.','rp-hint'));
    let positioned=!fresh,selection={latitude:initial.latitude??-2.84,longitude:initial.longitude??-40.44,radiusKm:initial.radiusKm??0.05};
    function reportSelection(next){
      selection=next;positioned=true;radius.input.value=Number(next.radiusKm.toFixed(2));coords.textContent='Ponto selecionado: '+next.latitude.toFixed(5)+', '+next.longitude.toFixed(5);
      const shared=overlappingRegions({...selection,id:stableId},ops.regions);
      overlaps.textContent=shared.length?'Sobreposição com '+shared.map(r=>r.name).join(', ')+'. A menor área de cobertura define a região do ponto.':'';
    }
    const map=createPricingGeofenceMap({root:mapRoot,tiles,overlay,zoomIn:plus,zoomOut:minus,onChange:reportSelection,canSelect:()=>true});
    map.setSelection(selection);map.setOtherAreas?.(ops.regions.filter(r=>r.enabled&&!r.archived&&r.id!==stableId).map(regionArea));
    if(positioned)reportSelection(selection);
    radius.input.addEventListener('input',()=>{const value=Number(radius.input.value);if(value>=0.05&&value<=100){map.setRadiusKm(value);selection={...map.getSelection()};if(positioned)reportSelection(selection);}});
    let searchSequence=0;
    async function findPlaces(){
      const seq=++searchSequence,query=search.input.value.trim();if(query.length<3){m.showError('Digite pelo menos três caracteres.');return;}
      searchButton.disabled=true;results.replaceChildren(node('p','Buscando…','rp-hint'));
      try{const response=await api.searchPricingRegion(getToken(),query);if(disposed||!m.dialog.open||seq!==searchSequence)return;
        results.replaceChildren();response.items.forEach(place=>{
          const choose=button(place.name+' · '+place.address,()=>{
            name.input.value=name.input.value||place.name;selection={latitude:place.latitude,longitude:place.longitude,radiusKm:Number(radius.input.value)||0.05};
            map.setSelection(selection);reportSelection(selection);results.replaceChildren();});
          choose.classList.add('rp-search-result');results.append(choose);
        });
        if(!response.items.length)results.append(node('p','Nenhum resultado. Você pode posicionar o alfinete no mapa.','rp-hint'));
      }catch(err){if(seq===searchSequence&&m.dialog.open)m.showError(err);}finally{searchButton.disabled=false;}
    }
    search.input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void findPlaces();}});
    const choices=active(ops.categories).map(c=>({id:c.id,...check(c.name,initial.categoryIds?.includes(c.id)??false)}));
    choices.forEach(c=>panels[1].append(c.wrap));panels[1].append(node('p','Uma categoria só poderá receber corridas quando tiver tarifa válida e motorista compatível.','rp-hint'));
    const enabled=check('Região ativa',initial.enabled??true);panels[1].append(enabled.wrap);
    const addTariff=check('Definir uma tarifa agora',false),tariffContainer=node('div');tariffContainer.hidden=true;
    const placeholder={id:stableId,name:initial.name??'Esta região'};
    const tariff=tariffFields(tariffContainer,{originRegionId:stableId,destinationRegionId:stableId},[...active(ops.regions).filter(r=>r.id!==stableId),placeholder],active(ops.categories));
    tariff.origin.input.value=stableId;tariff.destination.input.value=stableId;
    addTariff.input.addEventListener('change',()=>{tariffContainer.hidden=!addTariff.input.checked;tariffContainer.querySelectorAll('input,select,button').forEach(i=>i.disabled=!addTariff.input.checked);});
    tariffContainer.querySelectorAll('input,select,button').forEach(i=>i.disabled=true);
    panels[2].append(node('p','Você pode cadastrar os preços agora ou depois. Sem tarifa válida, a opção fica indisponível.','rp-hint'),addTariff.wrap,tariffContainer);
    const summary=node('div',null,'rp-review-summary');panels[3].append(summary);
    const footer=node('footer',null,'rp-dialog-footer'),back=button('Voltar',()=>showStep(step-1)),next=button('Continuar',()=>{if(validStep())showStep(step+1);},true);
    const saveButton=node('button','Salvar região','button button--primary');saveButton.type='submit';saveButton.hidden=true;footer.append(back,next,saveButton);form.append(footer);m.body.append(form);
    let step=0;const holder={};
    function readRegion(){return {id:stableId,zoneId:initial.zoneId??'external',name:name.input.value.trim(),municipality:municipality.input.value.trim(),state:state.input.value,
      ...selection,radiusKm:Number(radius.input.value),categoryIds:choices.filter(c=>c.input.checked).map(c=>c.id),enabled:enabled.input.checked,archived:false};}
    function validStep(){
      for(const input of panels[step].querySelectorAll('input,select'))if(!input.disabled&&!input.checkValidity()){input.reportValidity();return false;}
      if(step===0&&!positioned){m.showError('Selecione o ponto da região no mapa.');return false;}
      return true;
    }
    function showStep(n){
      if(n<0||n>3)return;step=n;m.feedback.hidden=true;panels.forEach((p,i)=>p.hidden=i!==n);
      [...steps.children].forEach((li,i)=>{li.classList.toggle('is-current',i===n);if(i===n)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
      back.hidden=n===0;next.hidden=n===3;saveButton.hidden=n!==3;
      if(n===0)requestAnimationFrame(()=>map.render());
      if(n===2){for(const select of [tariff.origin.input,tariff.destination.input])for(const option of select.options)if(option.value===stableId)option.textContent=name.input.value;}
      if(n===3){const r=readRegion();summary.replaceChildren(node('h3',r.name),node('p',r.municipality+' · '+r.state),
        node('p',r.radiusKm+' km de cobertura'),node('p',choices.filter(c=>c.input.checked).map(c=>c.wrap.textContent).join(' · ')||'Sem categorias'));
        if(addTariff.input.checked){try{const rate=tariff.read();summary.append(node('p','Dia: '+formatRate(rate,'day')),node('p','Noite: '+formatRate(rate,'night')));}catch(err){showStep(2);m.showError(err);}}
        else summary.append(node('p','Nenhuma nova tarifa será adicionada.','rp-hint'));}
      panels[n].querySelector('input,select')?.focus();
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(step!==3){if(validStep())showStep(step+1);return;}saveButton.disabled=true;
      try{const region=readRegion();const mutation={kind:'region.save',region,...(addTariff.input.checked?{rates:[tariff.read()]}:{})};
        if(await save(mutation,holder))m.dialog.close();
      }catch(err){m.showError(err);}finally{saveButton.disabled=false;}
    });
    m.dialog.addEventListener('close',()=>{searchSequence++;map.destroy();},{once:true});showStep(0);
  }
  function openSimulation(){
    const ops=operations(),regions=active(ops.regions).filter(r=>r.enabled),categories=active(ops.categories).filter(c=>c.enabled&&data.supportedCategoryIds.includes(c.id));
    const m=modal('Simular corrida','Usa os pontos centrais das regiões e uma rota calculada no servidor. Não cria corrida ou cobrança.');
    const form=node('form'),origin=field('Origem','select',regions[0]?.id,{items:regions.map(r=>[r.id,r.name]),required:true}),
      destination=field('Destino','select',regions[0]?.id,{items:regions.map(r=>[r.id,r.name]),required:true}),
      category=field('Categoria','select',categories[0]?.id,{items:categories.map(c=>[c.id,c.name]),required:true}),
      period=field('Período','select','day',{items:[['day','Dia'],['after_22','Noite']]}),
      passengers=field('Passageiros','number',1,{required:true,min:'1',max:'4',step:'1'}),
      submit=node('button','Calcular preço','button button--primary'),result=node('div',null,'rp-simulation-result');submit.type='submit';
    form.append(origin.wrap,destination.wrap,category.wrap,period.wrap,passengers.wrap,submit,result);m.body.append(form);
    form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;submit.disabled=true;
      try{const a=regions.find(r=>r.id===origin.input.value),b=regions.find(r=>r.id===destination.input.value);
        if(!a||!b)throw Error('Selecione duas regiões válidas.');
        const response=await api.simulatePricing(getToken(),{origin:{zoneId:a.zoneId,localityId:a.id},destination:{zoneId:b.zoneId,localityId:b.id},
          category:category.input.value,period:period.input.value,passengers:Number(passengers.input.value),
          pickup:{latitude:a.latitude,longitude:a.longitude},dropoff:{latitude:b.latitude,longitude:b.longitude}});
        result.replaceChildren(node('strong',formatMoney(response.quote.totalAmountCents)),node('span','Preço calculado · nenhuma cobrança realizada'));
      }catch(err){result.replaceChildren();m.showError(err);}finally{submit.disabled=false;}
    });
  }
  async function loadHistory(){
    const target=get('history');if(!target||disposed)return;target.textContent='Carregando histórico…';
    try{const response=await api.pricingManagementHistory(getToken());if(disposed)return;target.replaceChildren();
      response.items.forEach(item=>{const line=node('div',null,'rp-history-line');line.append(node('span',new Date(item.date).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})),node('strong',item.actor));target.append(line);});
    }catch(err){error(err);}
  }
  async function load(){
    if(disposed||busy)return;get('refresh').disabled=true;root.setAttribute('aria-busy','true');
    try{const response=await api.pricingManagement(getToken());if(disposed)return;data=response;message();render();}
    catch(err){error(err);}finally{if(!disposed){get('refresh').disabled=false;root.removeAttribute('aria-busy');}}
  }
  get('refresh').addEventListener('click',()=>void load(),{signal:abort.signal});
  get('region-filter').addEventListener('input',renderRegions,{signal:abort.signal});
  get('rate-region').addEventListener('change',renderRates,{signal:abort.signal});
  get('rate-category').addEventListener('change',renderRates,{signal:abort.signal});
  get('add-region').addEventListener('click',()=>openRegion(),{signal:abort.signal});
  get('add-category').addEventListener('click',()=>openCategory(),{signal:abort.signal});
  get('add-rate').addEventListener('click',()=>openRate(),{signal:abort.signal});
  get('simulate').addEventListener('click',openSimulation,{signal:abort.signal});
  const settingsHolder={};
  get('settings-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!event.currentTarget.reportValidity())return;
    try{await save({kind:'settings.save',nightStartHour:Number(get('night-hour').value),dayStartHour:Number(get('day-hour').value)},settingsHolder);}catch{/* feedback retained */}
  },{signal:abort.signal});
  coverage=createPricingCoverageMap({root:get('coverage-map'),tiles:get('coverage-tiles'),overlay:get('coverage-overlay'),zoomIn:get('coverage-plus'),zoomOut:get('coverage-minus'),
    onSelect:area=>{if(canWrite()){const region=operations().regions.find(r=>r.id===area.localityId);if(region)openRegion(region);}}});
  void load();
  return {destroy(){disposed=true;abort.abort();coverage?.destroy();dialogs.forEach(d=>d.close());dialogs.clear();}};
}
