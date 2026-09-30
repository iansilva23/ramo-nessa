import { randomUUID } from 'node:crypto';

import {
  ADMIN_SCOPES,
  type AdminActor,
  type AdminRepository,
  type AdminScope,
} from './admin-repository.js';
import type {
  AdminHumanAuthRepository,
  AdminHumanStatus,
  AdminHumanUserRecord,
} from './admin-human-auth-repository.js';
import { createAdminHumanUser } from './admin-human-auth-service.js';
import { normalizeAdminEmail } from './admin-human-crypto.js';

export class AdminStaffError extends Error {
  constructor(
    public readonly code:
      | 'ADMIN_STAFF_NOT_FOUND'
      | 'ADMIN_STAFF_OWNER_IMMUTABLE'
      | 'ADMIN_STAFF_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'AdminStaffError';
  }
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AdminStaffError('ADMIN_STAFF_INVALID', 'Nome do funcionário é obrigatório.');
  }
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 80) {
    throw new AdminStaffError(
      'ADMIN_STAFF_INVALID',
      'Nome do funcionário deve ter entre 3 e 80 caracteres.',
    );
  }
  return name;
}

function normalizeScopes(value: unknown): AdminScope[] {
  if (!Array.isArray(value)) {
    throw new AdminStaffError(
      'ADMIN_STAFF_INVALID',
      'Selecione as permissões do funcionário.',
    );
  }
  const scopes = [...new Set(value)];
  if (
    scopes.length === 0 ||
    scopes.some(
      (scope) =>
        typeof scope !== 'string' ||
        !ADMIN_SCOPES.includes(scope as AdminScope),
    )
  ) {
    throw new AdminStaffError(
      'ADMIN_STAFF_INVALID',
      'Permissões administrativas inválidas.',
    );
  }
  const normalized = scopes as AdminScope[];
  const impliedReads = new Map<AdminScope, AdminScope>([
    ['rides:write', 'rides:read'],
    ['drivers:auth:write', 'drivers:auth:read'],
    ['drivers:profile:write', 'drivers:profile:read'],
    ['drivers:documents:write', 'drivers:documents:read'],
    ['passengers:auth:write', 'passengers:auth:read'],
    ['finance:write', 'finance:read'],
    ['pricing:write', 'pricing:read'],
    ['communications:write', 'communications:read'],
    ['support:write', 'support:read'],
    ['privacy:write', 'privacy:read'],
  ]);
  for (const scope of [...normalized]) {
    const implied = impliedReads.get(scope);
    if (implied != null && !normalized.includes(implied)) {
      normalized.push(implied);
    }
  }
  return normalized;
}

function publicUser(user: AdminHumanUserRecord, ownerUserId: string) {
  return {
    id: user.id,
    name: user.name,
    email: user.emailNormalized,
    scopes: [...user.scopes],
    status: user.status,
    isOwner: user.id === ownerUserId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function listAdminStaff(input: {
  repository: AdminHumanAuthRepository;
  ownerUserId: string;
}) {
  const users = await input.repository.listUsers();
  return { users: users.map((user) => publicUser(user, input.ownerUserId)) };
}

export async function createAdminStaff(input: {
  repository: AdminHumanAuthRepository;
  admin: AdminRepository;
  actor: AdminActor;
  ownerUserId: string;
  name: unknown;
  email: unknown;
  scopes: unknown;
  encryptionKey: Buffer;
  now?: Date;
}) {
  const name = normalizeName(input.name);
  if (typeof input.email !== 'string') {
    throw new AdminStaffError('ADMIN_STAFF_INVALID', 'E-mail do funcionário é obrigatório.');
  }
  let email: string;
  try {
    email = normalizeAdminEmail(input.email);
  } catch {
    throw new AdminStaffError('ADMIN_STAFF_INVALID', 'E-mail administrativo inválido.');
  }
  const scopes = normalizeScopes(input.scopes);
  const now = input.now ?? new Date();
  const created = await createAdminHumanUser({
    repository: input.repository,
    name,
    email,
    scopes,
    encryptionKey: input.encryptionKey,
    now,
  });
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'admin.staff.created',
    targetType: 'admin_user',
    targetId: created.user.id,
    metadata: {
      name: created.user.name,
      email: created.user.emailNormalized,
      scopes: created.user.scopes,
    },
    createdAt: now.toISOString(),
  });
  return {
    user: publicUser(created.user, input.ownerUserId),
    onboarding: {
      initialPassword: created.initialPassword,
      totpSecret: created.totpSecretBase32,
      otpauthUri: created.otpauthUri,
    },
  };
}

