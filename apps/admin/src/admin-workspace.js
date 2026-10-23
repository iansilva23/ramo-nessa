// Presentation only: preserve controls, listeners, validation and API payloads.
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};

export const navigationGroups = [
  ['Operação', ['overview', 'fleet', 'rides', 'pricing', 'geo']],
  ['Pessoas e atendimento', ['drivers', 'passengers', 'benefits', 'support', 'issues']],
  ['Financeiro', ['finance', 'costs']],
  ['Conteúdo e crescimento', ['agency', 'marketing', 'coupons', 'notifications', 'site', 'design']],
  ['Administração', ['staff', 'integrations', 'privacy', 'audit']],
];

export function organizeAdminNavigation(nav) {
  if (!nav || nav.dataset.organized) return;
  nav.dataset.organized = 'true';
  for (const [label, views] of navigationGroups) {
    const group = node('details', null, 'admin-nav-group');
    group.setAttribute('aria-label', label);
    group.append(node('summary', label));
    for (const view of views) {
      const link = nav.querySelector(`[data-view="${view}"]`);
      if (link) group.append(link);
    }
    nav.append(group);
  }
}

export function syncAdminNavigation(nav) {
  nav?.querySelectorAll('.admin-nav-group').forEach(group => {
    const hidden = ![...group.querySelectorAll('.nav-item')].some(link => !link.hidden);
    if (group.hidden !== hidden) group.hidden = hidden;
    if (!hidden && group.querySelector('.nav-item.is-active:not([hidden])') && !group.open) group.open = true;
  });
}

// Keep the original nodes and their names/IDs. Related fields get a short
// heading; conditional containers are moved intact, never unhidden here.
const formGroups = {
  'coupon-form': [
    ['Identificação', 'Dê um nome à campanha e escolha um código.', ['coupon-code', 'coupon-name']],
    ['Benefício', 'Escolha o tipo e o valor do cupom.', ['coupon-kind', 'coupon-value-field', 'coupon-percent-fields']],
    ['Validade e limites', 'Defina quando usar e quantas vezes cada pessoa pode aproveitar.', ['coupon-startsAt', 'coupon-endsAt', 'coupon-maxRedemptions', 'coupon-perPassengerLimit', 'coupon-perDeviceLimit']],
  ],
  'marketing-campaign-form': [
    ['Mensagem da campanha', 'O que o cliente vai receber.', ['name', 'title', 'message']],
    ['Presente e orçamento', 'Configure os valores e a validade.', ['couponValue', 'couponValidDays', 'budget', 'repeatAnnually']],
  ],
  'operational-settings-form': [
    ['Prazos da corrida', 'Aceite, pagamento e encerramento da busca.', ['driver-offer-ttl-seconds', 'driver-payment-hold-seconds', 'no-driver-decision-timeout-seconds']],
    ['Mapa e localização', 'Atualização do GPS e visualização dos motoristas próximos.', ['driver-location-max-age-seconds', 'nearby-driver-max-distance-km', 'show-nearby-drivers']],
  ],
  'driver-registry-form': [
    ['Identificação', 'Como o motorista aparece no cadastro.', ['registry-full-name', 'registry-preferred-name']],
    ['Veículo', 'Dados e capacidade do veículo.', ['registry-plate', 'registry-make', 'registry-model', 'registry-model-year', 'registry-color', 'registry-seat-capacity', 'registry-four-by-four']],
  ],
  'benefit-campaign-form': [
    ['Campanha e período', 'Nome, categoria e datas de participação.', ['benefit-name', 'benefit-category', 'benefit-starts-at', 'benefit-ends-at']],
    ['Participação', 'Quem participa e quantos motoristas serão premiados.', ['benefit-region-mode', 'benefit-participant-mode', 'benefit-top-count', 'benefit-min-participants']],
  ],
  'notification-form': [
    ['Destinatários', 'Escolha quem recebe e o tipo de aviso.', ['notification-audience', 'notification-category']],
    ['Mensagem', 'Escreva o título e o texto do aviso.', ['notification-title', 'notification-body']],
  ],
  'release-policy-form': [
    ['Aplicativo', 'Escolha o aplicativo e a plataforma.', ['release-app-kind', 'release-platform']],
    ['Versão disponível', 'Informe a versão e os números de build.', ['release-latest-version', 'release-latest-build', 'release-minimum-build']],
    ['Atualização', 'Link e mensagem que o usuário vai receber.', ['release-store-url', 'release-update-message']],
  ],
  'cost-rule-form': [
    ['Identificação', 'Nome e categoria para encontrar este custo depois.', ['cost-rule-name', 'cost-rule-category', 'cost-rule-slot']],
    ['Cálculo', 'Escolha quando cobrar e como calcular.', ['cost-rule-basis', 'cost-rule-calculation-label', 'cost-rule-example', 'cost-rule-amount-label', 'cost-rule-rate-label']],
    ['Período e observação', 'Defina a vigência e complete os detalhes.', ['cost-rule-start', 'cost-rule-end', 'cost-rule-certainty', 'cost-rule-notes']],
  ],
};

