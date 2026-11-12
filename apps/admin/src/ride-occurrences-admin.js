import {element as node, action, field, toggle, header, feedback, setFeedback} from './admin-components.js';
const categories = {moto:'Mototáxi', car:'Carro popular', buggy:'Buggy', delivery:'Entregas', comfort_black:'Comfort / Black'};
const statuses = {awaiting_passenger:'Aguardando passageiro', review:'Em análise', replacement_search:'Buscando substituto', refund_pending:'Devolução em andamento', resolved:'Resolvida'};
const methods = {cash:'Dinheiro', pix:'Pix', wallet:'Carteira', card:'Cartão'};
const kinds = {refund:'Devolução integral', mechanical:'Problema mecânico', dispute:'Encerramento contestado', cash:'Interrupção em dinheiro'};
const decisions = {close:'Encerrar sem penalidade', refund:'Solicitar devolução integral por Pix', pay_driver:'Creditar tarifa ao motorista'};

export function createOccurrencesAdmin({root, api, getToken, hasScope, view, openTicket}) {
  if (root.querySelector('[data-occurrence-admin]')) return;
  const host = view === 'finance' ? root.querySelector('[data-manual-refunds]')?.parentElement : root.querySelector('#view-support');
  if (!host) return;
  const section = node('section', null, 'panel-card');
  section.dataset.occurrenceAdmin = 'true';
  section.setAttribute('aria-label', view === 'finance' ? 'Ocorrências e adicionais' : 'Ocorrências vinculadas às corridas');
  const message = feedback('Carregando…');
  section.append(header(view === 'finance' ? 'REGRAS DA OPERAÇÃO' : 'ANÁLISE DE INTERRUPÇÕES',
    view === 'finance' ? 'Ocorrências e adicionais' : 'Ocorrências vinculadas às corridas',
    view === 'finance' ? 'Configure os recursos separadamente. Corridas já iniciadas mantêm as regras originais.' : 'Confira as duas versões e os registros do atendimento antes de decidir.'), message);
  host.append(section);
  const request = (path, method = 'GET', body) => api.occurrenceRequest(getToken(), path, method, body);
  let busy = false, policy;
  async function execute(work, success = 'Atualizado.') {
    if (busy) return;
    busy = true; section.setAttribute('aria-busy', 'true'); setFeedback(message, 'Atualizando…');
    const disabled = new Map([...section.querySelectorAll('button,input,select,textarea')].map(control => [control, control.disabled]));
    for (const control of disabled.keys()) control.disabled = true;
    try { await work(); setFeedback(message, success, 'success'); }
    catch (error) { setFeedback(message, error.message || 'Não foi possível concluir. Tente novamente.', 'error'); }
    finally {
      busy = false; section.setAttribute('aria-busy', 'false');
      for (const [control, previous] of disabled) if (control.isConnected) control.disabled = previous;
    }
  }
  if (view === 'finance') {
    const form = node('form', null, 'admin-policy-form');
    const enabled = node('input'), bonus = node('input'); enabled.type = bonus.type = 'checkbox';
    const grid = node('div', null, 'admin-policy-grid');
    grid.append(toggle('Novos cancelamentos e ocorrências', 'Interrupções, substituição no Pix e análise das duas versões.', enabled),
      toggle('Adicional e bônus na próxima corrida', 'Aplicação somente após decisão administrativa justificada.', bonus));
    const amounts = node('fieldset', null, 'admin-policy-categories'); amounts.append(node('legend', 'Adicional por categoria (R$)'));
    const fields = {};
    for (const [key, label] of Object.entries(categories)) {
      const input = node('input'); input.type = 'number'; input.min = '0'; input.max = '1000'; input.step = '.01'; input.required = true; input.inputMode = 'decimal';
      amounts.append(field(label, input)); fields[key] = input;
    }
    const save = action('Salvar configurações', true); save.type = 'submit';
    const actions = node('div', null, 'admin-form-actions'); actions.append(save, node('small', 'Ativar um recurso não ativa o outro.'));
    form.append(grid, amounts,
      node('p', 'Em dinheiro, o bônus pertence ao próximo motorista; em Pix, ao motorista prejudicado. O adicional não recebe comissão e não substitui as taxas de cancelamento existentes.', 'admin-policy-note'), actions);
    section.append(form);
    function lock(loading = false) {
      enabled.disabled = loading || !hasScope('support:write');
      bonus.disabled = loading || !hasScope('finance:write');
      Object.values(fields).forEach(control => control.disabled = loading || !hasScope('finance:write'));
      save.disabled = loading || !hasScope('support:write');
    }
    function render() {
      enabled.checked = policy.enabled; bonus.checked = policy.bonusEnabled;
      for (const key of Object.keys(fields)) fields[key].value = (policy.bonusCents[key] / 100).toFixed(2);
      lock();
    }
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!policy || !hasScope('support:write')) return;
      const values = hasScope('finance:write')
        ? Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, Math.round(Number(input.value) * 100)])) : policy.bonusCents;
      const next = {enabled:enabled.checked, bonusEnabled:hasScope('finance:write') ? bonus.checked : policy.bonusEnabled, bonusCents:values, revision:policy.revision};
      void execute(async () => {policy = await request('/v1/admin/occurrence-policy', 'PUT', next); render();}, 'Configurações salvas. Corridas já iniciadas foram preservadas.');
    });
    lock(true);
    void request('/v1/admin/occurrence-policy').then(result => {
      policy = result; render(); setFeedback(message, 'Ocorrências: ' + (policy.enabled ? 'ativadas' : 'desativadas') + ' · Adicional e bônus: ' + (policy.bonusEnabled ? 'ativados' : 'desativados') + '.');
    }).catch(error => {form.hidden = true; setFeedback(message, error.message, 'error');});
    return;
  }

  const toolbar = node('div', null, 'admin-form-actions');
  const refresh = action('Atualizar ocorrências');
  const filter = node('select');
  for (const [value, text] of [['all','Todas as ocorrências'], ['pending','Em acompanhamento'], ['resolved','Resolvidas']]) {
    const option = node('option', text); option.value = value; filter.append(option);
  }
  const count = node('small');
  toolbar.append(field('Exibir', filter), refresh, count);
  const list = node('div', null, 'admin-case-list'); section.append(toolbar, list);
  let items = [];
  function renderList() {
    const visible = items.filter(record => filter.value === 'all' || (filter.value === 'resolved' ? record.status === 'resolved' : record.status !== 'resolved'));
    count.textContent = visible.length + (visible.length === 1 ? ' ocorrência' : ' ocorrências');
    list.replaceChildren();
    for (const record of visible) {
      const card = node('article', null, 'admin-case');
      const head = node('div', null, 'admin-case-header');
      const badge = node('span', statuses[record.status] || record.status, 'admin-case-badge'); badge.dataset.state = record.status;
      head.append(node('h3', 'Corrida #' + record.ride_id.slice(0,8).toUpperCase()), badge);
      card.append(head, node('p', (kinds[record.kind] || 'Interrupção') + ' · ' + (methods[record.payment_method] || record.payment_method), 'muted-copy'));
      const versions = node('div', null, 'admin-case-versions');
      for (const [name, statement] of [['Motorista', record.driver_statement], ['Passageiro', record.passenger_statement || 'Aguardando a versão do passageiro.']]) {
        const version = node('div', null, 'admin-case-version'); version.append(node('strong', name), node('p', statement)); versions.append(version);
      }
      card.append(versions);
      const ticket = action('Abrir atendimento e evidências'); ticket.onclick = () => openTicket?.(record.ticket_id); card.append(ticket);
      if (record.cash_returned_at) card.append(node('p', record.cash_return_confirmed === true ? 'Passageiro confirmou a devolução em dinheiro.' : record.cash_return_confirmed === false ? 'Passageiro contestou a devolução.' : 'Motorista registrou a devolução. Aguardando confirmação do passageiro.', 'admin-policy-note'));
      if (record.decision) {
        card.append(node('p', 'Decisão: ' + (decisions[record.decision.action] || record.decision.action) + ' — ' + record.decision.note, 'admin-policy-note'));
        if (record.decision.penalty) card.append(node('p', 'Adicional futuro aprovado após moderação.', 'muted-copy'));
      }
      const evidence = node('details');
      evidence.append(node('summary', 'Referência e dados financeiros'), node('p', 'Corrida: ' + record.ride_id), node('p', 'Atendimento: ' + record.ticket_id), node('p', 'Estado da corrida: ' + record.ride_state + ' · pagamento: ' + record.payment_status)); card.append(evidence);
      if (record.decision && record.status !== 'resolved' && hasScope('support:write') && hasScope('finance:write')) {
        const retry = action('Consultar operação financeira pendente');
        retry.onclick = () => void execute(async () => {await request(`/v1/admin/ride-occurrences/${record.id}/decision`, 'POST', {...record.decision, revision:record.revision}); await load();}); card.append(retry);
      }
      if (!record.decision && record.status !== 'resolved' && hasScope('support:write')) {
        const form = node('form', null, 'admin-policy-form');
        const choice = node('select'), note = node('textarea'), penalty = node('input');
        for (const [value, text] of Object.entries(decisions)) {
          const option = node('option', text); option.value = value;
          option.disabled = value !== 'close' && (!hasScope('finance:write') || record.payment_method !== 'pix') || value === 'pay_driver' && record.kind !== 'dispute'; choice.append(option);
        }
        penalty.type = 'checkbox'; penalty.disabled = !hasScope('finance:write') || record.occurrence_terms?.bonusEnabled !== true;
        note.required = true; note.minLength = 10; note.maxLength = 2000; note.placeholder = 'Registre as evidências, a análise das duas versões e a justificativa.';
        const save = action('Registrar decisão', true); save.type = 'submit';
        form.append(field('Decisão administrativa', choice), field('Análise e justificativa', note),
          toggle('Aplicar adicional futuro', 'Somente por desistência injustificada, após analisar as duas versões.', penalty), save);
        form.addEventListener('submit', event => {
          event.preventDefault();
          if (!globalThis.confirm('Registrar a decisão selecionada? Operações financeiras serão registradas uma única vez.')) return;
          const body = {action:choice.value, note:note.value, penalty:penalty.checked, revision:record.revision};
          void execute(async () => {await request(`/v1/admin/ride-occurrences/${record.id}/decision`, 'POST', body); await load();}, 'Decisão registrada. Consulte o estado real da operação financeira.');
        }); card.append(form);
      }
      list.append(card);
    }
    if (!visible.length) {
      const empty = node('div', null, 'empty-state');
      empty.append(node('strong', 'Nenhuma ocorrência nesta seleção'), node('p', 'As interrupções registradas nas corridas aparecerão aqui, vinculadas ao atendimento existente.'));
      list.append(empty);
    }
  }
  async function load() {const response = await request('/v1/admin/ride-occurrences'); items = response.items; renderList();}
  filter.addEventListener('change', renderList);
  refresh.onclick = () => void execute(load);
  void execute(load);
}
