import { AdminApiError, createAdminApi } from './api.js';
import {
  actionLabel,
  actorLabel,
  formatCurrencyCents,
  formatDateTime,
  formatSessionRemaining,
  locationLabel,
  paymentStatusLabel,
  pricePeriodLabel,
  rideStatePresentation,
  secondsUntil,
  serviceCategoryLabel,
  statusPresentation,
  validateDriverId,
  validateDriverStatus,
  validatePhone,
} from './security.js';

const api = createAdminApi();

const state = {
  token: null,
  user: null,
  expiresAt: null,
  currentDriver: null,
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
  },
  selectedRide: null,
  auditEntries: [],
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

const scopeLabels = new Map([
  ['drivers:auth:read', 'Consultar acesso de motoristas'],
  ['drivers:auth:write', 'Aprovar e suspender motoristas'],
  ['passengers:auth:read', 'Consultar acesso de passageiros'],
  ['rides:read', 'Consultar operação de corridas'],
  ['audit:read', 'Consultar auditoria'],
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

function clearSession(message = '') {
  stopSessionTimer();
  state.token = null;
  state.user = null;
  state.expiresAt = null;
  state.currentDriver = null;
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
  };
  state.selectedRide = null;
  state.auditEntries = [];
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
    'rides',
    'drivers',
    'passengers',
    'audit',
  ]);
  const view = known.has(viewName) ? viewName : 'overview';

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
    rides: 'Viagens',
    drivers: 'Motoristas',
    passengers: 'Passageiros',
    audit: 'Auditoria',
  };
  byId('page-title').textContent = titles[view];
  document.body.classList.remove('nav-open');

  if (view === 'overview') {
    void loadDashboard({ announce: false });
  }
  if (view === 'audit') {
    void loadAudit({ announce: false });
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

    row.append(identity, phone, status, created, updated);
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
  } catch (error) {
    if (
      error instanceof AdminApiError &&
      error.status === 404
    ) {
      state.currentDriver = null;
      renderDriverNotFound(driverId);
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
    target.textContent = entry.targetId ?? '—';

    const metadata = document.createElement('td');
    metadata.className = 'table-metadata';
    metadata.textContent = metadataText(entry.metadata);

    row.append(when, actor, action, target, metadata);
    body.append(row);
  }
}

async function loadAudit({ announce = true } = {}) {
  if (!state.token || !hasScope('audit:read')) {
    renderAudit([]);
    return;
  }
  try {
    const payload = await api.audit(state.token, 50);
    renderAudit(payload?.entries ?? []);
    if (announce) {
      setMessage(globalMessage, 'Auditoria atualizada.', 'success');
    }
  } catch (error) {
    handleAuthenticatedError(error);
  }
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
byId('refresh-dashboard-button').addEventListener('click', () => {
  void loadDashboard();
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
byId('refresh-audit-button').addEventListener('click', () => {
  void loadAudit();
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
  state.token = null;
});

authView.hidden = false;
adminView.hidden = true;
setMessage(loginMessage);
setMessage(globalMessage);
