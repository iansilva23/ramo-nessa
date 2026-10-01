export const benefitCategories = Object.freeze({
  moto: 'Mototáxi',
  car: 'Carro',
  delivery: 'Entrega',
  comfort_black: 'Comfort / 4x4',
  buggy: 'Buggy',
});

const statusLabels = Object.freeze({
  draft: 'Rascunho',
  scheduled: 'Agendada',
  active: 'Ativa',
  paused: 'Pausada',
  ended: 'Encerrada',
});

function integer(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} deve ficar entre ${min} e ${max}.`);
  }
  return number;
}

function lines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateIso(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    throw new Error(`${label} inválido.`);
  }
  return date.toISOString();
}

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseMissionLines(value) {
  return lines(value).map((line, index) => {
    const parts = line.split('|').map((item) => item.trim());
    if (parts.length < 4) {
      throw new Error(
        `Missão ${index + 1}: use tipo|meta|pontos|título.`,
      );
    }
    const [rawKind, rawTarget, rawBonus, ...titleParts] = parts;
    const kind =
      rawKind.toLowerCase() === 'corridas'
        ? 'completed_rides'
        : rawKind.toLowerCase() === '5estrelas'
          ? 'five_star_ratings'
          : null;
    if (kind == null) {
      throw new Error(
        `Missão ${index + 1}: tipo deve ser corridas ou 5estrelas.`,
      );
    }
    const title = titleParts.join(' | ').trim();
    if (title.length < 3 || title.length > 100) {
      throw new Error(`Missão ${index + 1}: título inválido.`);
    }
    return {
      id: `${kind}-${index + 1}`,
      title,
      kind,
      target: integer(rawTarget, `Meta da missão ${index + 1}`, 1, 100000),
      bonusPoints: integer(
        rawBonus,
        `Pontos da missão ${index + 1}`,
        0,
        100000,
      ),
    };
  });
}

function parsePrizeLines(value) {
  const used = new Set();
  return lines(value).map((line, index) => {
    const separator = line.indexOf('|');
    if (separator < 1) {
      throw new Error(
        `Prêmio ${index + 1}: use posição|descrição.`,
      );
    }
    const rank = integer(
      line.slice(0, separator).trim(),
      `Posição do prêmio ${index + 1}`,
      1,
      50,
    );
    if (used.has(rank)) {
      throw new Error(`A posição ${rank} está repetida nos prêmios.`);
    }
    used.add(rank);
    const label = line.slice(separator + 1).trim();
    if (label.length < 2 || label.length > 160) {
      throw new Error(`Prêmio ${index + 1}: descrição inválida.`);
    }
    return { rank, label };
  });
}

export function benefitRegionOptionsFromCatalog(catalog) {
  const result = new Map();
  const add = (zoneId, localityId, label) => {
    if (!zoneId) return;
    const zone = String(zoneId).trim();
    const locality =
      localityId == null || String(localityId).trim() === ''
        ? null
        : String(localityId).trim();
    const key = locality == null ? zone : `${zone}|${locality}`;
    if (!result.has(key)) {
      result.set(key, {
        zoneId: zone,
        ...(locality == null ? {} : { localityId: locality }),
        label: label || (locality == null ? zone : `${zone} · ${locality}`),
      });
    }
  };

  for (const zone of ['jericoacoara', 'prea', 'jijoca']) {
    add(zone, null, zone === 'jericoacoara' ? 'Jericoacoara' : zone[0].toUpperCase() + zone.slice(1));
  }

  const localities =
    catalog?.localities && typeof catalog.localities === 'object'
      ? catalog.localities
      : {};
  for (const [zoneId, items] of Object.entries(localities)) {
    add(zoneId, null);
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item?.localityId) {
        add(
          zoneId,
          item.localityId,
          item.label || `${zoneId} · ${item.localityId}`,
        );
      }
    }
  }

  for (const geofence of Array.isArray(catalog?.localityGeofences)
    ? catalog.localityGeofences
    : []) {
    if (geofence?.zoneId && geofence?.localityId) {
      add(
        geofence.zoneId,
        geofence.localityId,
        geofence.label ||
          `${geofence.zoneId} · ${geofence.localityId}`,
      );
    }
  }

  return [...result.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR'),
  );
}

export function driverBenefitCampaignPayload(values) {
  const startsAt = dateIso(values.startsAt, 'Início');
  const endsAt = dateIso(values.endsAt, 'Fim');
  if (endsAt <= startsAt) {
    throw new Error('O fim da campanha deve ser posterior ao início.');
  }

  const cancelPercent = Number(
    String(values.cancelMaxPercent).replace(',', '.'),
  );
  if (
    !Number.isFinite(cancelPercent) ||
    cancelPercent < 0 ||
    cancelPercent > 100
  ) {
    throw new Error('Percentual máximo de cancelamento inválido.');
  }

  const participantDriverIds = lines(values.participantDriverIds);
  if (
    values.participantMode === 'selected' &&
    participantDriverIds.length === 0
  ) {
    throw new Error(
      'Informe ao menos um motorista para uma campanha selecionada.',
    );
  }

  const topCount = integer(values.topCount, 'Top premiado', 1, 50);
  const prizes = parsePrizeLines(values.prizes);
  if (prizes.some((prize) => prize.rank > topCount)) {
    throw new Error('A posição do prêmio deve estar dentro do Top premiado.');
  }
  return {
    name: String(values.name ?? '').trim(),
    category: values.category,
    regionMode: values.regionMode,
    participantMode: values.participantMode,
    regions: Array.isArray(values.regions) ? values.regions : [],
    participantDriverIds,
    excludedDriverIds: lines(values.excludedDriverIds),
    startsAt,
    endsAt,
    topCount,
    minParticipants: integer(
      values.minParticipants,
      'Mínimo de participantes',
      1,
      10000,
    ),
    ridePoints: integer(
      values.ridePoints,
      'Pontos por corrida',
      0,
      100000,
    ),
    fiveStarPoints: integer(
      values.fiveStarPoints,
      'Pontos por 5 estrelas',
      0,
      100000,
    ),
    fourStarPoints: integer(
      values.fourStarPoints,
      'Pontos por 4 estrelas',
      0,
      100000,
    ),
    lowCancellationMaxBps: Math.round(cancelPercent * 100),
    lowCancellationBonusPoints: integer(
      values.cancelBonus,
      'Bônus por baixo cancelamento',
      0,
      100000,
    ),
    missions: parseMissionLines(values.missions),
    prizes,
  };
}

export function driverBenefitCampaignPatch(campaign, values) {
  const payload = driverBenefitCampaignPayload(values);
  if (campaign.rulesLocked) {
    return { name: payload.name, prizes: payload.prizes, expectedUpdatedAt: campaign.updatedAt };
  }
  for (const key of ['startsAt', 'endsAt']) {
    if (values[key] === localDateTimeValue(campaign[key])) payload[key] = campaign[key];
  }
  payload.missions = payload.missions.map((mission, index) => {
    const previous = campaign.missions?.[index];
    return previous?.kind === mission.kind && previous.title === mission.title
      ? { ...mission, id: previous.id } : mission;
  });
  return { ...payload, expectedUpdatedAt: campaign.updatedAt };
}

export function createDriverBenefitsAdmin({
  root,
  api,
  getToken,
  hasScope,
  onError,
}) {
  let destroyed = false;
  let busy = false;
  let data = { settings: { enabled: false }, campaigns: [] };
  let regionOptions = [];
  let editingCampaign = null;
  const listeners = [];
  const el = (id) => root.querySelector(`#${id}`);

  function listen(target, type, handler) {
    if (target == null) return;
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  }

  function show(message = '', tone = 'neutral') {
    const target = el('benefits-message');
    if (target == null || destroyed) return;
    target.textContent = message;
    target.dataset.tone = tone;
    target.hidden = !message;
  }

  function handle(error) {
    show(error?.message || 'Não foi possível concluir a operação.', 'danger');
    onError?.(error);
  }

  function selectedRegions() {
    return [...el('benefit-regions').selectedOptions].map((option) => {
      const found = regionOptions.find((item) => item.key === option.value);
      return found?.region;
    }).filter(Boolean);
  }

  function renderRegionOptions(catalog) {
    const select = el('benefit-regions');
    const current = new Set([...select.selectedOptions].map((option) => option.value));
    regionOptions = benefitRegionOptionsFromCatalog(catalog).map((item) => ({
      key: item.localityId == null
        ? item.zoneId
        : `${item.zoneId}|${item.localityId}`,
      label: item.label,
      region: {
        zoneId: item.zoneId,
        ...(item.localityId == null ? {} : { localityId: item.localityId }),
      },
    }));
    select.replaceChildren();
    for (const item of regionOptions) {
      const option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.label;
      option.selected = current.has(item.key);
      select.append(option);
    }
  }

  async function loadRegions() {
    if (!hasScope('pricing:read')) {
      renderRegionOptions(null);
      return;
    }
    try {
      const catalog = await api.pricingCatalog(getToken());
      if (!destroyed) renderRegionOptions(catalog);
    } catch {
      if (!destroyed) renderRegionOptions(null);
    }
  }

  function syncParticipantMode() {
    const selected = el('benefit-participant-mode').value === 'selected';
    el('benefit-selected-driver-ids-field').hidden = !selected;
  }

  function resetForm() {
    editingCampaign = null;
    el('benefit-campaign-form').reset();
    el('benefit-campaign-id').value = '';
    el('benefit-top-count').value = '3';
    el('benefit-min-participants').value = '5';
    el('benefit-ride-points').value = '20';
    el('benefit-five-star-points').value = '5';
    el('benefit-four-star-points').value = '2';
    el('benefit-cancel-max-percent').value = '5';
    el('benefit-cancel-bonus').value = '100';
    el('benefit-form-title').textContent = 'Nova campanha';
    el('benefit-save').textContent = 'Criar campanha em rascunho';
    syncParticipantMode();
    setBusy(busy);
  }

  function campaignValues() {
    return {
      name: el('benefit-name').value,
      category: el('benefit-category').value,
      startsAt: el('benefit-starts-at').value,
      endsAt: el('benefit-ends-at').value,
      regionMode: el('benefit-region-mode').value,
      participantMode: el('benefit-participant-mode').value,
      regions: selectedRegions(),
      participantDriverIds: el('benefit-participant-driver-ids').value,
      excludedDriverIds: el('benefit-excluded-driver-ids').value,
      topCount: el('benefit-top-count').value,
      minParticipants: el('benefit-min-participants').value,
      ridePoints: el('benefit-ride-points').value,
      fiveStarPoints: el('benefit-five-star-points').value,
      fourStarPoints: el('benefit-four-star-points').value,
      cancelMaxPercent: el('benefit-cancel-max-percent').value,
      cancelBonus: el('benefit-cancel-bonus').value,
      missions: el('benefit-missions').value,
      prizes: el('benefit-prizes').value,
    };
  }

  function regionKey(region) {
    return region.localityId == null
      ? region.zoneId
      : `${region.zoneId}|${region.localityId}`;
  }

  function editCampaign(campaign) {
    editingCampaign = campaign;
    el('benefit-campaign-id').value = campaign.id;
    el('benefit-name').value = campaign.name;
    el('benefit-category').value = campaign.category;
    el('benefit-starts-at').value = localDateTimeValue(campaign.startsAt);
    el('benefit-ends-at').value = localDateTimeValue(campaign.endsAt);
    el('benefit-region-mode').value = campaign.regionMode;
    el('benefit-participant-mode').value = campaign.participantMode;
    const selected = new Set((campaign.regions ?? []).map(regionKey));
    for (const region of campaign.regions ?? []) {
      const key = regionKey(region);
      if (regionOptions.some((item) => item.key === key)) continue;
      regionOptions.push({ key, label: key, region });
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      el('benefit-regions').append(option);
    }
    for (const option of el('benefit-regions').options) {
      option.selected = selected.has(option.value);
    }
    el('benefit-participant-driver-ids').value =
      (campaign.participantDriverIds ?? []).join('\n');
    el('benefit-excluded-driver-ids').value =
      (campaign.excludedDriverIds ?? []).join('\n');
    el('benefit-top-count').value = String(campaign.topCount);
    el('benefit-min-participants').value = String(campaign.minParticipants);
    el('benefit-ride-points').value = String(campaign.scoring?.ridePoints ?? 20);
    el('benefit-five-star-points').value =
      String(campaign.scoring?.fiveStarPoints ?? 5);
    el('benefit-four-star-points').value =
      String(campaign.scoring?.fourStarPoints ?? 2);
    el('benefit-cancel-max-percent').value =
      String((campaign.scoring?.lowCancellationMaxBps ?? 500) / 100);
    el('benefit-cancel-bonus').value =
      String(campaign.scoring?.lowCancellationBonusPoints ?? 100);
    el('benefit-missions').value = (campaign.missions ?? []).map((mission) => {
      const kind =
        mission.kind === 'completed_rides' ? 'corridas' : '5estrelas';
      return `${kind}|${mission.target}|${mission.bonusPoints}|${mission.title}`;
    }).join('\n');
    el('benefit-prizes').value = (campaign.prizes ?? [])
      .map((prize) => `${prize.rank}|${prize.label}`)
      .join('\n');
    el('benefit-form-title').textContent = 'Editar campanha';
    el('benefit-save').textContent = 'Salvar alterações';
    syncParticipantMode();
    setBusy(busy);
    el('benefit-campaign-form').scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function setBusy(value) {
    busy = value;
    const locked = editingCampaign?.rulesLocked === true;
    el('benefit-rules-lock-note').hidden = !locked;
    for (const control of root.querySelectorAll('button,input,select,textarea')) {
      if (control.dataset.benefitScope) {
        control.disabled = value || !hasScope(control.dataset.benefitScope);
        continue;
      }
      if (control.id === 'benefits-refresh') {
        control.disabled = value;
        continue;
      }
      if (
        control.closest('#benefit-campaign-form') ||
        control.closest('#benefit-base-form') ||
        control.id === 'benefits-global-toggle'
      ) {
        const lockedField = locked && control.closest('#benefit-campaign-form') &&
          !['benefit-name', 'benefit-prizes', 'benefit-save', 'benefit-campaign-id'].includes(control.id);
        control.disabled = value || !hasScope('drivers:benefits:write') || lockedField;
      }
    }
  }

  function formatDate(value) {
    return value
      ? new Date(value).toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '—';
  }

  function statusButton(label, status, campaign) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--ghost-dark';
    button.textContent = label;
    button.dataset.benefitScope = 'drivers:benefits:write';
    button.disabled = busy || !hasScope('drivers:benefits:write');
    listen(button, 'click', () => {
      if (status === 'ended' && !globalThis.confirm('Encerrar a campanha e preservar sua classificação final? Ela não poderá ser reaberta.')) return;
      void perform(async () => {
        await api.setDriverBenefitCampaignStatus(
          getToken(),
          campaign.id,
          status,
          campaign.updatedAt,
        );
        await reload();
        show('Status da campanha atualizado.', 'success');
      });
    });
    return button;
  }

  function renderCampaigns() {
    const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    el('benefits-campaign-count').textContent =
      `${campaigns.length} campanha(s)`;
    const list = el('benefits-campaign-list');
    list.replaceChildren();
    el('benefits-campaign-empty').hidden = campaigns.length !== 0;

    for (const campaign of campaigns) {
      const card = document.createElement('article');
      card.className = 'benefits-campaign-card';

      const head = document.createElement('div');
      head.className = 'benefits-campaign-card__head';
      const identity = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = campaign.name;
      const subtitle = document.createElement('p');
      subtitle.className = 'muted-copy';
      const regions = (campaign.regions ?? []).length === 0
        ? 'Toda a operação'
        : campaign.regions.map((region) =>
            region.localityId
              ? `${region.zoneId} · ${region.localityId}`
              : region.zoneId,
          ).join(', ');
      subtitle.textContent =
        `${benefitCategories[campaign.category] ?? campaign.category} · ${regions}`;
      identity.append(title, subtitle);
      const status = document.createElement('span');
      status.className =
        `pill ${campaign.effectiveStatus === 'active' ? 'pill--success' : 'pill--neutral'}`;
      status.textContent =
        statusLabels[campaign.effectiveStatus] ?? campaign.effectiveStatus;
      head.append(identity, status);

      const facts = document.createElement('div');
      facts.className = 'benefits-campaign-facts';
      const factValues = [
        ['Período', `${formatDate(campaign.startsAt)} → ${formatDate(campaign.endsAt)}`],
        ['Premiação', `Top ${campaign.topCount}`],
        ['Mínimo', `${campaign.minParticipants} participantes`],
        ['Participação',
          campaign.participantMode === 'selected'
            ? 'Motoristas selecionados'
            : 'Todos os elegíveis'],
      ];
      for (const [label, value] of factValues) {
        const fact = document.createElement('div');
        const small = document.createElement('span');
        small.textContent = label;
        const strong = document.createElement('strong');
        strong.textContent = value;
        fact.append(small, strong);
        facts.append(fact);
      }

      const awards = document.createElement('p');
      awards.className = 'muted-copy';
      awards.textContent =
        (campaign.prizes ?? []).length === 0
          ? 'Sem prêmio descrito.'
          : 'Prêmios: ' +
            campaign.prizes
              .map((prize) => `${prize.rank}º — ${prize.label}`)
              .join(' · ');

      const actions = document.createElement('div');
      actions.className = 'benefits-action-row';
      const leaderboard = document.createElement('button');
      leaderboard.type = 'button';
      leaderboard.className = 'button button--dark';
      leaderboard.textContent = 'Ver ranking';
      leaderboard.dataset.benefitScope = 'drivers:benefits:read';
      leaderboard.disabled = busy || !hasScope('drivers:benefits:read');
      listen(leaderboard, 'click', () => {
        void loadLeaderboard(campaign).catch(handle);
      });
      actions.append(leaderboard);

      if (hasScope('drivers:benefits:write')) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'button button--ghost-dark';
        edit.textContent = 'Editar';
        edit.dataset.benefitScope = 'drivers:benefits:write';
        edit.disabled = busy;
        listen(edit, 'click', () => editCampaign(campaign));
        if (campaign.effectiveStatus !== 'ended') actions.append(edit);

        if (campaign.status === 'draft') {
          actions.append(statusButton('Agendar', 'scheduled', campaign));
          if (Date.parse(campaign.startsAt) <= Date.now() && Date.now() < Date.parse(campaign.endsAt)) {
            actions.append(statusButton('Ativar', 'active', campaign));
          }
        } else if (
          campaign.effectiveStatus === 'active' &&
          campaign.status !== 'paused'
        ) {
          actions.append(statusButton('Pausar', 'paused', campaign));
          actions.append(statusButton('Encerrar', 'ended', campaign));
        } else if (campaign.status === 'paused') {
          actions.append(statusButton('Retomar', 'active', campaign));
          actions.append(statusButton('Encerrar', 'ended', campaign));
        } else if (campaign.effectiveStatus === 'scheduled') {
          actions.append(statusButton('Voltar a rascunho', 'draft', campaign));
        }
      }

      card.append(head, facts, awards, actions);
      list.append(card);
    }
  }

  function renderGlobal() {
    const enabled = data.settings?.enabled === true;
    const pill = el('benefits-global-status');
    pill.textContent = enabled ? 'Ativado' : 'Desativado';
    pill.className = `pill ${enabled ? 'pill--success' : 'pill--neutral'}`;
    const button = el('benefits-global-toggle');
    button.textContent = enabled ? 'Desativar módulo' : 'Ativar módulo';
    button.className =
      enabled ? 'button button--ghost-dark' : 'button button--primary';
  }

  async function reload() {
    const payload = await api.driverBenefits(getToken());
    if (destroyed) return;
    data = payload;
    renderGlobal();
    renderCampaigns();
  }

  async function perform(action) {
    if (busy || destroyed) return;
    setBusy(true);
    show();
    try {
      await action();
    } catch (error) {
      handle(error);
    } finally {
      if (!destroyed) setBusy(false);
    }
  }

  async function loadLeaderboard(campaign) {
    const payload = await api.driverBenefitLeaderboard(
      getToken(),
      campaign.id,
    );
    if (destroyed) return;
    el('benefits-leaderboard-card').hidden = false;
    el('benefits-leaderboard-title').textContent =
      `Ranking — ${campaign.name}`;
    el('benefits-leaderboard-meta').textContent =
      `${payload.participantCount} participante(s) · ` +
      (payload.prizesUnlocked
        ? 'premiação liberada pelo mínimo configurado'
        : 'mínimo de participantes ainda não atingido');

    const podium = el('benefits-podium');
    podium.replaceChildren();
    for (const entry of (payload.leaderboard ?? []).slice(0, 3)) {
      const item = document.createElement('div');
      item.className = `benefits-podium__item benefits-podium__item--${entry.rank}`;
      const rank = document.createElement('strong');
      rank.textContent = `#${entry.rank}`;
      const name = document.createElement('span');
      name.textContent = entry.displayName;
      const points = document.createElement('small');
      points.textContent = `${entry.points.toLocaleString('pt-BR')} pts`;
      item.append(rank, name, points);
      podium.append(item);
    }

    const body = el('benefits-leaderboard-body');
    body.replaceChildren();
    for (const entry of payload.leaderboard ?? []) {
      const row = document.createElement('tr');
      const values = [
        `#${entry.rank}`,
        entry.displayName,
        entry.points.toLocaleString('pt-BR'),
        String(entry.completedRides),
        entry.ratingAverage > 0
          ? entry.ratingAverage.toFixed(2).replace('.', ',')
          : '—',
      ];
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
    el('benefits-leaderboard-card').scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  listen(el('benefit-participant-mode'), 'change', syncParticipantMode);
  listen(el('benefit-form-reset'), 'click', resetForm);
  listen(el('benefits-refresh'), 'click', () => void perform(reload));
  listen(el('benefits-global-toggle'), 'click', () => {
    void perform(async () => {
      const enabled = data.settings?.enabled !== true;
      if (
        enabled &&
        !window.confirm(
          'Ativar Ranking & Benefícios globalmente? Somente campanhas ativas e elegíveis aparecerão para os motoristas.',
        )
      ) {
        return;
      }
      await api.setDriverBenefitsEnabled(getToken(), enabled);
      await reload();
      show(
        enabled
          ? 'Módulo global ativado.'
          : 'Módulo global desativado. Campanhas e pontos foram preservados.',
        'success',
      );
    });
  });

  listen(el('benefit-campaign-form'), 'submit', (event) => {
    event.preventDefault();
    if (!hasScope('drivers:benefits:write')) return;
    void perform(async () => {
      const payload = driverBenefitCampaignPayload(campaignValues());
      const id = el('benefit-campaign-id').value.trim();
      if (id) {
        if (editingCampaign == null || editingCampaign.id !== id) {
          throw new Error('Atualize e abra a campanha novamente antes de salvar.');
        }
        const patch = driverBenefitCampaignPatch(editingCampaign, campaignValues());
        await api.updateDriverBenefitCampaign(getToken(), id, patch);
        show('Campanha atualizada.', 'success');
      } else {
        await api.createDriverBenefitCampaign(getToken(), payload);
        show(
          'Campanha criada em rascunho. Ela ainda não aparece para motoristas.',
          'success',
        );
      }
      resetForm();
      await reload();
    });
  });

  listen(el('benefit-base-form'), 'submit', (event) => {
    event.preventDefault();
    if (!hasScope('drivers:benefits:write')) return;
    void perform(async () => {
      const driverId = el('benefit-base-driver-id').value.trim();
      const zoneId = el('benefit-base-zone').value.trim();
      const localityId = el('benefit-base-locality').value.trim();
      await api.setDriverBenefitBase(getToken(), driverId, {
        zoneId,
        ...(localityId ? { localityId } : {}),
      });
      show('Base territorial do motorista salva.', 'success');
    });
  });

  listen(el('benefit-base-clear'), 'click', () => {
    const driverId = el('benefit-base-driver-id').value.trim();
    if (!driverId || !hasScope('drivers:benefits:write')) return;
    void perform(async () => {
      await api.clearDriverBenefitBase(getToken(), driverId);
      show('Base territorial removida.', 'success');
    });
  });

  listen(el('benefits-leaderboard-close'), 'click', () => {
    el('benefits-leaderboard-card').hidden = true;
  });

  resetForm();
  renderRegionOptions(null);
  setBusy(false);

  if (hasScope('drivers:benefits:read')) {
    void Promise.all([reload(), loadRegions()]).catch(handle);
  } else {
    show('Sua conta não possui permissão para consultar Ranking & Benefícios.');
  }

  return {
    destroy() {
      destroyed = true;
      listeners.forEach((remove) => remove());
    },
  };
}
