import {
  createPricingCoverageMap,
  createPricingGeofenceMap,
} from './pricing-geofence-map.js';

const LOCAL_SCOPES = new Set(['prea', 'jijoca']);
const PRICE_CATEGORIES = ['moto', 'delivery', 'car'];
const CATEGORY_LABELS = Object.freeze({
  moto: 'Moto',
  delivery: 'Entrega',
  car: 'Carro',
  comfort_black: 'Comfort/Black',
});

function byId(id) {
  return document.getElementById(id);
}

function scopeLabel(scope) {
  if (scope === 'prea') return 'Preá';
  if (scope === 'jijoca') return 'Jijoca';
  return 'Destino externo';
}

function scopeDefault(scope) {
  if (scope === 'prea') {
    return { latitude: -2.82017, longitude: -40.41467 };
  }
  if (scope === 'jijoca') {
    return { latitude: -2.8986, longitude: -40.4506 };
  }
  return { latitude: -2.906425, longitude: -40.357338 };
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function titleFromId(value) {
  return String(value ?? '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function moneyToCents(value, label) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} deve ser maior que zero.`);
  }
  return Math.round(amount * 100);
}

function centsToInput(cents) {
  const value = Number(cents);
  return Number.isFinite(value)
    ? (value / 100).toFixed(2).replace('.', ',')
    : '';
}

function priceLabel(price) {
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  if (price?.kind === 'exact') {
    return formatter.format(Number(price.amountCents) / 100);
  }
  if (price?.kind === 'range') {
    return (
      formatter.format(Number(price.minCents) / 100) +
      ' – ' +
      formatter.format(Number(price.maxCents) / 100)
    );
  }
  return '—';
}

function categoryList(policy) {
  return Array.isArray(policy?.enabledCategories)
    ? policy.enabledCategories
    : [];
}

function errorMessage(error) {
  return (
    error?.message ||
    'Não foi possível concluir esta operação de localidade.'
  );
}

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text != null) item.textContent = text;
  return item;
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createLocalitiesAdmin(input) {
  const api = input.api;
  let catalog = null;
  let draft = null;
  let overviewMap = null;
  let wizardMap = null;
  let step = 1;
  let mode = 'create';
  let editing = null;
  let initialForm = null;
  let lastDeleted = null;
  let mounted = true;

  function token() {
    return input.getToken?.() ?? null;
  }

  function hasScope(scope) {
    return input.hasScope?.(scope) === true;
  }

  function setMessage(message = '', tone = 'neutral') {
    const target = byId('localities-message');
    if (target == null) return;
    target.textContent = message;
    target.dataset.tone = tone;
    target.hidden = !message;
  }

  function handleError(error) {
    setMessage(errorMessage(error), 'danger');
    input.onError?.(error);
  }

  function allEntries() {
    if (catalog == null) return [];
    const geofences = Array.isArray(catalog.localityGeofences)
      ? catalog.localityGeofences
      : [];
    const result = [];
    for (const scope of ['prea', 'jijoca']) {
      const values = Array.isArray(catalog.localities?.[scope])
        ? catalog.localities[scope]
        : [];
      for (const item of values) {
        result.push({
          scope,
          localityId: item.localityId,
          label: titleFromId(item.localityId),
          prices: item.prices ?? {},
          policy: item.policy ?? {},
          geofence:
            geofences.find(
              (area) =>
                area.zoneId === scope &&
                area.localityId === item.localityId,
            ) ?? null,
        });
      }
    }
    for (const localityId of catalog.externalLocalities ?? []) {
      result.push({
        scope: 'external',
        localityId,
        label: titleFromId(localityId),
        prices: {},
        policy: {},
        geofence:
          geofences.find(
            (area) =>
              area.zoneId === 'external' &&
              area.localityId === localityId,
          ) ?? null,
      });
    }
    return result;
  }

  function entryKey(entry) {
    return `${entry.scope}:${entry.localityId}`;
  }

  function findEntry(scope, localityId) {
    return (
      allEntries().find(
        (entry) =>
          entry.scope === scope &&
          entry.localityId === localityId,
      ) ?? null
    );
  }

  function activeCategoriesFromForm() {
    if (!LOCAL_SCOPES.has(byId('locality-scope')?.value)) return [];
    const categories = [];
    if (byId('locality-category-moto')?.checked) {
      categories.push('moto');
    }
    if (byId('locality-category-delivery')?.checked) {
      categories.push('delivery');
    }
    if (byId('locality-category-car')?.checked) {
      categories.push('car');
    }
    if (
      byId('locality-scope')?.value === 'prea' &&
      byId('locality-category-comfort')?.checked
    ) {
      categories.push('comfort_black');
    }
    return categories;
  }

  function syncPriceCard(category) {
    const enabled = byId(`locality-category-${category}`)?.checked === true;
    const card = byId(`locality-price-${category}-card`);
    if (card != null) card.hidden = !enabled;
    const kind = byId(`locality-price-${category}-kind`)?.value ?? 'exact';
    const maxField = byId(`locality-price-${category}-max-field`);
    const minLabel = byId(`locality-price-${category}-min-label`);
    if (maxField != null) maxField.hidden = kind !== 'range';
    if (minLabel != null) {
      minLabel.textContent = kind === 'range' ? 'Mínimo (R$)' : 'Preço (R$)';
    }
  }

  function syncScopeUi() {
    const scope = byId('locality-scope')?.value ?? 'prea';
    const local = LOCAL_SCOPES.has(scope);
    const comfort = byId('locality-category-comfort-card');
    const night = byId('locality-night-card');
    if (comfort != null) comfort.hidden = scope !== 'prea';
    if (night != null) night.hidden = scope !== 'prea';
    const serviceNote = byId('locality-external-services-note');
    const priceNote = byId('locality-external-price-note');
    const priceGrid = byId('locality-price-grid');
    const categoryGrid = byId('locality-category-grid');
    if (serviceNote != null) serviceNote.hidden = local;
    if (priceNote != null) priceNote.hidden = local;
    if (priceGrid != null) priceGrid.hidden = !local;
    if (categoryGrid != null) categoryGrid.hidden = !local;
    if (!local) {
      for (const category of PRICE_CATEGORIES) {
        const checkbox = byId(`locality-category-${category}`);
        if (checkbox != null) checkbox.checked = false;
      }
      const comfortCheckbox = byId('locality-category-comfort');
      if (comfortCheckbox != null) comfortCheckbox.checked = false;
      const nightCheckbox = byId('locality-night-surcharge');
      if (nightCheckbox != null) nightCheckbox.checked = false;
    }
    for (const category of PRICE_CATEGORIES) syncPriceCard(category);
  }

  function syncIdPreview() {
    if (mode === 'edit' && editing != null) return;
    const id = slugify(byId('locality-name')?.value);
    const hidden = byId('locality-id');
    const preview = byId('locality-id-preview');
    if (hidden != null) hidden.value = id;
    if (preview != null) preview.textContent = id || '—';
  }

  function setMapCoordinate(selection) {
    const label = byId('locality-coordinate-label');
    if (label == null) return;
    const lat = Number(selection?.latitude);
    const lon = Number(selection?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      label.textContent = '—';
      return;
    }
    label.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }

  function ensureWizardMap() {
    if (wizardMap != null) return wizardMap;
    const root = byId('locality-wizard-map');
    if (root == null) return null;
    wizardMap = createPricingGeofenceMap({
      root,
      tiles: byId('locality-wizard-map-tiles'),
      overlay: byId('locality-wizard-map-overlay'),
      zoomIn: byId('locality-wizard-map-zoom-in'),
      zoomOut: byId('locality-wizard-map-zoom-out'),
      onChange(selection) {
        setMapCoordinate(selection);
      },
    });
    return wizardMap;
  }

  function ensureOverviewMap() {
    if (overviewMap != null) return overviewMap;
    const root = byId('localities-overview-map');
    if (root == null) return null;
    overviewMap = createPricingCoverageMap({
      root,
      tiles: byId('localities-overview-map-tiles'),
      overlay: byId('localities-overview-map-overlay'),
      zoomIn: byId('localities-overview-map-zoom-in'),
      zoomOut: byId('localities-overview-map-zoom-out'),
      onSelect(area) {
        openEdit(area.zoneId, area.localityId);
      },
    });
    return overviewMap;
  }

  function updateMapFromScope({ preserveSelection = false } = {}) {
    const map = ensureWizardMap();
    if (map == null) return;
    const radius = Number(byId('locality-radius')?.value || 2);
    if (!preserveSelection) {
      map.setSelection({
        ...scopeDefault(byId('locality-scope')?.value ?? 'prea'),
        radiusKm: radius,
      });
    } else {
      map.setRadiusKm(radius);
    }
    setMapCoordinate(map.getSelection());
  }

  function captureForm() {
    const selection = ensureWizardMap()?.getSelection() ?? {
      ...scopeDefault(byId('locality-scope')?.value ?? 'prea'),
      radiusKm: Number(byId('locality-radius')?.value || 2),
    };
    const prices = {};
    for (const category of PRICE_CATEGORIES) {
      prices[category] = {
        kind: byId(`locality-price-${category}-kind`)?.value ?? 'exact',
        min: byId(`locality-price-${category}-min`)?.value ?? '',
        max: byId(`locality-price-${category}-max`)?.value ?? '',
      };
    }
    return {
      scope: byId('locality-scope')?.value ?? 'prea',
      name: byId('locality-name')?.value ?? '',
      localityId: byId('locality-id')?.value ?? '',
      radius: Number(byId('locality-radius')?.value || 2),
      selection,
      categories: activeCategoriesFromForm(),
      prices,
      nightSurcharge: byId('locality-night-surcharge')?.checked === true,
    };
  }

  function applyForm(model) {
    const scope = model.scope ?? 'prea';
    byId('locality-scope').value = scope;
    byId('locality-name').value = model.name ?? titleFromId(model.localityId);
    byId('locality-id').value = model.localityId ?? slugify(model.name);
    byId('locality-id-preview').textContent =
      byId('locality-id').value || '—';
    byId('locality-radius').value = String(model.radius ?? 2);

    const categories = new Set(model.categories ?? []);
    for (const category of PRICE_CATEGORIES) {
      byId(`locality-category-${category}`).checked =
        categories.has(category);
      const price = model.prices?.[category] ?? {};
      byId(`locality-price-${category}-kind`).value =
        price.kind ?? 'exact';
      byId(`locality-price-${category}-min`).value =
        price.min ?? '';
      byId(`locality-price-${category}-max`).value =
        price.max ?? '';
    }
    byId('locality-category-comfort').checked =
      categories.has('comfort_black');
    byId('locality-night-surcharge').checked =
      model.nightSurcharge === true;

    syncScopeUi();
    const map = ensureWizardMap();
    map?.setSelection({
      ...(model.selection ?? scopeDefault(scope)),
      radiusKm: model.radius ?? model.selection?.radiusKm ?? 2,
    });
    setMapCoordinate(map?.getSelection());
  }

  function modelFromEntry(entry) {
    const categories = categoryList(entry.policy);
    const prices = {};
    for (const category of PRICE_CATEGORIES) {
      const price = entry.prices?.[category];
      prices[category] = {
        kind: price?.kind ?? 'exact',
        min:
          price?.kind === 'range'
            ? centsToInput(price.minCents)
            : centsToInput(price?.amountCents),
        max:
          price?.kind === 'range'
            ? centsToInput(price.maxCents)
            : '',
      };
    }
    return {
      scope: entry.scope,
      name: entry.label,
      localityId: entry.localityId,
      radius: Number(entry.geofence?.radiusKm ?? 2),
      selection: entry.geofence
        ? {
            latitude: Number(entry.geofence.centerLatitude),
            longitude: Number(entry.geofence.centerLongitude),
            radiusKm: Number(entry.geofence.radiusKm),
          }
        : {
            ...scopeDefault(entry.scope),
            radiusKm: 2,
          },
      categories,
      prices,
      nightSurcharge:
        entry.policy?.applyNightSurcharge === true,
    };
  }

  function renderReview() {
    const target = byId('locality-review');
    if (target == null) return;
    target.replaceChildren();
    const model = captureForm();
    const rows = [
      ['Localidade', model.name || titleFromId(model.localityId)],
      ['Base / região', scopeLabel(model.scope)],
      ['Identificador', model.localityId || '—'],
      ['Raio', `${Number(model.radius).toLocaleString('pt-BR')} km`],
      [
        'Serviços',
        model.categories.length > 0
          ? model.categories
              .map((category) => CATEGORY_LABELS[category] ?? category)
              .join(' · ')
          : model.scope === 'external'
            ? 'Definidos pela rota'
            : 'Nenhum',
      ],
    ];
    if (LOCAL_SCOPES.has(model.scope)) {
      for (const category of PRICE_CATEGORIES) {
        if (!model.categories.includes(category)) continue;
        const price = model.prices[category];
        let label = '—';
        if (price.min) {
          try {
            label =
              price.kind === 'range'
                ? priceLabel({
                    kind: 'range',
                    minCents: moneyToCents(price.min, 'Preço mínimo'),
                    maxCents: moneyToCents(price.max, 'Preço máximo'),
                  })
                : priceLabel({
                    kind: 'exact',
                    amountCents: moneyToCents(price.min, 'Preço'),
                  });
          } catch {
            label = 'Preço incompleto';
          }
        }
        rows.push([
          `Preço · ${CATEGORY_LABELS[category]}`,
          label,
        ]);
      }
      if (model.scope === 'prea') {
        rows.push([
          'Adicional noturno',
          model.nightSurcharge ? 'Aplicar' : 'Não aplicar',
        ]);
      }
    }
    for (const [label, value] of rows) {
      const row = element('div', 'locality-review__row');
      row.append(
        element('span', null, label),
        element('strong', null, value),
      );
      target.append(row);
    }
  }

  function showStep(next) {
    step = Math.max(1, Math.min(6, Number(next) || 1));
    for (let index = 1; index <= 6; index += 1) {
      const panel = byId(`locality-step-${index}`);
      if (panel != null) panel.hidden = index !== step;
      const marker = document.querySelector(
        `[data-locality-step="${index}"]`,
      );
      if (marker != null) {
        marker.classList.toggle('is-active', index === step);
        marker.classList.toggle('is-complete', index < step);
      }
    }
    byId('locality-wizard-back').hidden = step === 1;
    byId('locality-wizard-next').hidden = step === 6;
    byId('locality-wizard-save').hidden = step !== 6;
    if (step === 2) {
      requestAnimationFrame(() => ensureWizardMap()?.render());
    }
    if (step === 4) {
      for (const category of PRICE_CATEGORIES) syncPriceCard(category);
    }
    if (step === 6) renderReview();
  }

  function validateStep(current) {
    const scope = byId('locality-scope')?.value ?? 'prea';
    if (current === 1) {
      const localityId = byId('locality-id')?.value.trim();
      if (!localityId) throw new Error('Informe o nome da localidade.');
      if (mode === 'create' && findEntry(scope, localityId) != null) {
        throw new Error('Já existe uma localidade com este identificador.');
      }
    }
    if (current === 2) {
      const radius = Number(byId('locality-radius')?.value);
      if (!Number.isFinite(radius) || radius < 0.05 || radius > 100) {
        throw new Error('O raio deve ficar entre 0,05 km e 100 km.');
      }
    }
    if (current === 3 && LOCAL_SCOPES.has(scope)) {
      if (activeCategoriesFromForm().length === 0) {
        throw new Error('Escolha pelo menos um serviço para esta localidade.');
      }
    }
    if (current === 4 && LOCAL_SCOPES.has(scope)) {
      const categories = activeCategoriesFromForm();
      for (const category of PRICE_CATEGORIES) {
        if (!categories.includes(category)) continue;
        const kind = byId(`locality-price-${category}-kind`).value;
        const min = moneyToCents(
          byId(`locality-price-${category}-min`).value,
          `Preço de ${CATEGORY_LABELS[category]}`,
        );
        if (kind === 'range') {
          const max = moneyToCents(
            byId(`locality-price-${category}-max`).value,
            `Preço máximo de ${CATEGORY_LABELS[category]}`,
          );
          if (max < min) {
            throw new Error(
              `O máximo de ${CATEGORY_LABELS[category]} não pode ser menor que o mínimo.`,
            );
          }
        }
      }
    }
  }

  function openWizard(nextMode, entry = null) {
    mode = nextMode;
    editing = entry;
    setMessage();
    const wizard = byId('locality-wizard');
    if (wizard != null) wizard.hidden = false;
    byId('locality-wizard-title').textContent =
      nextMode === 'edit' ? 'Editar localidade' : 'Nova localidade';
    byId('locality-wizard-subtitle').textContent =
      nextMode === 'edit'
        ? 'Altere somente o necessário e salve no rascunho.'
        : 'Preencha uma etapa por vez. Nada é publicado automaticamente.';
    byId('locality-scope').disabled = nextMode === 'edit';
    byId('locality-name').disabled = nextMode === 'edit';

    const model =
      entry != null
        ? modelFromEntry(entry)
        : {
            scope: 'prea',
            name: '',
            localityId: '',
            radius: 2,
            selection: { ...scopeDefault('prea'), radiusKm: 2 },
            categories: [],
            prices: {},
            nightSurcharge: false,
          };
    applyForm(model);
    initialForm = deepClone(captureForm());
    showStep(1);
    wizard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeWizard() {
    const wizard = byId('locality-wizard');
    if (wizard != null) wizard.hidden = true;
    editing = null;
    initialForm = null;
    mode = 'create';
    setMessage();
  }

  function openEdit(scope, localityId) {
    const entry = findEntry(scope, localityId);
    if (entry == null) return;
    openWizard('edit', entry);
  }

  async function ensureDraft() {
    if (draft?.status === 'draft') return draft;
    const currentToken = token();
    if (!currentToken) throw new Error('Sessão administrativa expirada.');
    const created = await api.createPricingVersion(currentToken);
    const payload = await api.getPricingVersion(currentToken, created.id);
    draft = payload.version;
    catalog = payload.catalog;
    return draft;
  }

  async function applyPatch(patch) {
    const currentToken = token();
    if (!currentToken) throw new Error('Sessão administrativa expirada.');
    const version = await ensureDraft();
    const payload = await api.updatePricingVersion(currentToken, {
      versionId: version.id,
      patch,
      expectedUpdatedAt: version.updatedAt,
    });
    draft = payload.version;
    catalog = payload.catalog;
    return payload;
  }

  function buildPricePatch(scope, localityId, category, price) {
    const min = moneyToCents(
      price.min,
      `Preço de ${CATEGORY_LABELS[category]}`,
    );
    return {
      kind: 'locality_price',
      hub: scope,
      localityId,
      category,
      price:
        price.kind === 'range'
          ? {
              kind: 'range',
              minCents: min,
              maxCents: moneyToCents(
                price.max,
                `Preço máximo de ${CATEGORY_LABELS[category]}`,
              ),
            }
          : { kind: 'exact', amountCents: min },
    };
  }

  async function saveWizard() {
    setMessage();
    if (!hasScope('pricing:write')) {
      throw new Error('Sua conta não pode editar localidades.');
    }
    for (let current = 1; current <= 5; current += 1) {
      validateStep(current);
    }
    const model = captureForm();
    const localityId = model.localityId;
    const existing = findEntry(model.scope, localityId);

    if (existing == null) {
      await applyPatch({
        kind: 'locality_structure',
        operation: 'add',
        scope: model.scope,
        localityId,
      });
    }

    await applyPatch({
      kind: 'locality_geofence',
      operation: 'upsert',
      zoneId: model.scope,
      localityId,
      centerLatitude: model.selection.latitude,
      centerLongitude: model.selection.longitude,
      radiusKm: model.radius,
    });

    if (LOCAL_SCOPES.has(model.scope)) {
      for (const category of PRICE_CATEGORIES) {
        if (!model.categories.includes(category)) continue;
        await applyPatch(
          buildPricePatch(
            model.scope,
            localityId,
            category,
            model.prices[category],
          ),
        );
      }
      await applyPatch({
        kind: 'locality_policy',
        hub: model.scope,
        localityId,
        enabledCategories: model.categories,
        applyNightSurcharge:
          model.scope === 'prea' && model.nightSurcharge,
      });
    }

    await refresh({ announce: false });
    closeWizard();
    setMessage(
      mode === 'edit'
        ? 'Localidade atualizada no rascunho. Nada foi publicado ainda.'
        : 'Localidade adicionada ao rascunho. Nada foi publicado ainda.',
      'success',
    );
  }

  async function deleteEntry(entry) {
    if (!hasScope('pricing:write')) {
      throw new Error('Sua conta não pode excluir localidades.');
    }
    const confirmed = window.confirm(
      `Excluir "${entry.label}" do rascunho? A versão publicada não muda até você publicar o rascunho.`,
    );
    if (!confirmed) return;
    lastDeleted = deepClone(modelFromEntry(entry));
    await applyPatch({
      kind: 'locality_structure',
      operation: 'remove',
      scope: entry.scope,
      localityId: entry.localityId,
    });
    await refresh({ announce: false });
    renderUndoDelete();
    setMessage(
      'Localidade removida somente do rascunho. Você pode desfazer antes de publicar.',
      'success',
    );
  }

  function renderUndoDelete() {
    const existing = byId('localities-undo-delete');
    existing?.remove();
    if (lastDeleted == null) return;
    const holder = byId('localities-message')?.parentElement;
    if (holder == null) return;
    const button = element(
      'button',
      'button button--ghost-dark localities-undo-delete',
      'Desfazer última exclusão',
    );
    button.id = 'localities-undo-delete';
    button.type = 'button';
    button.addEventListener('click', () => {
      void undoDelete();
    });
    holder.insertBefore(button, byId('localities-message')?.nextSibling ?? null);
  }

  async function undoDelete() {
    if (lastDeleted == null) return;
    const model = lastDeleted;
    await applyPatch({
      kind: 'locality_structure',
      operation: 'add',
      scope: model.scope,
      localityId: model.localityId,
    });
    await applyPatch({
      kind: 'locality_geofence',
      operation: 'upsert',
      zoneId: model.scope,
      localityId: model.localityId,
      centerLatitude: model.selection.latitude,
      centerLongitude: model.selection.longitude,
      radiusKm: model.radius,
    });
    if (LOCAL_SCOPES.has(model.scope)) {
      for (const category of PRICE_CATEGORIES) {
        if (!model.categories.includes(category)) continue;
        const price = model.prices?.[category];
        if (!price?.min) continue;
        await applyPatch(
          buildPricePatch(
            model.scope,
            model.localityId,
            category,
            price,
          ),
        );
      }
      await applyPatch({
        kind: 'locality_policy',
        hub: model.scope,
        localityId: model.localityId,
        enabledCategories: model.categories,
        applyNightSurcharge:
          model.scope === 'prea' && model.nightSurcharge,
      });
    }
    lastDeleted = null;
    await refresh({ announce: false });
    renderUndoDelete();
    setMessage('Exclusão desfeita no rascunho.', 'success');
  }

  function renderDirectory() {
    const entries = allEntries();
    byId('localities-total').textContent = String(entries.length);
    byId('localities-geofenced').textContent = String(
      entries.filter((entry) => entry.geofence != null).length,
    );
    byId('localities-prea').textContent = String(
      entries.filter((entry) => entry.scope === 'prea').length,
    );
    byId('localities-jijoca').textContent = String(
      entries.filter((entry) => entry.scope === 'jijoca').length,
    );
    byId('localities-list-count').textContent =
      `${entries.length} cadastrada(s)`;

    const list = byId('localities-list');
    list.replaceChildren();

    for (const entry of entries) {
      const card = element('article', 'locality-directory-item');
      card.dataset.key = entryKey(entry);

      const top = element('div', 'locality-directory-item__top');
      const name = element('div');
      name.append(
        element('strong', null, entry.label),
        element(
          'small',
          null,
          `${scopeLabel(entry.scope)} · ${entry.localityId}`,
        ),
      );
      const radius = element(
        'span',
        'pill',
        entry.geofence
          ? `${Number(entry.geofence.radiusKm).toLocaleString('pt-BR')} km`
          : 'Sem área',
      );
      top.append(name, radius);

      const details = element('div', 'locality-directory-item__details');
      if (LOCAL_SCOPES.has(entry.scope)) {
        const categories = categoryList(entry.policy);
        details.textContent =
          categories.length > 0
            ? categories
                .map((category) => CATEGORY_LABELS[category] ?? category)
                .join(' · ')
            : 'Nenhum serviço habilitado';
      } else {
        details.textContent = 'Preço definido por rota';
      }

      const actions = element('div', 'locality-directory-item__actions');
      const edit = element('button', 'button button--table', 'Editar');
      edit.type = 'button';
      edit.addEventListener('click', () => openEdit(entry.scope, entry.localityId));
      actions.append(edit);
      if (hasScope('pricing:write')) {
        const remove = element(
          'button',
          'button button--table button--danger-soft',
          'Excluir',
        );
        remove.type = 'button';
        remove.addEventListener('click', () => {
          void deleteEntry(entry).catch(handleError);
        });
        actions.append(remove);
      }

      card.append(top, details, actions);
      list.append(card);
    }

    byId('localities-empty').hidden = entries.length !== 0;

    const areas = entries
      .filter((entry) => entry.geofence != null)
      .map((entry) => ({
        ...entry.geofence,
        label: entry.label,
      }));
    ensureOverviewMap()?.setAreas(areas);
  }

  function renderDraftStatus() {
    const target = byId('localities-draft-status');
    if (target == null) return;
    target.textContent =
      draft?.status === 'draft'
        ? `Rascunho #${draft.versionNumber} · alterações protegidas`
        : 'Catálogo publicado · novo rascunho será criado ao salvar';
    const create = byId('localities-new-button');
    if (create != null) create.hidden = !hasScope('pricing:write');
  }

  async function refresh({ announce = true } = {}) {
    const currentToken = token();
    if (!currentToken || !hasScope('pricing:read')) {
      catalog = null;
      draft = null;
      renderDirectory();
      renderDraftStatus();
      return;
    }
    const versionsPayload = await api.pricingVersions(currentToken);
    const items = Array.isArray(versionsPayload?.items)
      ? versionsPayload.items
      : [];
    const draftVersion =
      items.find((version) => version.status === 'draft') ?? null;
    if (draftVersion != null) {
      const payload = await api.getPricingVersion(
        currentToken,
        draftVersion.id,
      );
      draft = payload.version;
      catalog = payload.catalog;
    } else {
      draft = null;
      catalog = await api.pricingCatalog(currentToken);
    }
    if (!mounted) return;
    renderDirectory();
    renderDraftStatus();
    if (announce) setMessage('Localidades atualizadas.', 'success');
  }

  function bind() {
    byId('localities-refresh-button')?.addEventListener('click', () => {
      void refresh().catch(handleError);
    });
    byId('localities-new-button')?.addEventListener('click', () => {
      openWizard('create');
    });
    byId('locality-wizard-close')?.addEventListener('click', closeWizard);
    byId('locality-wizard-cancel')?.addEventListener('click', closeWizard);
    byId('locality-wizard-reset')?.addEventListener('click', () => {
      if (initialForm != null) {
        applyForm(deepClone(initialForm));
        showStep(1);
        setMessage('Alterações locais desfeitas.', 'success');
      }
    });
    byId('locality-wizard-back')?.addEventListener('click', () => {
      showStep(step - 1);
    });
    byId('locality-wizard-next')?.addEventListener('click', () => {
      try {
        validateStep(step);
        showStep(step + 1);
      } catch (error) {
        setMessage(errorMessage(error), 'danger');
      }
    });
    byId('locality-wizard-save')?.addEventListener('click', () => {
      const button = byId('locality-wizard-save');
      button.disabled = true;
      void saveWizard()
        .catch(handleError)
        .finally(() => {
          button.disabled = false;
        });
    });

    byId('locality-scope')?.addEventListener('change', () => {
      syncScopeUi();
      updateMapFromScope();
    });
    byId('locality-name')?.addEventListener('input', syncIdPreview);
    byId('locality-radius')?.addEventListener('input', () => {
      const radius = Number(byId('locality-radius')?.value);
      if (Number.isFinite(radius) && radius >= 0.05) {
        ensureWizardMap()?.setRadiusKm(radius);
        const selection = ensureWizardMap()?.getSelection();
        setMapCoordinate(selection);
      }
    });

    for (const category of PRICE_CATEGORIES) {
      byId(`locality-category-${category}`)?.addEventListener(
        'change',
        () => syncPriceCard(category),
      );
      byId(`locality-price-${category}-kind`)?.addEventListener(
        'change',
        () => syncPriceCard(category),
      );
    }
  }

  bind();
  renderDraftStatus();
  void refresh({ announce: false }).catch(handleError);

  return {
    refresh,
    destroy() {
      mounted = false;
      overviewMap?.destroy();
      wizardMap?.destroy();
      overviewMap = null;
      wizardMap = null;
    },
  };
}
