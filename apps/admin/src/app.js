import { AdminApiError, createAdminApi } from './api.js';
import { createFleetMap } from './fleet-map.js';
import {
  actionLabel,
  actorLabel,
  driverDocumentStatusPresentation,
  driverDocumentTypeLabel,
  formatCurrencyCents,
  formatDateTime,
  formatSessionRemaining,
  locationLabel,
  paymentStatusLabel,
  pricePeriodLabel,
  registryStatusPresentation,
  rideStatePresentation,
  secondsUntil,
  serviceCategoryLabel,
  statusPresentation,
  validateDriverId,
  validateDriverRegistryStatus,
  validateDriverStatus,
  validatePhone,
} from './security.js';

const api = createAdminApi();

const state = {
  token: null,
  user: null,
  expiresAt: null,
  currentDriver: null,
  currentDriverRegistry: null,
  currentDriverDocuments: null,
  pricingCatalog: null,
  pricingVersions: {
    items: [],
    effectiveVersionId: null,
  },
  selectedPricingVersion: null,
  fleet: {
    generatedAt: null,
    staleAfterSeconds: 120,
    summary: {
      totalOnline: 0,
      free: 0,
      reserved: 0,
      onRide: 0,
      busy: 0,
      staleGps: 0,
    },
    items: [],
  },
  fleetTimer: null,
  fleetLoading: false,
  finance: {
    generatedAt: null,
    readOnly: true,
    summary: {
      paymentsTotal: 0,
      paymentsPaid: 0,
      paymentsPaidCents: 0,
      paymentsPending: 0,
      paymentsFailed: 0,
      paymentsCancelled: 0,
      paymentsRefunded: 0,
      platformRevenueCents: 0,
      driverPayableCents: 0,
      driverPayoutPendingCents: 0,
      rideEscrowCents: 0,
      passengerWalletCents: 0,
      payoutsRequested: 0,
      payoutsRequestedCents: 0,
    },
    payments: [],
    payouts: [],
    policy: null,
  },
  dashboard: {
    generatedAt: null,
    rides: {
      active: 0,
      searchingDriver: 0,
      driverOnTheWay: 0,
      inProgress: 0,
      completedLast24h: 0,
      cancelledLast24h: 0,
    },
    activeRides: [],
  },
  driverDirectory: {
    items: [],
    nextCursor: null,
    summary: { total: 0, active: 0, suspended: 0 },
    query: '',
    status: '',
  },
  selectedPassenger: null,
  passengerDirectory: {
    items: [],
    nextCursor: null,
    summary: { total: 0, active: 0, suspended: 0 },
    query: '',
    status: '',
  },
  rideDirectory: {
    items: [],
    nextCursor: null,
    scope: 'active',
    state: '',
    query: '',
    from: '',
    to: '',
  },
  selectedRide: null,
  auditEntries: [],
  auditDirectory: {
    nextCursor: null,
    actorKind: '',
    action: '',
    targetType: '',
    query: '',
  },
  sessionTimer: null,
};

const byId = (id) => document.getElementById(id);
const authView = byId('auth-view');
const adminView = byId('admin-view');
const loginForm = byId('login-form');
const loginEmail = byId('login-email');
const loginPassword = byId('login-password');
const loginTotp = byId('login-totp');
const loginButton = byId('login-button');
const loginMessage = byId('login-message');
const globalMessage = byId('global-message');
let fleetMap = null;

const scopeLabels = new Map([
  ['drivers:auth:read', 'Consultar acesso de motoristas'],
  ['drivers:auth:write', 'Aprovar e suspender acessos de motoristas'],
  ['drivers:profile:read', 'Consultar perfil e veículo de motoristas'],
  ['drivers:profile:write', 'Editar e aprovar perfil e veículo'],
  ['drivers:documents:read', 'Consultar documentos de motoristas'],
  ['drivers:documents:write', 'Revisar documentos de motoristas'],
  ['passengers:auth:read', 'Consultar acesso de passageiros'],
  ['passengers:auth:write', 'Bloquear e desbloquear passageiros'],
  ['rides:read', 'Consultar operação de corridas'],
  ['rides:write', 'Cancelar corridas antes do início da viagem'],
  ['fleet:read', 'Consultar frota e posições operacionais'],
  ['finance:read', 'Consultar pagamentos, comissões e saques'],
  ['finance:write', 'Administrar políticas financeiras permitidas'],
  ['pricing:read', 'Consultar catálogo de preços e zonas'],
  ['pricing:write', 'Editar e publicar versões de preços'],
  ['audit:read', 'Consultar auditoria'],
]);

const ADMIN_CANCELLABLE_RIDE_STATES = new Set([
  'PAID',
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_ARRIVED',
]);

function hasScope(scope) {
  return state.user?.scopes?.includes(scope) === true;
}

function setMessage(element, message = '', tone = 'neutral') {
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = !message;
}

function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'RN';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function clearSensitiveInputs() {
  loginPassword.value = '';
  loginTotp.value = '';
}

function stopSessionTimer() {
  if (state.sessionTimer != null) {
    clearInterval(state.sessionTimer);
    state.sessionTimer = null;
  }
}

function stopFleetPolling() {
  if (state.fleetTimer != null) {
    clearInterval(state.fleetTimer);
    state.fleetTimer = null;
  }
}

function clearSession(message = '') {
  stopSessionTimer();
  stopFleetPolling();
  state.token = null;
  state.user = null;
  state.expiresAt = null;
  state.currentDriver = null;
  state.currentDriverRegistry = null;
  state.currentDriverDocuments = null;
  state.pricingCatalog = null;
  state.pricingVersions = {
    items: [],
    effectiveVersionId: null,
  };
  state.selectedPricingVersion = null;
  state.fleet = {
    generatedAt: null,
    staleAfterSeconds: 120,
    summary: {
      totalOnline: 0,
      free: 0,
      reserved: 0,
      onRide: 0,
      busy: 0,
      staleGps: 0,
    },
    items: [],
  };
  state.fleetLoading = false;
  state.finance = {
    generatedAt: null,
    readOnly: true,
    summary: {
      paymentsTotal: 0,
      paymentsPaid: 0,
      paymentsPaidCents: 0,
      paymentsPending: 0,
      paymentsFailed: 0,
      paymentsCancelled: 0,
      paymentsRefunded: 0,
      platformRevenueCents: 0,
      driverPayableCents: 0,
      driverPayoutPendingCents: 0,
      rideEscrowCents: 0,
      passengerWalletCents: 0,
      payoutsRequested: 0,
      payoutsRequestedCents: 0,
    },
    payments: [],
    payouts: [],
    policy: null,
  };
  if (fleetMap != null) {
    fleetMap.update([]);
  }
  state.dashboard = {
    generatedAt: null,
    rides: {
      active: 0,
      searchingDriver: 0,
      driverOnTheWay: 0,
      inProgress: 0,
      completedLast24h: 0,
      cancelledLast24h: 0,
    },
    activeRides: [],
  };
  state.driverDirectory = {
    items: [],
    nextCursor: null,
    summary: { total: 0, active: 0, suspended: 0 },
    query: '',
    status: '',
  };
  state.selectedPassenger = null;
  state.passengerDirectory = {
    items: [],
    nextCursor: null,
    summary: { total: 0, active: 0, suspended: 0 },
    query: '',
    status: '',
  };
  state.rideDirectory = {
    items: [],
    nextCursor: null,
    scope: 'active',
    state: '',
    query: '',
    from: '',
    to: '',
  };
  state.selectedRide = null;
  state.auditEntries = [];
  state.auditDirectory = {
    nextCursor: null,
    actorKind: '',
    action: '',
    targetType: '',
    query: '',
  };
  adminView.hidden = true;
  authView.hidden = false;
  document.body.classList.remove('nav-open');
  clearSensitiveInputs();
  if (message) setMessage(loginMessage, message, 'danger');
  loginEmail.focus();
}

function errorMessage(error) {
  if (error instanceof AdminApiError) {
    if (
      error.code === 'ADMIN_LOGIN_RATE_LIMITED' &&
      error.retryAfterSeconds
    ) {
      return `${error.message} Aguarde cerca de ${error.retryAfterSeconds}s.`;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}

function handleAuthenticatedError(error) {
  if (
    error instanceof AdminApiError &&
    (error.status === 401 ||
      error.code === 'ADMIN_SESSION_INVALID' ||
      error.code === 'ADMIN_SESSION_EXPIRED')
  ) {
    clearSession('Sua sessão terminou. Entre novamente.');
    return true;
  }
  setMessage(globalMessage, errorMessage(error), 'danger');
  return false;
}

function updateSessionClock() {
  if (!state.expiresAt) return;
  const seconds = secondsUntil(state.expiresAt);
  const label = formatSessionRemaining(seconds);
  const sessionTime = byId('session-time');
  if (sessionTime != null) sessionTime.textContent = label;
  byId('sidebar-session-time').textContent = label;
  byId('overview-expiry').textContent = formatDateTime(state.expiresAt);

  if (seconds <= 0) {
    clearSession('Sua sessão administrativa expirou.');
  }
}

function startSessionTimer() {
  stopSessionTimer();
  updateSessionClock();
  state.sessionTimer = setInterval(updateSessionClock, 30_000);
}

function renderIdentity() {
  const user = state.user;
  if (!user) return;

  byId('operator-name').textContent = user.name;
  byId('operator-email').textContent = user.email;
  byId('operator-initials').textContent = initials(user.name);
  byId('overview-user').textContent = user.name;
  byId('overview-email').textContent = user.email;

  const scopeList = byId('scope-list');
  scopeList.replaceChildren();
  for (const scope of user.scopes ?? []) {
    const item = document.createElement('div');
    item.className = 'scope-item';

    const dot = document.createElement('span');
    dot.className = 'scope-item__dot';

    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = scopeLabels.get(scope) ?? scope;
    const code = document.createElement('small');
    code.textContent = scope;

    content.append(title, code);
    item.append(dot, content);
    scopeList.append(item);
  }

  if (scopeList.childElementCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted-copy';
    empty.textContent = 'Nenhum escopo administrativo disponível.';
    scopeList.append(empty);
  }
}

function activateView(viewName) {
  const known = new Set([
    'overview',
    'fleet',
    'rides',
    'drivers',
    'passengers',
    'pricing',
    'finance',
    'audit',
  ]);
  const view = known.has(viewName) ? viewName : 'overview';
  stopFleetPolling();

  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.hidden = panel.id !== `view-${view}`;
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    const selected = button.dataset.view === view;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
  });

  const titles = {
    overview: 'Visão geral',
    fleet: 'Frota',
    rides: 'Viagens',
    drivers: 'Motoristas',
    passengers: 'Passageiros',
    pricing: 'Preços',
    finance: 'Financeiro',
    audit: 'Auditoria',
  };
  byId('page-title').textContent = titles[view];
  document.body.classList.remove('nav-open');

  if (view === 'overview') {
    void loadDashboard({ announce: false });
  }
  if (view === 'fleet') {
    void loadFleet({ announce: false });
    startFleetPolling();
  }
  if (view === 'audit') {
    void loadAudit({ announce: false });
  }
  if (view === 'pricing') {
    void loadPricingCatalog({ announce: false });
    void loadPricingVersions({ announce: false });
  }
  if (view === 'finance') {
    void loadFinance({ announce: false });
  }
  if (view === 'drivers' && hasScope('drivers:auth:read')) {
    void loadDriverDirectory({ reset: true, announce: false });
  }
  if (view === 'rides' && hasScope('rides:read')) {
    void loadRideDirectory({ reset: true, announce: false });
  }
  if (
    view === 'passengers' &&
    hasScope('passengers:auth:read')
  ) {
    void loadPassengerDirectory({ reset: true, announce: false });
  }
}