function groupFields(form, groups) {
  for (const [title, copy, keys] of groups) {
    const controls = keys.map(key => form.querySelector(`[id="${key}"], [name="${key}"]`)).filter(Boolean);
    const fields = [...new Set(controls.map(control => {
      if (control.matches('label, div, p')) return control;
      return control.closest('label') ?? control;
    }))];
    // Explicitly skip an unexpected template instead of splitting controls
    // away from a condition, fieldset or controller-owned component.
    if (fields.length !== keys.length || !fields.every(field => field.parentElement === fields[0].parentElement)) continue;
    const section = node('fieldset', null, 'admin-field-group');
    section.append(node('legend', title), node('p', copy, 'admin-field-hint'));
    const grid = node('div', null, 'admin-field-grid');
    fields[0].before(section);
    fields.forEach(field => grid.append(field));
    section.append(grid);
  }
}

function groupStaffPermissions(panel) {
  for (const type of ['create', 'edit']) {
    const controls = [...panel.querySelectorAll(`[data-staff-${type}-scope]`)];
    if (!controls.length) continue;
    const parent = controls[0].closest('.integration-checklist-grid');
    if (!parent) continue;
    const buckets = new Map();
    for (const control of controls) {
      const scope = control.getAttribute(`data-staff-${type}-scope`).split(':')[0];
      const label = ({rides:'Corridas e frota', fleet:'Corridas e frota', drivers:'Motoristas', passengers:'Passageiros', finance:'Financeiro', costs:'Financeiro', pricing:'Regiões e preços', communications:'Conteúdo e comunicação', growth:'Marketing', promotions:'Cupons', support:'Atendimento', privacy:'Privacidade', staff:'Equipe', audit:'Auditoria'})[scope] ?? 'Outros acessos';
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(control.closest('label'));
    }
    parent.classList.add('admin-permissions');
    for (const [label, fields] of buckets) {
      const group = node('fieldset', null, 'admin-permission-group');
      group.append(node('legend', label));
      fields.forEach(field => group.append(field));
      parent.append(group);
    }
  }
}

