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
  function issueCard(i, active) {
    const card = node('article', '', 'panel-card growth-issue');
    card.dataset.severity = i.severity;
    card.append(
      node('span', labels[i.severity], 'growth-badge'),
      node('h2', i.title),
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
    for (const key of ['enabled', 'automatic', 'requireSupply']) {
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
      nodes.push(node('p', payload.interpretation));
    }
    el('marketing-detail').replaceChildren(...nodes);
    el('marketing-detail-panel').hidden = false;
    el('marketing-detail-panel').scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
  function renderMarketing() {
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
                `${c.enabled ? 'Ativada' : 'Desligada'} · ${c.automatic ? 'Automática' : 'Manual'} · ${c.channels.map((ch) => labels[ch]).join(', ')} · ${c.zones.join(', ') || 'Todas as regiões'}`,
              ),
              node(
                'p',
                `Teto ${formatCurrencyCents(c.budgetCents)} · reservado ${formatCurrencyCents(c.metrics.reservedCents)} · ${c.metrics.contacted} contatados · ${c.metrics.opened} aberturas registradas · ${c.metrics.control} no grupo de comparação.`,
              ),
            );
            box.append(
              button('Editar', 'marketing:write', async () => {
                fill(c);
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
            box.append(send);
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
    listen(el('marketing-reset'), 'click', () => fill());
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
      form.elements.namedItem('message').value =
        'Confira as novidades e os benefícios disponíveis para você no Ramo Nessa.';
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
        await load();
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
