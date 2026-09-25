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

export function validateDriverRegistryStatus(value) {
  if (
    value !== 'pending' &&
    value !== 'approved' &&
    value !== 'suspended'
  ) {
    throw new Error('Status cadastral inválido.');
  }
  return value;
}

export function registryStatusPresentation(status) {
  if (status === 'approved') {
    return {
      label: 'Aprovado',
      tone: 'success',
      detail: 'Cadastro validado administrativamente.',
    };
  }
  if (status === 'pending') {
    return {
      label: 'Pendente',
      tone: 'warning',
      detail: 'Aguardando validação administrativa.',
    };
  }
  if (status === 'suspended') {
    return {
      label: 'Suspenso',
      tone: 'danger',
      detail: 'Cadastro bloqueado administrativamente.',
    };
  }
  return {
    label: 'Não cadastrado',
    tone: 'neutral',
    detail: 'Nenhum estado cadastral foi retornado.',
  };
}

export function driverDocumentTypeLabel(type) {
  const labels = {
    driver_license: 'CNH',
    vehicle_registration: 'CRLV',
  };
  return labels[type] ?? String(type ?? 'Documento');
}

export function driverDocumentStatusPresentation(status) {
  if (status === 'approved') {
    return {
      label: 'Aprovado',
      tone: 'success',
      detail: 'Documento aprovado e dentro da validade informada.',
    };
  }
  if (status === 'pending') {
    return {
      label: 'Pendente',
      tone: 'warning',
      detail: 'Documento aguardando revisão humana.',
    };
  }
  if (status === 'rejected') {
    return {
      label: 'Rejeitado',
      tone: 'danger',
      detail: 'Documento precisa ser reenviado antes da aprovação.',
    };
  }
  if (status === 'expired') {
    return {
      label: 'Vencido',
      tone: 'danger',
      detail: 'Documento fora da validade e não aceito para operação.',
    };
  }
  return {
    label: 'Não enviado',
    tone: 'neutral',
    detail: 'Nenhum documento atual foi encontrado.',
  };
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
    'driver.auth.status_changed': 'Status de acesso alterado',
    'driver.registry.upserted': 'Cadastro do motorista atualizado',
    'driver.registry.status_changed': 'Status cadastral alterado',
    'driver.document.submitted': 'Documento recebido',
    'driver.document.reviewed': 'Documento revisado',
    'driver.document_compliance.blocked': 'Novas corridas bloqueadas',
    'driver.document_compliance.unblocked': 'Novas corridas liberadas',
    'driver.document_compliance.kept_active': 'Motorista mantido ativo',
    'driver.document_compliance.notified': 'Motorista avisado sobre documentos',
    'operational_settings.updated': 'Configuração operacional alterada',
    'payment_policy.pix_price_adjustment_updated': 'Preço do Pix atualizado',
    'payment_policy.card_price_adjustment_updated': 'Preço do cartão atualizado',
    'payment_policy.updated': 'Política de pagamento atualizada',
    'payment_policy.card_price_adjustment_updated': 'Preço no cartão alterado',
    'payment_policy.updated': 'Política de pagamento alterada',
    'pricing.catalog_version.created': 'Versão de preços criada',
    'pricing.catalog_version.updated': 'Rascunho de preços alterado',
    'pricing.catalog_version.published': 'Versão de preços publicada',
  };
  return labels[action] ?? action;
}

export function actorLabel(actor) {
  if (!actor || typeof actor !== 'object') return 'Ator desconhecido';
  return actor.kind === 'user'
    ? actor.name || 'Usuário Admin'
    : actor.name || 'Integração Admin';
}


export function formatCurrencyCents(
  value,
  locale = 'pt-BR',
  currency = 'BRL',
) {
  const cents = Number(value);
  if (!Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function rideStatePresentation(state) {
  const map = {
    CREATED: { label: 'Criada', tone: 'neutral' },
    AWAITING_PAYMENT: { label: 'Aguardando pagamento', tone: 'warning' },
    PAID: { label: 'Paga', tone: 'info' },
    SEARCHING_DRIVER: { label: 'Buscando motorista', tone: 'warning' },
    DRIVER_ASSIGNED: { label: 'Motorista definido', tone: 'info' },
    DRIVER_ARRIVING: { label: 'Motorista a caminho', tone: 'info' },
    DRIVER_ARRIVED: { label: 'Motorista chegou', tone: 'info' },
    IN_PROGRESS: { label: 'Em andamento', tone: 'success' },
    COMPLETED: { label: 'Concluída', tone: 'success' },
    PAYMENT_FAILED: { label: 'Pagamento falhou', tone: 'danger' },
    NO_DRIVER_FOUND: { label: 'Sem motorista', tone: 'danger' },
    CANCELLED_BY_PASSENGER: { label: 'Cancelada pelo passageiro', tone: 'danger' },
    CANCELLED_BY_DRIVER: { label: 'Cancelada pelo motorista', tone: 'danger' },
    CANCELLED_BY_ADMIN: { label: 'Cancelada pelo Admin', tone: 'danger' },
    REFUND_PENDING: { label: 'Reembolso pendente', tone: 'warning' },
    REFUNDED: { label: 'Reembolsada', tone: 'neutral' },
  };
  return map[state] ?? { label: String(state ?? 'Desconhecido'), tone: 'neutral' };
}

export function serviceCategoryLabel(category) {
  const labels = {
    moto: 'Moto',
    delivery: 'Entrega',
    car: 'Carro',
    comfort_black: 'Comfort/Black',
    buggy: 'Buggy',
  };
  return labels[category] ?? String(category ?? '—');
}

export function locationLabel(location) {
  if (!location || typeof location !== 'object') return '—';
  if (typeof location.localityId === 'string' && location.localityId.trim()) {
    return location.localityId.trim();
  }
  const zones = {
    jericoacoara: 'Jericoacoara',
    jijoca: 'Jijoca',
    prea: 'Preá',
    external: 'Destino externo',
  };
  return zones[location.zoneId] ?? String(location.zoneId ?? '—');
}


export function paymentStatusLabel(status) {
  const labels = {
    created: 'Criado',
    pending: 'Pendente',
    authorized: 'Autorizado',
    paid: 'Pago',
    failed: 'Falhou',
    cancelled: 'Cancelado',
    refunded: 'Reembolsado',
  };
  return labels[status] ?? String(status ?? '—');
}

export function pricePeriodLabel(period) {
  const labels = {
    day: 'Diurno',
    after_22: 'Após 22h',
  };
  return labels[period] ?? String(period ?? '—');
}