export async function updateAdminStaff(input: {
  repository: AdminHumanAuthRepository;
  admin: AdminRepository;
  actor: AdminActor;
  ownerUserId: string;
  userId: string;
  name?: unknown;
  scopes?: unknown;
  status?: unknown;
  now?: Date;
}) {
  const current = await input.repository.findUserById(input.userId);
  if (current == null || current.deletedAt != null) {
    throw new AdminStaffError('ADMIN_STAFF_NOT_FOUND', 'Funcionário administrativo não encontrado.');
  }
  if (current.id === input.ownerUserId) {
    throw new AdminStaffError(
      'ADMIN_STAFF_OWNER_IMMUTABLE',
      'A conta proprietária não pode ser alterada pela gestão de funcionários.',
    );
  }
  const hasName = input.name !== undefined;
  const hasScopes = input.scopes !== undefined;
  const hasStatus = input.status !== undefined;
  if (!hasName && !hasScopes && !hasStatus) {
    throw new AdminStaffError('ADMIN_STAFF_INVALID', 'Nenhuma alteração foi informada.');
  }
  const name = hasName ? normalizeName(input.name) : undefined;
  const scopes = hasScopes ? normalizeScopes(input.scopes) : undefined;
  let status: AdminHumanStatus | undefined;
  if (hasStatus) {
    if (input.status !== 'active' && input.status !== 'suspended') {
      throw new AdminStaffError('ADMIN_STAFF_INVALID', 'Status administrativo inválido.');
    }
    status = input.status;
  }
  const now = input.now ?? new Date();
  const updated = await input.repository.updateUser({
    id: current.id,
    ...(name == null ? {} : { name }),
    ...(scopes == null ? {} : { scopes }),
    ...(status == null ? {} : { status }),
    updatedAt: now.toISOString(),
  });
  if (updated == null) {
    throw new AdminStaffError('ADMIN_STAFF_NOT_FOUND', 'Funcionário administrativo não encontrado.');
  }
  const scopesChanged =
    scopes != null &&
    (scopes.length !== current.scopes.length ||
      scopes.some((scope) => !current.scopes.includes(scope)));
  const revokedSessions =
    scopesChanged || status === 'suspended'
      ? await input.repository.revokeSessionsForUser(current.id, now.toISOString())
      : 0;
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'admin.staff.updated',
    targetType: 'admin_user',
    targetId: updated.id,
    metadata: {
      previous: { name: current.name, status: current.status, scopes: current.scopes },
      current: { name: updated.name, status: updated.status, scopes: updated.scopes },
      revokedSessions,
    },
    createdAt: now.toISOString(),
  });
  return { user: publicUser(updated, input.ownerUserId), revokedSessions };
}

export async function deleteAdminStaff(input: {
  repository: AdminHumanAuthRepository;
  admin: AdminRepository;
  actor: AdminActor;
  ownerUserId: string;
  userId: string;
  now?: Date;
}) {
  const current = await input.repository.findUserById(input.userId);
  if (current == null || current.deletedAt != null) {
    throw new AdminStaffError('ADMIN_STAFF_NOT_FOUND', 'Funcionário administrativo não encontrado.');
  }
  if (current.id === input.ownerUserId) {
    throw new AdminStaffError(
      'ADMIN_STAFF_OWNER_IMMUTABLE',
      'A conta proprietária não pode ser excluída.',
    );
  }
  const now = input.now ?? new Date();
  const deleted = await input.repository.softDeleteUser({
    id: current.id,
    tombstoneEmail: `deleted+${current.id}@deleted.ramonessa.invalid`,
    deletedAt: now.toISOString(),
  });
  if (deleted == null) {
    throw new AdminStaffError('ADMIN_STAFF_NOT_FOUND', 'Funcionário administrativo não encontrado.');
  }
  const revokedSessions = await input.repository.revokeSessionsForUser(
    current.id,
    now.toISOString(),
  );
  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'admin.staff.deleted',
    targetType: 'admin_user',
    targetId: current.id,
    metadata: {
      name: current.name,
      email: current.emailNormalized,
      scopes: current.scopes,
      revokedSessions,
    },
    createdAt: now.toISOString(),
  });
  return { userId: current.id, revokedSessions };
}
