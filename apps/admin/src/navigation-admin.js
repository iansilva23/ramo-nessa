import {element as el, action, toggle, header, feedback, setFeedback} from './admin-components.js';

export function createNavigationAdmin({root,api,getToken,hasScope}) {
 const host=root.querySelector('[data-manual-refunds]');
 if(!host||root.querySelector('[data-navigation-admin]'))return;
 const section=el('section',null,'panel-card');section.dataset.navigationAdmin='true';
 section.setAttribute('aria-label','Economia de rotas');
 const form=el('form',null,'admin-policy-form'),enabled=el('input');enabled.type='checkbox';
 const message=feedback('Carregando configuração…'),metrics=el('p',null,'muted');
 const save=action('Salvar economia de rotas',true);save.type='submit';
 const reload=action('Recarregar configuração');reload.type='button';
 const actions=el('div',null,'admin-form-actions');actions.append(save,reload);
 form.append(toggle('Ativar economia de rotas','Até quatro recálculos por desvio na corrida. A localização continua sendo enviada.',enabled),
  el('p','Quando ativado, o app deixa de consultar rotas só pela passagem do tempo. Após quatro recálculos, oferece seguir por conta própria ou abrir o Google Maps. Abrir o Maps pausa a navegação interna até o motorista retomá-la.'),
  el('small','Desligado por padrão. Ative após instalar os aplicativos compatíveis. A mudança é consultada pelos apps durante a corrida; contador e escolhas não são apagados ao desligar.'),actions);
 section.append(header('Economia de rotas','Controle de consultas da navegação do motorista'),message,form,metrics);host.before(section);
 let policy=null,busy=false;const writable=hasScope('rides:write');
 function lock(){enabled.disabled=!writable||busy||!policy;save.disabled=!writable||busy||!policy;reload.disabled=busy;section.setAttribute('aria-busy',String(busy));}
 function render(){enabled.checked=policy.enabled===true;setFeedback(message,policy.enabled?'Ativado. Proteção de consultas habilitada nos apps compatíveis.':'Desativado. Navegação atual preservada.');}
 async function load(){if(busy)return;busy=true;lock();try{policy=await api.navigationRequest(getToken());render();const u=policy.usage??{};metrics.textContent=`Consultas controladas nos últimos 30 dias: ${u.requests??0}. Rotas iniciais: ${u.initial??0}. Recálculos: ${u.recalculations??0}. Falhas do provedor: ${u.errors??0}. Estes contadores não representam a fatura do Google.`;}catch(e){setFeedback(message,e.message??'Não foi possível carregar.','error');}finally{busy=false;lock();}}
 reload.addEventListener('click',()=>void load());
 form.addEventListener('submit',event=>{event.preventDefault();if(busy||!writable||!policy)return;
  const next={enabled:enabled.checked,revision:policy.revision};busy=true;lock();setFeedback(message,'Salvando…');
  void api.navigationRequest(getToken(),'PUT',next).then(result=>{policy={...policy,...result};render();})
   .catch(e=>setFeedback(message,e.message??'Não foi possível salvar.','error')).finally(()=>{busy=false;lock();});
 });
 lock();void load();
}
