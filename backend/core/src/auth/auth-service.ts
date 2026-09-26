import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import type {
  AuthSessionRepository,
  AuthSessionRecord,
  AuthSubjectType,
} from './auth-session-repository.js';
import type { AuthOtpRepository } from './auth-otp-repository.js';

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthenticationError extends Error {
  constructor(
    public readonly code:
      | 'AUTH_REQUIRED'
      | 'AUTH_INVALID'
      | 'AUTH_EXPIRED'
      | 'AUTH_ROLE_MISMATCH'
      | 'AUTH_IDENTITY_DISABLED',
    message: string,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface IssuedAuthSession {
  token: string;
  session: AuthSessionRecord;
}

export function hashBearerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function issueAuthSession(input: {
  repository: AuthSessionRepository;
  subjectId: string;
  subjectType: AuthSubjectType;
  now?: Date;
  ttlMs?: number;
}): Promise<IssuedAuthSession> {
  const subjectId = input.subjectId.trim();
  if (subjectId.length < 3) {
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Identidade da sessão é inválida.',
    );
  }

  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs < 60_000) {
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Duração da sessão é inválida.',
    );
  }

  const token = randomBytes(32).toString('base64url');
  const session: AuthSessionRecord = {
    id: randomUUID(),
    subjectId,
    subjectType: input.subjectType,
    tokenHash: hashBearerToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  await input.repository.create(session);
  return { token, session };
}

function bearerToken(headers: IncomingHttpHeaders): string | null {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return null;

  const match = value.trim().match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/i);
  return match?.[1] ?? null;
}

export async function revokeBearerSession(input: {
  repository: AuthSessionRepository;
  headers: IncomingHttpHeaders;
  now?: Date;
}): Promise<AuthSessionRecord> {
  const token = bearerToken(input.headers);
  if (token == null) {
    throw new AuthenticationError(
      'AUTH_REQUIRED',
      'Envie um Bearer token válido.',
    );
  }

  const session = await input.repository.findByTokenHash(
    hashBearerToken(token),
  );
  if (session == null) {
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Sessão inválida.',
    );
  }

  await input.repository.revoke(
    session.id,
    (input.now ?? new Date()).toISOString(),
  );
  return session;
}

export async function authenticateBearer(input: {
  repository: AuthSessionRepository;
  headers: IncomingHttpHeaders;
  requiredType?: AuthSubjectType;
  identities?: AuthOtpRepository;
  now?: Date;
}): Promise<AuthSessionRecord> {
  const token = bearerToken(input.headers);
  if (token == null) {
    throw new AuthenticationError(
      'AUTH_REQUIRED',
      'Envie um Bearer token válido.',
    );
  }

  const session = await input.repository.findByTokenHash(
    hashBearerToken(token),
  );
  if (session == null || session.revokedAt != null) {
    throw new AuthenticationError(
      'AUTH_INVALID',
      'Sessão inválida ou revogada.',
    );
  }

  const now = input.now ?? new Date();
  if (Date.parse(session.expiresAt) <= now.getTime()) {
    throw new AuthenticationError(
      'AUTH_EXPIRED',
      'Sessão expirada. Entre novamente.',
    );
  }

  if (
    input.requiredType != null &&
    session.subjectType !== input.requiredType
  ) {
    throw new AuthenticationError(
      'AUTH_ROLE_MISMATCH',
      'Esta sessão não possui acesso a este recurso.',
    );
  }

  if (input.identities != null) {
    const identity = await input.identities.findIdentityBySubject(
      session.subjectType,
      session.subjectId,
    );

    if (
      identity?.status === 'suspended' ||
      (identity == null && process.env.NODE_ENV === 'production')
    ) {
      throw new AuthenticationError(
        'AUTH_IDENTITY_DISABLED',
        'Esta conta não está disponível.',
      );
    }
  }

  return session;
}
