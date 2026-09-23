import type { AuthIdentityStatus } from '../auth/auth-otp-repository.js';

export class InvalidAdminRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAdminRequestError';
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidAdminRequestError('Corpo da requisição é inválido.');
  }
  return body as Record<string, unknown>;
}

export function parseAdminDriverProvisionRequest(body: unknown): {
  phone: string;
  status: AuthIdentityStatus;
} {
  const value = objectBody(body);
  const phone =
    typeof value.phone === 'string' ? value.phone.trim() : '';
  const rawStatus =
    value.status == null ? 'active' : String(value.status);

  if (!phone) {
    throw new InvalidAdminRequestError('phone é obrigatório.');
  }
  if (rawStatus !== 'active' && rawStatus !== 'suspended') {
    throw new InvalidAdminRequestError(
      'status deve ser active ou suspended.',
    );
  }

  return { phone, status: rawStatus };
}

export function parseAdminDriverStatusRequest(body: unknown): {
  status: AuthIdentityStatus;
} {
  const value = objectBody(body);
  const rawStatus = String(value.status ?? '');
  if (rawStatus !== 'active' && rawStatus !== 'suspended') {
    throw new InvalidAdminRequestError(
      'status deve ser active ou suspended.',
    );
  }
  return { status: rawStatus };
}

export function parseAdminAuditLimit(value: string | null): number {
  if (value == null || value.trim() === '') return 50;
  if (!/^\d{1,3}$/.test(value)) {
    throw new InvalidAdminRequestError(
      'limit deve ser inteiro entre 1 e 100.',
    );
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new InvalidAdminRequestError(
      'limit deve ser inteiro entre 1 e 100.',
    );
  }
  return limit;
}
