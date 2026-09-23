import { AdminApiError, createAdminApi } from './api.js';
import {
  actionLabel,
  actorLabel,
  formatDateTime,
  formatSessionRemaining,
  secondsUntil,
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
  driverDirectory: {
    items: [],
    nextCursor: null,
    summary: { total: 0, active: 0, suspended: 0 },
    query: '',
    status: '',
  },
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
  state.driverDirectory = {
    items: [],
    nextCursor: null,
    summary: { total: 0, active: 0, suspended: 0 },
    query: '',
    status: '',
  };
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
  const known = new Set(['overview', 'drivers', 'audit']);
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
    drivers: 'Motoristas',
    audit: 'Auditoria',
  };
  byId('page-title').textContent = titles[view];
  document.body.classList.remove('nav-open');

  if (view === 'audit') {
    void loadAudit({ announce: false });
  }
  if (view === 'drivers' && hasScope('drivers:auth:read')) {
    void loadDriverDirectory({ reset: true, announce: false });
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
