const labels={moto:'Mototáxi',car:'Carro popular',buggy:'Buggy',delivery:'Entregas',comfort_black:'Comfort / Black'};
const states={awaiting_pix:'Aguardando Pix',review:'Para analisar',approved:'Aguardando devolução',refunded:'Concluído'};
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
function field(label,type='text',value=''){const wrap=el('label',label);const control=el('input');control.type=type;control.value=value;wrap.append(control);return {wrap,control};}
export function createCancellationAdmin({root,api,getToken,hasScope}){
 const host=root.querySelector('[data-manual-refunds]');if(!host)return;
 const heading=root.querySelector('.page-heading');if(heading)heading.after(host);
 let policy=null,items=[],filter='review',busy=false;const writable=hasScope('finance:write');
 host.replaceChildren();
 const header=el('div',null,'page-heading');header.append(el('h2','Cancelamentos e devoluções'),el('p','Analise o caso, faça o Pix pelo banco e registre o comprovante. Nenhum botão desta área envia dinheiro.'));
 const message=el('p','Carregando…','admin-feedback');message.setAttribute('role','status');
 const switchCard=el('div',null,'panel-card manual-refund-policy manual-refund-activation');
 const system=field('Ativar sistema de cancelamento','checkbox');
 system.wrap.classList.add('admin-policy-toggle');
 const systemStatus=el('p',null,'admin-policy-note');
 const switchHelp=el('p','Desativado: sem botão, contagem, taxa ou novas devoluções manuais deste sistema. Você pode preparar as regras abaixo antes de ativar.');
 const saveSwitch=el('button','Salvar ativação','button button--primary');saveSwitch.type='button';
 switchCard.append(system.wrap,systemStatus,switchHelp,saveSwitch);
 const settings=el('details',null,'panel-card');settings.append(el('summary','Regras por categoria'));
 const ruleForm=el('div',null,'manual-refund-policy');
 const choose=el('select');choose.setAttribute('aria-label','Categoria');
 Object.entries(labels).forEach(([key,name])=>{const o=el('option',name);o.value=key;choose.append(o);});
 const enabled=field('Cobrar taxa após o prazo gratuito','checkbox');const fee=field('Taxa de cancelamento (R$)','number');
 fee.control.min='0';fee.control.max='1000';fee.control.step='.01';
 const seconds=field('Prazo gratuito após o aceite (segundos)','number');seconds.control.min='0';seconds.control.max='300';seconds.control.step='1';
 const save=el('button','Salvar categoria','button button--primary');save.type='button';
 const help=el('p','A taxa vai integralmente para o motorista. Alterações valem para novas corridas; as já solicitadas mantêm a regra anterior.');
 ruleForm.append(choose,enabled.wrap,fee.wrap,seconds.wrap,help,save);settings.append(ruleForm);
 const tabs=el('nav',null,'manual-refund-tabs');tabs.setAttribute('aria-label','Etapas da devolução');
 const list=el('div',null,'manual-refund-list');
 const detail=el('div',null,'manual-refund-detail');detail.setAttribute('aria-live','polite');
 const refresh=el('button','Atualizar casos','button button--ghost-dark');refresh.type='button';
 host.append(header,switchCard,settings,refresh,tabs,message,list,detail);
 const request=(path,method='GET',body)=>api.manualRefundRequest(getToken(),path,method,body);
 function renderRule(){
  if(!policy)return;const r=policy.rules[choose.value];enabled.control.checked=r.enabled;fee.control.value=r.feeCents==null?'':(r.feeCents/100).toFixed(2);seconds.control.value=r.freeSeconds;
  system.control.checked=policy.systemEnabled===true;
  systemStatus.textContent=policy.systemEnabled?'Sistema ativado':'Sistema desativado';
  [system.control,saveSwitch,enabled.control,fee.control,seconds.control,save].forEach(n=>n.disabled=!writable||busy);
 }
 choose.addEventListener('change',()=>{renderRule();message.textContent='Categoria selecionada. Salve antes de trocar para manter alterações.';});
 async function execute(action){if(busy)return;busy=true;save.disabled=true;saveSwitch.disabled=true;system.control.disabled=true;refresh.disabled=true;
  try{await action();}catch(e){message.textContent=e.message||'Não foi possível concluir. Atualize antes de tentar novamente.';}
  finally{busy=false;refresh.disabled=false;renderRule();}}
 saveSwitch.addEventListener('click',()=>execute(async()=>{
  if(!writable||!policy)return;
  policy=await request('/v1/admin/cancellation-policy','PUT',{rules:policy.rules,revision:policy.revision,systemEnabled:system.control.checked});
  message.textContent=policy.systemEnabled?'Sistema ativado. O botão aparecerá para corridas elegíveis ao atualizar a tela.':'Sistema desativado. Botão, contagem, taxas e novos casos manuais estão desligados.';
 }));
 save.addEventListener('click',()=>execute(async()=>{
  if(!writable||!policy)return;
  if(seconds.control.value.trim()===''||(enabled.control.checked&&fee.control.value.trim()===''))throw Error('Preencha o prazo e o valor antes de ativar a taxa.');
  const rules=structuredClone(policy.rules);rules[choose.value]={enabled:enabled.control.checked,freeSeconds:Number(seconds.control.value),feeCents:fee.control.value.trim()===''?null:Math.round(Number(fee.control.value)*100)};
  policy=await request('/v1/admin/cancellation-policy','PUT',{rules,revision:policy.revision,systemEnabled:policy.systemEnabled===true});
  renderRule();message.textContent='Categoria salva. Novas corridas usarão esta regra.';
 }));
 function renderList(){
  tabs.replaceChildren();[['review','Para analisar'],['approved','Aguardando devolução'],['refunded','Concluídos']].forEach(([key,name])=>{
   const count=items.filter(c=>key==='review'?['review','awaiting_pix'].includes(c.status):c.status===key).length;
   const b=el('button',name+' ('+count+')','button '+(filter===key?'button--primary':'button--ghost-dark'));b.type='button';b.setAttribute('aria-pressed',String(filter===key));
   b.onclick=()=>{filter=key;detail.replaceChildren();renderList();};tabs.append(b);
  });
  list.replaceChildren();const current=items.filter(c=>filter==='review'?['review','awaiting_pix'].includes(c.status):c.status===filter);
  if(!current.length)list.append(el('p','Nenhum caso nesta etapa.'));
  for(const c of current){
   const card=el('article',null,'panel-card manual-refund-row');
   const info=el('div');info.append(el('strong',c.passengerName||'Passageiro sem nome cadastrado'),el('p',(labels[c.category]||'Corrida')+' · '+states[c.status]),el('small','Motorista: '+(c.driverName||'Não atribuído')));
   const amounts=el('div');amounts.append(el('strong','A devolver: '+money(c.paidCents-c.feeCents)),el('p','Pago: '+money(c.paidCents)+' · Taxa: '+money(c.feeCents)));
   const open=el('button','Abrir ficha','button button--ghost-dark');open.type='button';open.onclick=()=>execute(async()=>{settings.open=false;renderDetail({...c,...await request('/v1/admin/manual-refunds/'+c.rideId)});});
   card.append(info,amounts,open);list.append(card);
  }
 }
 function renderDetail(c){
  detail.replaceChildren();const title=el('h3','Devolução de '+(c.passengerName||'passageiro'));detail.append(title);
  detail.append(el('p','Motorista: '+(c.driverName||'Não atribuído')+' · '+(labels[c.category]||'')),el('p','Motivo: '+c.reason),
   el('p','Valor pago: '+money(c.paidCents)),el('p','Crédito preservado do motorista: '+money(c.creditedFeeCents)),
   el('p','Custo da empresa por isenção: '+money(c.creditedFeeCents-c.feeCents)));
  detail.append(el('p','Cancelamento: '+new Date(c.createdAt).toLocaleString('pt-BR')));
  if(c.terms)detail.append(el('p','Aceite: '+(c.terms.acceptedAt?new Date(c.terms.acceptedAt).toLocaleString('pt-BR'):'Sem aceite')+' · Prazo gratuito: '+c.terms.rule.freeSeconds+'s'));
  const id=el('details');id.append(el('summary','Referência da corrida'),el('code',c.rideId));detail.append(id);
  if(c.pix){
   const pix=el('article',null,'panel-card');pix.append(el('strong','Dados para o Pix'),el('p','Titular informado: '+c.pix.holder),el('p','Tipo: '+c.pix.type),el('code',c.pix.key));
   const copy=el('button','Copiar chave Pix','button button--ghost-dark');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(c.pix.key);message.textContent='Chave copiada. Confira o titular no banco antes de transferir.';}catch{message.textContent='Não foi possível copiar. Selecione a chave exibida.';}};pix.append(copy);detail.append(pix);
  }else detail.append(el('p','Aguardando os dados Pix do passageiro. O cancelamento já liberou o motorista.'));
  if(c.status==='refunded'){
   detail.append(el('strong',c.paidCents===c.feeCents?'Concluído sem valor a devolver':'Devolução concluída: '+money(c.paidCents-c.feeCents)));
   if(c.bankReference)detail.append(el('p','Identificador bancário: '+c.bankReference));
   if(c.receipt){const download=el('button','Baixar comprovante','button button--ghost-dark');download.type='button';download.onclick=()=>{
    const bytes=Uint8Array.from(atob(c.receipt.base64),ch=>ch.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:c.receipt.contentType}));
    const a=el('a');a.href=url;a.download=c.receipt.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   };detail.append(download);}return;
  }
  const review=el('form',null,'manual-refund-policy');
  const f=field('Taxa final a descontar do passageiro (R$)','number',(c.feeCents/100).toFixed(2));f.control.min='0';f.control.max=(c.creditedFeeCents/100).toFixed(2);f.control.step='.01';f.control.required=true;
  const note=field('Justificativa da análise');note.control.required=true;note.control.maxLength=500;
  const summary=el('strong');function amount(){summary.textContent='Devolver: '+money(c.paidCents-Math.round(Number(f.control.value)*100))+' · A diferença da taxa sai da empresa.';}f.control.oninput=amount;amount();
  const approve=el('button','Aprovar devolução manual','button button--primary');approve.type='submit';
  [f.control,note.control,approve].forEach(n=>n.disabled=!writable);
  review.append(f.wrap,note.wrap,summary,approve);
  if(c.status==='approved'){const revise=el('details');revise.append(el('summary','Revisar taxa aprovada'),review);detail.append(revise);}else detail.append(review);
  review.onsubmit=e=>{e.preventDefault();execute(async()=>{
   const result=await request('/v1/admin/manual-refunds/'+c.rideId+'/review','POST',{feeCents:Math.round(Number(f.control.value)*100),revision:c.revision,note:note.control.value});
   filter=result.status;await load();renderDetail(result);message.textContent='Análise salva. A aprovação não envia o Pix.';
  });};
  if(c.status==='approved'){
   const form=el('form',null,'manual-refund-policy');
   form.append(el('h4','Registrar Pix já realizado'),el('p','Confira o titular e o valor '+money(c.paidCents-c.feeCents)+' no banco. Anexe o comprovante apenas depois de transferir.'));
   const reference=field('Identificador da transferência (banco)');reference.control.required=true;reference.control.minLength=8;reference.control.maxLength=150;
   const file=field('Comprovante (PNG, JPEG ou PDF, até 500 KB)','file');file.control.accept='image/png,image/jpeg,application/pdf';file.control.required=true;
   const done=el('button','Confirmar devolução realizada','button button--primary');done.type='submit';[reference.control,file.control,done].forEach(n=>n.disabled=!writable);
   form.append(reference.wrap,file.wrap,done);detail.append(form);
   form.onsubmit=e=>{e.preventDefault();execute(async()=>{
    const selected=file.control.files[0];if(!selected||selected.size>512000)throw Error('Envie comprovante com até 500 KB.');
    if(!confirm('Confirma que o Pix de '+money(c.paidCents-c.feeCents)+' já foi realizado para o titular exibido?'))return;
    const bytes=new Uint8Array(await selected.arrayBuffer());let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));
    const receipt={name:selected.name.replace(/[^\w .()-]/g,'_'),contentType:selected.type,base64:btoa(binary)};
    const result=await request('/v1/admin/manual-refunds/'+c.rideId+'/paid','POST',{revision:c.revision,bankReference:reference.control.value,receipt});
    filter='refunded';await load();renderDetail(result);message.textContent='Devolução registrada. O saldo do motorista foi preservado.';
   });};
  }
 }
 async function load(){const [p,c]=await Promise.all([request('/v1/admin/cancellation-policy'),request('/v1/admin/manual-refunds')]);policy=p;items=c.items;renderRule();renderList();message.textContent='Casos atualizados.';}
 refresh.onclick=()=>execute(load);void execute(load);
 return {reload:()=>execute(load)};
}
