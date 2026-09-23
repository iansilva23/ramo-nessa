import type { IncomingMessage } from 'node:http';

export class IdentityUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityUnavailableError';
  }
}

export function resolvePassengerId(request: IncomingMessage): string {
  // Segurança: nunca aceitar identidade de teste em produção.
  if (process.env.NODE_ENV === 'production') {
    throw new IdentityUnavailableError(
      'Autenticação ainda não está configurada para produção.',
    );
  }

  if (process.env.ALLOW_DEV_IDENTITY !== 'true') {
    throw new IdentityUnavailableError(
      'Identidade de desenvolvimento está desativada.',
    );
  }

  const value = request.headers['x-dev-passenger-id'];
  const passengerId = Array.isArray(value) ? value[0] : value;

  if (passengerId == null || passengerId.trim().length < 3) {
    throw new IdentityUnavailableError(
      'Envie x-dev-passenger-id apenas no ambiente de desenvolvimento.',
    );
  }

  return passengerId.trim();
}
