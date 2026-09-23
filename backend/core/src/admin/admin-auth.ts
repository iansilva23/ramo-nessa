import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import {
  ADMIN_SCOPES,
  type AdminApiKeyRecord,
  type AdminRepository,
  type AdminScope,
} from './admin-repository.js';

const ADMIN_TOKEN_PREFIX = 'rn_admin_';

export class AdminAuthenticationError extends Error {
  constructor(
    public readonly code:
      | 'ADMIN_AUTH_REQUIRED'
      | 'ADMIN_AUTH_INVALID'
      | 'ADMIN_SCOPE_REQUIRED'
      | 'ADMIN_KEY_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'AdminAuthenticationError';
  }
}

export function hashAdminApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeScopes(scopes: readonly string[]): AdminScope[] {
  const unique = [...new Set(scopes)];
  if (
    unique.length === 0 ||
    unique.some(
      (scope) => !ADMIN_SCOPES.includes(scope as AdminScope),
    )
  ) {
    throw new AdminAuthenticationError(
      'ADMIN_KEY_INVALID',
      'Escopos administrativos inválidos.',
    );
  }
  return unique as AdminScope[];
}

function validateKeyName(name: string): string {
  const normalized = name.trim();
  if (
    normalized.length < 3 ||
    normalized.length > 80 ||
    !/^[\p{L}\p{N} ._-]+$/u.test(normalized)
  ) {
    throw new AdminAuthenticationError(
      'ADMIN_KEY_INVALID',
      'Nome da chave administrativa é inválido.',
    );
  }
  return normalized;
}

export async function issueAdminApiKey(input: {
  repository: AdminRepository;
  name: string;
  scopes?: readonly AdminScope[];
  now?: Date;
}): Promise<{ token: string; key: AdminApiKeyRecord }> {
  const name = validateKeyName(input.name);
  const scopes = normalizeScopes(
    input.scopes ?? ADMIN_SCOPES,
  );
  const token =
    ADMIN_TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const now = input.now ?? new Date();

  const key: AdminApiKeyRecord = {
    id: randomUUID(),
    name,
    tokenHash: hashAdminApiToken(token),
    scopes,
    createdAt: now.toISOString(),
  };
  await input.repository.createApiKey(key);
  return { token, key };
}

function bearerToken(headers: IncomingHttpHeaders): string | null {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return null;

  const match = value
    .trim()
    .match(/^Bearer\s+(rn_admin_[A-Za-z0-9_-]{40,80})$/);
  return match?.[1] ?? null;
}

export async function authenticateAdminBearer(input: {
  repository: AdminRepository;
  headers: IncomingHttpHeaders;
  requiredScope: AdminScope;
  now?: Date;
}): Promise<AdminApiKeyRecord> {
  const token = bearerToken(input.headers);
  if (token == null) {
    throw new AdminAuthenticationError(
      'ADMIN_AUTH_REQUIRED',
      'Credencial administrativa é obrigatória.',
    );
  }

  const key = await input.repository.findApiKeyByTokenHash(
    hashAdminApiToken(token),
  );
  if (key == null || key.revokedAt != null) {
    throw new AdminAuthenticationError(
      'ADMIN_AUTH_INVALID',
      'Credencial administrativa inválida ou revogada.',
    );
  }
  if (!key.scopes.includes(input.requiredScope)) {
    throw new AdminAuthenticationError(
      'ADMIN_SCOPE_REQUIRED',
      'Credencial sem permissão para esta operação.',
    );
  }

  const usedAt = (input.now ?? new Date()).toISOString();
  await input.repository.touchApiKeyLastUsed(key.id, usedAt);
  return { ...key, lastUsedAt: usedAt };
}
