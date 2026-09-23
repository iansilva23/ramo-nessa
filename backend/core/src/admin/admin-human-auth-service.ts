import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import {
  ADMIN_SCOPES,
  type AdminScope,
} from './admin-repository.js';
import type {
  AdminHumanAuthRepository,
  AdminHumanSessionRecord,
  AdminHumanUserRecord,
} from './admin-human-auth-repository.js';
import {
  decryptAdminTotpSecret,
  encodeBase32,
  encryptAdminTotpSecret,
  hashAdminPassword,
  normalizeAdminEmail,
  randomAdminTotpSecret,
  resolveAdminMfaEncryptionKey,
  verifyAdminPassword,
  verifyAdminTotp,
} from './admin-human-crypto.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export class AdminHumanAuthenticationError extends Error {
  constructor(
    public readonly code:
      | 'ADMIN_LOGIN_INVALID'
      | 'ADMIN_LOGIN_RATE_LIMITED'
      | 'ADMIN_SESSION_REQUIRED'
      | 'ADMIN_SESSION_INVALID'
      | 'ADMIN_SESSION_EXPIRED'
      | 'ADMIN_SCOPE_REQUIRED'
      | 'ADMIN_USER_EXISTS',
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AdminHumanAuthenticationError';
  }
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (
    name.length < 3 ||
    name.length > 80 ||
    !/^[\p{L}\p{N} ._-]+$/u.test(name)
  ) {
    throw new Error('Nome administrativo inválido.');
  }
  return name;
}

function normalizeScopes(scopes: readonly AdminScope[]): AdminScope[] {
  const unique = [...new Set(scopes)];
  if (
    unique.length === 0 ||
    unique.some((scope) => !ADMIN_SCOPES.includes(scope))
  ) {
    throw new Error('Escopos administrativos inválidos.');
  }
  return unique;
}

export function hashAdminHumanSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function resolveAdminLoginRateLimitSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env.ADMIN_LOGIN_RATE_LIMIT_SECRET?.trim();
  if (value != null && value.length >= 32) return value;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'ADMIN_LOGIN_RATE_LIMIT_SECRET com pelo menos 32 caracteres é obrigatório em produção.',
    );
  }
  return 'ramo-nessa-admin-login-rate-limit-development-only';
}

function rateBucket(secret: string, kind: string, value: string): string {
  return createHmac('sha256', secret)
    .update(`${kind}:${value}`, 'utf8')
    .digest('hex');
}

function sessionBearer(headers: IncomingHttpHeaders): string | null {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null) return null;
  const match = value
    .trim()
    .match(/^Bearer\s+(rn_admin_session_[A-Za-z0-9_-]{40,80})$/);
  return match?.[1] ?? null;
}

