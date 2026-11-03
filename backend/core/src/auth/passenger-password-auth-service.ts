import {
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

import type { AuthOtpRepository } from './auth-otp-repository.js';
import type { AuthSessionRepository } from './auth-session-repository.js';
import { issueAuthSession } from './auth-service.js';

const SCRYPT_PREFIX = 'scrypt-passenger-v1';
const SCRYPT_KEY_LENGTH = 64;
const PASSWORD_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error != null) {
          reject(error);
          return;
        }
        resolve(Buffer.from(derivedKey));
      },
    );
  });
}

export class PassengerPasswordAuthError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PASSENGER_EMAIL'
      | 'INVALID_PASSENGER_NAME'
      | 'INVALID_PASSENGER_PASSWORD'
      | 'PASSENGER_EMAIL_IN_USE'
      | 'PASSENGER_LOGIN_INVALID'
      | 'PASSENGER_LOGIN_RATE_LIMITED'
      | 'PASSENGER_IDENTITY_NOT_FOUND',
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'PassengerPasswordAuthError';
  }
}

export function normalizePassengerEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length < 5 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new PassengerPasswordAuthError(
      'INVALID_PASSENGER_EMAIL',
      'Informe um e-mail válido.',
    );
  }
  return email;
}

export function normalizePassengerName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (
    name.length < 3 ||
    name.length > 100 ||
    !/^[\p{L}\p{M}][\p{L}\p{M} .'-]+$/u.test(name)
  ) {
    throw new PassengerPasswordAuthError(
      'INVALID_PASSENGER_NAME',
      'Informe seu nome completo.',
    );
  }
  return name;
}

export function validatePassengerPassword(password: string): void {
  if (
    password.length < 10 ||
    password.length > 128 ||
    !/[A-Za-zÀ-ÿ]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new PassengerPasswordAuthError(
      'INVALID_PASSENGER_PASSWORD',
      'A senha deve ter pelo menos 10 caracteres, incluindo letra e número.',
    );
  }
}

export async function hashPassengerPassword(
  password: string,
): Promise<string> {
  validatePassengerPassword(password);
  const salt = randomBytes(16);
  const derived = await scryptKey(password, salt);
  return [
    SCRYPT_PREFIX,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifyPassengerPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [prefix, saltEncoded, hashEncoded] = encoded.split('$');
  if (
    prefix !== SCRYPT_PREFIX ||
    !saltEncoded ||
    !hashEncoded ||
    password.length > 128
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltEncoded, 'base64url');
    const expected = Buffer.from(hashEncoded, 'base64url');
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) {
      return false;
    }
    const actual = await scryptKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function loginBucket(
  secret: string,
  kind: string,
  value: string,
): string {
  return createHmac('sha256', secret)
    .update(`password-login:${kind}:${value}`, 'utf8')
    .digest('hex');
}

export async function loginPassengerWithPassword(input: {
  identities: AuthOtpRepository;
  sessions: AuthSessionRepository;
  email: string;
  password: string;
  rateLimitSecret: string;
  clientIp?: string;
  clientInstanceId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  let emailNormalized: string;
  try {
    emailNormalized = normalizePassengerEmail(input.email);
  } catch {
    emailNormalized = input.email.trim().toLowerCase().slice(0, 254);
  }

  const limited = await input.identities.consumeRateLimits({
    rules: [
      {
        key: loginBucket(input.rateLimitSecret, 'email', emailNormalized),
        limit: 6,
        windowMs: PASSWORD_LOGIN_WINDOW_MS,
      },
      ...(input.clientIp
        ? [{
            key: loginBucket(
              input.rateLimitSecret,
              'ip',
              input.clientIp,
            ),
            limit: 30,
            windowMs: PASSWORD_LOGIN_WINDOW_MS,
          }]
        : []),
      ...(input.clientInstanceId
        ? [{
            key: loginBucket(
              input.rateLimitSecret,
              'client',
              input.clientInstanceId,
            ),
            limit: 20,
            windowMs: PASSWORD_LOGIN_WINDOW_MS,
          }]
        : []),
    ],
    now: now.toISOString(),
  });

  if (!limited.allowed) {
    throw new PassengerPasswordAuthError(
      'PASSENGER_LOGIN_RATE_LIMITED',
      'Muitas tentativas. Tente novamente em alguns minutos.',
      Math.max(1, Math.ceil(limited.retryAfterMs / 1000)),
    );
  }

  const identity = await input.identities.findIdentityByEmail(
    'passenger',
    emailNormalized,
  );
  const encoded = identity?.passwordHash ?? '';

  let passwordOk = false;
  if (encoded) {
    passwordOk = await verifyPassengerPassword(input.password, encoded);
  } else if (input.password.length <= 128) {
    // Mantém custo de CPU aproximado mesmo para conta inexistente/sem senha.
    await scryptKey(
      input.password.padEnd(10, '_'),
      Buffer.alloc(16, 7),
    );
  }

  if (
    identity == null ||
    !passwordOk ||
    identity.status !== 'active'
  ) {
    throw new PassengerPasswordAuthError(
      'PASSENGER_LOGIN_INVALID',
      'E-mail ou senha inválidos.',
    );
  }

  const issued = await issueAuthSession({
    repository: input.sessions,
    subjectId: identity.subjectId,
    subjectType: 'passenger',
    now,
  });

  return {
    accessToken: issued.token,
    expiresAt: issued.session.expiresAt,
    subjectId: issued.session.subjectId,
    subjectType: issued.session.subjectType,
  };
}

export async function updatePassengerAccount(input: {
  identities: AuthOtpRepository;
  subjectId: string;
  fullName?: string;
  email?: string;
  password?: string;
  now?: Date;
}) {
  const identity = await input.identities.findIdentityBySubject(
    'passenger',
    input.subjectId,
  );
  if (identity == null) {
    throw new PassengerPasswordAuthError(
      'PASSENGER_IDENTITY_NOT_FOUND',
      'Conta de passageiro não encontrada.',
    );
  }

  const fullName =
    input.fullName == null
      ? undefined
      : normalizePassengerName(input.fullName);
  const emailNormalized =
    input.email == null
      ? undefined
      : normalizePassengerEmail(input.email);

  if (emailNormalized != null) {
    const emailOwner = await input.identities.findIdentityByEmail(
      'passenger',
      emailNormalized,
    );
    if (
      emailOwner != null &&
      emailOwner.subjectId !== input.subjectId
    ) {
      throw new PassengerPasswordAuthError(
        'PASSENGER_EMAIL_IN_USE',
        'Este e-mail já está vinculado a outra conta.',
      );
    }
  }

  const passwordHash =
    input.password == null
      ? undefined
      : await hashPassengerPassword(input.password);

  const updated = await input.identities.setPassengerAccount({
    subjectId: input.subjectId,
    ...(fullName == null ? {} : { fullName }),
    ...(emailNormalized == null ? {} : { emailNormalized }),
    ...(passwordHash == null ? {} : { passwordHash }),
    updatedAt: (input.now ?? new Date()).toISOString(),
  });

  if (updated == null) {
    throw new PassengerPasswordAuthError(
      'PASSENGER_IDENTITY_NOT_FOUND',
      'Conta de passageiro não encontrada.',
    );
  }

  return {
    subjectId: updated.subjectId,
    phoneE164: updated.phoneE164,
    email: updated.emailNormalized ?? null,
    fullName: updated.fullName ?? null,
    photoUrl: updated.photoUrl ?? null,
  };
}
