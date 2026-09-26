import type { AuthSubjectType } from '../auth/auth-session-repository.js';
import type { PushPlatform } from '../notifications/push-device-repository.js';
import type {
  AdminNotificationAudience,
  AdminNotificationCategory,
} from './admin-communications-repository.js';

export class InvalidCommunicationsRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCommunicationsRequestError';
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidCommunicationsRequestError(
      'Corpo da requisição é inválido.',
    );
  }
  return body as Record<string, unknown>;
}

function cleanText(
  value: unknown,
  field: string,
  min: number,
  max: number,
): string {
  if (typeof value !== 'string') {
    throw new InvalidCommunicationsRequestError(
      `${field} é obrigatório.`,
    );
  }
  const text = value.trim();
  if (
    text.length < min ||
    text.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  ) {
    throw new InvalidCommunicationsRequestError(
      `${field} deve ter entre ${min} e ${max} caracteres válidos.`,
    );
  }
  return text;
}

function optionalHttpsUrl(
  value: unknown,
  field: string,
): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 500) {
    throw new InvalidCommunicationsRequestError(
      `${field} é inválida.`,
    );
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new InvalidCommunicationsRequestError(
      `${field} é inválida.`,
    );
  }
  if (url.protocol !== 'https:') {
    throw new InvalidCommunicationsRequestError(
      `${field} deve usar HTTPS.`,
    );
  }
  return url.toString();
}

export function parseAdminNotificationBroadcast(body: unknown): {
  audience: AdminNotificationAudience;
  category: AdminNotificationCategory;
  title: string;
  body: string;
} {
  const value = objectBody(body);
  const audience = String(value.audience ?? '');
  const category = String(value.category ?? '');
  if (
    audience !== 'all' &&
    audience !== 'passenger' &&
    audience !== 'driver'
  ) {
    throw new InvalidCommunicationsRequestError(
      'Público deve ser todos, passageiros ou motoristas.',
    );
  }
  if (
    category !== 'general' &&
    category !== 'event' &&
    category !== 'service' &&
    category !== 'maintenance' &&
    category !== 'update' &&
    category !== 'promotion'
  ) {
    throw new InvalidCommunicationsRequestError(
      'Categoria da notificação é inválida.',
    );
  }

  return {
    audience,
    category,
    title: cleanText(value.title, 'Título', 1, 80),
    body: cleanText(value.body, 'Mensagem', 1, 240),
  };
}

export function parseAppKind(value: string): AuthSubjectType {
  if (value !== 'passenger' && value !== 'driver') {
    throw new InvalidCommunicationsRequestError(
      'Aplicativo deve ser passenger ou driver.',
    );
  }
  return value;
}

export function parsePushPlatform(value: string): PushPlatform {
  if (value !== 'android' && value !== 'ios') {
    throw new InvalidCommunicationsRequestError(
      'Plataforma deve ser android ou ios.',
    );
  }
  return value;
}

export function parseAdminReleasePolicyUpdate(
  body: unknown,
): {
  latestVersion: string;
  latestBuild: number;
  minimumBuild: number;
  storeUrl?: string;
  updateMessage: string;
} {
  const value = objectBody(body);
  const latestVersion = cleanText(
    value.latestVersion,
    'Versão mais recente',
    1,
    40,
  );
  if (!/^[0-9A-Za-z._+-]+$/.test(latestVersion)) {
    throw new InvalidCommunicationsRequestError(
      'Versão mais recente possui formato inválido.',
    );
  }

  const latestBuild = value.latestBuild;
  const minimumBuild = value.minimumBuild;
  if (
    typeof latestBuild !== 'number' ||
    !Number.isInteger(latestBuild) ||
    latestBuild < 1 ||
    typeof minimumBuild !== 'number' ||
    !Number.isInteger(minimumBuild) ||
    minimumBuild < 1 ||
    minimumBuild > latestBuild
  ) {
    throw new InvalidCommunicationsRequestError(
      'Build mínimo deve ser positivo e não pode superar o build mais recente.',
    );
  }

  const storeUrl = optionalHttpsUrl(
    value.storeUrl,
    'URL da loja',
  );

  return {
    latestVersion,
    latestBuild,
    minimumBuild,
    ...(storeUrl == null ? {} : { storeUrl }),
    updateMessage: cleanText(
      value.updateMessage,
      'Mensagem de atualização',
      1,
      240,
    ),
  };
}

export function parseAdminAgencyPromotionUpdate(body: unknown): {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  ctaLabel: string;
  ctaUrl?: string;
} {
  const value = objectBody(body);
  if (typeof value.enabled !== 'boolean') {
    throw new InvalidCommunicationsRequestError(
      'enabled deve ser booleano.',
    );
  }

  const ctaUrl = optionalHttpsUrl(value.ctaUrl, 'URL do botão');
  return {
    enabled: value.enabled,
    title: cleanText(value.title, 'Título', 1, 80),
    subtitle: cleanText(value.subtitle, 'Subtítulo', 1, 120),
    description: cleanText(value.description, 'Descrição', 1, 600),
    ctaLabel: cleanText(value.ctaLabel, 'Texto do botão', 1, 40),
    ...(ctaUrl == null ? {} : { ctaUrl }),
  };
}

export function parsePublicReleasePolicyQuery(
  searchParams: URLSearchParams,
): {
  appKind: AuthSubjectType;
  platform: PushPlatform;
  buildNumber: number;
} {
  const appKind = parseAppKind(searchParams.get('app')?.trim() ?? '');
  const platform = parsePushPlatform(
    searchParams.get('platform')?.trim() ?? '',
  );
  const rawBuild = searchParams.get('build')?.trim() ?? '';
  if (!/^\d{1,10}$/.test(rawBuild)) {
    throw new InvalidCommunicationsRequestError(
      'build deve ser um inteiro positivo.',
    );
  }
  const buildNumber = Number(rawBuild);
  if (
    !Number.isInteger(buildNumber) ||
    buildNumber < 1 ||
    buildNumber > 2_147_483_647
  ) {
    throw new InvalidCommunicationsRequestError(
      'build deve ser um inteiro positivo.',
    );
  }
  return { appKind, platform, buildNumber };
}


export function parseAdminSocialLinksUpdate(body: unknown): {
  instagramHandle?: string;
  instagramUrl?: string;
} {
  const value = objectBody(body);
  const raw = value.instagramHandle;
  if (raw == null || raw === '') return {};
  if (typeof raw !== 'string') {
    throw new InvalidCommunicationsRequestError(
      'Instagram deve ser um nome de usuário válido.',
    );
  }

  const username = raw.trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    throw new InvalidCommunicationsRequestError(
      'Instagram deve conter apenas letras, números, ponto ou sublinhado.',
    );
  }

  return {
    instagramHandle: `@${username}`,
    instagramUrl: `https://www.instagram.com/${username}/`,
  };
}
