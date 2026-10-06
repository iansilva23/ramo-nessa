import { formatCurrencyCents } from './security.js';

export function moneyToCents(value) {
  const raw=String(value).trim();
  if(!/^\d{1,8}([.,]\d{1,2})?$/.test(raw)) throw new Error('Informe um valor válido, como 10,99.');
  const [integer,fraction='']=raw.replace(',','.').split('.');
  return Number(integer)*100+Number(fraction.padEnd(2,'0'));
}
export function reportCards(summary) {
  return [
    ['Comissão bruta das corridas',summary.commissionCents],
    ['Outras receitas registradas',summary.otherRevenueCents],
    ['Acréscimos de pagamento recuperados',summary.feeRecoveryCents],
    ['Custos confirmados',summary.confirmedCostsCents],
    ['Custos estimados adicionais',summary.estimatedCostsCents],
    ['Resultado dos custos confirmados',summary.resultConfirmedCents],
    ['Resultado líquido incluindo estimativas',summary.projectedNetCents],
  ];
}
const today=()=>new Date(Date.now()-3*3600000).toISOString().slice(0,10);
const labelBasis={monthly:'Mensal',ride:'Por corrida liquidada',pix_payment:'Por Pix recebido',card_payment:'Por cartão recebido',commission_percent:'Sobre a comissão'};
export function createCompanyCostsAdmin({root,api,getToken,hasScope,onError}) {
  const fieldIds={name:'cost-expense-name',category:'cost-expense-category',slot:'cost-expense-slot',date:'cost-expense-date',ride:'cost-expense-ride',payment:'cost-expense-payment',rule:'cost-expense-rule',notes:'cost-expense-notes'};
  const abort=new AbortController();let destroyed=false,busy=false,request=0,editing=null;
  const pending=new Map();
  const el=id=>root.querySelector(`#${id}`);
  const value=id=>el(id).value.trim();
  const status=(text)=>{if(!destroyed)el('cost-status').textContent=text;};
  const node=(tag,text,className)=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
  const listen=(id,event,handler)=>el(id).addEventListener(event,handler,{signal:abort.signal});
  const button=(text,action)=>{const b=node('button',text,'button button--ghost-dark');b.type='button';b.addEventListener('click',()=>void mutation(action),{signal:abort.signal});b.disabled=!hasScope('costs:write');return b;};
  function clearExpense() {
    editing=null;el('cost-expense-form').reset();el('cost-expense-date').value=today();el('cost-expense-title').textContent='Cadastrar despesa';pending.delete('expense');
  }
  function fillExpense(data,item=null) {
    editing=item;el('cost-expense-title').textContent=item?'Editar despesa':'Confirmar custo previsto';
    for(const [field,key] of [['name','name'],['category','category'],['slot','slot'],['date','occurredOn'],['ride','rideId'],['payment','paymentId'],['rule','ruleId'],['notes','notes']])el(fieldIds[field]).value=data[key]??'';
    el('cost-expense-amount').value=(data.amountCents/100).toFixed(2).replace('.',',');el('cost-expense-certainty').value=data.certainty??'confirmed';
    el('cost-expense-form').scrollIntoView({behavior:'smooth',block:'center'});
  }
  function render(data) {
    el('cost-summary').replaceChildren(...reportCards(data.summary).map(([label,cents])=>{
      const card=node('article','','panel-card');card.append(node('small',label),node('strong',formatCurrencyCents(cents),cents<0?'cost-negative':'cost-value'));return card;
    }));
    el('cost-categories-summary').replaceChildren(...data.categories.map(c=>node('p',`${c.category}: ${formatCurrencyCents(c.amountCents)}`)));
    const rules=data.items.filter(i=>i.kind==='rule');
    el('cost-rules').replaceChildren(...rules.map(i=>{
      const d=i.data,box=node('div','','cost-row');box.append(node('strong',d.name),node('p',`${d.category} · ${labelBasis[d.basis]} · ${d.basis==='commission_percent'?(d.rateBps/100)+'%':formatCurrencyCents(d.amountCents)+(d.rateBps?' + '+(d.rateBps/100)+'%':'')} · ${d.startsOn} até ${d.endsOn??'sem data final'}`),node('small',`Tipo: ${d.slot} · ID: ${i.id}`));
      if(!d.endsOn)box.append(button('Encerrar vigência',async()=>{
        const end=globalThis.prompt('Último dia em que a regra deve valer (AAAA-MM-DD):',today());if(!end)return;
        await api.saveCost(getToken(),{id:i.id,kind:'rule',data:{...d,endsOn:end},expectedUpdatedAt:i.updatedAt});
      }));
      return box;
    }));
    el('cost-expenses').replaceChildren(...data.items.filter(i=>i.kind==='expense').map(i=>{
      const d=i.data,box=node('div','','cost-row');box.append(node('strong',d.name),node('p',`${d.occurredOn} · ${d.category} · ${formatCurrencyCents(d.amountCents)+(d.rateBps?' + '+(d.rateBps/100)+'%':'')} · ${d.voided?'Cancelado':d.certainty==='confirmed'?'Confirmado':'Estimado'}`));
      if(d.notes)box.append(node('small',d.notes));
      if(!d.voided){box.append(button('Editar',async()=>{fillExpense(d,i);}));box.append(button('Cancelar registro',async()=>{
        if(!globalThis.confirm('Cancelar este registro de custo? O histórico será preservado.'))return;
        await api.saveCost(getToken(),{id:i.id,kind:'expense',data:{...d,voided:true},expectedUpdatedAt:i.updatedAt});
      }));}return box;
    }));
    el('cost-lines-count').textContent=`${data.lineCount} lançamentos no total. Mostrando ${data.lines.length}; o resumo considera todos.`;
    el('cost-lines').replaceChildren(...data.lines.map(l=>{
      const box=node('div','','cost-row');box.append(node('strong',`${l.name}: ${formatCurrencyCents(l.amountCents)}`),node('p',`${l.date} · ${l.category} · ${l.certainty==='confirmed'?'Confirmado':'Estimado'}${l.paymentId?' · Pagamento '+l.paymentId:''}${l.rideId?' · Corrida '+l.rideId:''}`));
      if(l.source==='rule'&&l.certainty==='estimated')box.append(button('Registrar valor confirmado',async()=>{
        const rule=rules.find(i=>i.id===l.ruleId);
        fillExpense({name:l.name,category:l.category,slot:l.slot,amountCents:l.amountCents,occurredOn:l.date,
          rideId:l.rideId,paymentId:l.paymentId,ruleId:rule?.data.basis==='monthly'?l.ruleId:null,certainty:'confirmed',notes:'Valor conferido da estimativa.'});
      }));return box;
    }));
    el('cost-rides').replaceChildren(node('p',`${data.rideCount} corridas. Mostrando ${data.rides.length}.`),...data.rides.map(r=>node('p',`Corrida ${r.rideId}: receita ${formatCurrencyCents(r.commissionCents)} − custos ${formatCurrencyCents(r.costsCents)} = ${formatCurrencyCents(r.netCents)}`)));
  }
  async function load() {
    if(!hasScope('costs:read'))return;
    const seq=++request;status('Consultando custos e resultado…');
    try {const data=await api.costs(getToken(),{from:value('cost-from'),to:value('cost-to')});if(!destroyed&&seq===request){render(data);status('Resultado atualizado. Custos estimados aparecem separados.');}}
    catch(e){if(!destroyed&&seq===request){status(e.message);onError?.(e);}}
  }
  async function mutation(action) {
    if(busy||destroyed||!hasScope('costs:write'))return;busy=true;status('Salvando…');
    try {await action();if(!destroyed)await load();}catch(e){status(e.message);onError?.(e);}finally{busy=false;}
  }
  function creationId(kind,data) {
    const fingerprint=JSON.stringify(data),old=pending.get(kind);
    if(old?.fingerprint===fingerprint)return old.id;
    const id=crypto.randomUUID();pending.set(kind,{fingerprint,id});return id;
  }
  listen('cost-period-form','submit',e=>{e.preventDefault();void load();});
  listen('cost-this-month','click',()=>{el('cost-from').value=today().slice(0,8)+'01';el('cost-to').value=today();void load();});
  listen('cost-expense-reset','click',clearExpense);
  listen('cost-expense-form','submit',e=>{e.preventDefault();void mutation(async()=>{
    const data={name:value('cost-expense-name'),category:value('cost-expense-category'),slot:value('cost-expense-slot'),amountCents:moneyToCents(value('cost-expense-amount')),
      occurredOn:value('cost-expense-date'),certainty:value('cost-expense-certainty'),rideId:value('cost-expense-ride')||null,paymentId:value('cost-expense-payment')||null,ruleId:value('cost-expense-rule')||null,notes:value('cost-expense-notes'),voided:false};
    await api.saveCost(getToken(),{id:editing?.id??creationId('expense',data),kind:'expense',data,...(editing?{expectedUpdatedAt:editing.updatedAt}:{})});clearExpense();
  });});
  listen('cost-rule-basis','change',()=>{
    const basis=value('cost-rule-basis'),percentage=basis==='commission_percent',payment=['pix_payment','card_payment'].includes(basis);el('cost-rule-rate-label').hidden=!percentage&&!payment;el('cost-rule-amount-label').hidden=percentage;
  });
  listen('cost-rule-form','submit',e=>{e.preventDefault();void mutation(async()=>{
    const basis=value('cost-rule-basis'),percent=basis==='commission_percent';
    const data={name:value('cost-rule-name'),category:value('cost-rule-category'),slot:value('cost-rule-slot'),notes:value('cost-rule-notes'),basis,
      amountCents:percent?0:moneyToCents(value('cost-rule-amount')),rateBps:percent||['pix_payment','card_payment'].includes(basis)?moneyToCents(value('cost-rule-rate')):0,
      startsOn:value('cost-rule-start'),endsOn:value('cost-rule-end')||null,certainty:value('cost-rule-certainty')};
    await api.saveCost(getToken(),{id:creationId('rule',data),kind:'rule',data});pending.delete('rule');el('cost-rule-form').reset();el('cost-rule-start').value=today();
    el('cost-rule-rate-label').hidden=true;el('cost-rule-amount-label').hidden=false;
  });});
  el('cost-from').value=today().slice(0,8)+'01';el('cost-to').value=today();el('cost-expense-date').value=today();el('cost-rule-start').value=today();
  if(!hasScope('costs:write'))for(const form of ['cost-expense-form','cost-rule-form'])for(const control of el(form).elements)control.disabled=true;
  void load();
  return {load,destroy(){destroyed=true;request++;abort.abort();pending.clear();}};
}
