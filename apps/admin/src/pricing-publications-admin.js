import {buildPricingRateRows, formatPriceView} from './pricing-rate-matrix.js';

// Independent UX for draft review/publication. Reuses the existing versioned
// Core API, its permissions, optimistic locking and audit. Never stores tokens.
function formatDate(value) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('pt-BR', {dateStyle: 'short', timeStyle: 'short'}).format(timestamp)
    : 'Data não informada';
}

export function pricingPublicationSummary(effective, proposed) {
  const fields = [
    ['fixedRoutes', 'Rotas fixas'],
    ['localities', 'Tarifas de localidades'],
    ['localityPolicies', 'Categorias por localidade'],
    ['localityGeofences', 'Áreas de atendimento'],
    ['distanceFarePolicies', 'Preços por quilômetro'],
    ['municipalityOverrides', 'Municípios'],
    ['categoryPolicies', 'Disponibilidade de categorias'],
    ['zonePolicies', 'Disponibilidade de zonas'],
    ['commercialPolicy', 'Regras comerciais'],
    ['periodPolicy', 'Horários'],
    ['surcharges', 'Adicionais'],
    ['jeri', 'Regras de Jericoacoara'],
    ['sharedTransfers', 'Transfers compartilhados'],
    ['commissionBps', 'Comissão da plataforma'],
    ['externalLocalities', 'Destinos externos'],
    ['localityDisplayNames', 'Nomes de localidades'],
    ['buggy', 'Regras de buggy'],
    ['delivery', 'Regras de entrega'],
    ['pickupPolicy', 'Regras de coleta'],
  ];
  const results = [];
  for (const [key, label] of fields) {
    if (JSON.stringify(effective?.[key] ?? null) !==
        JSON.stringify(proposed?.[key] ?? null)) results.push(label);
  }
  return results;
}

export function pricingPublicationPriceChanges(effective, proposed) {
  const oldRows = new Map(buildPricingRateRows(effective).map(row => [row.key, row]));
  const newRows = new Map(buildPricingRateRows(proposed).map(row => [row.key, row]));
  const keys = [...new Set([...oldRows.keys(), ...newRows.keys()])].sort();
  return keys.flatMap(key => {
    const before = oldRows.get(key);
    const after = newRows.get(key);
    const prev = {
      day: formatPriceView(before?.day),
      night: formatPriceView(before?.night),
      enabled: before?.enabled,
    };
    const next = {
      day: formatPriceView(after?.day),
      night: formatPriceView(after?.night),
      enabled: after?.enabled,
    };
    if (JSON.stringify(prev) === JSON.stringify(next)) return [];
    return [{
      key,
      label: after?.label ?? before?.label ?? key,
      category: after?.categoryLabel ?? before?.categoryLabel ?? '',
      before: prev.day + ' dia · ' + prev.night + ' noite',
      after: next.day + ' dia · ' + next.night + ' noite',
      availabilityChanged: prev.enabled !== next.enabled,
    }];
  });
}