function prioritizeDailyWork(panel, view) {
  // Consult and act first; configuration stays available farther down.
  const moveToEnd = selector => {
    const element = panel.querySelector(selector);
    if (element?.parentElement === panel) panel.append(element);
  };
  if (view === 'drivers') {
    moveToEnd('.operational-settings-card');
    moveToEnd('#driver-search-policy-panel');
  }
  if (view === 'finance') {
    [...panel.children].filter(element => element.matches('.finance-cash-card, .finance-card-price-card')).forEach(element => panel.append(element));
  }
  if (view === 'geo') moveToEnd('.geo-storage');
  if (['coupons', 'staff'].includes(view)) {
    const form = panel.querySelector(view === 'coupons' ? '#coupon-form' : '#staff-create-form');
    const editor = form?.closest('.panel-card');
    const list = [...panel.querySelectorAll(':scope > .panel-card')].find(card => card !== editor && card.querySelector(view === 'coupons' ? '#coupons-list' : '#staff-list'));
    // Resolve using the original heading as a fallback for static table IDs.
    const listCard = list ?? [...panel.querySelectorAll(':scope > .panel-card')].find(card => /Campanhas cadastradas|Acessos cadastrados/.test(card.querySelector('h2')?.textContent ?? ''));
    if (editor && listCard) editor.before(listCard);
    if (editor) {
      const header = panel.querySelector('.page-heading');
      const button = node('button', view === 'coupons' ? '+ Nova campanha' : '+ Adicionar funcionário', 'button button--primary admin-create-shortcut');
      button.type = 'button';
      const syncShortcut = () => {
        const submit = form.querySelector('button[type="submit"]');
        button.disabled = submit?.disabled === true || form.hidden || editor.hidden;
      };
      syncShortcut();
      new MutationObserver(syncShortcut).observe(editor, {subtree:true,attributes:true,attributeFilter:['disabled','hidden']});
      button.addEventListener('click', () => {
        revealAdminSection(editor);
        const first = form.querySelector('input:not([type=hidden])');
        first?.focus({preventScroll:true});
      });
      header?.append(button);
    }
  }
}

export function revealAdminSection(target) {
  if (!target) return;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
  if (target.tagName === 'DETAILS') target.open = true;
  target.scrollIntoView({block: 'start', behavior: 'auto'});
}

export function organizeAdminWorkspace(panel, view) {
  // This approved workspace is the visual reference, left untouched.
  if (!panel || view === 'pricing' || panel.dataset.organized) return;
  panel.dataset.organized = 'true';
  panel.classList.add('admin-workspace');
  prioritizeDailyWork(panel, view);
  for (const [id, groups] of Object.entries(formGroups)) {
    const form = panel.querySelector(`[id="${id}"]`);
    if (form) groupFields(form, groups);
  }
  if (view === 'staff') groupStaffPermissions(panel);
  const heading = panel.querySelector('.page-heading, .rp-heading');
  if (!heading) return;
  const title = heading.querySelector('h1');
  if (title && !title.querySelector('.rp-title-dot')) title.append(node('span', null, 'rp-title-dot'));
  const sections = [...panel.querySelectorAll('.panel-card, .benefits-hero, .gl-workspace, .design-apps-grid > article')]
    .filter(section => !section.parentElement.closest('.panel-card') && !section.hidden)
    .map(section => ({section, heading: section.querySelector('h2, summary')}))
    .filter(item => item.heading);
  if (sections.length >= 3) {
    const nav = node('nav', null, 'admin-section-nav');
    nav.setAttribute('aria-label', 'Ir para uma parte desta página');
    nav.append(node('span', 'Nesta página', 'admin-section-label'));
    const links = node('div', null, 'admin-section-links');
    const select = node('select');
    select.setAttribute('aria-label', 'Ir para uma parte desta página');
    const placeholder = node('option', 'Escolha o que deseja fazer');
    placeholder.value = '';
    select.append(placeholder);
    sections.forEach(({section, heading: sectionHeading}, index) => {
      const button = node('button', sectionHeading.textContent.trim().replace(/\s+/g, ' '));
      button.type = 'button';
      if (!section.id) section.id = `workspace-${view}-${index}`;
      button.setAttribute('aria-controls', section.id);
      button.addEventListener('click', () => {
        revealAdminSection(section);
        sectionHeading.tabIndex = -1;
        sectionHeading.focus({preventScroll:true});
      });
      const option = node('option', button.textContent);
      option.value = String(index);
      select.append(option);
      links.append(button);
    });
    select.addEventListener('change', () => {
      if (select.value === '') return;
      const item = sections[Number(select.value)];
      revealAdminSection(item.section);
      item.heading.tabIndex = -1;
      item.heading.focus({preventScroll:true});
      select.value = '';
    });
    nav.append(links, select);
    heading.after(nav);
  }
  panel.addEventListener('invalid', event => revealAdminSection(event.target), true);
}
