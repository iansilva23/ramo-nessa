const categories={moto:'Mototáxi',car:'Carro popular',buggy:'Buggy',delivery:'Entregas',comfort_black:'Comfort / Black'};
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function createOccurrencesAdmin({root,api,getToken,hasScope,view,openTicket}){
 if(root.querySelector('[data-occurrence-admin]'))return;
 const section=node('section');section.className='panel-card';section.dataset.occurrenceAdmin='true';
 const message=node('p','Carregando…');message.setAttribute('role','status');section.append(node('h2',view==='finance'?'Ocorrências e adicionais':'Ocorrências vinculadas às corridas'),message);
 const host=view==='finance'?root.querySelector('[data-manual-refunds]')?.parentElement:root; if(!host)return;host.append(section);
 const request=(path,method='GET',body)=>api.occurrenceRequest(getToken(),path,method,body);
 let busy=false,policy;
 async function execute(work){if(busy)return;busy=true;const disabled=new Map([...section.querySelectorAll('button')].map(b=>[b,b.disabled]));section.querySelectorAll('button').forEach(b=>b.disabled=true);try{await work();message.textContent='Atualizado.';}catch(e){message.textContent=e.message;}finally{busy=false;for(const [b,previous]of disabled)if(b.isConnected)b.disabled=previous;}}
 if(view==='finance'){
  const form=node('form'),enabled=node('input'),bonus=node('input');enabled.type=bonus.type='checkbox';
  const a=node('label','Novos cancelamentos e ocorrências');a.append(enabled);
  const b=node('label','Adicional e bônus na próxima corrida');b.append(bonus);
  form.append(a,b,node('p','Controles independentes. Salvar não altera corridas já iniciadas. Em dinheiro, o bônus pertence ao próximo motorista; em Pix, ao motorista prejudicado. Nenhuma comissão sobre o adicional.'));
  const fields={};for(const [key,label]of Object.entries(categories)){const wrapper=node('label',label+' — adicional (R$)'),input=node('input');input.type='number';input.min='0';input.max='1000';input.step='.01';input.required=true;wrapper.append(input);form.append(wrapper);fields[key]=input;}
  const save=node('button','Salvar configurações');save.type='submit';save.className='button button--primary';form.append(save);section.append(form);
  enabled.disabled=!hasScope('support:write');bonus.disabled=!hasScope('finance:write');Object.values(fields).forEach(f=>f.disabled=!hasScope('finance:write'));save.disabled=!hasScope('support:write');
  form.onsubmit=e=>{e.preventDefault();if(!policy||!hasScope('support:write'))return;void execute(async()=>{
   const values=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,Math.round(Number(input.value)*100)]));
   const next={enabled:enabled.checked,bonusEnabled:bonus.checked,bonusCents:values,revision:policy.revision};
   policy=await request('/v1/admin/occurrence-policy','PUT',next);
  });};
  void request('/v1/admin/occurrence-policy').then(p=>{policy=p;enabled.checked=p.enabled;bonus.checked=p.bonusEnabled;for(const k of Object.keys(fields))fields[k].value=(p.bonusCents[k]/100).toFixed(2);message.textContent='Configuração carregada. Novos recursos não são ativados pela atualização.';}).catch(e=>{form.hidden=true;message.textContent=e.message;});
 }else{
  const refresh=node('button','Atualizar ocorrências');refresh.type='button';const list=node('div');section.append(refresh,list);
  async function load(){const response=await request('/v1/admin/ride-occurrences');list.replaceChildren();for(const c of response.items){
   const card=node('article');card.className='panel-card';card.append(node('h3','Corrida '+c.ride_id.slice(0,8)),node('p','Situação: '+c.status+' · '+c.payment_method),node('p','Motorista: '+c.driver_statement),node('p','Passageiro: '+(c.passenger_statement||'Aguardando versão')),node('p','Atendimento existente: '+c.ticket_id));
   const ticket=node('button','Abrir atendimento e evidências');ticket.type='button';ticket.onclick=()=>openTicket?.(c.ticket_id);card.append(ticket);
   if(c.cash_returned_at)card.append(node('p',c.cash_return_confirmed===true?'Passageiro confirmou a devolução em dinheiro':c.cash_return_confirmed===false?'Passageiro contestou a devolução':'Motorista registrou devolução; passageiro ainda não confirmou'));
   if(c.decision){card.append(node('p','Decisão: '+c.decision.action+' — '+c.decision.note));if(c.decision.penalty)card.append(node('p','Adicional futuro aprovado após moderação.'));}
   const evidence=node('details');evidence.append(node('summary','Referência e dados financeiros'),node('p','Corrida: '+c.ride_id),node('p','Estado da corrida: '+c.ride_state+' · pagamento: '+c.payment_status));card.append(evidence);
   if(c.decision&&c.status!=='resolved'&&hasScope('support:write')&&hasScope('finance:write')){const retry=node('button','Consultar e concluir operação financeira pendente');retry.type='button';retry.onclick=()=>void execute(async()=>{await request(`/v1/admin/ride-occurrences/${c.id}/decision`,'POST',{...c.decision,revision:c.revision});await load();});card.append(retry);}
   if(!c.decision&&c.status!=='resolved'&&hasScope('support:write')){
    const form=node('form'),choice=node('select'),note=node('textarea'),penalty=node('input'),penaltyLabel=node('label','Aplicar adicional futuro por desistência injustificada após analisar as duas versões'),save=node('button','Registrar decisão');
    for(const [value,label]of [['close','Encerrar sem penalidade'],['refund','Solicitar devolução integral por Pix'],['pay_driver','Creditar tarifa ao motorista']]){
     const o=node('option',label);o.value=value;o.disabled=value!=='close'&&(!hasScope('finance:write')||c.payment_method!=='pix')||value==='pay_driver'&&c.kind!=='dispute';choice.append(o);
    }
    penalty.type='checkbox';penalty.disabled=!hasScope('finance:write')||c.occurrence_terms?.bonusEnabled!==true;penaltyLabel.append(penalty);
    note.required=true;note.minLength=10;note.maxLength=2000;note.placeholder='Evidências, análise das duas versões e justificativa';save.type='submit';save.className='button button--primary';form.append(choice,penaltyLabel,note,save);
    form.onsubmit=e=>{e.preventDefault();if(!globalThis.confirm('Registrar a decisão selecionada? Operações financeiras serão registradas uma única vez.'))return;void execute(async()=>{await request(`/v1/admin/ride-occurrences/${c.id}/decision`,'POST',{action:choice.value,note:note.value,penalty:penalty.checked,revision:c.revision});await load();});};card.append(form);
   }
   list.append(card);
  }if(!response.items.length)list.append(node('p','Nenhuma ocorrência registrada.'));}
  refresh.onclick=()=>void execute(load);void execute(load);
 }
}
