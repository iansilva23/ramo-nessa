import { formatCurrencyCents, formatDateTime } from './security.js';
import { moneyToCents } from './company-costs-admin.js';
const labels = {
  inapp: 'Dentro do app',
  push: 'Push',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  critical: 'Crítica',
  warning: 'Atenção',
  info: 'Informativa',
  new: 'Nova',
  in_progress: 'Em análise',
  resolved: 'Marcada como resolvida',
};
const localInput = (at) =>
  new Date(Date.parse(at) - 3 * 3600000).toISOString().slice(0, 16);
const instant = (v) => new Date(`${v}:00-03:00`).toISOString();
export function createGrowthAdmin({
  root,
  api,
  getToken,
  hasScope,
  onError,
  view,
}) {
  const abort = new AbortController();
  let stopped = false,
    sequence = 0,
    busy = false,
    data = null,
    editing = null;
  const el = (id) => root.querySelector(`#${id}`);
  const node = (tag, text = '', className = '') => {
    const n = document.createElement(tag);
    n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  const status = (t) => {
    if (!stopped) el('growth-status').textContent = t;
  };
  const listen = (target, event, fn) =>
    target.addEventListener(event, fn, { signal: abort.signal });
  function button(label, scope, action) {
    const b = node('button', label, 'button button--ghost-dark');
    b.type = 'button';
    b.disabled = !hasScope(scope);
    listen(b, 'click', () => void perform(action));
    return b;
  }
  async function perform(fn) {
    if (stopped || busy) return;
    busy = true;
    status('Processando…');
    try {
      await fn();
    } catch (e) {
      if (!stopped) {
        status(e.message || 'Falha na operação.');
        onError?.(e);
      }
    } finally {
      busy = false;
    }
  }
  function cards(items) {
    el('growth-summary').replaceChildren(
      ...items.map(([label, value]) => {
        const a = node('article', '', 'panel-card');
        a.append(node('small', label), node('strong', String(value)));
        return a;
      }),
    );
  }
  function chart(id, rows) {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    el(id).replaceChildren(
      ...rows.map(([label, value, tone]) => {
        const row = node('div', '', 'growth-chart-row');
        const caption = node('div', '', 'growth-chart-caption');
        caption.append(node('span', label), node('strong', String(value)));
        const track = node('div', '', 'growth-chart-track');
        const bar = node('div', '', 'growth-chart-bar');
        bar.dataset.tone = tone;
        bar.style.width = `${(value / max) * 100}%`;
        track.append(bar);
        row.append(caption, track);
        return row;
      }),
    );
    if (rows.every((r) => r[1] === 0))
      el(id).append(
        node('p', 'Ainda não há ocorrências nestes indicadores.', 'muted-copy'),
      );
  }
  function updateTriggerFields() {
    const f = el('marketing-campaign-form'),
      trigger = f.elements.namedItem('trigger').value;
    const annual = ['birthday', 'calendar'].includes(trigger);
    const repeat = f.elements.namedItem('repeatAnnually');
    if (!annual) repeat.checked = false;
    repeat.closest('label').hidden = !annual;
    for (const [name, visible] of [
      ['calendarDay', trigger === 'calendar'],
      ['threshold', trigger === 'loyalty'],
      ['days', !annual],
      ['endsAt', !repeat.checked],
    ]) {
      const field = f.elements.namedItem(name);
      field.closest('label').hidden = !visible;
    }
  }
  function presetMessage(t) {
    if (t.trigger === 'birthday')
      return 'Feliz aniversário! O Ramo Nessa deseja um dia cheio de alegria. Conte com a gente para seus trajetos!';
    if (t.name === 'Natal')
      return 'Feliz Natal! Que seu dia seja cheio de bons encontros. Conte com o Ramo Nessa para chegar até eles.';
    if (t.name === 'Ano-Novo')
      return 'Feliz Ano-Novo! Que não faltem bons caminhos. O Ramo Nessa acompanha você nessa nova etapa.';
    if (t.trigger === 'inactive')
      return 'Sentimos sua falta! Quando precisar de uma corrida, o Ramo Nessa está por aqui. Abra o app e consulte a disponibilidade.';
    return `Hoje é ${t.name}! Obrigado por fazer parte do Ramo Nessa. Conte com a gente para seus trajetos.`;
  }
  async function toggleCampaign(c) {
    if (!hasScope('marketing:write') || !hasScope('marketing:send'))
      throw new Error('Sua conta precisa de permissão para ativar campanhas.');
    const enable = !c.enabled;
    await api.saveMarketingCampaign(getToken(), {
      id: c.id,
      expectedUpdatedAt: c.updatedAt,
      campaign: {
        ...c,
        enabled: enable,
        automatic: enable ? true : c.automatic,
      },
    });
    if (enable && !data.settings.enabled)
      await api.saveMarketingSettings(getToken(), {
        settings: { ...data.settings, enabled: true },
        expectedUpdatedAt: data.settings.updatedAt,
      });
    await load();
    status(
      enable
        ? 'Automação ativada. O app acompanha as regras a cada 15 minutos, dentro dos limites.'
        : 'Campanha pausada.',
    );
  }
  function renderAutomations() {
    const templates = data.templates.filter((t) =>
      ['birthday', 'calendar', 'inactive'].includes(t.trigger),
    );
    el('marketing-automations').replaceChildren(
      ...templates.map((t) => {
        const c = data.campaigns.find(
          (c) =>
            c.trigger === t.trigger &&
            c.calendarDay === t.calendarDay &&
            c.name === t.name,
        );
        const box = node('article', '', 'growth-automation');
        box.dataset.active = String(!!c?.enabled && data.settings.enabled);
        box.append(
          node(
            'span',
            t.trigger === 'birthday'
              ? 'ANIVERSÁRIOS'
              : t.trigger === 'inactive'
                ? 'RECONQUISTAR'
                : 'DATA ESPECIAL',
            'growth-kicker',
          ),
          node('h3', t.name),
        );
        const date = t.calendarDay
          ? t.calendarDay.split('-').reverse().join('/')
          : null;
        box.append(
          node(
            'p',
            t.trigger === 'birthday'
              ? 'No aniversário de cada cliente, todos os anos.'
              : date
                ? `${date} · todos os anos`
                : `Quando o cliente fica ${t.days} dias sem voltar.`,
          ),
        );
        box.append(
          node(
            'small',
            c
              ? `${c.enabled ? (data.settings.enabled ? 'Automação ligada' : 'Marketing geral pausado') : 'Pausada'} · ${c.couponValueCents ? formatCurrencyCents(c.couponValueCents) + ' de presente' : 'Sem cupom'}`
              : 'Mensagem pronta · sem cupom · Preá',
          ),
        );
        if (c && c.metrics.processed >= c.maxRecipients)
          box.append(
            node(
              'p',
              'Limite de destinatários alcançado. Abra Personalizar para ampliar.',
              'growth-warning',
            ),
          );
        if (
          c &&
          c.couponValueCents > 0 &&
          c.metrics.reservedCents + c.couponValueCents > c.budgetCents
        )
          box.append(
            node(
              'p',
              'Orçamento insuficiente para novos presentes. Abra Personalizar.',
              'growth-warning',
            ),
          );
        box.append(
          button(
            c?.enabled ? 'Pausar' : 'Ativar automático',
            'marketing:send',
            async () => {
              if (c) return toggleCampaign(c);
              if (!hasScope('marketing:write'))
                throw new Error('Sem permissão para criar campanhas.');
              const saved = await api.saveMarketingCampaign(getToken(), {
                campaign: {
                  ...t,
                  title:
                    t.trigger === 'birthday' ? 'Feliz aniversário!' : t.name,
                  message: presetMessage(t),
                  audience: 'all',
                  channels: data.channels.push ? ['inapp', 'push'] : ['inapp'],
                  zones: ['prea'],
                  categories: [],
                  startsAt: new Date().toISOString(),
                  endsAt: new Date(Date.now() + 3650 * 86400000).toISOString(),
                  automatic: true,
                  repeatAnnually: ['birthday', 'calendar'].includes(t.trigger),
                  enabled: false,
                  requireSupply: t.trigger === 'inactive',
                  couponValueCents: 0,
                  couponValidDays: 7,
                  budgetCents: 0,
                  maxRecipients: 100000,
                  channelCostCents: {
                    inapp: 0,
                    push: 0,
                    email: 0,
                    whatsapp: 0,
                  },
                  controlPercent: 0,
                },
              });
              // Reload first: if activation fails, the saved draft remains visible and reusable.
              await load();
              await toggleCampaign(saved.campaign);
            },
          ),
        );
        box.append(
          button(
            'Personalizar mensagem e cupom',
            'marketing:write',
            async () => {
              fill(c ?? null);
              if (!c) {
                const f = el('marketing-campaign-form');
                for (const key of ['name', 'trigger', 'days', 'threshold'])
                  f.elements.namedItem(key).value = t[key];
                f.elements.namedItem('calendarDay').value = t.calendarDay ?? '';
                f.elements.namedItem('title').value = t.name;
                f.elements.namedItem('message').value = presetMessage(t);
                f.elements.namedItem('automatic').checked = true;
                f.elements.namedItem('repeatAnnually').checked = [
                  'birthday',
                  'calendar',
                ].includes(t.trigger);
                for (const field of f.querySelectorAll('[name="zones"]'))
                  field.checked = field.value === 'prea';
                updateTriggerFields();
              }
              el('marketing-editor').open = true;
              el('marketing-editor').scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
              status(
                'Mensagem pronta. Personalize o presente e o orçamento, se desejar.',
              );
            },
          ),
        );
        return box;
      }),
    );
  }
  function issueCard(i, active) {
    const card = node('details', '', 'panel-card growth-issue');
    const heading = node('summary', '', 'growth-issue-heading');
    heading.append(
      node('span', labels[i.severity], 'growth-badge'),
      node('strong', i.title),
      node('small', labels[i.review?.status ?? 'new']),
    );
    card.append(heading);
    card.dataset.severity = i.severity;
    card.append(
      node('p', i.evidence),
      node(
        'small',
        `${i.zone ?? 'Todas as regiões'} · ${i.category ?? 'Todas as categorias'} · ${formatDateTime(i.at)}`,
      ),
    );
    card.append(node('h3', 'Possíveis causas'));
    for (const cause of i.causes) card.append(node('p', cause));
    card.append(node('h3', 'Ações sugeridas'));
    const list = node('ol');
    for (const action of i.actions) list.append(node('li', action));
    card.append(list);
    if (i.source === 'ride') {
      const a = node('a', 'Consultar viagens', 'button button--ghost-dark');
      a.href = '/admin/viagens';
      card.append(a);
    }
    if (i.source === 'support') {
      const a = node('a', 'Abrir suporte', 'button button--ghost-dark');
      a.href = '/admin/suporte';
      card.append(a);
    }
    if (i.source === 'marketing') {
      const a = node('a', 'Abrir marketing', 'button button--ghost-dark');
      a.href = '/admin/marketing';
      card.append(a);
    }
    if (active && i.review?.status === 'resolved')
      card.append(
        node(
          'p',
          'A condição continua detectada. Confira se a solução já teve efeito.',
          'growth-warning',
        ),
      );
    if (!active)
      card.append(
        node(
          'p',
          'Não detectado na consulta atual; confira a cobertura do período.',
        ),
      );
    const form = node('form', '', 'cost-form');
    const state = node('select');
    for (const value of ['new', 'in_progress', 'resolved']) {
      const option = node('option', labels[value]);
      option.value = value;
      state.append(option);
    }
    state.value = i.review?.status ?? 'new';
    const owner = node('input');
    owner.placeholder = 'Responsável';
    owner.maxLength = 80;
    owner.value = i.review?.owner ?? '';
    const notes = node('textarea');
    notes.placeholder = 'Investigação, ação tomada e resultado';
    notes.maxLength = 500;
    notes.value = i.review?.notes ?? '';
    for (const [text, control] of [
      ['Situação', state],
      ['Responsável', owner],
      ['Observação', notes],
    ]) {
      const label = node('label', text);
      label.append(control);
      form.append(label);
    }
    const save = node('button', 'Salvar acompanhamento', 'button button--dark');
    save.type = 'submit';
    save.disabled = !active || !hasScope('issues:write');
    form.append(save);
    listen(form, 'submit', (e) => {
      e.preventDefault();
      if (!hasScope('issues:write')) return;
      void perform(async () => {
        await api.reviewIssue(getToken(), {
          key: i.key,
          status: state.value,
          owner: owner.value,
          notes: notes.value,
        });
        await load();
      });
    });
    card.append(form);
    return card;
  }
  function renderIssues() {
    cards([
      ['Críticos', data.items.filter((i) => i.severity === 'critical').length],
      [
        'Precisam de atenção',
        data.items.filter((i) => i.severity === 'warning').length,
      ],
      [
        'Chamados e avisos',
        data.items.filter((i) => i.severity === 'info').length,
      ],
    ]);
    chart(
      'issue-chart',
      ['critical', 'warning', 'info'].map((severity) => [
        labels[severity],
        data.items.filter((i) => i.severity === severity).length,
        severity,
      ]),
    );
    const priority = [...data.items].sort(
      (a, b) =>
        ['critical', 'warning', 'info'].indexOf(a.severity) -
        ['critical', 'warning', 'info'].indexOf(b.severity),
    )[0];
    el('issue-next-title').textContent =
      priority?.title ?? 'Nenhum problema detectado';
    el('issue-next-action').textContent =
      priority?.actions[0] ??
      'Confira a cobertura da consulta abaixo. Continue acompanhando a operação.';
    const f = (id) => el(id).value;
    const items = data.items
      .filter(
        (i) =>
          (!f('issue-severity') || i.severity === f('issue-severity')) &&
          (!f('issue-zone') || i.zone === f('issue-zone')) &&
          (!f('issue-category') || i.category === f('issue-category')) &&
          (!f('issue-state') ||
            (i.review?.status ?? 'new') === f('issue-state')),
      )
      .sort(
        (a, b) =>
          ['critical', 'warning', 'info'].indexOf(a.severity) -
          ['critical', 'warning', 'info'].indexOf(b.severity),
      );
    el('issue-list').replaceChildren(
      ...(items.length
        ? items.map((i) => issueCard(i, true))
        : [
            node(
              'p',
              'Nenhum problema detectado nos dados consultados com estes filtros.',
            ),
          ]),
    );
    el('issue-history').replaceChildren(
      ...(data.history.length
        ? data.history.map((i) => issueCard(i, false))
        : [
            node('p', 'Nenhum acompanhamento anterior fora da consulta atual.'),
          ]),
    );
    const c = data.coverage;
    el('issue-coverage').textContent =
      `Consulta: ${c.rideSample} corridas recentes, ofertas de ${c.offerRideSample} corridas e ${c.supportSample} chamados.${c.limited ? ' A amostra alcançou um limite; não representa todas as ocorrências.' : ''}`;
    el('issue-unmeasured').replaceChildren(
      ...data.unmeasured.map((t) => node('p', t)),
    );
  }
  function fill(c = null) {
    editing = c;
    const form = el('marketing-campaign-form');
    form.reset();
    el('marketing-form-title').textContent = c
      ? 'Editar campanha'
      : 'Nova campanha';
    const v = c ?? {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    for (const key of [
      'name',
      'trigger',
      'days',
      'threshold',
      'title',
      'message',
      'audience',
      'couponValidDays',
      'maxRecipients',
      'controlPercent',
    ])
      if (v[key] != null) form.elements.namedItem(key).value = v[key];
    form.elements.namedItem('calendarDay').value = v.calendarDay ?? '';
    for (const key of [
      'enabled',
      'automatic',
      'requireSupply',
      'repeatAnnually',
    ]) {
      const field = form.elements.namedItem(key);
      if (v[key] != null) field.checked = v[key];
    }
    form.elements.namedItem('enabled').disabled =
      !c || !hasScope('marketing:send');
    for (const key of ['startsAt', 'endsAt'])
      form.elements.namedItem(key).value = localInput(v[key]);
    for (const [field, key] of [
      ['couponValue', 'couponValueCents'],
      ['budget', 'budgetCents'],
    ])
      form.elements.namedItem(field).value = ((v[key] ?? 0) / 100)
        .toFixed(2)
        .replace('.', ',');
    for (const ch of ['push', 'email', 'whatsapp'])
      form.elements.namedItem(
        `cost${ch[0].toUpperCase() + ch.slice(1)}`,
      ).value = ((v.channelCostCents?.[ch] ?? 0) / 100)
        .toFixed(2)
        .replace('.', ',');
    for (const key of ['channels', 'zones', 'categories'])
      if (v[key])
        for (const field of form.querySelectorAll(`[name="${key}"]`))
          field.checked = v[key].includes(field.value);
    updateTriggerFields();
    if (!hasScope('marketing:write'))
      for (const field of form.elements) field.disabled = true;
  }
  function formCampaign() {
    const form = el('marketing-campaign-form'),
      val = (n) => form.elements.namedItem(n).value;
    const checked = (n) => form.elements.namedItem(n).checked;
    const list = (n) =>
      [...form.querySelectorAll(`[name="${n}"]:checked`)].map((e) => e.value);
    return {
      name: val('name'),
      trigger: val('trigger'),
      days: Number(val('days')),
      threshold: Number(val('threshold')),
      calendarDay: val('calendarDay') || null,
      title: val('title'),
      message: val('message'),
      audience: val('audience'),
      channels: list('channels'),
      zones: list('zones'),
      categories: list('categories'),
      startsAt: instant(val('startsAt')),
      endsAt: instant(val('endsAt')),
      couponValueCents: moneyToCents(val('couponValue')),
      couponValidDays: Number(val('couponValidDays')),
      budgetCents: moneyToCents(val('budget')),
      maxRecipients: Number(val('maxRecipients')),
      controlPercent: Number(val('controlPercent')),
      channelCostCents: {
        inapp: 0,
        push: moneyToCents(val('costPush')),
        email: moneyToCents(val('costEmail')),
        whatsapp: moneyToCents(val('costWhatsapp')),
      },
      enabled: !!editing && checked('enabled'),
      automatic: checked('automatic'),
      repeatAnnually: checked('repeatAnnually'),
      requireSupply: checked('requireSupply'),
    };
  }
  function detail(payload, type) {
    const nodes = [];
    if (type === 'preview') {
      nodes.push(
        node('h3', payload.campaign.name),
        node(
          'p',
          `${payload.scanned} clientes consultados · ${payload.eligible} elegíveis · ${payload.control} no grupo de comparação.`,
        ),
        node(
          'p',
          `Reserva máxima prevista: ${formatCurrencyCents(payload.estimatedMaximumCents)}. Restante: ${formatCurrencyCents(payload.remainingBudgetCents)} e ${payload.remainingRecipients} destinatários.`,
        ),
      );
      if (!payload.complete)
        nodes.push(
          node(
            'p',
            'Consulta limitada. A execução será bloqueada.',
            'growth-warning',
          ),
        );
      if (!payload.campaign.enabled || !payload.settings.enabled)
        nodes.push(node('p', 'Prévia de regras. O envio está desligado.'));
      if (payload.quiet)
        nodes.push(node('p', 'Horário de silêncio: envio bloqueado.'));
      nodes.push(node('h3', 'Motivos de exclusão'));
      for (const [reason, count] of Object.entries(payload.reasons))
        nodes.push(node('p', `${reason}: ${count}`));
    } else {
      for (const [key, g] of Object.entries(payload.groups))
        nodes.push(
          node(
            'h3',
            key === 'contact' ? 'Grupo de campanha' : 'Grupo de comparação',
          ),
          node(
            'p',
            `${g.assigned} participantes · ${g.observed} com 14 dias de observação · ${g.converted} fizeram corrida · ${g.redeemed} presentes usados · comissão bruta ${formatCurrencyCents(g.commissionCents)}.`,
          ),
        );
      const chartBox = node('div');
      chartBox.id = 'marketing-conversion-chart';
      nodes.push(chartBox, node('p', payload.interpretation));
    }
    el('marketing-detail').replaceChildren(...nodes);
    if (type !== 'preview')
      chart(
        'marketing-conversion-chart',
        Object.entries(payload.groups).map(([key, group]) => [
          key === 'contact'
            ? 'Fizeram corrida · campanha'
            : 'Fizeram corrida · comparação',
          group.converted,
          key,
        ]),
      );
    el('marketing-detail-panel').hidden = false;
    el('marketing-detail-panel').scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
  function renderMarketing() {
    el('marketing-master').textContent = data.settings.enabled
      ? 'Pausar todo o marketing'
      : 'Ligar marketing';
    el('marketing-master').disabled =
      !hasScope('marketing:write') || !hasScope('marketing:send');
    cards([
      ['Marketing', data.settings.enabled ? 'Ativado' : 'Desligado'],
      ['Campanhas ativadas', data.campaigns.filter((c) => c.enabled).length],
      [
        'Reservado no orçamento',
        formatCurrencyCents(
          data.campaigns.reduce((s, c) => s + c.metrics.reservedCents, 0),
        ),
      ],
    ]);
    el('marketing-channels').replaceChildren(
      ...Object.entries(data.channels).map(([ch, ready]) =>
        node(
          'span',
          `${labels[ch]}: ${ready ? 'configurado' : 'indisponível'}`,
          'growth-badge',
        ),
      ),
    );
    const f = el('marketing-settings');
    for (const key of ['maxContactsPerWeek', 'quietStartHour', 'quietEndHour'])
      f.elements.namedItem(key).value = data.settings[key];
    f.elements.namedItem('enabled').checked = data.settings.enabled;
    for (const control of f.elements)
      control.disabled = !hasScope('marketing:write');
    f.elements.namedItem('enabled').disabled = !hasScope('marketing:send');
    chart('marketing-chart', [
      [
        'Clientes contatados¹',
        data.campaigns.reduce((n, c) => n + c.metrics.contacted, 0),
        'contact',
      ],
      [
        'Aberturas no app',
        data.campaigns.reduce((n, c) => n + c.metrics.opened, 0),
        'opened',
      ],
      [
        'Grupo de comparação',
        data.campaigns.reduce((n, c) => n + c.metrics.control, 0),
        'control',
      ],
    ]);
    el('marketing-chart').append(
      node(
        'small',
        '¹ Soma por campanha; um cliente pode aparecer em mais de uma. Não representa corridas nem retorno financeiro.',
      ),
    );
    renderAutomations();
    const select = el('marketing-template');
    select.replaceChildren(node('option', 'Escolha um modelo'));
    select.firstChild.value = '';
    data.templates.forEach((t, i) => {
      const option = node('option', t.name);
      option.value = i;
      select.append(option);
    });
    el('marketing-campaigns').replaceChildren(
      ...(data.campaigns.length
        ? data.campaigns.map((c) => {
            const box = node('article', '', 'growth-campaign');
            box.append(
              node('h3', c.name),
              node(
                'p',
                `${c.enabled ? 'Ativada' : 'Desligada'} · ${c.automatic ? 'Automática' : 'Manual'}${c.repeatAnnually ? ' · repete todo ano' : ''} · ${c.channels.map((ch) => labels[ch]).join(', ')} · ${c.zones.join(', ') || 'Todas as regiões'}`,
              ),
              node(
                'p',
                `Teto ${formatCurrencyCents(c.budgetCents)} · reservado ${formatCurrencyCents(c.metrics.reservedCents)} · ${c.metrics.contacted} contatados · ${c.metrics.opened} aberturas registradas · ${c.metrics.control} no grupo de comparação.`,
              ),
            );
            if (
              c.metrics.processed >= c.maxRecipients ||
              (c.couponValueCents > 0 &&
                c.metrics.reservedCents + c.couponValueCents > c.budgetCents)
            )
              box.append(
                node(
                  'p',
                  'Limite alcançado. Personalize o orçamento ou o máximo de destinatários para continuar.',
                  'growth-warning',
                ),
              );
            if (!c.repeatAnnually && Date.parse(c.endsAt) <= Date.now())
              box.append(
                node(
                  'p',
                  'Período encerrado. Atualize as datas para continuar.',
                  'growth-warning',
                ),
              );
            box.append(
              button(
                c.enabled ? 'Pausar' : 'Ativar automático',
                'marketing:send',
                async () => {
                  await toggleCampaign(c);
                },
              ),
              button('Personalizar', 'marketing:write', async () => {
                fill(c);
                el('marketing-editor').open = true;
                el('marketing-campaign-form').scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
                status('Revise a campanha antes de salvar.');
              }),
              button(
                'Ver oportunidades / prévia',
                'marketing:read',
                async () => {
                  detail(
                    await api.marketingPreview(getToken(), c.id),
                    'preview',
                  );
                  status('Prévia atualizada.');
                },
              ),
              button('Ver resultados', 'marketing:read', async () => {
                detail(await api.marketingReport(getToken(), c.id), 'report');
                status('Resultados atualizados.');
              }),
            );
            const actions = node('details', '', 'growth-secondary-actions');
            actions.append(node('summary', 'Envio manual'));
            const send = button('Executar lote', 'marketing:send', async () => {
              const p = await api.marketingPreview(getToken(), c.id);
              detail(p, 'preview');
              if (
                !p.complete ||
                !p.settings.enabled ||
                !p.campaign.enabled ||
                p.quiet
              )
                throw new Error(
                  'Confira a prévia: envio desligado, limitado ou em horário de silêncio.',
                );
              if (
                !globalThis.confirm(
                  `Executar um lote de até 100 destinatários de “${c.name}”, respeitando o orçamento e as preferências?`,
                )
              ) {
                status('Envio cancelado.');
                return;
              }
              const result = await api.executeMarketing(getToken(), c.id);
              await load();
              status(
                `${result.reserved} reservas, ${result.processed} processadas. Confira os resultados por canal.`,
              );
            });
            actions.append(send);
            box.append(actions);
            return box;
          })
        : [
            node(
              'p',
              'Nenhuma campanha cadastrada. Comece com um modelo e revise os controles.',
            ),
          ]),
    );
    el('marketing-notes').replaceChildren(
      ...data.notes.map((t) => node('p', t)),
    );
  }
  async function load() {
    const seq = ++sequence;
    status('Consultando…');
    try {
      const payload = await (view === 'issues'
        ? api.issues(getToken())
        : api.marketing(getToken()));
      if (stopped || seq !== sequence) return;
      data = payload;
      if (view === 'issues') renderIssues();
      else renderMarketing();
      status('Dados atualizados.');
    } catch (e) {
      if (!stopped && seq === sequence) {
        status(e.message);
        onError?.(e);
      }
    }
  }
  listen(el('growth-refresh'), 'click', () => void load());
  if (view === 'issues') {
    for (const id of [
      'issue-severity',
      'issue-zone',
      'issue-category',
      'issue-state',
    ])
      listen(el(id), 'change', () => {
        if (data) renderIssues();
      });
  } else {
    fill();
    listen(
      el('marketing-master'),
      'click',
      () =>
        void perform(async () => {
          if (
            !data ||
            !hasScope('marketing:write') ||
            !hasScope('marketing:send')
          )
            return;
          const enabled = !data.settings.enabled;
          await api.saveMarketingSettings(getToken(), {
            settings: { ...data.settings, enabled },
            expectedUpdatedAt: data.settings.updatedAt,
          });
          await load();
          status(
            enabled
              ? 'Marketing ligado. Apenas campanhas ativadas serão executadas.'
              : 'Todas as campanhas pausadas pelo controle geral.',
          );
        }),
    );
    listen(el('marketing-reset'), 'click', () => fill());
    listen(
      el('marketing-campaign-form').elements.namedItem('trigger'),
      'change',
      updateTriggerFields,
    );
    listen(
      el('marketing-campaign-form').elements.namedItem('repeatAnnually'),
      'change',
      updateTriggerFields,
    );
    listen(el('marketing-template'), 'change', () => {
      if (!data) return;
      const t = data.templates[Number(el('marketing-template').value)];
      if (!t || el('marketing-template').value === '') return;
      fill();
      const form = el('marketing-campaign-form');
      for (const key of ['name', 'trigger', 'days', 'threshold'])
        form.elements.namedItem(key).value = t[key];
      form.elements.namedItem('calendarDay').value = t.calendarDay ?? '';
      form.elements.namedItem('title').value = t.name;
      form.elements.namedItem('message').value = presetMessage(t);
      form.elements.namedItem('automatic').checked = true;
      form.elements.namedItem('repeatAnnually').checked = [
        'birthday',
        'calendar',
      ].includes(t.trigger);
      updateTriggerFields();
    });
    listen(el('marketing-settings'), 'submit', (e) => {
      e.preventDefault();
      if (!hasScope('marketing:write')) return;
      void perform(async () => {
        const f = e.currentTarget,
          s = {
            enabled: f.elements.namedItem('enabled').checked,
            maxContactsPerWeek: Number(
              f.elements.namedItem('maxContactsPerWeek').value,
            ),
            quietStartHour: Number(
              f.elements.namedItem('quietStartHour').value,
            ),
            quietEndHour: Number(f.elements.namedItem('quietEndHour').value),
          };
        await api.saveMarketingSettings(getToken(), {
          settings: s,
          expectedUpdatedAt: data.settings.updatedAt,
        });
        await load();
      });
    });
    listen(el('marketing-campaign-form'), 'submit', (e) => {
      e.preventDefault();
      if (!hasScope('marketing:write')) return;
      void perform(async () => {
        const c = formCampaign();
        if (c.couponValueCents > 0 && !hasScope('finance:write'))
          throw new Error('Presentes exigem permissão financeira.');
        await api.saveMarketingCampaign(getToken(), {
          id: editing?.id,
          campaign: c,
          expectedUpdatedAt: editing?.updatedAt,
        });
        fill();
        el('marketing-editor').open = false;
        await load();
        status('Campanha salva. Use Ativar automático na lista para começar.');
      });
    });
  }
  void load();
  return {
    load,
    destroy() {
      stopped = true;
      sequence++;
      abort.abort();
    },
  };
}
