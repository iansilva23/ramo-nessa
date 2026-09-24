import {
  createHmac,
  randomInt,
  randomUUID,
} from 'node:crypto';

import type {
  AuthIdentityRecord,
  AuthOtpRepository,
  AuthRateLimitRule,
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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const OTP_PHONE_PER_HOUR = 5;
const OTP_PHONE_PER_DAY = 12;
const OTP_DEVICE_PER_HOUR = 20;
const OTP_DEVICE_PER_DAY = 60;
const OTP_IP_PER_HOUR = 60;
const OTP_IP_PER_DAY = 300;

export class PhoneOtpError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PHONE'
      | 'INVALID_EMAIL'
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

export interface OtpRequestContext {
  clientIp?: string | undefined;
  clientInstanceId?: string | undefined;
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

export function normalizeRegistrationEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length < 5 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new PhoneOtpError(
      'INVALID_EMAIL',
      'Informe um e-mail válido.',
    );
  }
  return email;
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

export function resolveOtpRateLimitSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.OTP_RATE_LIMIT_SECRET?.trim();
  if (configured != null && configured.length >= 32) {
    return configured;
  }

  if (env.NODE_ENV === 'production') {
    throw new PhoneOtpError(
      'OTP_DELIVERY_NOT_CONFIGURED',
      'OTP_RATE_LIMIT_SECRET não está configurado com segurança.',
    );
  }

  return 'ramo-nessa-development-rate-limit-secret';
}

function otpDigest(challengeId: string, code: string): string {
  return createHmac('sha256', resolveOtpHashSecret())
    .update(`${challengeId}:${code}`, 'utf8')
    .digest('hex');
}

function rateLimitKey(scope: string): string {
  return createHmac('sha256', resolveOtpRateLimitSecret())
    .update(scope, 'utf8')
    .digest('hex');
}

function normalizedClientInstanceId(value?: string): string | null {
  const normalized = value?.trim();
  if (
    normalized == null ||
    normalized.length < 16 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

async function enforceOtpRequestRateLimits(input: {
  repository: AuthOtpRepository;
  subjectType: AuthSubjectType;
  phoneE164: string;
  context?: OtpRequestContext | undefined;
  now: Date;
}): Promise<void> {
  const rules: AuthRateLimitRule[] = [
    {
      key: rateLimitKey(
        `otp-request:phone:hour:${input.subjectType}:${input.phoneE164}`,
      ),
      limit: OTP_PHONE_PER_HOUR,
      windowMs: HOUR_MS,
    },
    {
      key: rateLimitKey(
        `otp-request:phone:day:${input.subjectType}:${input.phoneE164}`,
      ),
      limit: OTP_PHONE_PER_DAY,
      windowMs: DAY_MS,
    },
  ];

  const instanceId = normalizedClientInstanceId(
    input.context?.clientInstanceId,
  );
  if (instanceId != null) {
    rules.push(
      {
        key: rateLimitKey(`otp-request:device:hour:${instanceId}`),
        limit: OTP_DEVICE_PER_HOUR,
        windowMs: HOUR_MS,
      },
      {
        key: rateLimitKey(`otp-request:device:day:${instanceId}`),
        limit: OTP_DEVICE_PER_DAY,
        windowMs: DAY_MS,
      },
    );
  }

  const clientIp = input.context?.clientIp?.trim();
  if (clientIp) {
    rules.push(
      {
        key: rateLimitKey(`otp-request:ip:hour:${clientIp}`),
        limit: OTP_IP_PER_HOUR,
        windowMs: HOUR_MS,
      },
      {
        key: rateLimitKey(`otp-request:ip:day:${clientIp}`),
        limit: OTP_IP_PER_DAY,
        windowMs: DAY_MS,
      },
    );
  }

  const result = await input.repository.consumeRateLimits({
    rules,
    now: input.now.toISOString(),
  });
  if (!result.allowed) {
    throw new PhoneOtpError(
      'OTP_RATE_LIMITED',
      `Muitas solicitações. Tente novamente em ${Math.max(
        1,
        Math.ceil(result.retryAfterMs / 1000),
      )}s.`,
    );
  }
}

async function resolveIdentity(input: {
  repository: AuthOtpRepository;
  subjectType: AuthSubjectType;
  phoneE164: string;
  now: Date;
}): Promise<AuthIdentityRecord | null> {
  const existing = await input.repository.findIdentityByPhone(
    input.subjectType,
    input.phoneE164,
  );
  if (existing != null) {
    // Não revelar por resposta HTTP se uma identidade existe ou está suspensa.
    // A conta só recebe SMS quando está ativa.
    return existing.status === 'active' ? existing : null;
  }

  if (input.subjectType === 'driver') {
    // Motorista é pré-provisionado. Retornamos um desafio opaco abaixo, mas
    // não persistimos nem enviamos SMS, evitando enumeração de cadastros.
    return null;
  }

  const id = randomUUID();
  return input.repository.findOrCreatePassengerIdentity({
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
  devCode?: string;
}

export async function requestPhoneOtp(input: {
  repository: AuthOtpRepository;
  delivery: OtpDeliveryProvider | null;
  subjectType: AuthSubjectType;
  phone: string;
  email?: string;
  context?: OtpRequestContext;
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
  const rawEmail = input.email?.trim();
  const emailNormalized =
    rawEmail == null || rawEmail.length === 0
      ? undefined
      : normalizeRegistrationEmail(rawEmail);

  await enforceOtpRequestRateLimits({
    repository: input.repository,
    subjectType: input.subjectType,
    phoneE164,
    context: input.context,
    now,
  });

  const identity = await resolveIdentity({
    repository: input.repository,
    subjectType: input.subjectType,
    phoneE164,
    now,
  });

  if (identity == null) {
    return {
      challengeId: randomUUID(),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
      retryAfterSeconds: Math.ceil(OTP_COOLDOWN_MS / 1000),
    };
  }

  const challengeId = randomUUID();
  const code = randomInt(100000, 1000000).toString();
  const challenge: OtpChallengeRecord = {
    id: challengeId,
    identityId: identity.id,
    codeDigest: otpDigest(challengeId, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    attemptCount: 0,
    ...(emailNormalized == null
      ? {}
      : { requestedEmailNormalized: emailNormalized }),
    createdAt: now.toISOString(),
  };

  const creation = await input.repository.createChallengeWithCooldown({
    challenge,
    now: now.toISOString(),
    cooldownMs: OTP_COOLDOWN_MS,
  });
  if (!creation.created) {
    throw new PhoneOtpError(
      'OTP_RATE_LIMITED',
      `Aguarde ${Math.max(
        1,
        Math.ceil(creation.retryAfterMs / 1000),
      )}s para reenviar.`,
    );
  }

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
  emailNormalized?: string;
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

  let identity =
    await input.repository.findIdentityById(attempt.challenge.identityId);
  if (identity == null || identity.status !== 'active') {
    throw new PhoneOtpError(
      'AUTH_IDENTITY_SUSPENDED',
      'Esta conta está temporariamente indisponível.',
    );
  }

  const requestedEmail = attempt.challenge.requestedEmailNormalized;
  if (requestedEmail != null && identity.emailNormalized !== requestedEmail) {
    const updatedIdentity = await input.repository.setIdentityEmail({
      subjectType: identity.subjectType,
      subjectId: identity.subjectId,
      emailNormalized: requestedEmail,
      updatedAt: now.toISOString(),
    });
    if (updatedIdentity != null) {
      identity = updatedIdentity;
    }
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
    ...(identity.emailNormalized == null
      ? {}
      : { emailNormalized: identity.emailNormalized }),
  };
}
