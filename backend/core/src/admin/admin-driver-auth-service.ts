import { randomUUID } from 'node:crypto';

import type {
  AuthIdentityRecord,
  AuthIdentityStatus,
  AuthOtpRepository,
} from '../auth/auth-otp-repository.js';
import type { AuthSessionRepository } from '../auth/auth-session-repository.js';
import { normalizeBrazilMobilePhone } from '../auth/phone-otp-service.js';
import type { AdminActor, AdminRepository } from './admin-repository.js';

export class AdminDriverAuthError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_DRIVER_ID'
      | 'INVALID_DRIVER_STATUS'
      | 'DRIVER_AUTH_NOT_FOUND'
      | 'DRIVER_PHONE_CONFLICT'
      | 'DRIVER_ID_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'AdminDriverAuthError';
  }
}

function normalizeDriverId(value: string): string {
  const driverId = value.trim();
  if (
    driverId.length < 3 ||
    driverId.length > 120 ||
    !/^[A-Za-z0-9._:-]+$/.test(driverId)
  ) {
    throw new AdminDriverAuthError(
      'INVALID_DRIVER_ID',
      'Identificador do motorista é inválido.',
    );
  }
  return driverId;
}

function normalizeStatus(value: string): AuthIdentityStatus {
  if (value !== 'active' && value !== 'suspended') {
    throw new AdminDriverAuthError(
      'INVALID_DRIVER_STATUS',
      'Status deve ser active ou suspended.',
    );
  }
  return value;
}

async function audit(input: {
  repository: AdminRepository;
  actor: AdminActor;
  action: string;
  driverId: string;
  metadata: Record<string, unknown>;
  now: string;
}): Promise<void> {
  await input.repository.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: input.action,
    targetType: 'driver',
    targetId: input.driverId,
    metadata: input.metadata,
    createdAt: input.now,
  });
}

export async function getDriverAuthForAdmin(input: {
  identities: AuthOtpRepository;
  driverId: string;
}) {
  const driverId = normalizeDriverId(input.driverId);
  const identity = await input.identities.findIdentityBySubject(
    'driver',
    driverId,
  );
  if (identity == null) {
    throw new AdminDriverAuthError(
      'DRIVER_AUTH_NOT_FOUND',
      'Identidade de autenticação do motorista não encontrada.',
    );
  }
  return identity;
}

export async function provisionDriverAuthFromAdmin(input: {
  identities: AuthOtpRepository;
  sessions: AuthSessionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  phone: string;
  status?: AuthIdentityStatus;
  now?: Date;
}): Promise<{ created: boolean; identity: AuthIdentityRecord }> {
  const driverId = normalizeDriverId(input.driverId);
  const phoneE164 = normalizeBrazilMobilePhone(input.phone);
  const status = normalizeStatus(input.status ?? 'suspended');
  const now = (input.now ?? new Date()).toISOString();

  let [byPhone, bySubject] = await Promise.all([
    input.identities.findIdentityByPhone('driver', phoneE164),
    input.identities.findIdentityBySubject('driver', driverId),
  ]);

  if (byPhone != null && byPhone.subjectId !== driverId) {
    throw new AdminDriverAuthError(
      'DRIVER_PHONE_CONFLICT',
      'Telefone já está associado a outro motorista.',
    );
  }
  if (bySubject != null && bySubject.phoneE164 !== phoneE164) {
    throw new AdminDriverAuthError(
      'DRIVER_ID_CONFLICT',
      'Motorista já está associado a outro telefone.',
    );
  }

  let created = false;
  let identity = bySubject ?? byPhone;

  if (identity == null) {
    try {
      identity = await input.identities.createIdentity({
        id: randomUUID(),
        subjectId: driverId,
        subjectType: 'driver',
        phoneE164,
        status,
        createdAt: now,
        updatedAt: now,
      });
      created = true;
    } catch (error) {
      [byPhone, bySubject] = await Promise.all([
        input.identities.findIdentityByPhone('driver', phoneE164),
        input.identities.findIdentityBySubject('driver', driverId),
      ]);
      if (byPhone != null && byPhone.subjectId !== driverId) {
        throw new AdminDriverAuthError(
          'DRIVER_PHONE_CONFLICT',
          'Telefone já está associado a outro motorista.',
        );
      }
      if (bySubject != null && bySubject.phoneE164 !== phoneE164) {
        throw new AdminDriverAuthError(
          'DRIVER_ID_CONFLICT',
          'Motorista já está associado a outro telefone.',
        );
      }
      identity = bySubject ?? byPhone;
      if (identity == null) throw error;
    }
  }

  if (identity.status !== status) {
    const updated = await input.identities.setIdentityStatus({
      subjectType: 'driver',
      subjectId: driverId,
      status,
      updatedAt: now,
    });
    if (updated == null) {
      throw new AdminDriverAuthError(
        'DRIVER_AUTH_NOT_FOUND',
        'Identidade do motorista não encontrada durante atualização.',
      );
    }
    identity = updated;
  }

  let revokedSessions = 0;
  if (status === 'suspended') {
    revokedSessions = await input.sessions.revokeAllForSubject(
      'driver',
      driverId,
      now,
    );
  }

  await audit({
    repository: input.admin,
    actor: input.actor,
    action: created
      ? 'driver.auth.provisioned'
      : 'driver.auth.provision_confirmed',
    driverId,
    metadata: { status, revokedSessions },
    now,
  });

  return { created, identity };
}

export async function setDriverAuthStatusFromAdmin(input: {
  identities: AuthOtpRepository;
  sessions: AuthSessionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverId: string;
  status: AuthIdentityStatus;
  now?: Date;
}) {
  const driverId = normalizeDriverId(input.driverId);
  const status = normalizeStatus(input.status);
  const now = (input.now ?? new Date()).toISOString();

  const previous = await input.identities.findIdentityBySubject(
    'driver',
    driverId,
  );
  if (previous == null) {
    throw new AdminDriverAuthError(
      'DRIVER_AUTH_NOT_FOUND',
      'Identidade de autenticação do motorista não encontrada.',
    );
  }

  const identity = await input.identities.setIdentityStatus({
    subjectType: 'driver',
    subjectId: driverId,
    status,
    updatedAt: now,
  });
  if (identity == null) {
    throw new AdminDriverAuthError(
      'DRIVER_AUTH_NOT_FOUND',
      'Identidade de autenticação do motorista não encontrada.',
    );
  }

  let revokedSessions = 0;
  if (status === 'suspended') {
    revokedSessions = await input.sessions.revokeAllForSubject(
      'driver',
      driverId,
      now,
    );
  }

  await audit({
    repository: input.admin,
    actor: input.actor,
    action: 'driver.auth.status_changed',
    driverId,
    metadata: {
      previousStatus: previous.status,
      status,
      revokedSessions,
    },
    now,
  });

  return { identity, revokedSessions };
}
