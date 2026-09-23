const DRIVER_ID_PATTERN = /^[A-Za-z0-9._:-]{3,120}$/;
const PHONE_PATTERN = /^[+()\d\s-]{10,24}$/;

export function validateDriverId(value) {
  const driverId = String(value ?? '').trim();
  if (!DRIVER_ID_PATTERN.test(driverId)) {
    throw new Error(
      'Use um identificador de motorista com 3–120 caracteres válidos.',
    );
  }
  return driverId;
}

export function validatePhone(value) {
  const phone = String(value ?? '').trim();
  if (!PHONE_PATTERN.test(phone)) {
    throw new Error('Informe um telefone brasileiro válido.');
  }
  return phone;
}

export function validateDriverStatus(value) {
  if (value !== 'active' && value !== 'suspended') {
    throw new Error('Status administrativo inválido.');
  }
  return value;
}

export function statusPresentation(status) {
  if (status === 'active') {
    return {
      label: 'Aprovado',
      tone: 'success',
      detail: 'Pode solicitar OTP e acessar o app Motorista.',
    };
  }
  if (status === 'suspended') {
    return {
      label: 'Suspenso',
      tone: 'danger',
      detail: 'Login e sessões do motorista ficam bloqueados.',
    };
  }
  return {
    label: 'Desconhecido',
    tone: 'neutral',
    detail: 'O Core retornou um estado não reconhecido.',
  };
}

export function formatDateTime(value, locale = 'pt-BR') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

export function secondsUntil(value, now = new Date()) {
  const target = Date.parse(value ?? '');
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - now.getTime()) / 1000));
}

export function formatSessionRemaining(seconds) {
  if (seconds <= 0) return 'Sessão expirada';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min restantes`;
  return `${Math.max(1, minutes)}min restantes`;
}

export function actionLabel(action) {
  const labels = {
    'driver.auth.provisioned': 'Motorista provisionado',
    'driver.auth.provision_confirmed': 'Cadastro confirmado',
    'driver.auth.status_changed': 'Status alterado',
  };
  return labels[action] ?? action;
}

export function actorLabel(actor) {
  if (!actor || typeof actor !== 'object') return 'Ator desconhecido';
  return actor.kind === 'user'
    ? actor.name || 'Usuário Admin'
    : actor.name || 'Integração Admin';
}
