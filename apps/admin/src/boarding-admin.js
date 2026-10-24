const categories={moto:'Mototáxi',car:'Carro popular',buggy:'Buggy',delivery:'Entregas',comfort_black:'Comfort / Black'};
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function createBoardingAdmin({root,api,getToken,hasScope}){
 if(!root.querySelector('[data-manual-refunds]'))return;
 const section=el('section');section.className='panel-card';section.setAttribute('aria-label','Código de embarque');
 const title=el('h2','Código de embarque');
 const info=el('p','3 dígitos e 5 tentativas. A configuração vale somente para novas corridas. Entregas usam o código de coleta. Corridas já criadas mantêm sua regra.');
 const message=el('p','Carregando configuração…');message.setAttribute('role','status');
 const enabled=el('input');enabled.type='checkbox';const label=el('label','Exigir código de embarque');label.append(enabled);
 const form=el('form'),options=el('div');options.className='manual-refund-policy';const controls={};
 for(const [key,name] of Object.entries(categories)){const l=el('label',name),input=el('input');input.type='checkbox';l.append(input);options.append(l);controls[key]=input;}
 const save=el('button','Salvar configuração');save.className='button button--primary';save.type='submit';
 const release=el('details');release.append(el('summary','Liberar embarque excepcional pelo suporte'));
 const releaseForm=el('form');const id=el('input');id.placeholder='Identificador da corrida';id.setAttribute('aria-label','Identificador da corrida');id.required=true;
 const reason=el('textarea');reason.placeholder='Motivo e verificação feita pelo suporte';reason.setAttribute('aria-label','Motivo da liberação');reason.required=true;reason.minLength=10;reason.maxLength=500;
 const releaseButton=el('button','Registrar liberação');releaseButton.type='submit';releaseButton.className='button button--ghost-dark';
 releaseForm.append(id,reason,el('p','A liberação fica registrada com sua identificação e não inicia a corrida. O motorista ainda precisa confirmar a chegada e iniciar.'),releaseButton);release.append(releaseForm);
 form.append(label,options,save);section.append(title,info,message,form,release);root.querySelector('[data-manual-refunds]').before(section);
 let policy=null,busy=false;const writable=hasScope('rides:write');
 function render(){enabled.checked=policy?.enabled===true;for(const key of Object.keys(categories))controls[key].checked=policy?.categories?.[key]===true;
 for(const control of [enabled,save,...Object.values(controls),id,reason,releaseButton])control.disabled=!writable||busy||!policy;
 message.textContent=policy?.enabled?'Código ativado para novas corridas nas categorias selecionadas.':'Código desativado. Nenhum código será exigido nas novas corridas.';}
 async function execute(action,successMessage){if(busy)return;busy=true;render();try{await action();render();if(successMessage)message.textContent=successMessage;}catch(e){message.textContent=e.message||'Não foi possível concluir.';}finally{busy=false;for(const control of [enabled,save,...Object.values(controls),id,reason,releaseButton])control.disabled=!writable||!policy;}}
 form.addEventListener('submit',e=>{e.preventDefault();const next={enabled:enabled.checked,categories:Object.fromEntries(Object.keys(categories).map(k=>[k,controls[k].checked])),revision:policy?.revision};
  void execute(async()=>{policy=await api.boardingRequest(getToken(),'/v1/admin/boarding-policy','PUT',next);});});
 releaseForm.addEventListener('submit',e=>{e.preventDefault();const rideId=id.value.trim(),note=reason.value.trim();
  if(!/^[0-9a-f-]{36}$/i.test(rideId)){message.textContent='Informe um identificador válido.';return;}
  if(!globalThis.confirm('Confirma que o suporte verificou o encontro e autoriza este embarque sem código?'))return;
  void execute(async()=>{await api.boardingRequest(getToken(),`/v1/admin/rides/${rideId}/boarding-override`,'POST',{reason:note});reason.value='';},'Liberação registrada. O motorista já pode confirmar o início da corrida.');});
 void api.boardingRequest(getToken(),'/v1/admin/boarding-policy').then(result=>{policy=result;render();}).catch(e=>{message.textContent=e.message;form.hidden=true;release.hidden=true;});
}
