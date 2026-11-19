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

// Consistent line icons instead of unrelated font glyphs. Routes and labels
// remain the original links, including permission-controlled visibility.
const navigationIconPaths = {
  "overview": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "fleet": "M3 17v-5l2-6h14l2 6v5 M3 12h18 M6 17v3 M18 17v3 M6 15h2 M16 15h2",
  "rides": "M5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M19 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M5 8v5a3 3 0 0 0 3 3h8 M13 13l3 3-3 3",
  "drivers": "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21v-2a7 7 0 0 1 14 0v2 M18 12l3 3-3 3",
  "passengers": "M9 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M3 20v-2a6 6 0 0 1 12 0v2 M17 5a3 3 0 0 1 0 6 M18 14a5 5 0 0 1 3 5v1",
  "benefits": "M8 3h8v5a4 4 0 0 1-8 0z M8 5H4v2a4 4 0 0 0 4 4 M16 5h4v2a4 4 0 0 1-4 4 M12 12v7 M8 21h8 M9 19h6",
  "geo": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 3c-5 5-5 13 0 18 M12 3c5 5 5 13 0 18 M3 12h18",
  "pricing": "M3 7V3h4l14 14-4 4L3 7z M7 7h.01 M10 14l4-4",
  "issues": "M12 3l10 18H2L12 3z M12 9v5 M12 17h.01",
  "marketing": "M3 10v5h4l12 5V5L7 10H3z M7 15l2 6h4l-2-5 M22 9v7",
  "coupons": "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5z M14 5v3 M14 11v2 M14 16v3",
  "finance": "M3 5h18v14H3z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M6 12h.01 M18 12h.01",
  "costs": "M4 21V3h11l5 5v13H4z M14 3v6h6 M8 13h8 M8 17h5",
  "notifications": "M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9 M10 21h4",
  "site": "M3 4h18v16H3z M3 9h18 M7 6.5h.01 M10 6.5h.01 M7 13h10 M7 16h6",
  "design": "M14 3l7 7-9 9-7-7 9-9z M5 12l-2 9 9-2 M12 5l7 7",
  "support": "M3 13v-2a9 9 0 0 1 18 0v6h-4v-7h4 M3 10h4v7H3v-7 M17 17v2a2 2 0 0 1-2 2h-3",
  "privacy": "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z M8 12l3 3 5-6",
  "agency": "M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  "integrations": "M8 3v4 M16 3v4 M6 7h12v5a6 6 0 0 1-12 0V7z M12 18v3",
  "staff": "M8 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M2 21v-3a6 6 0 0 1 10-4 M17 12l5 2v4c0 3-5 5-5 5s-5-2-5-5v-4l5-2z M15 17l2 2 3-4",
  "audit": "M9 3H4v18h16v-5 M9 7H7 M7 12h3 M7 16h5 M17 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M20 10l3 3"
};
function styleNavigationIcons(nav) {
  for (const link of nav.querySelectorAll('.nav-item')) {
    const path = navigationIconPaths[link.dataset.view];
    if (!path) continue;
    const holder = link.querySelector('.nav-icon, span[aria-hidden="true"]');
    if (!holder) continue;
    holder.classList.add('nav-icon'); holder.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round'})) svg.setAttribute(key,value);
    const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d',path); svg.append(shape); holder.replaceChildren(svg);
  }
}

export function organizeAdminNavigation(nav) {
  if (!nav || nav.dataset.organized) return;
  nav.dataset.organized = 'true';
  styleNavigationIcons(nav);
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
  if (!nav) return;
  const active = nav.querySelector('.nav-item.is-active:not([hidden])')?.dataset.view ?? '';
  const changed = nav.dataset.workspaceActive !== active;
  nav.dataset.workspaceActive = active;
  nav.querySelectorAll('.admin-nav-group').forEach(group => {
    const hidden = ![...group.querySelectorAll('.nav-item')].some(link => !link.hidden);
    if (group.hidden !== hidden) group.hidden = hidden;
    const selected = !hidden && !!group.querySelector('.nav-item.is-active:not([hidden])');
    if (changed && group.open !== selected) group.open = selected;
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