export function createPricingPublicationsAdmin({
  root, api, getToken, hasScope, onError = () => {},
}) {
  let mounted = true;
  let sequence = 0;
  let loading = false;
  let writing = false;
  let drafts = [];
  let selected = null;
  let activeCatalog = null;
  let pendingVersionId = null;
  const byId = id => root.querySelector('#' + id);

  function message(text = '', kind = 'success') {
    const node = byId('publication-message');
    if (!node) return;
    node.textContent = text;
    node.className = 'global-message ' + (kind === 'danger' ? 'is-error' : 'is-success');
    node.hidden = !text;
  }
  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }
  function appendLine(parent, title, detail) {
    const line = el('div', 'publication-row');
    line.append(el('strong', '', title), el('span', '', detail));
    parent.append(line);
  }
  function renderVersions(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    drafts = items.filter(version => version.status === 'draft');
    const effective = items.find(version =>
      version.id === payload?.effectiveVersionId);
    byId('publication-active').textContent = effective
      ? 'Versão #' + effective.versionNumber
      : 'Catálogo padrão';
    byId('publication-count').textContent = String(drafts.length);
    const list = byId('publication-drafts');
    list.replaceChildren();
    if (!drafts.length) {
      list.append(el('p', 'pricing-policy-help',
        'Nenhum rascunho pendente. Crie alterações em Preços ou Localidades.'));
    } else {
      for (const version of drafts) {
        const button = el('button', 'publication-draft-button', '');
        button.type = 'button';
        button.dataset.versionId = version.id;
        button.setAttribute('aria-pressed', String(selected?.version?.id === version.id));
        const title = el('strong', '', 'Rascunho #' + version.versionNumber);
        button.append(title, el('span', '',
          'Salvo em ' + formatDate(version.updatedAt)));
        button.addEventListener('click', () =>
          void selectDraft(version.id).catch(handleError));
        list.append(button);
      }
    }
    const history = byId('publication-history');
    history.replaceChildren();
    const published = items.filter(v => v.status === 'published');
    if (!published.length) {
      history.append(el('p', 'pricing-policy-help',
        'Ainda não há versões publicadas; o catálogo padrão está em vigor.'));
    } else {
      for (const version of published.slice(0, 12)) {
        appendLine(history,
          'Versão #' + version.versionNumber +
            (version.id === payload?.effectiveVersionId ? ' · Em vigor' : ''),
          'Publicada em ' + formatDate(version.publishedAt) +
            ' · Vigência: ' + formatDate(version.effectiveFrom));
      }
    }
  }
  function renderSelection() {
    const review = byId('publication-diff');
    review.replaceChildren();
    const actions = byId('publication-actions');
    const checkbox = byId('publication-confirm-review');
    checkbox.checked = false;
    actions.hidden = selected == null;
    if (!selected) {
      byId('publication-selected-title').textContent = 'Selecione um rascunho';
      byId('publication-selected-meta').textContent =
        'O resumo não é uma autorização automática.';
      review.append(el('p', 'pricing-policy-help',
        'Escolha um rascunho para consultar as alterações antes de publicar.'));
      return;
    }
    byId('publication-selected-title').textContent =
      'Rascunho #' + selected.version.versionNumber;
    byId('publication-selected-meta').textContent =
      'Última alteração: ' + formatDate(selected.version.updatedAt);
    const differences = pricingPublicationSummary(activeCatalog, selected.catalog);
    const priceChanges = pricingPublicationPriceChanges(activeCatalog, selected.catalog);
    if (priceChanges.length) {
      const heading = el('strong', 'publication-diff-heading',
        'Preços alterados (' + priceChanges.length + ')');
      review.append(heading);
      const list = el('div', 'publication-price-changes');
      for (const change of priceChanges) {
        const item = el('div', 'publication-price-change');
        item.append(el('strong', '', change.label + ' · ' + change.category));
        item.append(el('span', '', 'Antes: ' + change.before));
        item.append(el('span', '', 'Rascunho: ' + change.after));
        if (change.availabilityChanged) {
          item.append(el('small', '', 'A disponibilidade desta categoria também mudou'));
        }
        list.append(item);
      }
      review.append(list);
    }
    if (differences.length === 0) {
      review.append(el('p', 'pricing-policy-help',
        'Nenhuma mudança identificada no resumo. Confira o catálogo completo antes de publicar.'));
    } else {
      review.append(el('p', 'pricing-policy-help',
        'Áreas alteradas em relação ao catálogo vigente:'));
      const list = el('ul', 'publication-changes');
      for (const difference of differences) {
        list.append(el('li', '', difference));
      }
      review.append(list);
    }
    // UI permission is only an aid; Core enforces pricing:write as authority.
    const allowed = hasScope('pricing:write');
    checkbox.disabled = !allowed;
    byId('publication-publish').disabled = !allowed || writing;
    byId('publication-discard').disabled = !allowed || writing;
    byId('publication-permission').textContent = allowed
      ? 'Publicar modifica apenas o catálogo desta instalação. Exige confirmação e autorização comercial.'
      : 'Somente leitura: sua conta não pode publicar ou excluir rascunhos.';
    syncActions();
  }
  function syncActions() {
    const allowed = hasScope('pricing:write') && !!selected && !writing;
    byId('publication-publish').disabled =
      !allowed || !byId('publication-confirm-review').checked;
    byId('publication-discard').disabled = !allowed;
  }
  function handleError(error) {
    if (!mounted) return;
    const text = error?.message || 'Não foi possível concluir. Atualize a lista.';
    message(text, 'danger');
    onError(error);
  }
  async function refresh({announce = false, internalWrite = false} = {}) {
    if (loading || !mounted || (writing && !internalWrite)) return;
    loading = true;
    const current = ++sequence;
    // Do not permit publishing a previously reviewed snapshot while a fresh
    // baseline and draft list are being fetched.
    pendingVersionId = pendingVersionId || selected?.version.id || null;
    selected = null;
    renderSelection();
    byId('publication-refresh').disabled = true;
    try {
      const token = getToken();
      if (!token || !hasScope('pricing:read')) {
        throw new Error('Sua conta não tem permissão para consultar as versões.');
      }
      const [versions, active] = await Promise.all([
        api.pricingVersions(token), api.pricingCatalog(token),
      ]);
      if (!mounted || current !== sequence) return;
      activeCatalog = active;
      const previousId = pendingVersionId || selected?.version.id;
      selected = null;
      renderVersions(versions);
      const next = drafts.find(v => v.id === previousId) || drafts[0];
      if (next) await selectDraft(next.id, {notify: false, internalRefresh: true});
      else renderSelection();
      if (announce) message('Versões atualizadas.');
    } finally {
      loading = false;
      if (mounted) byId('publication-refresh').disabled = false;
    }
  }
  async function selectDraft(id, {notify = true, internalRefresh = false} = {}) {
    // A refresh owns the draft list until it finishes. Ignore manual clicks
    // against stale list items rather than cancelling the refresh sequence.
    if (!mounted || (loading && !internalRefresh) ||
        (writing && !internalRefresh)) return;
    const match = drafts.find(version => version.id === id);
    if (!match) return;
    // Invalidate the previous review immediately. A failed request must never
    // leave an older draft enabled for publication under another selection.
    const requestSequence = ++sequence;
    selected = null;
    pendingVersionId = null;
    renderSelection();
    const payload = await api.getPricingVersion(getToken(), match.id);
    if (!mounted || requestSequence !== sequence) return;
    if (payload?.version?.id !== id || payload.version.status !== 'draft') {
      message('Esse rascunho mudou. Atualize a lista antes de publicar.', 'danger');
      return;
    }
    selected = payload;
    pendingVersionId = id;
    renderSelection();
    for (const button of byId('publication-drafts')
      .querySelectorAll('button[data-version-id]')) {
      button.setAttribute('aria-pressed', String(button.dataset.versionId === id));
    }
    if (notify) message();
  }
  async function mutate(action) {
    if (!mounted || loading || writing || !hasScope('pricing:write') || !selected) return;
    const checked = byId('publication-confirm-review').checked;
    if (action === 'publish' && !checked) return;
    const original = selected.version;
    const versionId = original.id;
    writing = true;
    syncActions();
    try {
      // Protect against concurrent ADM editors and stale review previews.
      const [fresh, freshActive] = await Promise.all([
        api.getPricingVersion(getToken(), versionId),
        api.pricingCatalog(getToken()),
      ]);
      if (fresh?.version?.status !== 'draft' ||
          fresh.version.updatedAt !== original.updatedAt) {
        throw new Error('O rascunho mudou desde sua revisão. Recarregue e confira antes de prosseguir.');
      }
      // A second operator may publish another version while this screen is
      // open. Stop and recompare instead of approving an obsolete baseline.
      if (freshActive?.versionId !== activeCatalog?.versionId ||
          freshActive?.versionNumber !== activeCatalog?.versionNumber) {
        throw new Error('A versão em vigor mudou durante a revisão. Atualize e confira os preços antes de publicar.');
      }
      const confirmed = window.confirm(action === 'publish'
        ? 'PUBLICAR a versão #' + original.versionNumber +
          '? Esta ação tornará as novas tarifas vigentes para novas cotações. Confira as aprovações comerciais antes de confirmar.'
        : 'EXCLUIR o rascunho #' + original.versionNumber +
          '? As alterações não publicadas serão perdidas. O catálogo vigente não será alterado.');
      if (!confirmed) return;
      if (action === 'publish') {
        await api.publishPricingVersion(getToken(), {
          versionId, expectedUpdatedAt: original.updatedAt,
        });
      } else {
        await api.deletePricingVersion(getToken(), {
          versionId, expectedUpdatedAt: original.updatedAt,
        });
      }
      pendingVersionId = null;
      selected = null;
      await refresh({internalWrite: true});
      message(action === 'publish'
        ? 'Versão publicada. Novas cotações usarão a tarifa vigente.'
        : 'Rascunho excluído. A tabela vigente permaneceu intacta.');
    } catch (error) {
      // Do not retry an ambiguous write after a timeout. Refresh from Core.
      selected = null;
      pendingVersionId = null;
      await refresh({internalWrite: true}).catch(() => {});
      throw error;
    } finally {
      writing = false;
      if (mounted) syncActions();
    }
  }
  byId('publication-refresh').addEventListener('click', () =>
    void refresh({announce: true}).catch(handleError));
  byId('publication-confirm-review').addEventListener('change', syncActions);
  byId('publication-publish').addEventListener('click', () =>
    void mutate('publish').catch(handleError));
  byId('publication-discard').addEventListener('click', () =>
    void mutate('discard').catch(handleError));
  void refresh().catch(handleError);
  return {
    destroy() { mounted = false; sequence++; },
  };
}
