import {
  createHmac,
  randomInt,
  randomUUID,
} from 'node:crypto';

import type {
  AuthIdentityRecord,
  AuthOtpRepository,
  OtpChallengeRecord,
} from './auth-otp-repository.js';
import type {
  AuthSessionRepository,
  AuthSubjectType,
} from './auth-session-repository.js';
import { issueAuthSession } from './auth-service.js';
import type { OtpDeliveryProvider } from './otp-delivery-provider.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export class PhoneOtpError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PHONE'
      | 'DRIVER_NOT_REGISTERED'
      | 'AUTH_IDENTITY_SUSPENDED'
      | 'OTP_RATE_LIMITED'
      | 'OTP_INVALID_OR_EXPIRED'
      | 'OTP_DELIVERY_NOT_CONFIGURED'
      | 'OTP_DELIVERY_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'PhoneOtpError';
  }
}

export function normalizeBrazilMobilePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const national =
    digits.startsWith('55') && digits.length === 13
      ? digits.slice(2)
      : digits;

  if (!/^[1-9]\d9\d{8}$/.test(national)) {
    throw new PhoneOtpError(
      'INVALID_PHONE',
      'Informe um celular brasileiro válido com DDD.',
    );
  }

  return `+55${national}`;
}

export function resolveOtpHashSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.OTP_HASH_SECRET?.trim();
  if (configured != null && configured.length >= 32) {
    return configured;
  }

  if (env.NODE_ENV === 'production') {
    throw new PhoneOtpError(
      'OTP_DELIVERY_NOT_CONFIGURED',
      'OTP_HASH_SECRET não está configurado com segurança.',
    );
  }

  return 'ramo-nessa-development-otp-secret-only';
}

function otpDigest(challengeId: string, code: string): string {
  return createHmac('sha256', resolveOtpHashSecret())
    .update(`${challengeId}:${code}`, 'utf8')
    .digest('hex');
}

async function resolveIdentity(input: {
  repository: AuthOtpRepository;
  subjectType: AuthSubjectType;
  phoneE164: string;
  now: Date;
}): Promise<AuthIdentityRecord> {
  const existing = await input.repository.findIdentityByPhone(
    input.subjectType,
    input.phoneE164,
  );
  if (existing != null) {
    if (existing.status !== 'active') {
      throw new PhoneOtpError(
        'AUTH_IDENTITY_SUSPENDED',
        'Esta conta está temporariamente indisponível.',
      );
    }
    return existing;
  }

  if (input.subjectType === 'driver') {
    throw new PhoneOtpError(
      'DRIVER_NOT_REGISTERED',
      'Motorista não encontrado ou ainda não aprovado.',
    );
  }

  const id = randomUUID();
  return input.repository.createIdentity({
    id,
    subjectId: id,
    subjectType: 'passenger',
    phoneE164: input.phoneE164,
    status: 'active',
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  });
}

export interface RequestedPhoneOtp {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
  // Nunca enviar em produção. Existe somente para testes/dev local.
  devCode?: string;
}

export async function requestPhoneOtp(input: {
  repository: AuthOtpRepository;
  delivery: OtpDeliveryProvider | null;
  subjectType: AuthSubjectType;
  phone: string;
  now?: Date;
}): Promise<RequestedPhoneOtp> {
  if (input.delivery == null) {
    throw new PhoneOtpError(
      'OTP_DELIVERY_NOT_CONFIGURED',
      'Entrega de código por SMS ainda não está configurada.',
    );
  }

  const now = input.now ?? new Date();
  const phoneE164 = normalizeBrazilMobilePhone(input.phone);
  const identity = await resolveIdentity({
    repository: input.repository,
    subjectType: input.subjectType,
    phoneE164,
    now,
  });

  const latest =
    await input.repository.findLatestChallengeByIdentityId(identity.id);
  if (
    latest != null &&
    latest.consumedAt == null &&
    now.getTime() - Date.parse(latest.createdAt) < OTP_COOLDOWN_MS
  ) {
    const remainingMs =
      OTP_COOLDOWN_MS - (now.getTime() - Date.parse(latest.createdAt));
    throw new PhoneOtpError(
      'OTP_RATE_LIMITED',
      `Aguarde ${Math.max(1, Math.ceil(remainingMs / 1000))}s para reenviar.`,
    );
  }

  if (latest != null && latest.consumedAt == null) {
    await input.repository.cancelChallenge(
      latest.id,
      now.toISOString(),
    );
  }

  const challengeId = randomUUID();
  const code = randomInt(100000, 1000000).toString();
  const challenge: OtpChallengeRecord = {
    id: challengeId,
    identityId: identity.id,
    codeDigest: otpDigest(challengeId, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    attemptCount: 0,
    createdAt: now.toISOString(),
  };

  await input.repository.createChallenge(challenge);
  try {
    await input.delivery.sendCode({
      phoneE164,
      code,
      challengeId,
      expiresInSeconds: Math.ceil(OTP_TTL_MS / 1000),
    });
  } catch {
    await input.repository.cancelChallenge(
      challenge.id,
      now.toISOString(),
    );
    throw new PhoneOtpError(
      'OTP_DELIVERY_FAILED',
      'Não foi possível enviar o código agora.',
    );
  }

  return {
    challengeId,
    expiresAt: challenge.expiresAt,
    retryAfterSeconds: Math.ceil(OTP_COOLDOWN_MS / 1000),
    ...(input.delivery.exposesCodeForDevelopment === true &&
    process.env.NODE_ENV !== 'production'
      ? { devCode: code }
      : {}),
  };
}

export async function verifyPhoneOtp(input: {
  repository: AuthOtpRepository;
  sessions: AuthSessionRepository;
  challengeId: string;
  code: string;
  now?: Date;
}): Promise<{
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  subjectId: string;
  subjectType: AuthSubjectType;
}> {
  const challengeId = input.challengeId.trim();
  const code = input.code.trim();
  if (
    challengeId.length < 20 ||
    !/^\d{6}$/.test(code)
  ) {
    throw new PhoneOtpError(
      'OTP_INVALID_OR_EXPIRED',
      'Código inválido ou expirado.',
    );
  }

  const now = input.now ?? new Date();
  const attempt = await input.repository.attemptChallenge({
    challengeId,
    codeDigest: otpDigest(challengeId, code),
    attemptedAt: now.toISOString(),
    maxAttempts: OTP_MAX_ATTEMPTS,
  });
  if (attempt == null || !attempt.matched) {
    throw new PhoneOtpError(
      'OTP_INVALID_OR_EXPIRED',
      'Código inválido ou expirado.',
    );
  }

  const identity =
    await input.repository.findIdentityById(attempt.challenge.identityId);
  if (identity == null || identity.status !== 'active') {
    throw new PhoneOtpError(
      'AUTH_IDENTITY_SUSPENDED',
      'Esta conta está temporariamente indisponível.',
    );
  }

  const issued = await issueAuthSession({
    repository: input.sessions,
    subjectId: identity.subjectId,
    subjectType: identity.subjectType,
    now,
  });

  return {
    accessToken: issued.token,
    tokenType: 'Bearer',
    expiresAt: issued.session.expiresAt,
    subjectId: identity.subjectId,
    subjectType: identity.subjectType,
  };
}
