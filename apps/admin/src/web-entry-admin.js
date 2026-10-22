// Presentation setting only; never changes app login, permissions or prices.
export function createWebEntryAdmin({root,api,getToken,canRead,canWrite,onError}) {
  const toggle=root.querySelector('[data-entry-enabled]'),save=root.querySelector('[data-entry-save]');
  const message=root.querySelector('[data-entry-message]'),status=root.querySelector('[data-entry-status]');
  let current=null,busy=false,generation=0;
  const render=()=>{
    toggle.disabled=busy||!current||!canWrite();
    save.disabled=busy||!current||!canWrite()||toggle.checked===current.enabled;
    status.textContent=current?(current.enabled?'Ativada':'Desativada'):'Aguardando dados';
    status.className='pill '+(current?.enabled?'pill--info':'pill--neutral');
  };
  async function load(){
    const request=++generation,token=getToken();current=null;busy=false;toggle.checked=false;render();
    if(!canRead()){message.textContent='Sua conta não tem permissão para consultar esta configuração.';return;}
    message.textContent='Carregando configuração…';
    try{
      const value=await api.webEntrySettings(token);
      if(request!==generation||token!==getToken())return;
      if(typeof value?.enabled!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Resposta de configuração inválida.');
      current=value;toggle.checked=current.enabled;
      message.textContent='Vale para Passageiro e Motorista Web instalados na tela inicial. A mudança aparece ao abrir ou retomar o app.';
    }catch(error){if(request!==generation||token!==getToken())return;message.textContent=error.message||'Não foi possível carregar. Use Atualizar para tentar novamente.';onError?.(error);}
    render();
  }
  toggle.addEventListener('change',render);
  save.addEventListener('click',async()=>{
    if(busy||!current||!canWrite()||toggle.checked===current.enabled)return;
    const request=++generation,token=getToken();busy=true;message.textContent='Salvando…';render();
    try{
      const value=await api.updateWebEntrySettings(token,{enabled:toggle.checked,expectedRevision:current.revision});
      if(request!==generation||token!==getToken())return;
      current=value;toggle.checked=value.enabled;
      message.textContent=value.enabled?'Tela de deslizar ativada. Aparece ao abrir ou retomar o app instalado.':'Salvo. Os aplicativos abrem diretamente, sem precisar deslizar.';
    }catch(error){
      if(request!==generation||token!==getToken())return;
      if(error.status===409){current=null;message.textContent='Outra pessoa alterou a opção. Clique em Atualizar e confira antes de salvar novamente.';}
      else{toggle.checked=current.enabled;message.textContent=error.message||'Não foi possível salvar. Tente novamente.';}
      onError?.(error);
    }finally{if(request===generation&&token===getToken()){busy=false;render();}}
  });
  return {load,reset(){generation++;current=null;busy=false;toggle.checked=false;message.textContent='Entre no ADM para consultar a configuração.';render();}};
}
