import {element as el, action, field, toggle, header, feedback, setFeedback} from './admin-components.js';
const categories = {moto:'Mototáxi', car:'Carro popular', buggy:'Buggy', delivery:'Entregas', comfort_black:'Comfort / Black'};

export function createBoardingAdmin({root, api, getToken, hasScope}) {
  const host = root.querySelector('[data-manual-refunds]');
  if (!host || root.querySelector('[data-boarding-admin]')) return;
  const section = el('section', null, 'panel-card');
  section.dataset.boardingAdmin = 'true';
  section.setAttribute('aria-label', 'Código de embarque');
  const message = feedback('Carregando configuração…');
  const enabled = el('input'); enabled.type = 'checkbox';
  const form = el('form', null, 'admin-policy-form');
  const options = el('fieldset', null, 'admin-policy-categories');
  options.append(el('legend', 'Categorias que utilizam o código'));
  const controls = {};
  for (const [key, name] of Object.entries(categories)) {
    const input = el('input'); input.type = 'checkbox';
    const label = el('label', null, 'admin-policy-toggle');
    label.append(el('span', name), input); options.append(label); controls[key] = input;
  }
  const save = action('Salvar configuração', true); save.type = 'submit';
  const actions = el('div', null, 'admin-form-actions');
  actions.append(save, el('small', 'Válido somente para novas corridas.'));
  form.append(toggle('Exigir código de embarque', 'O motorista valida 3 dígitos, com até 5 tentativas.', enabled), options, actions);

  const release = el('details', null, 'admin-exception');
  release.append(el('summary', 'Liberação excepcional pelo suporte'));
  const releaseForm = el('form');
  const id = el('input'); id.placeholder = 'Identificador completo da corrida'; id.required = true;
  const reason = el('textarea'); reason.placeholder = 'Descreva a verificação feita pelo suporte';
  reason.required = true; reason.minLength = 10; reason.maxLength = 500;
  const releaseButton = action('Registrar liberação'); releaseButton.type = 'submit';
  releaseForm.append(field('Identificador da corrida', id), field('Motivo da liberação', reason),
    el('p', 'A liberação fica registrada com sua identificação. O motorista ainda precisa confirmar a chegada e iniciar a corrida.', 'admin-policy-note'), releaseButton);
  release.append(releaseForm);
  section.append(header('SEGURANÇA NO EMBARQUE', 'Código de embarque', 'Entregas usam o código de coleta. Corridas já criadas mantêm a regra original.'), message, form, release);
  host.before(section);
  let policy = null, busy = false;
  const writable = hasScope('rides:write');
  const inputs = [enabled, save, ...Object.values(controls), id, reason, releaseButton];
  function lock() { for (const input of inputs) input.disabled = !writable || busy || !policy; section.setAttribute('aria-busy', String(busy)); }
  function render() {
    enabled.checked = policy?.enabled === true;
    for (const key of Object.keys(categories)) controls[key].checked = policy?.categories?.[key] === true;
    lock();
    setFeedback(message, policy?.enabled ? 'Ativado para novas corridas nas categorias selecionadas.' : 'Desativado. Nenhum código será exigido nas novas corridas.');
  }
  async function execute(work, success) {
    if (busy || !writable || !policy) return;
    busy = true; lock(); setFeedback(message, 'Salvando…');
    try { await work(); render(); if (success) setFeedback(message, success, 'success'); }
    catch (error) { setFeedback(message, error.message || 'Não foi possível concluir. Tente novamente.', 'error'); }
    finally { busy = false; lock(); }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const next = {enabled:enabled.checked, categories:Object.fromEntries(Object.keys(categories).map(k => [k, controls[k].checked])), revision:policy?.revision};
    void execute(async () => { policy = await api.boardingRequest(getToken(), '/v1/admin/boarding-policy', 'PUT', next); }, 'Configuração salva. Corridas já iniciadas foram preservadas.');
  });
  releaseForm.addEventListener('submit', event => {
    event.preventDefault(); const rideId = id.value.trim(), note = reason.value.trim();
    if (!/^[0-9a-f-]{36}$/i.test(rideId)) { setFeedback(message, 'Informe um identificador válido.', 'error'); return; }
    if (!globalThis.confirm('Confirma que o suporte verificou o encontro e autoriza este embarque sem código?')) return;
    void execute(async () => {
      await api.boardingRequest(getToken(), `/v1/admin/rides/${rideId}/boarding-override`, 'POST', {reason:note});
      reason.value = '';
    }, 'Liberação registrada. O motorista já pode confirmar o início da corrida.');
  });
  lock();
  void api.boardingRequest(getToken(), '/v1/admin/boarding-policy').then(result => {policy = result; render();})
    .catch(error => {setFeedback(message, error.message, 'error'); form.hidden = true; release.hidden = true;});
}