async function openSession(payload) {
  if (
    !payload?.accessToken?.startsWith('rn_admin_session_') ||
    !payload?.user ||
    !payload?.expiresAt
  ) {
    throw new Error('Resposta de autenticação inválida.');
  }

  state.token = payload.accessToken;
  state.user = payload.user;
  state.expiresAt = payload.expiresAt;
  authView.hidden = true;
  adminView.hidden = false;
  setMessage(loginMessage);
  setMessage(globalMessage);
  clearSensitiveInputs();
  renderIdentity();
  activateView('overview');
  startSessionTimer();

  if (hasScope('drivers:auth:read')) {
    await loadDriverDirectory({ reset: true, announce: false });
  } else {
    renderDriverSummary({ total: 0, active: 0, suspended: 0 });
    renderDriverDirectory();
  }

  if (hasScope('passengers:auth:read')) {
    await loadPassengerDirectory({ reset: true, announce: false });
  } else {
    renderPassengerSummary({ total: 0, active: 0, suspended: 0 });
    renderPassengerDirectory();
  }

  if (hasScope('audit:read')) {
    await loadAudit({ announce: false });
  } else {
    renderAudit([]);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setMessage(loginMessage);

  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  const totpCode = loginTotp.value.trim();

  if (!email || password.length < 12 || !/^\d{6}$/.test(totpCode)) {
    setMessage(
      loginMessage,
      'Preencha e-mail, senha e o código MFA de 6 dígitos.',
      'danger',
    );
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = 'Validando…';
  try {
    const payload = await api.login({ email, password, totpCode });
    await openSession(payload);
  } catch (error) {
    clearSensitiveInputs();
    setMessage(loginMessage, errorMessage(error), 'danger');
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Entrar com segurança';
  }
}

async function handleLogout() {
  const token = state.token;
  if (!token) {
    clearSession();
    return;
  }

  try {
    await api.logout(token);
  } catch {
    // A limpeza local acontece mesmo se a rede cair; o token expira em até 2h.
  } finally {
    clearSession('Sessão encerrada com segurança.');
  }
}

function detailRow(label, value) {
  const row = document.createElement('div');
  const term = document.createElement('span');
  term.className = 'driver-detail__label';
  term.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value;
  row.append(term, content);
  return row;
}

function setRegistryWriteControlsVisible() {
  const controls = byId('driver-registry-write-controls');
  controls.hidden = !hasScope('drivers:profile:write');
}

function clearDriverRegistryForm() {
  byId('registry-full-name').value = '';
  byId('registry-preferred-name').value = '';
  byId('registry-plate').value = '';
  byId('registry-make').value = '';
  byId('registry-model').value = '';
  byId('registry-model-year').value = '';
  byId('registry-color').value = '';
  byId('registry-seat-capacity').value = '';
  byId('registry-four-by-four').checked = false;
  document
    .querySelectorAll('input[name="registry-category"]')
    .forEach((input) => {
      input.checked = false;
    });
  byId('registry-profile-status').value = 'pending';
  byId('registry-vehicle-status').value = 'pending';
}

function fillDriverRegistryForm(payload) {
  const profile = payload?.profile ?? null;
  const vehicle = payload?.vehicle ?? null;
  byId('registry-full-name').value = profile?.fullName ?? '';
  byId('registry-preferred-name').value =
    profile?.preferredName ?? '';
  byId('registry-plate').value = vehicle?.plateNormalized ?? '';
  byId('registry-make').value = vehicle?.make ?? '';
  byId('registry-model').value = vehicle?.model ?? '';
  byId('registry-model-year').value =
    vehicle?.modelYear == null ? '' : String(vehicle.modelYear);
  byId('registry-color').value = vehicle?.color ?? '';
  byId('registry-seat-capacity').value =
    vehicle?.seatCapacity == null
      ? ''
      : String(vehicle.seatCapacity);
  byId('registry-four-by-four').checked =
    vehicle?.fourByFour === true;

  const categories = new Set(
    Array.isArray(vehicle?.categories) ? vehicle.categories : [],
  );
  document
    .querySelectorAll('input[name="registry-category"]')
    .forEach((input) => {
      input.checked = categories.has(input.value);
    });

  byId('registry-profile-status').value =
    profile?.status ?? 'pending';
  byId('registry-vehicle-status').value =
    vehicle?.status ?? 'pending';
}

function registrySummaryItem(label, value) {
  const item = document.createElement('div');
  const caption = document.createElement('span');
  caption.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  item.append(caption, strong);
  return item;
}

function renderDriverRegistry(payload, driverId) {
  state.currentDriverRegistry = payload;
  setRegistryWriteControlsVisible();
  fillDriverRegistryForm(payload);

  const target = byId('driver-registry-result');
  const overall = byId('driver-registry-overall');
  target.replaceChildren();

  const profile = payload?.profile ?? null;
  const vehicle = payload?.vehicle ?? null;
  const approved = payload?.registryApproved === true;
  overall.className = `pill pill--${approved ? 'success' : 'warning'}`;
  overall.textContent = approved
    ? 'Cadastro aprovado'
    : profile || vehicle
      ? 'Aguardando aprovação'
      : 'Cadastro pendente';

  if (!profile && !vehicle) {
    target.className = 'driver-registry-result empty-state';
    target.textContent =
      `O motorista ${driverId} ainda não possui perfil e veículo cadastrados.`;
    byId('registry-status-button').disabled = true;
    return;
  }

  target.className = 'driver-registry-result';
  const profileStatus = registryStatusPresentation(profile?.status);
  const vehicleStatus = registryStatusPresentation(vehicle?.status);

  const summary = document.createElement('div');
  summary.className = 'driver-registry-summary';
  summary.append(
    registrySummaryItem(
      'Nome',
      profile?.preferredName || profile?.fullName || '—',
    ),
    registrySummaryItem(
      'Perfil',
      profileStatus.label,
    ),
    registrySummaryItem(
      'Veículo',
      vehicle
        ? `${vehicle.make} ${vehicle.model} · ${vehicle.plateNormalized}`
        : '—',
    ),
    registrySummaryItem(
      'Status do veículo',
      vehicleStatus.label,
    ),
    registrySummaryItem(
      'Categorias',
      Array.isArray(vehicle?.categories) &&
        vehicle.categories.length > 0
        ? vehicle.categories
            .map((category) => serviceCategoryLabel(category))
            .join(', ')
        : '—',
    ),
    registrySummaryItem(
      'Capacidade',
      vehicle?.seatCapacity == null
        ? '—'
        : `${vehicle.seatCapacity} lugar(es)`,
    ),
    registrySummaryItem(
      'Tração',
      vehicle?.fourByFour === true ? '4x4' : 'Convencional',
    ),
    registrySummaryItem(
      'Atualizado',
      formatDateTime(
        vehicle?.updatedAt ?? profile?.updatedAt,
      ),
    ),
  );
  target.append(summary);
  byId('registry-status-button').disabled =
    !profile || !vehicle || !hasScope('drivers:profile:write');
}

function renderDriverRegistryUnavailable(
  message = 'Cadastre ou abra um motorista para continuar.',
) {
  state.currentDriverRegistry = null;
  clearDriverRegistryForm();
  setRegistryWriteControlsVisible();
  const target = byId('driver-registry-result');
  target.replaceChildren();
  target.className = 'driver-registry-result empty-state';
  target.textContent = message;
  const overall = byId('driver-registry-overall');
  overall.className = 'pill';
  overall.textContent = 'Não carregado';
  byId('registry-status-button').disabled = true;
}

async function loadDriverRegistry(driverId) {
  if (!state.token) return;

  if (!hasScope('drivers:profile:read')) {
    renderDriverRegistryUnavailable(
      hasScope('drivers:profile:write')
        ? 'Sem permissão de leitura do cadastro. É possível criar dados, mas não consultar os existentes.'
        : 'Sua conta não possui acesso ao cadastro de perfil e veículo.',
    );
    return;
  }

  try {
    const payload = await api.getDriverRegistry(
      state.token,
      driverId,
    );
    renderDriverRegistry(payload, driverId);
  } catch (error) {
    if (
      error instanceof AdminApiError &&
      error.status === 404
    ) {
      renderDriverRegistryUnavailable(
        'A identidade do motorista não foi encontrada para o cadastro.',
      );
      return;
    }
    handleAuthenticatedError(error);
  }
}

function requiredRegistryText(value, label, min, max) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (
    normalized.length < min ||
    normalized.length > max
  ) {
    throw new Error(
      `${label} deve ter entre ${min} e ${max} caracteres.`,
    );
  }
  return normalized;
}

function collectDriverRegistryForm() {
  const categories = [
    ...document.querySelectorAll(
      'input[name="registry-category"]:checked',
    ),
  ].map((input) => input.value);

  if (categories.length === 0) {
    throw new Error('Selecione ao menos uma categoria do veículo.');
  }

  const modelYear = Number(byId('registry-model-year').value);
  if (
    !Number.isInteger(modelYear) ||
    modelYear < 1980 ||
    modelYear > 2100
  ) {
    throw new Error('Informe um ano de veículo válido.');
  }

  const seatCapacity = Number(
    byId('registry-seat-capacity').value,
  );
  if (
    !Number.isInteger(seatCapacity) ||
    seatCapacity < 1 ||
    seatCapacity > 12
  ) {
    throw new Error('A capacidade deve ficar entre 1 e 12 lugares.');
  }

  const preferredName = String(
    byId('registry-preferred-name').value ?? '',
  ).trim();

  return {
    fullName: requiredRegistryText(
      byId('registry-full-name').value,
      'Nome completo',
      3,
      120,
    ),
    ...(preferredName
      ? {
          preferredName: requiredRegistryText(
            preferredName,
            'Nome preferido',
            2,
            80,
          ),
        }
      : {}),
    vehicle: {
      plate: requiredRegistryText(
        byId('registry-plate').value,
        'Placa',
        7,
        10,
      ),
      make: requiredRegistryText(
        byId('registry-make').value,
        'Marca',
        2,
        60,
      ),
      model: requiredRegistryText(
        byId('registry-model').value,
        'Modelo',
        1,
        80,
      ),
      modelYear,
      color: requiredRegistryText(
        byId('registry-color').value,
        'Cor',
        2,
        40,
      ),
      categories,
      fourByFour: byId('registry-four-by-four').checked,
      seatCapacity,
    },
  };
}

async function handleDriverRegistrySubmit(event) {
  event.preventDefault();
  setMessage(globalMessage);

  if (!state.token || !state.currentDriver) {
    setMessage(
      globalMessage,
      'Abra um motorista antes de salvar o cadastro.',
      'danger',
    );
    return;
  }
  if (!hasScope('drivers:profile:write')) {
    setMessage(
      globalMessage,
      'Sua conta não pode editar o cadastro do motorista.',
      'danger',
    );
    return;
  }

  const button = byId('registry-save-button');
  button.disabled = true;
  try {
    const payload = collectDriverRegistryForm();
    const result = await api.upsertDriverRegistry(
      state.token,
      {
        driverId: state.currentDriver.driverId,
        ...payload,
      },
    );
    renderDriverRegistry(
      result,
      state.currentDriver.driverId,
    );
    setMessage(
      globalMessage,
      'Perfil e veículo salvos. A aprovação continua explícita.',
      'success',
    );
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

async function handleDriverRegistryStatus() {
  setMessage(globalMessage);

  if (!state.token || !state.currentDriver) {
    setMessage(
      globalMessage,
      'Abra um motorista antes de alterar a aprovação.',
      'danger',
    );
    return;
  }
  if (
    !state.currentDriverRegistry?.profile ||
    !state.currentDriverRegistry?.vehicle
  ) {
    setMessage(
      globalMessage,
      'Salve o perfil e o veículo antes de alterar a aprovação.',
      'danger',
    );
    return;
  }

  const button = byId('registry-status-button');
  button.disabled = true;
  try {
    const profileStatus = validateDriverRegistryStatus(
      byId('registry-profile-status').value,
    );
    const vehicleStatus = validateDriverRegistryStatus(
      byId('registry-vehicle-status').value,
    );
    const result = await api.setDriverRegistryStatus(
      state.token,
      {
        driverId: state.currentDriver.driverId,
        profileStatus,
        vehicleStatus,
      },
    );
    renderDriverRegistry(
      result,
      state.currentDriver.driverId,
    );
    setMessage(
      globalMessage,
      result.registryApproved
        ? 'Perfil e veículo aprovados administrativamente.'
        : 'Status cadastral atualizado.',
      'success',
    );
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

function formatDocumentFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.trunc(bytes)} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDocumentDate(value) {
  if (typeof value !== 'string') return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function setDocumentReviewControlsVisible(payload = null) {
  const panel = byId('driver-document-review-panel');
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const hasPending = items.some(
    (item) => item?.status === 'pending',
  );
  panel.hidden =
    !hasScope('drivers:documents:write') || !hasPending;
}

function documentItemByType(payload, type) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.find((item) => item?.documentType === type) ?? null;
}

function syncDocumentReviewForm(payload) {
  const select = byId('driver-document-review-type');
  const pending = (Array.isArray(payload?.items) ? payload.items : [])
    .filter((item) => item?.status === 'pending');
  select.replaceChildren();

  for (const item of pending) {
    const option = document.createElement('option');
    option.value = item.documentType;
    option.textContent = driverDocumentTypeLabel(item.documentType);
    select.append(option);
  }

  byId('driver-document-review-status').value = 'approved';
  byId('driver-document-rejection-reason').value = '';
  syncDocumentRejectionRequirement();
  byId('driver-document-review-button').disabled =
    pending.length === 0 || !hasScope('drivers:documents:write');
}

function documentMeta(label, value) {
  const item = document.createElement('div');
  const caption = document.createElement('span');
  caption.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  item.append(caption, strong);
  return item;
}

function renderDriverDocumentCard(type, record) {
  const card = document.createElement('article');
  card.className = 'driver-document-item';

  const header = document.createElement('div');
  header.className = 'driver-document-item__header';

  const titleWrap = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow eyebrow--dark';
  eyebrow.textContent = 'DOCUMENTO';
  const title = document.createElement('h3');
  title.textContent = driverDocumentTypeLabel(type);
  titleWrap.append(eyebrow, title);

  const presentation = driverDocumentStatusPresentation(
    record?.effectiveStatus ?? record?.status,
  );
  const pill = document.createElement('span');
  pill.className = `pill pill--${presentation.tone}`;
  pill.textContent = presentation.label;
  header.append(titleWrap, pill);

  const detail = document.createElement('p');
  detail.className = 'muted-copy';
  detail.textContent = presentation.detail;

  const meta = document.createElement('div');
  meta.className = 'driver-document-meta';

  if (record == null) {
    meta.append(
      documentMeta('Arquivo privado', 'Não recebido'),
      documentMeta('Validade', '—'),
      documentMeta('Enviado', '—'),
      documentMeta('Revisado', '—'),
    );
  } else {
    meta.append(
      documentMeta(
        'Arquivo privado',
        record.hasPrivateFile === true
          ? `${record.mimeType ?? 'Arquivo'} · ${formatDocumentFileSize(record.sizeBytes)}`
          : 'Indisponível',
      ),
      documentMeta('Validade', formatDocumentDate(record.expiresOn)),
      documentMeta('Enviado', formatDateTime(record.submittedAt)),
      documentMeta('Revisado', formatDateTime(record.reviewedAt)),
    );
  }

  card.append(header, detail, meta);

  if (record?.rejectionReason) {
    const reason = document.createElement('p');
    reason.className = 'driver-document-rejection';
    reason.textContent = `Motivo: ${record.rejectionReason}`;
    card.append(reason);
  }

  return card;
}

function renderDriverDocuments(payload) {
  state.currentDriverDocuments = payload;
  const target = byId('driver-documents-result');
  const overall = byId('driver-documents-overall');
  target.replaceChildren();

  const approved = payload?.documentsApproved === true;
  overall.className = `pill pill--${approved ? 'success' : 'warning'}`;
  overall.textContent = approved
    ? 'Documentos aprovados'
    : 'Revisão pendente';

  const grid = document.createElement('div');
  grid.className = 'driver-documents-grid';
  grid.append(
    renderDriverDocumentCard(
      'driver_license',
      documentItemByType(payload, 'driver_license'),
    ),
    renderDriverDocumentCard(
      'vehicle_registration',
      documentItemByType(payload, 'vehicle_registration'),
    ),
  );
  target.className = 'driver-documents-result';
  target.append(grid);

  syncDocumentReviewForm(payload);
  setDocumentReviewControlsVisible(payload);
}

function renderDriverDocumentsUnavailable(
  message = 'Abra um motorista para consultar os documentos.',
) {
  state.currentDriverDocuments = null;
  const target = byId('driver-documents-result');
  target.replaceChildren();
  target.className = 'driver-documents-result empty-state';
  target.textContent = message;

  const overall = byId('driver-documents-overall');
  overall.className = 'pill';
  overall.textContent = 'Não carregado';

  const select = byId('driver-document-review-type');
  select.replaceChildren();
  byId('driver-document-review-status').value = 'approved';
  byId('driver-document-rejection-reason').value = '';
  byId('driver-document-review-button').disabled = true;
  byId('driver-document-review-panel').hidden = true;
}

async function loadDriverDocuments(driverId) {
  if (!state.token) return;

  if (!hasScope('drivers:documents:read')) {
    renderDriverDocumentsUnavailable(
      'Sua conta não possui permissão para consultar documentos.',
    );
    return;
  }

  try {
    const payload = await api.getDriverDocuments(
      state.token,
      driverId,
    );
    renderDriverDocuments(payload);
  } catch (error) {
    if (
      error instanceof AdminApiError &&
      error.status === 404
    ) {
      renderDriverDocumentsUnavailable(
        'Cadastre o perfil do motorista antes de revisar documentos.',
      );
      return;
    }
    handleAuthenticatedError(error);
  }
}

function normalizedRejectionReason() {
  return String(
    byId('driver-document-rejection-reason').value ?? '',
  )
    .trim()
    .replace(/\s+/g, ' ');
}

function syncDocumentRejectionRequirement() {
  const rejected =
    byId('driver-document-review-status').value === 'rejected';
  const field = byId('driver-document-rejection-reason');
  field.required = rejected;
  field.disabled = !rejected;
  if (!rejected) field.value = '';
}

async function handleDriverDocumentReview(event) {
  event.preventDefault();
  setMessage(globalMessage);

  if (!state.token || !state.currentDriver) {
    setMessage(
      globalMessage,
      'Abra um motorista antes de revisar documentos.',
      'danger',
    );
    return;
  }
  if (!hasScope('drivers:documents:write')) {
    setMessage(
      globalMessage,
      'Sua conta não pode revisar documentos.',
      'danger',
    );
    return;
  }

  const documentType =
    byId('driver-document-review-type').value;
  const current = documentItemByType(
    state.currentDriverDocuments,
    documentType,
  );
  if (current?.status !== 'pending') {
    setMessage(
      globalMessage,
      'Selecione um documento pendente de revisão.',
      'danger',
    );
    return;
  }

  const status = byId('driver-document-review-status').value;
  if (status !== 'approved' && status !== 'rejected') {
    setMessage(globalMessage, 'Decisão documental inválida.', 'danger');
    return;
  }

  const rejectionReason = normalizedRejectionReason();
  if (
    status === 'rejected' &&
    (rejectionReason.length < 3 || rejectionReason.length > 240)
  ) {
    setMessage(
      globalMessage,
      'Informe um motivo de rejeição entre 3 e 240 caracteres.',
      'danger',
    );
    return;
  }

  const button = byId('driver-document-review-button');
  button.disabled = true;
  try {
    await api.reviewDriverDocument(state.token, {
      driverId: state.currentDriver.driverId,
      documentType,
      status,
      ...(status === 'rejected' ? { rejectionReason } : {}),
    });
    await loadDriverDocuments(state.currentDriver.driverId);
    setMessage(
      globalMessage,
      status === 'approved'
        ? 'Documento aprovado e decisão auditada.'
        : 'Documento rejeitado e decisão auditada.',
      'success',
    );
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    const pending = Array.isArray(
      state.currentDriverDocuments?.items,
    )
      ? state.currentDriverDocuments.items.some(
          (item) => item?.status === 'pending',
        )
      : false;
    button.disabled =
      !pending || !hasScope('drivers:documents:write');
  }
}

function renderDriver(driver) {
  const target = byId('driver-result');
  target.replaceChildren();
  target.className = 'driver-result';

  const presentation = statusPresentation(driver.status);
  const header = document.createElement('div');
  header.className = 'driver-result__header';

  const identity = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.className = 'eyebrow eyebrow--dark';
  kicker.textContent = 'IDENTIDADE';
  const title = document.createElement('h3');
  title.textContent = driver.driverId;
  identity.append(kicker, title);

  const pill = document.createElement('span');
  pill.className = `pill pill--${presentation.tone}`;
  pill.textContent = presentation.label;
  header.append(identity, pill);

  const details = document.createElement('div');
  details.className = 'driver-details';
  details.append(
    detailRow('Telefone', driver.phoneE164 ?? '—'),
    detailRow('Atualizado', formatDateTime(driver.updatedAt)),
  );

  const statusCopy = document.createElement('p');
  statusCopy.className = 'driver-result__status-copy';
  statusCopy.textContent = presentation.detail;

  target.append(header, details, statusCopy);

  if (hasScope('drivers:auth:write')) {
    const actions = document.createElement('div');
    actions.className = 'driver-actions';

    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      driver.status === 'active'
        ? 'button button--danger'
        : 'button button--primary';
    button.textContent =
      driver.status === 'active'
        ? 'Suspender acesso'
        : 'Aprovar motorista';
    button.addEventListener('click', () => {
      void changeDriverStatus(
        driver.driverId,
        driver.status === 'active' ? 'suspended' : 'active',
        button,
      );
    });
    actions.append(button);
    target.append(actions);
  }
}

function renderDriverNotFound(driverId) {
  const target = byId('driver-result');
  target.replaceChildren();
  target.className = 'driver-result empty-state';

  const strong = document.createElement('strong');
  strong.textContent = 'Motorista não provisionado';
  const copy = document.createElement('p');
  copy.textContent =
    `Nenhuma identidade de autenticação foi encontrada para ${driverId}.`;
  target.append(strong, copy);
}

function numericMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.trunc(number)
    : 0;
}

function renderDashboard(payload = null) {
  const rides = payload?.rides ?? {};
  const summary = {
    active: numericMetric(rides.active),
    searchingDriver: numericMetric(rides.searchingDriver),
    driverOnTheWay: numericMetric(rides.driverOnTheWay),
    inProgress: numericMetric(rides.inProgress),
    completedLast24h: numericMetric(rides.completedLast24h),
    cancelledLast24h: numericMetric(rides.cancelledLast24h),
  };
  const activeRides = Array.isArray(payload?.activeRides)
    ? payload.activeRides
    : [];

  state.dashboard = {
    generatedAt:
      typeof payload?.generatedAt === 'string'
        ? payload.generatedAt
        : null,
    rides: summary,
    activeRides,
  };

  byId('dashboard-active').textContent = String(summary.active);
  byId('dashboard-searching').textContent = String(
    summary.searchingDriver,
  );
  byId('dashboard-on-way').textContent = String(
    summary.driverOnTheWay,
  );
  byId('dashboard-in-progress').textContent = String(
    summary.inProgress,
  );
  byId('dashboard-completed-24h').textContent = String(
    summary.completedLast24h,
  );
  byId('dashboard-cancelled-24h').textContent = String(
    summary.cancelledLast24h,
  );
  byId('dashboard-active-count').textContent =
    `${activeRides.length} corrida(s)`;
  byId('dashboard-updated-at').textContent =
    state.dashboard.generatedAt == null
      ? hasScope('rides:read')
        ? 'Aguardando atualização'
        : 'Sem permissão rides:read'
      : `Atualizado em ${formatDateTime(state.dashboard.generatedAt)}`;

  const body = byId('dashboard-rides-body');
  const empty = byId('dashboard-rides-empty');
  body.replaceChildren();

  for (const ride of activeRides) {
    const row = document.createElement('tr');

    const stateCell = document.createElement('td');
    const stateInfo = rideStatePresentation(ride.state);
    const statePill = document.createElement('span');
    statePill.className = `pill pill--${stateInfo.tone}`;
    statePill.textContent = stateInfo.label;
    stateCell.append(statePill);

    const route = document.createElement('td');
    const routeStrong = document.createElement('strong');
    routeStrong.textContent =
      `${locationLabel(ride.origin)} → ` +
      locationLabel(ride.destination);
    const rideId = document.createElement('small');
    rideId.className = 'table-subtext';
    rideId.textContent = String(ride.id ?? '—');
    route.append(routeStrong, rideId);

    const category = document.createElement('td');
    category.textContent = serviceCategoryLabel(ride.category);

    const passenger = document.createElement('td');
    passenger.textContent = String(ride.passengerId ?? '—');

    const driver = document.createElement('td');
    driver.textContent = String(
      ride.driverId ?? ride.reservedDriverId ?? 'Aguardando',
    );

    const amount = document.createElement('td');
    amount.textContent = formatCurrencyCents(
      ride.totalAmountCents,
    );

    const updated = document.createElement('td');
    updated.textContent = formatDateTime(ride.updatedAt);

    row.append(
      stateCell,
      route,
      category,
      passenger,
      driver,
      amount,
      updated,
    );
    body.append(row);
  }

  empty.hidden = activeRides.length !== 0;
}

async function loadDashboard({ announce = true } = {}) {
  if (!state.token || !hasScope('rides:read')) {
    renderDashboard();
    return;
  }

  const refreshButton = byId('refresh-dashboard-button');
  refreshButton.disabled = true;
  try {
    const payload = await api.dashboard(state.token);
    renderDashboard(payload);
    if (announce) {
      setMessage(
        globalMessage,
        'Dashboard operacional atualizado.',
        'success',
      );
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    refreshButton.disabled = false;
  }
}

function fleetAvailabilityPresentation(value) {
  if (value === 'on_ride') {
    return { label: 'Em corrida', tone: 'info' };
  }
  if (value === 'reserved') {
    return { label: 'Reservado', tone: 'warning' };
  }
  if (value === 'busy') {
    return { label: 'Ocupado', tone: 'warning' };
  }
  return { label: 'Livre', tone: 'success' };
}

function fleetGpsLabel(location) {
  if (location?.status === 'stale') {
    const minutes = Math.max(
      1,
      Math.round(Number(location.ageSeconds ?? 0) / 60),
    );
    return `GPS há ${minutes} min`;
  }
  const seconds = Math.max(
    0,
    Math.trunc(Number(location?.ageSeconds ?? 0)),
  );
  return seconds < 5 ? 'GPS agora' : `GPS há ${seconds}s`;
}

function ensureFleetMap() {
  if (fleetMap != null) return fleetMap;
  fleetMap = createFleetMap({
    root: byId('fleet-map'),
    tiles: byId('fleet-map-tiles'),
    markers: byId('fleet-map-markers'),
    zoomIn: byId('fleet-map-zoom-in'),
    zoomOut: byId('fleet-map-zoom-out'),
  });
  return fleetMap;
}

function renderFleet(payload = null) {
  const summary = {
    totalOnline: numericMetric(payload?.summary?.totalOnline),
    free: numericMetric(payload?.summary?.free),
    reserved: numericMetric(payload?.summary?.reserved),
    onRide: numericMetric(payload?.summary?.onRide),
    busy: numericMetric(payload?.summary?.busy),
    staleGps: numericMetric(payload?.summary?.staleGps),
  };
  const items = Array.isArray(payload?.items) ? payload.items : [];

  state.fleet = {
    generatedAt:
      typeof payload?.generatedAt === 'string'
        ? payload.generatedAt
        : null,
    staleAfterSeconds: numericMetric(
      payload?.staleAfterSeconds ?? 120,
    ),
    summary,
    items,
  };

  byId('fleet-total-online').textContent =
    String(summary.totalOnline);
  byId('fleet-free').textContent = String(summary.free);
  byId('fleet-on-ride').textContent = String(summary.onRide);
  byId('fleet-stale-gps').textContent =
    String(summary.staleGps);
  byId('fleet-roster-count').textContent =
    `${items.length} online`;
  byId('fleet-updated-at').textContent =
    state.fleet.generatedAt == null
      ? hasScope('fleet:read')
        ? 'Aguardando atualização'
        : 'Sem permissão fleet:read'
      : `Atualizado em ${formatDateTime(state.fleet.generatedAt)}`;

  const roster = byId('fleet-roster');
  const empty = byId('fleet-roster-empty');
  roster.replaceChildren();

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'fleet-roster-item';

    const top = document.createElement('div');
    top.className = 'fleet-roster-item__top';

    const identity = document.createElement('div');
    identity.className = 'fleet-roster-item__identity';
    const name = document.createElement('strong');
    name.textContent = item.driverName ?? item.driverId ?? 'Motorista';
    const vehicle = document.createElement('small');
    const vehicleParts = [
      item.vehicle?.make,
      item.vehicle?.model,
      item.vehicle?.plate,
    ].filter(Boolean);
    vehicle.textContent =
      vehicleParts.length > 0
        ? vehicleParts.join(' · ')
        : String(item.driverId ?? '—');
    identity.append(name, vehicle);

    const availability = fleetAvailabilityPresentation(
      item.availability,
    );
    const status = document.createElement('span');
    status.className = `pill pill--${availability.tone}`;
    status.textContent = availability.label;

    top.append(identity, status);

    const meta = document.createElement('div');
    meta.className = 'fleet-roster-item__meta';
    const service = document.createElement('span');
    service.textContent =
      item.currentServiceCategory != null
        ? serviceCategoryLabel(item.currentServiceCategory)
        : Array.isArray(item.categories) && item.categories.length > 0
          ? item.categories
              .map((category) => serviceCategoryLabel(category))
              .join(', ')
          : 'Sem categoria';

    const gps = document.createElement('span');
    gps.textContent = fleetGpsLabel(item.location);
    if (item.location?.status === 'stale') {
      gps.className = 'text-danger';
    }

    meta.append(service, gps);
    card.append(top, meta);
    roster.append(card);
  }

  empty.hidden = items.length !== 0;

  if (!byId('view-fleet').hidden) {
    ensureFleetMap().update(items);
  }
}

async function loadFleet({ announce = true } = {}) {
  if (
    !state.token ||
    !hasScope('fleet:read') ||
    state.fleetLoading
  ) {
    if (!hasScope('fleet:read')) renderFleet();
    return;
  }

  state.fleetLoading = true;
  const button = byId('refresh-fleet-button');
  button.disabled = true;
  try {
    const payload = await api.fleet(state.token);
    renderFleet(payload);
    if (announce) {
      setMessage(
        globalMessage,
        'Mapa da frota atualizado.',
        'success',
      );
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    state.fleetLoading = false;
    button.disabled = false;
  }
}

function startFleetPolling() {
  stopFleetPolling();
  if (!state.token || !hasScope('fleet:read')) {
    renderFleet();
    return;
  }
  state.fleetTimer = setInterval(() => {
    void loadFleet({ announce: false });
  }, 5_000);
}

function payoutStatusPresentation(status) {
  const value = String(status ?? '');
  if (value === 'paid') {
    return { label: 'Pago', tone: 'success' };
  }
  if (value === 'processing') {
    return { label: 'Processando', tone: 'info' };
  }
  if (value === 'requested') {
    return { label: 'Solicitado', tone: 'warning' };
  }
  if (value === 'failed') {
    return { label: 'Falhou', tone: 'danger' };
  }
  if (value === 'cancelled') {
    return { label: 'Cancelado', tone: 'neutral' };
  }
  return { label: value || '—', tone: 'neutral' };
}

function paymentMethodLabel(method) {
  if (method === 'pix') return 'Pix';
  if (method === 'card') return 'Cartão';
  if (method === 'wallet') return 'Carteira';
  return String(method ?? '—');
}

function renderPaymentPolicy(policy = null) {
  state.finance.policy = policy;

  const cashEnabled = policy?.cashEnabled === true;
  const activationReady = policy?.cashActivationReady === true;
  const status = byId('finance-cash-status');
  status.className = cashEnabled
    ? 'pill pill--danger'
    : 'pill pill--success';
  status.textContent = cashEnabled ? 'Ativado' : 'Desativado';

  byId('finance-cash-debt-limit').textContent =
    formatCurrencyCents(
      numericMetric(policy?.futureCashDebtLimitCents ?? 12000),
    );
  byId('finance-cash-readiness').textContent =
    activationReady ? 'Pronta' : 'Bloqueada';
  byId('finance-cash-updated-at').textContent =
    policy?.updatedAt
      ? `Atualizada em ${formatDateTime(policy.updatedAt)}`
      : 'Aguardando política';

  const disableButton = byId('finance-disable-cash-button');
  disableButton.hidden =
    !cashEnabled || !hasScope('finance:write');
  disableButton.disabled = false;

  byId('finance-cash-note').textContent = activationReady
    ? 'A política está tecnicamente pronta para ativação.'
    : 'A ativação só será liberada depois do fluxo cash de comissão, dívida e limite operacional.';
}

function renderFinance(payload = null) {
  const summary = payload?.summary ?? {};
  const payments = Array.isArray(payload?.payments)
    ? payload.payments
    : [];
  const payouts = Array.isArray(payload?.payouts)
    ? payload.payouts
    : [];

  state.finance = {
    generatedAt:
      typeof payload?.generatedAt === 'string'
        ? payload.generatedAt
        : null,
    readOnly: payload?.readOnly !== false,
    summary: {
      paymentsTotal: numericMetric(summary.paymentsTotal),
      paymentsPaid: numericMetric(summary.paymentsPaid),
      paymentsPaidCents: numericMetric(summary.paymentsPaidCents),
      paymentsPending: numericMetric(summary.paymentsPending),
      paymentsFailed: numericMetric(summary.paymentsFailed),
      paymentsCancelled: numericMetric(summary.paymentsCancelled),
      paymentsRefunded: numericMetric(summary.paymentsRefunded),
      platformRevenueCents: numericMetric(
        summary.platformRevenueCents,
      ),
      driverPayableCents: numericMetric(summary.driverPayableCents),
      driverPayoutPendingCents: numericMetric(
        summary.driverPayoutPendingCents,
      ),
      rideEscrowCents: numericMetric(summary.rideEscrowCents),
      passengerWalletCents: numericMetric(
        summary.passengerWalletCents,
      ),
      payoutsRequested: numericMetric(summary.payoutsRequested),
      payoutsRequestedCents: numericMetric(
        summary.payoutsRequestedCents,
      ),
    },
    payments,
    payouts,
    policy: state.finance.policy,
  };

  const current = state.finance.summary;
  byId('finance-updated-at').textContent =
    state.finance.generatedAt == null
      ? hasScope('finance:read')
        ? 'Aguardando atualização'
        : 'Sem permissão finance:read'
      : `Atualizado em ${formatDateTime(state.finance.generatedAt)}`;
  byId('finance-paid-total').textContent =
    formatCurrencyCents(current.paymentsPaidCents);
  byId('finance-paid-count').textContent =
    `${current.paymentsPaid} pagamento(s)`;
  byId('finance-platform-revenue').textContent =
    formatCurrencyCents(current.platformRevenueCents);
  byId('finance-driver-payable').textContent =
    formatCurrencyCents(current.driverPayableCents);
  byId('finance-payout-pending').textContent =
    formatCurrencyCents(current.driverPayoutPendingCents);
  byId('finance-payout-count').textContent =
    `${current.payoutsRequested} solicitação(ões) aberta(s)`;
  byId('finance-ride-escrow').textContent =
    formatCurrencyCents(current.rideEscrowCents);
  byId('finance-passenger-wallet').textContent =
    formatCurrencyCents(current.passengerWalletCents);
  byId('finance-payments-total').textContent =
    String(current.paymentsTotal);
  byId('finance-payments-pending').textContent =
    String(current.paymentsPending);
  byId('finance-payments-failed').textContent =
    String(current.paymentsFailed);
  byId('finance-payments-cancelled').textContent =
    String(current.paymentsCancelled);
  byId('finance-payments-refunded').textContent =
    String(current.paymentsRefunded);

  const paymentBody = byId('finance-payments-body');
  paymentBody.replaceChildren();
  for (const payment of payments) {
    const row = document.createElement('tr');

    const statusCell = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className = 'pill pill--neutral';
    statusPill.textContent = paymentStatusLabel(payment.status);
    statusCell.append(statusPill);

    const method = document.createElement('td');
    method.textContent = paymentMethodLabel(payment.method);

    const ride = document.createElement('td');
    ride.textContent = payment.rideId ?? '—';

    const amount = document.createElement('td');
    amount.textContent = formatCurrencyCents(payment.amountCents);

    const processor = document.createElement('td');
    processor.textContent = payment.processor ?? '—';

    const created = document.createElement('td');
    created.textContent = formatDateTime(payment.createdAt);

    row.append(
      statusCell,
      method,
      ride,
      amount,
      processor,
      created,
    );
    paymentBody.append(row);
  }
  byId('finance-payments-visible').textContent =
    `${payments.length} item(ns)`;
  byId('finance-payments-empty').hidden = payments.length !== 0;

  const payoutBody = byId('finance-payouts-body');
  payoutBody.replaceChildren();
  for (const payout of payouts) {
    const row = document.createElement('tr');

    const statusCell = document.createElement('td');
    const presentation = payoutStatusPresentation(payout.status);
    const statusPill = document.createElement('span');
    statusPill.className = `pill pill--${presentation.tone}`;
    statusPill.textContent = presentation.label;
    statusCell.append(statusPill);

    const driver = document.createElement('td');
    driver.textContent = payout.driverId ?? '—';

    const amount = document.createElement('td');
    amount.textContent = formatCurrencyCents(payout.amountCents);

    const processor = document.createElement('td');
    processor.textContent = payout.processor ?? 'Aguardando integração';

    const created = document.createElement('td');
    created.textContent = formatDateTime(payout.createdAt);

    row.append(statusCell, driver, amount, processor, created);
    payoutBody.append(row);
  }
  byId('finance-payouts-visible').textContent =
    `${payouts.length} item(ns)`;
  byId('finance-payouts-empty').hidden = payouts.length !== 0;
}

async function loadFinance({ announce = true } = {}) {
  if (!state.token || !hasScope('finance:read')) {
    renderFinance();
    return;
  }

  const button = byId('refresh-finance-button');
  button.disabled = true;
  try {
    const [payload, policy] = await Promise.all([
      api.finance(state.token, 25),
      api.paymentPolicy(state.token),
    ]);
    renderFinance(payload);
    renderPaymentPolicy(policy);
    if (announce) {
      setMessage(
        globalMessage,
        'Financeiro atualizado pelo ledger.',
        'success',
      );
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

async function handleDisableCash() {
  if (
    !state.token ||
    !hasScope('finance:write') ||
    state.finance.policy?.cashEnabled !== true
  ) {
    return;
  }

  const button = byId('finance-disable-cash-button');
  button.disabled = true;
  try {
    const policy = await api.updatePaymentPolicy(state.token, {
      cashEnabled: false,
    });
    renderPaymentPolicy(policy);
    setMessage(
      globalMessage,
      'Dinheiro desativado com segurança.',
      'success',
    );
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

function pricingValueLabel(value) {
  if (value == null || typeof value !== 'object') return '—';
  if (value.kind === 'exact') {
    return formatCurrencyCents(value.amountCents);
  }
  if (value.kind === 'range') {
    return (
      `${formatCurrencyCents(value.minCents)} – ` +
      formatCurrencyCents(value.maxCents)
    );
  }
  return '—';
}

function pricingIdentifierLabel(value) {
  return String(value ?? '—')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) =>
      part.length <= 3
        ? part.toUpperCase()
        : part[0].toUpperCase() + part.slice(1),
    )
    .join(' ');
}

function pricingMoneyToCents(value, label) {
  const raw = String(value ?? '').trim();
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const amount = Number(normalized);
  const cents = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isInteger(cents) ||
    cents > 10_000_000
  ) {
    throw new Error(`${label} deve ser um valor positivo válido.`);
  }
  return cents;
}

function pricingVersionStatusPresentation(version) {
  if (version?.status === 'draft') {
    return { label: 'Rascunho', tone: 'warning' };
  }
  if (
    version?.status === 'published' &&
    version?.id === state.pricingVersions.effectiveVersionId
  ) {
    return { label: 'Em vigor', tone: 'success' };
  }
  if (version?.status === 'published') {
    const future =
      version.effectiveFrom != null &&
      Date.parse(version.effectiveFrom) > Date.now();
    return future
      ? { label: 'Agendada', tone: 'info' }
      : { label: 'Publicada', tone: 'neutral' };
  }
  return { label: 'Desconhecida', tone: 'neutral' };
}

function renderPricingVersions() {
  const body = byId('pricing-versions-body');
  const empty = byId('pricing-versions-empty');
  const createButton = byId('pricing-create-draft-button');
  body.replaceChildren();

  createButton.hidden = !hasScope('pricing:write');
  createButton.disabled = false;

  const items = state.pricingVersions.items;
  for (const version of items) {
    const row = document.createElement('tr');

    const versionCell = document.createElement('td');
    const versionName = document.createElement('strong');
    versionName.textContent = `#${version.versionNumber}`;
    const catalog = document.createElement('small');
    catalog.className = 'table-subtext';
    catalog.textContent = version.catalogVersion ?? 'v1';
    versionCell.append(versionName, catalog);

    const statusCell = document.createElement('td');
    const presentation = pricingVersionStatusPresentation(version);
    const pill = document.createElement('span');
    pill.className = `pill pill--${presentation.tone}`;
    pill.textContent = presentation.label;
    statusCell.append(pill);

    const effective = document.createElement('td');
    effective.textContent = formatDateTime(version.effectiveFrom);

    const updated = document.createElement('td');
    updated.textContent = formatDateTime(version.updatedAt);

    const actions = document.createElement('td');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'button button--table';
    open.textContent = 'Abrir';
    open.addEventListener('click', () => {
      void openPricingVersion(version.id);
    });
    actions.append(open);

    row.append(
      versionCell,
      statusCell,
      effective,
      updated,
      actions,
    );
    body.append(row);
  }

  empty.hidden = items.length !== 0;
}

function renderPricingEditor(version = null) {
  state.selectedPricingVersion = version;
  const empty = byId('pricing-editor-empty');
  const controls = byId('pricing-editor-controls');
  const status = byId('pricing-editor-status');

  if (version == null) {
    status.className = 'pill pill--neutral';
    status.textContent = 'Nenhum';
    controls.hidden = true;
    empty.hidden = false;
    empty.textContent =
      'Abra uma versão em rascunho ou crie uma nova para alterar preços.';
    return;
  }

  const presentation = pricingVersionStatusPresentation(version);
  status.className = `pill pill--${presentation.tone}`;
  status.textContent = presentation.label;

  byId('pricing-selected-version-title').textContent =
    `Versão #${version.versionNumber} · ${version.catalogVersion ?? 'v1'}`;
  byId('pricing-selected-version-meta').textContent =
    version.status === 'draft'
      ? 'Alterações ficam isoladas até a publicação.'
      : `Vigência: ${formatDateTime(version.effectiveFrom)}`;

  const editable =
    version.status === 'draft' && hasScope('pricing:write');
  controls.hidden = !editable;
  empty.hidden = editable;
  if (!editable) {
    empty.textContent =
      version.status === 'published'
        ? 'Esta versão já foi publicada e é imutável. O catálogo acima está em modo de consulta.'
        : 'Sua conta não possui permissão para editar esta versão.';
  }
}

function syncPricingEditFields() {
  const kind = byId('pricing-edit-kind').value;
  byId('pricing-fixed-route-fields').hidden =
    kind !== 'fixed_route';
  byId('pricing-locality-fields').hidden =
    kind !== 'locality_price';
  byId('pricing-category-policy-fields').hidden =
    kind !== 'category_policy';
  byId('pricing-zone-policy-fields').hidden =
    kind !== 'zone_policy';
  byId('pricing-locality-structure-fields').hidden =
    kind !== 'locality_structure';
}

function syncPricingLocalityPriceFields() {
  const range =
    byId('pricing-locality-price-kind').value === 'range';
  byId('pricing-locality-max-field').hidden = !range;
  byId('pricing-locality-min-label').textContent =
    range ? 'Mínimo (R$)' : 'Preço (R$)';
}

function renderPricingCatalog(payload = null) {
  state.pricingCatalog = payload;

  const prea = Array.isArray(payload?.localities?.prea)
    ? payload.localities.prea
    : [];
  const jijoca = Array.isArray(payload?.localities?.jijoca)
    ? payload.localities.jijoca
    : [];
  const localities = [
    ...prea.map((item) => ({ base: 'Preá', item })),
    ...jijoca.map((item) => ({ base: 'Jijoca', item })),
  ];
  const fixedRoutes = Array.isArray(payload?.fixedRoutes)
    ? payload.fixedRoutes
    : [];
  const categoryPolicies = Array.isArray(payload?.categoryPolicies)
    ? payload.categoryPolicies
    : [];
  const zonePolicies = Array.isArray(payload?.zonePolicies)
    ? payload.zonePolicies
    : [];
  const externalLocalities = Array.isArray(payload?.externalLocalities)
    ? payload.externalLocalities
    : [];

  const versionLabel =
    payload?.versionNumber == null
      ? payload?.catalogVersion ?? '—'
      : `#${payload.versionNumber}`;
  byId('pricing-version').textContent = versionLabel;

  const commissionBps = Number(payload?.commissionBps);
  byId('pricing-commission').textContent =
    Number.isFinite(commissionBps)
      ? `${(commissionBps / 100).toLocaleString('pt-BR')}%`
      : '—';

  byId('pricing-localities').textContent =
    String(localities.length);
  byId('pricing-fixed-routes').textContent =
    String(fixedRoutes.length);
  byId('pricing-locality-count').textContent =
    `${localities.length} localidade(s)`;
  byId('pricing-route-count').textContent =
    `${fixedRoutes.length} rota(s)`;
  byId('pricing-category-count').textContent =
    `${categoryPolicies.length} categoria(s)`;
  byId('pricing-zone-count').textContent =
    `${zonePolicies.length} zona(s)`;
  byId('pricing-external-count').textContent =
    `${externalLocalities.length} destino(s)`;

  const mode = byId('pricing-mode');
  if (payload == null) {
    mode.textContent = hasScope('pricing:read')
      ? 'Aguardando catálogo'
      : 'Sem permissão pricing:read';
  } else if (payload.mode === 'versioned') {
    mode.textContent =
      `Versão #${payload.versionNumber ?? '—'} · ` +
      (payload.editable ? 'rascunho' : 'publicada') +
      (payload.effectiveFrom
        ? ` · ${formatDateTime(payload.effectiveFrom)}`
        : '');
  } else {
    mode.textContent =
      `Catálogo ${payload.catalogVersion ?? '—'} · ` +
      'fallback estático';
  }

  const zoneBody = byId('pricing-zone-policies-body');
  zoneBody.replaceChildren();
  for (const policy of zonePolicies) {
    const row = document.createElement('tr');

    const zone = document.createElement('td');
    zone.textContent = pricingIdentifierLabel(policy.zoneId);

    const status = document.createElement('td');
    const pill = document.createElement('span');
    pill.className =
      `pill pill--${policy.enabled ? 'success' : 'danger'}`;
    pill.textContent =
      policy.enabled ? 'Ativa' : 'Desativada';
    status.append(pill);

    row.append(zone, status);
    zoneBody.append(row);
  }
  byId('pricing-zone-policies-empty').hidden =
    zonePolicies.length !== 0;

  const externalBody = byId('pricing-external-localities-body');
  externalBody.replaceChildren();
  for (const localityId of externalLocalities) {
    const row = document.createElement('tr');
    const locality = document.createElement('td');
    locality.textContent = localityId;
    row.append(locality);
    externalBody.append(row);
  }
  byId('pricing-external-localities-empty').hidden =
    externalLocalities.length !== 0;

  const categoryBody = byId('pricing-category-policies-body');
  categoryBody.replaceChildren();
  for (const policy of categoryPolicies) {
    const row = document.createElement('tr');

    const category = document.createElement('td');
    category.textContent = serviceCategoryLabel(policy.category);

    const status = document.createElement('td');
    const statusPill = document.createElement('span');
    statusPill.className =
      `pill pill--${policy.enabled ? 'success' : 'danger'}`;
    statusPill.textContent =
      policy.enabled ? 'Ativa' : 'Desativada';
    status.append(statusPill);

    const jeri = document.createElement('td');
    jeri.textContent = policy.requiresFourByFourOnJeriBoundary
      ? 'Exige 4x4'
      : 'Sem exigência 4x4';

    row.append(category, status, jeri);
    categoryBody.append(row);
  }
  byId('pricing-category-policies-empty').hidden =
    categoryPolicies.length !== 0;

  const localityBody = byId('pricing-localities-body');
  localityBody.replaceChildren();
  for (const entry of localities) {
    const row = document.createElement('tr');

    const base = document.createElement('td');
    base.textContent = entry.base;

    const locality = document.createElement('td');
    const localityName = document.createElement('strong');
    localityName.textContent = pricingIdentifierLabel(
      entry.item.localityId,
    );
    const localityId = document.createElement('small');
    localityId.className = 'table-subtext';
    localityId.textContent = entry.item.localityId;
    locality.append(localityName, localityId);

    const moto = document.createElement('td');
    moto.textContent = pricingValueLabel(entry.item.prices?.moto);

    const delivery = document.createElement('td');
    delivery.textContent = pricingValueLabel(
      entry.item.prices?.delivery,
    );

    const car = document.createElement('td');
    car.textContent = pricingValueLabel(entry.item.prices?.car);

    row.append(base, locality, moto, delivery, car);
    localityBody.append(row);
  }
  byId('pricing-localities-empty').hidden =
    localities.length !== 0;

  const routeBody = byId('pricing-routes-body');
  routeBody.replaceChildren();
  for (const route of fixedRoutes) {
    const row = document.createElement('tr');

    const pair = document.createElement('td');
    pair.textContent =
      `${pricingIdentifierLabel(route.a)} → ` +
      pricingIdentifierLabel(route.b);

    const category = document.createElement('td');
    category.textContent = serviceCategoryLabel(route.category);

    const day = document.createElement('td');
    day.textContent = formatCurrencyCents(route.dayCents);

    const night = document.createElement('td');
    night.textContent = formatCurrencyCents(route.after22Cents);

    const rule = document.createElement('td');
    rule.textContent = route.id;

    row.append(pair, category, day, night, rule);
    routeBody.append(row);
  }
  byId('pricing-routes-empty').hidden =
    fixedRoutes.length !== 0;
}

async function loadPricingCatalog({ announce = true } = {}) {
  if (!state.token || !hasScope('pricing:read')) {
    renderPricingCatalog();
    renderPricingEditor();
    return;
  }

  const button = byId('refresh-pricing-button');
  button.disabled = true;
  try {
    const payload = await api.pricingCatalog(state.token);
    renderPricingCatalog(payload);
    renderPricingEditor();
    if (announce) {
      setMessage(
        globalMessage,
        'Catálogo ativo de preços atualizado.',
        'success',
      );
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

async function loadPricingVersions({ announce = true } = {}) {
  if (!state.token || !hasScope('pricing:read')) {
    state.pricingVersions = {
      items: [],
      effectiveVersionId: null,
    };
    renderPricingVersions();
    return;
  }

  try {
    const payload = await api.pricingVersions(state.token);
    state.pricingVersions = {
      items: Array.isArray(payload?.items) ? payload.items : [],
      effectiveVersionId:
        typeof payload?.effectiveVersionId === 'string'
          ? payload.effectiveVersionId
          : null,
    };
    renderPricingVersions();
    if (announce) {
      setMessage(
        globalMessage,
        'Histórico de versões atualizado.',
        'success',
      );
    }
  } catch (error) {
    handleAuthenticatedError(error);
  }
}

async function openPricingVersion(versionId) {
  if (!state.token || !hasScope('pricing:read')) return;
  try {
    const payload = await api.getPricingVersion(
      state.token,
      versionId,
    );
    renderPricingCatalog(payload?.catalog ?? null);
    renderPricingEditor(payload?.version ?? null);
  } catch (error) {
    handleAuthenticatedError(error);
  }
}

async function handlePricingCreateDraft() {
  if (!state.token || !hasScope('pricing:write')) return;
  const button = byId('pricing-create-draft-button');
  button.disabled = true;
  try {
    const created = await api.createPricingVersion(state.token);
    await loadPricingVersions({ announce: false });
    await openPricingVersion(created.id);
    setMessage(
      globalMessage,
      `Rascunho #${created.versionNumber} criado a partir do catálogo vigente.`,
      'success',
    );
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

function buildPricingDraftPatch() {
  const kind = byId('pricing-edit-kind').value;
  if (kind === 'fixed_route') {
    const routeId = byId('pricing-route-id').value.trim();
    if (!routeId) {
      throw new Error('Informe o ID da rota fixa.');
    }
    return {
      kind: 'fixed_route',
      routeId,
      dayCents: pricingMoneyToCents(
        byId('pricing-route-day').value,
        'Preço dia',
      ),
      after22Cents: pricingMoneyToCents(
        byId('pricing-route-night').value,
        'Preço após 22h',
      ),
    };
  }

  if (kind === 'category_policy') {
    return {
      kind: 'category_policy',
      category: byId('pricing-policy-category').value,
      enabled: byId('pricing-policy-enabled').value === 'true',
      requiresFourByFourOnJeriBoundary:
        byId('pricing-policy-four-by-four').value === 'true',
    };
  }

  if (kind === 'zone_policy') {
    return {
      kind: 'zone_policy',
      zoneId: byId('pricing-zone-policy-id').value,
      enabled: byId('pricing-zone-policy-enabled').value === 'true',
    };
  }

  if (kind === 'locality_structure') {
    const localityId =
      byId('pricing-locality-structure-id').value.trim();
    if (!localityId) {
      throw new Error('Informe o ID da localidade.');
    }
    return {
      kind: 'locality_structure',
      operation:
        byId('pricing-locality-structure-operation').value,
      scope:
        byId('pricing-locality-structure-scope').value,
      localityId,
    };
  }

  const localityId = byId('pricing-locality-id').value.trim();
  if (!localityId) {
    throw new Error('Informe o ID da localidade.');
  }
  const priceKind = byId('pricing-locality-price-kind').value;
  const minCents = pricingMoneyToCents(
    byId('pricing-locality-min').value,
    priceKind === 'range' ? 'Preço mínimo' : 'Preço',
  );

  return {
    kind: 'locality_price',
    hub: byId('pricing-locality-hub').value,
    localityId,
    category: byId('pricing-locality-category').value,
    price:
      priceKind === 'range'
        ? {
            kind: 'range',
            minCents,
            maxCents: pricingMoneyToCents(
              byId('pricing-locality-max').value,
              'Preço máximo',
            ),
          }
        : {
            kind: 'exact',
            amountCents: minCents,
          },
  };
}

async function handlePricingEditSubmit(event) {
  event.preventDefault();
  setMessage(globalMessage);

  const version = state.selectedPricingVersion;
  if (
    !state.token ||
    !hasScope('pricing:write') ||
    version?.status !== 'draft'
  ) {
    setMessage(
      globalMessage,
      'Abra um rascunho editável antes de salvar.',
      'danger',
    );
    return;
  }

  const button = byId('pricing-save-draft-button');
  button.disabled = true;
  try {
    const payload = await api.updatePricingVersion(state.token, {
      versionId: version.id,
      patch: buildPricingDraftPatch(),
    });
    renderPricingCatalog(payload.catalog);
    renderPricingEditor(payload.version);
    await loadPricingVersions({ announce: false });
    setMessage(
      globalMessage,
      'Alteração salva somente no rascunho.',
      'success',
    );
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

async function handlePricingPublish() {
  const version = state.selectedPricingVersion;
  if (
    !state.token ||
    !hasScope('pricing:write') ||
    version?.status !== 'draft'
  ) {
    setMessage(
      globalMessage,
      'Abra um rascunho antes de publicar.',
      'danger',
    );
    return;
  }

  const rawEffective = byId('pricing-effective-from').value;
  let effectiveFrom = '';
  if (rawEffective) {
    const parsed = new Date(rawEffective);
    if (Number.isNaN(parsed.getTime())) {
      setMessage(
        globalMessage,
        'A vigência informada é inválida.',
        'danger',
      );
      return;
    }
    effectiveFrom = parsed.toISOString();
  }

  const button = byId('pricing-publish-button');
  button.disabled = true;
  try {
    const published = await api.publishPricingVersion(
      state.token,
      {
        versionId: version.id,
        effectiveFrom,
      },
    );
    byId('pricing-effective-from').value = '';
    await loadPricingVersions({ announce: false });
    await loadPricingCatalog({ announce: false });
    setMessage(
      globalMessage,
      published.effectiveFrom
        ? `Versão #${published.versionNumber} publicada com vigência em ${formatDateTime(published.effectiveFrom)}.`
        : `Versão #${published.versionNumber} publicada.`,
      'success',
    );
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

function renderDriverSummary(summary) {
  const normalized = {
    total: Number(summary?.total ?? 0),
    active: Number(summary?.active ?? 0),
    suspended: Number(summary?.suspended ?? 0),
  };
  state.driverDirectory.summary = normalized;
  byId('drivers-total').textContent = String(normalized.total);
  byId('drivers-active').textContent = String(normalized.active);
  byId('drivers-suspended').textContent = String(normalized.suspended);
  byId('driver-directory-summary').textContent =
    `${normalized.total} motorista(s)`;
}

function renderDriverDirectory() {
  const body = byId('driver-directory-body');
  const empty = byId('driver-directory-empty');
  const more = byId('driver-directory-more');
  const count = byId('driver-directory-count');
  body.replaceChildren();

  const items = state.driverDirectory.items;
  for (const driver of items) {
    const row = document.createElement('tr');

    const identity = document.createElement('td');
    const driverId = document.createElement('strong');
    driverId.textContent = driver.driverId;
    identity.append(driverId);

    const phone = document.createElement('td');
    phone.textContent = driver.phoneE164 ?? '—';

    const status = document.createElement('td');
    const presentation = statusPresentation(driver.status);
    const pill = document.createElement('span');
    pill.className = `pill pill--${presentation.tone}`;
    pill.textContent = presentation.label;
    status.append(pill);

    const updated = document.createElement('td');
    updated.textContent = formatDateTime(driver.updatedAt);

    const actions = document.createElement('td');
    actions.className = 'directory-row-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'button button--table';
    open.textContent = 'Abrir';
    open.addEventListener('click', () => {
      byId('driver-search-id').value = driver.driverId;
      void lookupDriver(driver.driverId).then(() => {
        byId('driver-result').scrollIntoView({ block: 'center' });
      });
    });
    actions.append(open);

    row.append(identity, phone, status, updated, actions);
    body.append(row);
  }

  empty.hidden = items.length !== 0;
  more.hidden = !state.driverDirectory.nextCursor;
  more.disabled = false;
  count.textContent =
    `${items.length} carregado(s) · ` +
    `${state.driverDirectory.summary.total} total`;
}

async function loadDriverDirectory({
  reset = true,
  announce = true,
} = {}) {
  if (!state.token || !hasScope('drivers:auth:read')) {
    renderDriverSummary({ total: 0, active: 0, suspended: 0 });
    state.driverDirectory.items = [];
    state.driverDirectory.nextCursor = null;
    renderDriverDirectory();
    return;
  }

  const more = byId('driver-directory-more');
  if (reset) {
    state.driverDirectory.query =
      byId('driver-directory-query').value.trim();
    state.driverDirectory.status =
      byId('driver-directory-status').value;
    state.driverDirectory.items = [];
    state.driverDirectory.nextCursor = null;
  }

  more.disabled = true;
  try {
    const payload = await api.drivers(state.token, {
      query: state.driverDirectory.query,
      status: state.driverDirectory.status,
      limit: 25,
      cursor: reset ? null : state.driverDirectory.nextCursor,
    });
    const incoming = Array.isArray(payload?.items)
      ? payload.items
      : [];

    if (reset) {
      state.driverDirectory.items = incoming;
    } else {
      const known = new Set(
        state.driverDirectory.items.map((item) => item.driverId),
      );
      state.driverDirectory.items.push(
        ...incoming.filter((item) => !known.has(item.driverId)),
      );
    }
    state.driverDirectory.nextCursor =
      typeof payload?.nextCursor === 'string' &&
      payload.nextCursor
        ? payload.nextCursor
        : null;
    renderDriverSummary(payload?.summary);
    renderDriverDirectory();

    if (announce) {
      setMessage(
        globalMessage,
        'Diretório de motoristas atualizado.',
        'success',
      );
    }
  } catch (error) {
    more.disabled = false;
    handleAuthenticatedError(error);
  }
}

function passengerStatusPresentation(status) {
  if (status === 'active') {
    return { label: 'Ativo', tone: 'success' };
  }
  if (status === 'suspended') {
    return { label: 'Suspenso', tone: 'danger' };
  }
  return { label: 'Desconhecido', tone: 'neutral' };
}

function renderPassengerSummary(summary) {
  const normalized = {
    total: Number(summary?.total ?? 0),
    active: Number(summary?.active ?? 0),
    suspended: Number(summary?.suspended ?? 0),
  };
  state.passengerDirectory.summary = normalized;
  byId('passengers-total').textContent = String(normalized.total);
  byId('passengers-active').textContent = String(normalized.active);
  byId('passengers-suspended').textContent = String(normalized.suspended);
  byId('passenger-directory-summary').textContent =
    `${normalized.total} passageiro(s)`;
}

function renderPassengerDirectory() {
  const body = byId('passenger-directory-body');
  const empty = byId('passenger-directory-empty');
  const more = byId('passenger-directory-more');
  const count = byId('passenger-directory-count');
  body.replaceChildren();

  const items = state.passengerDirectory.items;
  for (const passenger of items) {
    const row = document.createElement('tr');

    const identity = document.createElement('td');
    const passengerId = document.createElement('strong');
    passengerId.textContent = passenger.passengerId;
    identity.append(passengerId);

    const phone = document.createElement('td');
    phone.textContent = passenger.phoneE164 ?? '—';

    const status = document.createElement('td');
    const presentation = passengerStatusPresentation(passenger.status);
    const pill = document.createElement('span');
    pill.className = `pill pill--${presentation.tone}`;
    pill.textContent = presentation.label;
    status.append(pill);

    const created = document.createElement('td');
    created.textContent = formatDateTime(passenger.createdAt);

    const updated = document.createElement('td');
    updated.textContent = formatDateTime(passenger.updatedAt);

    const actions = document.createElement('td');
    actions.className = 'directory-row-actions';
    if (hasScope('rides:read')) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'button button--table';
      open.textContent = 'Abrir';
      open.addEventListener('click', () => {
        void lookupPassenger(passenger.passengerId);
      });
      actions.append(open);
    }

    row.append(identity, phone, status, created, updated, actions);
    body.append(row);
  }

  empty.hidden = items.length !== 0;
  more.hidden = !state.passengerDirectory.nextCursor;
  more.disabled = false;
  count.textContent =
    `${items.length} carregado(s) · ` +
    `${state.passengerDirectory.summary.total} total`;
}

async function loadPassengerDirectory({
  reset = true,
  announce = true,
} = {}) {
  if (!state.token || !hasScope('passengers:auth:read')) {
    renderPassengerSummary({ total: 0, active: 0, suspended: 0 });
    state.passengerDirectory.items = [];
    state.passengerDirectory.nextCursor = null;
    renderPassengerDirectory();
    return;
  }

  const more = byId('passenger-directory-more');
  if (reset) {
    state.passengerDirectory.query =
      byId('passenger-directory-query').value.trim();
    state.passengerDirectory.status =
      byId('passenger-directory-status').value;
    state.passengerDirectory.items = [];
    state.passengerDirectory.nextCursor = null;
  }

  more.disabled = true;
  try {
    const payload = await api.passengers(state.token, {
      query: state.passengerDirectory.query,
      status: state.passengerDirectory.status,
      limit: 25,
      cursor: reset ? null : state.passengerDirectory.nextCursor,
    });
    const incoming = Array.isArray(payload?.items)
      ? payload.items
      : [];

    if (reset) {
      state.passengerDirectory.items = incoming;
    } else {
      const known = new Set(
        state.passengerDirectory.items.map(
          (item) => item.passengerId,
        ),
      );
      state.passengerDirectory.items.push(
        ...incoming.filter(
          (item) => !known.has(item.passengerId),
        ),
      );
    }

    state.passengerDirectory.nextCursor =
      typeof payload?.nextCursor === 'string' &&
      payload.nextCursor
        ? payload.nextCursor
        : null;

    renderPassengerSummary(payload?.summary);
    renderPassengerDirectory();

    if (announce) {
      setMessage(
        globalMessage,
        'Diretório de passageiros atualizado.',
        'success',
      );
    }
  } catch (error) {
    more.disabled = false;
    handleAuthenticatedError(error);
  }
}

function renderPassengerDetailEmpty(
  message = 'Abra um passageiro na tabela para ver identidade e histórico recente.',
) {
  state.selectedPassenger = null;
  const content = byId('passenger-detail-content');
  content.replaceChildren();
  content.className = 'passenger-detail-content empty-state';
  content.textContent = message;

  const status = byId('passenger-detail-status');
  status.className = 'pill pill--neutral';
  status.textContent = 'Nenhum';

  byId('passenger-detail-history').hidden = true;
  byId('passenger-access-actions').hidden = true;
  byId('passenger-detail-rides-body').replaceChildren();
}

function passengerDetailItem(label, value) {
  const item = document.createElement('div');
  item.className = 'passenger-detail-item';
  const term = document.createElement('span');
  term.textContent = label;
  const data = document.createElement('strong');
  data.textContent = value;
  item.append(term, data);
  return item;
}

function renderPassengerDetail(payload) {
  state.selectedPassenger = payload;
  const passenger = payload?.passenger;
  if (passenger == null) {
    renderPassengerDetailEmpty('Ficha do passageiro indisponível.');
    return;
  }

  const presentation = passengerStatusPresentation(passenger.status);
  const status = byId('passenger-detail-status');
  status.className = `pill pill--${presentation.tone}`;
  status.textContent = presentation.label;

  const content = byId('passenger-detail-content');
  content.replaceChildren();
  content.className = 'passenger-detail-content';

  const identity = document.createElement('div');
  identity.className = 'passenger-detail-identity';
  const title = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.className = 'eyebrow eyebrow--dark';
  kicker.textContent = 'PASSAGEIRO';
  const id = document.createElement('h3');
  id.textContent = passenger.passengerId;
  title.append(kicker, id);
  identity.append(title);

  const grid = document.createElement('div');
  grid.className = 'passenger-detail-grid';
  grid.append(
    passengerDetailItem('Telefone', passenger.phoneE164 ?? '—'),
    passengerDetailItem('Status', presentation.label),
    passengerDetailItem('Criado', formatDateTime(passenger.createdAt)),
    passengerDetailItem(
      'Atualizado',
      formatDateTime(passenger.updatedAt),
    ),
  );
  content.append(identity, grid);

  const accessActions = byId('passenger-access-actions');
  const accessButton = byId('passenger-access-button');
  const accessNote = byId('passenger-access-note');
  const canManageAccess = hasScope('passengers:auth:write');
  accessActions.hidden = !canManageAccess;
  if (canManageAccess) {
    const blocking = passenger.status === 'active';
    accessButton.dataset.nextStatus =
      blocking ? 'suspended' : 'active';
    accessButton.textContent =
      blocking ? 'Bloquear acesso' : 'Desbloquear acesso';
    accessButton.className = blocking
      ? 'button button--danger'
      : 'button button--dark';
    accessButton.disabled = false;
    accessNote.textContent = blocking
      ? 'O bloqueio revoga imediatamente todas as sessões do passageiro.'
      : 'O desbloqueio libera novo login, mas não restaura sessões revogadas.';
  }

  const summary = payload?.rides ?? {};
  byId('passenger-detail-total-rides').textContent =
    String(numericMetric(summary.total));
  byId('passenger-detail-active-rides').textContent =
    String(numericMetric(summary.active));
  byId('passenger-detail-completed-rides').textContent =
    String(numericMetric(summary.completed));
  byId('passenger-detail-cancelled-rides').textContent =
    String(numericMetric(summary.cancelled));
  byId('passenger-detail-completed-amount').textContent =
    formatCurrencyCents(summary.completedAmountCents);

  const rides = Array.isArray(payload?.recentRides)
    ? payload.recentRides
    : [];
  const body = byId('passenger-detail-rides-body');
  body.replaceChildren();

  for (const ride of rides) {
    const row = document.createElement('tr');

    const stateCell = document.createElement('td');
    const stateInfo = rideStatePresentation(ride.state);
    const pill = document.createElement('span');
    pill.className = `pill pill--${stateInfo.tone}`;
    pill.textContent = stateInfo.label;
    stateCell.append(pill);

    const route = document.createElement('td');
    const routeName = document.createElement('strong');
    routeName.textContent =
      `${locationLabel(ride.origin)} → ${locationLabel(ride.destination)}`;
    const rideId = document.createElement('small');
    rideId.className = 'table-subtext';
    rideId.textContent = ride.id;
    route.append(routeName, rideId);

    const category = document.createElement('td');
    category.textContent = serviceCategoryLabel(ride.category);

    const amount = document.createElement('td');
    amount.textContent = formatCurrencyCents(ride.totalAmountCents);

    const updated = document.createElement('td');
    updated.textContent = formatDateTime(ride.updatedAt);

    row.append(stateCell, route, category, amount, updated);
    body.append(row);
  }

  byId('passenger-detail-rides-empty').hidden = rides.length !== 0;
  byId('passenger-detail-history').hidden = false;
}

async function lookupPassenger(passengerId) {
  if (
    !state.token ||
    !hasScope('passengers:auth:read') ||
    !hasScope('rides:read')
  ) {
    renderPassengerDetailEmpty(
      'Sua conta precisa de passengers:auth:read e rides:read para abrir a ficha.',
    );
    return;
  }

  try {
    const payload = await api.getPassenger(state.token, passengerId);
    renderPassengerDetail(payload);
  } catch (error) {
    if (
      error instanceof AdminApiError &&
      error.status === 404
    ) {
      renderPassengerDetailEmpty('Passageiro não encontrado.');
      return;
    }
    handleAuthenticatedError(error);
  }
}

async function handlePassengerAccessChange() {
  const passengerId =
    state.selectedPassenger?.passenger?.passengerId;
  const button = byId('passenger-access-button');
  const nextStatus = button.dataset.nextStatus;

  if (
    !state.token ||
    !passengerId ||
    !hasScope('passengers:auth:write') ||
    (nextStatus !== 'active' && nextStatus !== 'suspended')
  ) {
    return;
  }

  button.disabled = true;
  try {
    const result = await api.setPassengerStatus(state.token, {
      passengerId,
      status: nextStatus,
    });

    await loadPassengerDirectory({
      reset: true,
      announce: false,
    });
    await lookupPassenger(passengerId);

    const revoked = Number(result?.revokedSessions ?? 0);
    setMessage(
      globalMessage,
      nextStatus === 'suspended'
        ? `Passageiro bloqueado. ${revoked} sessão(ões) revogada(s).`
        : 'Passageiro desbloqueado. Um novo login será necessário.',
      'success',
    );

    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

function formatKm(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? `${number.toFixed(1)} km`
    : '—';
}

function renderRideDirectory() {
  const body = byId('ride-directory-body');
  const empty = byId('ride-directory-empty');
  const more = byId('ride-directory-more');
  const count = byId('ride-directory-count');
  const summary = byId('ride-directory-summary');

  body.replaceChildren();
  const items = state.rideDirectory.items;

  for (const ride of items) {
    const row = document.createElement('tr');

    const stateCell = document.createElement('td');
    const stateInfo = rideStatePresentation(ride.state);
    const statePill = document.createElement('span');
    statePill.className = `pill pill--${stateInfo.tone}`;
    statePill.textContent = stateInfo.label;
    stateCell.append(statePill);

    const route = document.createElement('td');
    const routeStrong = document.createElement('strong');
    routeStrong.textContent =
      `${locationLabel(ride.origin)} → ` +
      locationLabel(ride.destination);
    const rideId = document.createElement('small');
    rideId.className = 'table-subtext';
    rideId.textContent = ride.id;
    route.append(routeStrong, rideId);

    const category = document.createElement('td');
    category.textContent = serviceCategoryLabel(ride.category);

    const passenger = document.createElement('td');
    passenger.textContent = ride.passengerId ?? '—';

    const driver = document.createElement('td');
    driver.textContent =
      ride.driverId ?? ride.reservedDriverId ?? 'Aguardando';

    const amount = document.createElement('td');
    amount.textContent = formatCurrencyCents(
      ride.totalAmountCents,
    );

    const updated = document.createElement('td');
    updated.textContent = formatDateTime(ride.updatedAt);

    const actions = document.createElement('td');
    actions.className = 'directory-row-actions';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'button button--table';
    open.textContent = 'Abrir';
    open.addEventListener('click', () => {
      void lookupRide(ride.id);
    });
    actions.append(open);

    row.append(
      stateCell,
      route,
      category,
      passenger,
      driver,
      amount,
      updated,
      actions,
    );
    body.append(row);
  }

  empty.hidden = items.length !== 0;
  more.hidden = !state.rideDirectory.nextCursor;
  more.disabled = false;
  count.textContent = `${items.length} carregada(s)`;
  summary.textContent = `${items.length} carregada(s)`;
}

function renderRideDetailEmpty(
  message = 'Abra uma corrida na tabela para ver os detalhes.',
) {
  state.selectedRide = null;
  const content = byId('ride-detail-content');
  content.replaceChildren();
  content.className = 'ride-detail-content empty-state';
  content.textContent = message;

  const status = byId('ride-detail-status');
  status.className = 'pill pill--neutral';
  status.textContent = 'Nenhuma';

  byId('ride-cancel-panel').hidden = true;
  byId('ride-cancel-reason').value = '';
  byId('ride-cancel-button').disabled = false;
  byId('ride-cancel-note').textContent =
    'Disponível apenas antes do início da viagem.';
}

function rideDetailItem(label, value) {
  const item = document.createElement('div');
  item.className = 'ride-detail-item';

  const term = document.createElement('span');
  term.textContent = label;
  const data = document.createElement('strong');
  data.textContent = value;

  item.append(term, data);
  return item;
}

function renderRideDetail(ride) {
  state.selectedRide = ride;
  const content = byId('ride-detail-content');
  content.replaceChildren();
  content.className = 'ride-detail-content';

  const stateInfo = rideStatePresentation(ride.state);
  const status = byId('ride-detail-status');
  status.className = `pill pill--${stateInfo.tone}`;
  status.textContent = stateInfo.label;

  const cancelPanel = byId('ride-cancel-panel');
  const canCancel =
    hasScope('rides:write') &&
    ADMIN_CANCELLABLE_RIDE_STATES.has(ride.state);
  cancelPanel.hidden = !canCancel;
  byId('ride-cancel-button').disabled = false;
  byId('ride-cancel-reason').value = '';
  byId('ride-cancel-note').textContent =
    ride.paymentStatus === 'paid'
      ? 'Carteira é estornada imediatamente. Pix/cartão permanecem em reembolso pendente até o gateway confirmar.'
      : 'O cancelamento só é aceito quando o pagamento está confirmado.';

  const identity = document.createElement('div');
  identity.className = 'ride-detail-hero';

  const title = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.className = 'eyebrow eyebrow--dark';
  kicker.textContent = 'CORRIDA';
  const id = document.createElement('h3');
  id.textContent = ride.id;
  title.append(kicker, id);

  const route = document.createElement('strong');
  route.className = 'ride-detail-route';
  route.textContent =
    `${locationLabel(ride.origin)} → ` +
    locationLabel(ride.destination);

  identity.append(title, route);

  const grid = document.createElement('div');
  grid.className = 'ride-detail-grid';
  grid.append(
    rideDetailItem(
      'Pagamento',
      paymentStatusLabel(ride.paymentStatus),
    ),
    rideDetailItem(
      'Categoria',
      serviceCategoryLabel(ride.category),
    ),
    rideDetailItem('Período', pricePeriodLabel(ride.period)),
    rideDetailItem(
      'Passageiros',
      String(ride.passengers ?? '—'),
    ),
    rideDetailItem('Passageiro', ride.passengerId ?? '—'),
    rideDetailItem(
      'Motorista',
      ride.driverId ?? ride.reservedDriverId ?? 'Aguardando',
    ),
    rideDetailItem(
      'Distância da viagem',
      formatKm(ride.tripDistanceKm),
    ),
    rideDetailItem(
      'Distância até coleta',
      formatKm(ride.driverPickupDistanceKm),
    ),
    rideDetailItem('Criada', formatDateTime(ride.createdAt)),
    rideDetailItem('Atualizada', formatDateTime(ride.updatedAt)),
  );

  const finance = document.createElement('div');
  finance.className = 'ride-finance-grid';
  const quote = ride.quote ?? {};
  finance.append(
    rideDetailItem(
      'Tarifa-base',
      formatCurrencyCents(quote.baseAmountCents),
    ),
    rideDetailItem(
      'Compensação de coleta',
      formatCurrencyCents(quote.pickupCompensationCents),
    ),
    rideDetailItem(
      'Total',
      formatCurrencyCents(quote.totalAmountCents),
    ),
    rideDetailItem(
      'Comissão plataforma',
      formatCurrencyCents(quote.platformCommissionCents),
    ),
    rideDetailItem(
      'Líquido motorista',
      formatCurrencyCents(quote.driverNetCents),
    ),
  );

  const financeTitle = document.createElement('div');
  financeTitle.className = 'ride-detail-section-title';
  financeTitle.textContent = 'Snapshot financeiro';

  content.append(identity, grid, financeTitle, finance);
  content.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function lookupRide(rideId) {
  if (!state.token || !hasScope('rides:read')) return;

  try {
    const ride = await api.getRide(state.token, rideId);
    renderRideDetail(ride);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) {
      renderRideDetailEmpty('Corrida não encontrada.');
      return;
    }
    handleAuthenticatedError(error);
  }
}

async function handleRideCancel(event) {
  event.preventDefault();
  const ride = state.selectedRide;
  if (
    !state.token ||
    ride == null ||
    !hasScope('rides:write') ||
    !ADMIN_CANCELLABLE_RIDE_STATES.has(ride.state)
  ) {
    return;
  }

  const reason = byId('ride-cancel-reason').value
    .trim()
    .replace(/\s+/g, ' ');
  if (reason.length < 3 || reason.length > 500) {
    setMessage(
      globalMessage,
      'Informe um motivo de cancelamento entre 3 e 500 caracteres.',
      'danger',
    );
    return;
  }

  const button = byId('ride-cancel-button');
  button.disabled = true;
  try {
    const result = await api.cancelRide(state.token, {
      rideId: ride.id,
      reason,
    });

    if (
      result.refundStatus !== 'refunded' &&
      result.refundStatus !== 'pending_external_gateway'
    ) {
      throw new Error(
        'Resposta de cancelamento retornou status de reembolso desconhecido.',
      );
    }
    const pendingExternal =
      result.refundStatus === 'pending_external_gateway';
    const message = pendingExternal
      ? 'Corrida cancelada. Reembolso externo ficou pendente de confirmação do gateway.'
      : 'Corrida cancelada e reembolso concluído.';
    setMessage(
      globalMessage,
      message,
      pendingExternal ? 'warning' : 'success',
    );

    await loadRideDirectory({
      reset: true,
      announce: false,
    });
    await lookupRide(ride.id);

    if (hasScope('rides:read')) {
      void loadDashboard({ announce: false });
    }
    if (hasScope('finance:read')) {
      void loadFinance({ announce: false });
    }
    if (hasScope('audit:read')) {
      void loadAudit({ announce: false });
    }
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

async function loadRideDirectory({
  reset = true,
  announce = true,
} = {}) {
  if (!state.token || !hasScope('rides:read')) {
    state.rideDirectory.items = [];
    state.rideDirectory.nextCursor = null;
    renderRideDirectory();
    renderRideDetailEmpty('Sua conta não possui o escopo rides:read.');
    return;
  }

  const more = byId('ride-directory-more');
  if (reset) {
    state.rideDirectory.query =
      byId('ride-directory-query').value.trim();
    state.rideDirectory.scope =
      byId('ride-directory-scope').value === 'all'
        ? 'all'
        : 'active';
    state.rideDirectory.state =
      byId('ride-directory-state').value;
    state.rideDirectory.from =
      byId('ride-directory-from').value;
    state.rideDirectory.to =
      byId('ride-directory-to').value;
    if (
      state.rideDirectory.from &&
      state.rideDirectory.to &&
      state.rideDirectory.from > state.rideDirectory.to
    ) {
      setMessage(
        globalMessage,
        'A data inicial não pode ser posterior à data final.',
        'danger',
      );
      more.disabled = false;
      return;
    }
    state.rideDirectory.items = [];
    state.rideDirectory.nextCursor = null;
    renderRideDetailEmpty();
  }

  more.disabled = true;
  try {
    const payload = await api.rides(state.token, {
      scope: state.rideDirectory.scope,
      state: state.rideDirectory.state,
      query: state.rideDirectory.query,
      from: state.rideDirectory.from,
      to: state.rideDirectory.to,
      limit: 25,
      cursor: reset ? null : state.rideDirectory.nextCursor,
    });
    const incoming = Array.isArray(payload?.items)
      ? payload.items
      : [];

    if (reset) {
      state.rideDirectory.items = incoming;
    } else {
      const known = new Set(
        state.rideDirectory.items.map((item) => item.id),
      );
      state.rideDirectory.items.push(
        ...incoming.filter((item) => !known.has(item.id)),
      );
    }

    state.rideDirectory.nextCursor =
      typeof payload?.nextCursor === 'string' &&
      payload.nextCursor
        ? payload.nextCursor
        : null;

    renderRideDirectory();
    if (announce) {
      setMessage(
        globalMessage,
        'Diretório de viagens atualizado.',
        'success',
      );
    }
  } catch (error) {
    more.disabled = false;
    handleAuthenticatedError(error);
  }
}

async function lookupDriver(driverId) {
  if (!state.token) return;
  try {
    const driver = await api.getDriver(state.token, driverId);
    state.currentDriver = driver;
    renderDriver(driver);
    await loadDriverRegistry(driverId);
    await loadDriverDocuments(driverId);
  } catch (error) {
    if (
      error instanceof AdminApiError &&
      error.status === 404
    ) {
      state.currentDriver = null;
      renderDriverNotFound(driverId);
      renderDriverRegistryUnavailable(
        'Provisione o acesso do motorista antes de cadastrar perfil e veículo.',
      );
      renderDriverDocumentsUnavailable(
        'Provisione o motorista e cadastre o perfil antes dos documentos.',
      );
      return;
    }
    handleAuthenticatedError(error);
  }
}

async function handleDriverSearch(event) {
  event.preventDefault();
  setMessage(globalMessage);
  try {
    const driverId = validateDriverId(byId('driver-search-id').value);
    await lookupDriver(driverId);
  } catch (error) {
    setMessage(globalMessage, errorMessage(error), 'danger');
  }
}

async function handleDriverProvision(event) {
  event.preventDefault();
  setMessage(globalMessage);
  if (!state.token) return;

  const button = event.currentTarget.querySelector('button[type="submit"]');
  try {
    const driverId = validateDriverId(byId('provision-driver-id').value);
    const phone = validatePhone(byId('provision-phone').value);
    const status = validateDriverStatus(byId('provision-status').value);

    button.disabled = true;
    const result = await api.provisionDriver(state.token, {
      driverId,
      phone,
      status,
    });
    state.currentDriver = result;
    byId('driver-search-id').value = driverId;
    renderDriver(result);
    await loadDriverRegistry(driverId);
    await loadDriverDocuments(driverId);
    setMessage(
      globalMessage,
      result.created
        ? 'Acesso do motorista criado e auditado.'
        : 'Cadastro do motorista confirmado e atualizado.',
      'success',
    );
    event.currentTarget.reset();
    byId('provision-status').value = 'suspended';
    if (hasScope('drivers:auth:read')) {
      await loadDriverDirectory({ reset: true, announce: false });
    }
    if (hasScope('audit:read')) void loadAudit({ announce: false });
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

async function changeDriverStatus(driverId, status, button) {
  if (!state.token) return;
  setMessage(globalMessage);
  button.disabled = true;

  try {
    const result = await api.setDriverStatus(state.token, {
      driverId,
      status: validateDriverStatus(status),
    });
    state.currentDriver = result.driver ?? result;
    renderDriver(state.currentDriver);
    setMessage(
      globalMessage,
      status === 'active'
        ? 'Motorista aprovado. O login OTP está liberado.'
        : `Motorista suspenso. ${result.revokedSessions ?? 0} sessão(ões) revogada(s).`,
      'success',
    );
    if (hasScope('drivers:auth:read')) {
      await loadDriverDirectory({ reset: true, announce: false });
    }
    if (hasScope('audit:read')) void loadAudit({ announce: false });
  } catch (error) {
    handleAuthenticatedError(error);
  } finally {
    button.disabled = false;
  }
}

function metadataText(metadata) {
  if (!metadata || typeof metadata !== 'object') return '—';
  const labels = {
    status: 'status',
    previousStatus: 'anterior',
    revokedSessions: 'sessões revogadas',
  };
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '—';
  return entries
    .map(([key, value]) => `${labels[key] ?? key}: ${String(value)}`)
    .join(' · ');
}

function renderAudit(entries) {
  state.auditEntries = entries;
  byId('audit-count').textContent = String(entries.length);
  byId('audit-directory-count').textContent =
    `${entries.length} carregado(s)`;

  const more = byId('audit-load-more');
  more.hidden = !state.auditDirectory.nextCursor;
  more.disabled = false;

  const body = byId('audit-table-body');
  const empty = byId('audit-empty');
  body.replaceChildren();

  if (entries.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const entry of entries) {
    const row = document.createElement('tr');

    const when = document.createElement('td');
    when.textContent = formatDateTime(entry.createdAt);

    const actor = document.createElement('td');
    const actorName = document.createElement('strong');
    actorName.textContent = actorLabel(entry.actor);
    const actorKind = document.createElement('small');
    actorKind.className = 'table-subtext';
    actorKind.textContent =
      entry.actor?.kind === 'user' ? 'Usuário humano' : 'API key';
    actor.append(actorName, actorKind);

    const action = document.createElement('td');
    action.textContent = actionLabel(entry.action);

    const target = document.createElement('td');
    const targetId = document.createElement('strong');
    targetId.textContent = entry.targetId ?? '—';
    const targetType = document.createElement('small');
    targetType.className = 'table-subtext';
    targetType.textContent = entry.targetType ?? '—';
    target.append(targetId, targetType);

    const metadata = document.createElement('td');
    metadata.className = 'table-metadata';
    metadata.textContent = metadataText(entry.metadata);

    row.append(when, actor, action, target, metadata);
    body.append(row);
  }
}

async function loadAudit({
  announce = true,
  reset = true,
} = {}) {
  if (!state.token || !hasScope('audit:read')) {
    state.auditDirectory.nextCursor = null;
    renderAudit([]);
    return;
  }

  if (reset) {
    state.auditDirectory.nextCursor = null;
  }

  const more = byId('audit-load-more');
  more.disabled = true;

  try {
    const payload = await api.audit(state.token, {
      limit: 25,
      actorKind: state.auditDirectory.actorKind,
      action: state.auditDirectory.action,
      targetType: state.auditDirectory.targetType,
      query: state.auditDirectory.query,
      cursor: reset ? null : state.auditDirectory.nextCursor,
    });
    const incoming = Array.isArray(payload?.entries)
      ? payload.entries
      : [];

    if (reset) {
      state.auditEntries = incoming;
    } else {
      const known = new Set(
        state.auditEntries.map((entry) => entry.id),
      );
      state.auditEntries.push(
        ...incoming.filter((entry) => !known.has(entry.id)),
      );
    }

    state.auditDirectory.nextCursor =
      typeof payload?.nextCursor === 'string' &&
      payload.nextCursor
        ? payload.nextCursor
        : null;

    renderAudit(state.auditEntries);

    if (announce) {
      setMessage(globalMessage, 'Auditoria atualizada.', 'success');
    }
  } catch (error) {
    more.disabled = false;
    handleAuthenticatedError(error);
  }
}

function handleAuditFilter(event) {
  event.preventDefault();
  state.auditDirectory.actorKind =
    byId('audit-actor-kind').value;
  state.auditDirectory.action =
    byId('audit-action').value.trim();
  state.auditDirectory.targetType =
    byId('audit-target-type').value.trim();
  state.auditDirectory.query =
    byId('audit-query').value.trim();
  void loadAudit({ reset: true });
}

loginForm.addEventListener('submit', (event) => {
  void handleLogin(event);
});
byId('logout-button').addEventListener('click', () => {
  void handleLogout();
});
byId('ride-directory-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void loadRideDirectory({ reset: true });
});
byId('ride-cancel-form').addEventListener('submit', (event) => {
  void handleRideCancel(event);
});
byId('ride-directory-more').addEventListener('click', () => {
  void loadRideDirectory({ reset: false, announce: false });
});
byId('passenger-directory-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void loadPassengerDirectory({ reset: true });
});
byId('passenger-directory-more').addEventListener('click', () => {
  void loadPassengerDirectory({ reset: false, announce: false });
});
byId('passenger-access-button').addEventListener('click', () => {
  void handlePassengerAccessChange();
});
byId('refresh-dashboard-button').addEventListener('click', () => {
  void loadDashboard();
});
byId('refresh-fleet-button').addEventListener('click', () => {
  void loadFleet();
});
byId('refresh-finance-button').addEventListener('click', () => {
  void loadFinance();
});
byId('finance-disable-cash-button').addEventListener('click', () => {
  void handleDisableCash();
});
byId('refresh-pricing-button').addEventListener('click', () => {
  void Promise.all([
    loadPricingCatalog(),
    loadPricingVersions({ announce: false }),
  ]);
});
byId('pricing-create-draft-button').addEventListener('click', () => {
  void handlePricingCreateDraft();
});
byId('pricing-edit-form').addEventListener('submit', (event) => {
  void handlePricingEditSubmit(event);
});
byId('pricing-edit-kind').addEventListener('change', () => {
  syncPricingEditFields();
});
byId('pricing-locality-price-kind').addEventListener('change', () => {
  syncPricingLocalityPriceFields();
});
byId('pricing-publish-button').addEventListener('click', () => {
  void handlePricingPublish();
});
byId('driver-directory-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void loadDriverDirectory({ reset: true });
});
byId('driver-directory-more').addEventListener('click', () => {
  void loadDriverDirectory({ reset: false, announce: false });
});
byId('driver-search-form').addEventListener('submit', (event) => {
  void handleDriverSearch(event);
});
byId('driver-provision-form').addEventListener('submit', (event) => {
  void handleDriverProvision(event);
});
byId('driver-registry-form').addEventListener('submit', (event) => {
  void handleDriverRegistrySubmit(event);
});
byId('registry-status-button').addEventListener('click', () => {
  void handleDriverRegistryStatus();
});
byId('driver-document-review-form').addEventListener('submit', (event) => {
  void handleDriverDocumentReview(event);
});
byId('driver-document-review-status').addEventListener('change', () => {
  syncDocumentRejectionRequirement();
});
byId('audit-filter-form').addEventListener('submit', (event) => {
  handleAuditFilter(event);
});
byId('audit-load-more').addEventListener('click', () => {
  void loadAudit({ reset: false, announce: false });
});
byId('refresh-audit-button').addEventListener('click', () => {
  void loadAudit({ reset: true });
});
byId('mobile-menu-button').addEventListener('click', () => {
  document.body.classList.toggle('nav-open');
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    activateView(button.dataset.view);
  });
});

loginTotp.addEventListener('input', () => {
  loginTotp.value = loginTotp.value.replace(/\D/g, '').slice(0, 6);
});

window.addEventListener('pagehide', () => {
  stopFleetPolling();
  state.token = null;
});

authView.hidden = false;
adminView.hidden = true;
setMessage(loginMessage);
setMessage(globalMessage);
renderDriverRegistryUnavailable();
renderDriverDocumentsUnavailable();
renderPassengerDetailEmpty();
renderFleet();
renderFinance();
renderPaymentPolicy();
renderPricingCatalog();
renderPricingVersions();
renderPricingEditor();
syncPricingEditFields();
syncPricingLocalityPriceFields();
syncDocumentRejectionRequirement();
