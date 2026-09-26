import type { IncomingMessage } from 'node:http';

import type { AuthSessionRepository } from './auth-session-repository.js';
import type { AuthOtpRepository } from './auth-otp-repository.js';
import {
  authenticateBearer,
  AuthenticationError,
} from './auth-service.js';

export class IdentityUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityUnavailableError';
  }
}

function devIdentityHeader(
  request: IncomingMessage,
  headerName: 'x-dev-passenger-id' | 'x-dev-driver-id',
): string {
  if (process.env.NODE_ENV === 'production') {
    throw new AuthenticationError(
      'AUTH_REQUIRED',
      'Autenticação Bearer é obrigatória em produção.',
    );
  }

  if (process.env.ALLOW_DEV_IDENTITY !== 'true') {
    throw new IdentityUnavailableError(
      'Identidade de desenvolvimento está desativada.',
    );
  }

  const raw = request.headers[headerName];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || value.trim().length < 3) {
    throw new IdentityUnavailableError(
      `Envie ${headerName} apenas no ambiente de desenvolvimento.`,
    );
  }

  return value.trim();
}

export async function resolvePassengerId(input: {
  request: IncomingMessage;
  sessions: AuthSessionRepository;
  identities: AuthOtpRepository;
}): Promise<string> {
  if (input.request.headers.authorization != null) {
    const session = await authenticateBearer({
      repository: input.sessions,
      headers: input.request.headers,
      requiredType: 'passenger',
      identities: input.identities,
    });
    return session.subjectId;
  }

  return devIdentityHeader(input.request, 'x-dev-passenger-id');
}

export async function resolveDriverId(input: {
  request: IncomingMessage;
  sessions: AuthSessionRepository;
  identities: AuthOtpRepository;
}): Promise<string> {
  if (input.request.headers.authorization != null) {
    const session = await authenticateBearer({
      repository: input.sessions,
      headers: input.request.headers,
      requiredType: 'driver',
      identities: input.identities,
    });
    return session.subjectId;
  }

  return devIdentityHeader(input.request, 'x-dev-driver-id');
}