export async function createAdminHumanUser(input: {
  repository: AdminHumanAuthRepository;
  name: string;
  email: string;
  scopes?: readonly AdminScope[];
  encryptionKey?: Buffer;
  now?: Date;
}): Promise<{
  user: AdminHumanUserRecord;
  initialPassword: string;
  totpSecretBase32: string;
  otpauthUri: string;
}> {
  const name = normalizeName(input.name);
  const emailNormalized = normalizeAdminEmail(input.email);
  if (
    (await input.repository.findUserByEmail(emailNormalized)) != null
  ) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_USER_EXISTS',
      'Usuário Admin já cadastrado.',
    );
  }

  const scopes = normalizeScopes(input.scopes ?? ADMIN_SCOPES);
  const initialPassword =
    'Rn!' + randomBytes(18).toString('base64url');
  const passwordHash = await hashAdminPassword(initialPassword);
  const secret = randomAdminTotpSecret();
  const totpSecretBase32 = encodeBase32(secret);
  const encryptionKey =
    input.encryptionKey ?? resolveAdminMfaEncryptionKey();
  const now = input.now ?? new Date();

  const user = await input.repository.createUser({
    id: randomUUID(),
    name,
    emailNormalized,
    passwordHash,
    totpSecretCiphertext: encryptAdminTotpSecret(
      secret,
      encryptionKey,
    ),
    scopes,
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const label = encodeURIComponent(
    `Ramo Nessa:${emailNormalized}`,
  );
  const issuer = encodeURIComponent('Ramo Nessa');
  const otpauthUri =
    `otpauth://totp/${label}?secret=${totpSecretBase32}` +
    `&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

  return {
    user,
    initialPassword,
    totpSecretBase32,
    otpauthUri,
  };
}

export async function loginAdminHuman(input: {
  repository: AdminHumanAuthRepository;
  email: string;
  password: string;
  totpCode: string;
  clientIp?: string | undefined;
  encryptionKey?: Buffer;
  rateLimitSecret?: string;
  now?: Date;
}): Promise<{
  accessToken: string;
  session: AdminHumanSessionRecord;
  user: AdminHumanUserRecord;
}> {
  const now = input.now ?? new Date();
  const rateSecret =
    input.rateLimitSecret ?? resolveAdminLoginRateLimitSecret();

  let emailNormalized: string;
  try {
    emailNormalized = normalizeAdminEmail(input.email);
  } catch {
    emailNormalized = input.email.trim().toLowerCase().slice(0, 254);
  }

  const rules = [
    {
      key: rateBucket(rateSecret, 'email', emailNormalized),
      limit: 5,
      windowMs: LOGIN_WINDOW_MS,
    },
    ...(input.clientIp
      ? [{
          key: rateBucket(rateSecret, 'ip', input.clientIp),
          limit: 20,
          windowMs: LOGIN_WINDOW_MS,
        }]
      : []),
  ];
  const limited = await input.repository.consumeRateLimits({
    rules,
    now: now.toISOString(),
  });
  if (!limited.allowed) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_LOGIN_RATE_LIMITED',
      'Muitas tentativas. Tente novamente mais tarde.',
      Math.max(1, Math.ceil(limited.retryAfterMs / 1000)),
    );
  }

  const user = await input.repository.findUserByEmail(emailNormalized);
  if (user == null) {
    if (input.password.length >= 12 && input.password.length <= 256) {
      await hashAdminPassword(input.password);
    }
    throw new AdminHumanAuthenticationError(
      'ADMIN_LOGIN_INVALID',
      'Credenciais administrativas inválidas.',
    );
  }

  const passwordOk = await verifyAdminPassword(
    input.password,
    user.passwordHash,
  );
  if (!passwordOk || user.status !== 'active') {
    throw new AdminHumanAuthenticationError(
      'ADMIN_LOGIN_INVALID',
      'Credenciais administrativas inválidas.',
    );
  }

  let secret: Buffer;
  try {
    secret = decryptAdminTotpSecret(
      user.totpSecretCiphertext,
      input.encryptionKey ?? resolveAdminMfaEncryptionKey(),
    );
  } catch {
    throw new AdminHumanAuthenticationError(
      'ADMIN_LOGIN_INVALID',
      'Credenciais administrativas inválidas.',
    );
  }
  const counter = verifyAdminTotp({
    secret,
    code: input.totpCode,
    now,
  });
  if (counter == null) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_LOGIN_INVALID',
      'Credenciais administrativas inválidas.',
    );
  }

  const consumed = await input.repository.consumeTotpCounter({
    userId: user.id,
    counter,
    updatedAt: now.toISOString(),
  });
  if (!consumed) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_LOGIN_INVALID',
      'Código MFA já utilizado ou inválido.',
    );
  }

  const accessToken =
    'rn_admin_session_' + randomBytes(32).toString('base64url');
  const session = await input.repository.createSession({
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashAdminHumanSessionToken(accessToken),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
  });

  return { accessToken, session, user };
}

export async function authenticateAdminHumanSession(input: {
  repository: AdminHumanAuthRepository;
  headers: IncomingHttpHeaders;
  requiredScope?: AdminScope | undefined;
  now?: Date;
}): Promise<{
  session: AdminHumanSessionRecord;
  user: AdminHumanUserRecord;
}> {
  const token = sessionBearer(input.headers);
  if (token == null) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_SESSION_REQUIRED',
      'Sessão administrativa é obrigatória.',
    );
  }

  const session = await input.repository.findSessionByTokenHash(
    hashAdminHumanSessionToken(token),
  );
  if (session == null || session.revokedAt != null) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_SESSION_INVALID',
      'Sessão administrativa inválida ou revogada.',
    );
  }

  const now = input.now ?? new Date();
  if (Date.parse(session.expiresAt) <= now.getTime()) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_SESSION_EXPIRED',
      'Sessão administrativa expirada.',
    );
  }

  const user = await input.repository.findUserById(session.userId);
  if (user == null || user.status !== 'active') {
    throw new AdminHumanAuthenticationError(
      'ADMIN_SESSION_INVALID',
      'Sessão administrativa inválida.',
    );
  }
  if (
    input.requiredScope != null &&
    !user.scopes.includes(input.requiredScope)
  ) {
    throw new AdminHumanAuthenticationError(
      'ADMIN_SCOPE_REQUIRED',
      'Usuário Admin sem permissão para esta operação.',
    );
  }

  await input.repository.touchSession(session.id, now.toISOString());
  return {
    session: { ...session, lastUsedAt: now.toISOString() },
    user,
  };
}

export async function revokeAdminHumanSession(input: {
  repository: AdminHumanAuthRepository;
  headers: IncomingHttpHeaders;
  now?: Date;
}): Promise<void> {
  const authenticated = await authenticateAdminHumanSession({
    repository: input.repository,
    headers: input.headers,
    now: input.now,
  });
  await input.repository.revokeSession(
    authenticated.session.id,
    (input.now ?? new Date()).toISOString(),
  );
}
