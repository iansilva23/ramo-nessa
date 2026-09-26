import { randomUUID } from 'node:crypto';

import type {
  AuthIdentityStatus,
  AuthOtpRepository,
} from '../auth/auth-otp-repository.js';
import {
  normalizePassengerEmail,
  normalizePassengerName,
} from '../auth/passenger-password-auth-service.js';
import type { AuthSessionRepository } from '../auth/auth-session-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { AdminActor, AdminRepository } from './admin-repository.js';

export class AdminPassengerError extends Error {
  constructor(
    public readonly code:
      | 'PASSENGER_NOT_FOUND'
      | 'INVALID_PASSENGER_STATUS'
      | 'INVALID_PASSENGER_NAME'
      | 'INVALID_PASSENGER_EMAIL'
      | 'PASSENGER_EMAIL_IN_USE',
    message: string,
  ) {
    super(message);
    this.name = 'AdminPassengerError';
  }
}

export async function adminPassengerProfile(input: {
  identities: AuthOtpRepository;
  rides: RideRepository;
  passengerId: string;
  recentLimit?: number;
}) {
  const passengerId = input.passengerId.trim();
  const identity = await input.identities.findIdentityBySubject(
    'passenger',
    passengerId,
  );
  if (identity == null) {
    throw new AdminPassengerError(
      'PASSENGER_NOT_FOUND',
      'Passageiro não encontrado.',
    );
  }

  const recentLimit = Math.max(
    1,
    Math.min(25, Math.trunc(input.recentLimit ?? 10)),
  );
  const [rideSummary, recentRides] = await Promise.all([
    input.rides.getAdminPassengerRideSummary(passengerId),
    input.rides.listAdminRecentByPassengerId(
      passengerId,
      recentLimit,
    ),
  ]);

  return {
    passenger: {
      passengerId: identity.subjectId,
      phoneE164: identity.phoneE164,
      fullName: identity.fullName ?? null,
      email: identity.emailNormalized ?? null,
      status: identity.status,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    },
    rides: rideSummary,
    recentRides: recentRides.map((ride) => ({
      id: ride.id,
      state: ride.state,
      paymentStatus: ride.paymentStatus,
      driverId: ride.driverId ?? null,
      reservedDriverId: ride.reservedDriverId ?? null,
      category: ride.category,
      period: ride.period,
      passengers: ride.passengers,
      origin: ride.origin,
      destination: ride.destination,
      totalAmountCents: ride.quote.totalAmountCents,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    })),
  };
}


export async function updatePassengerProfileFromAdmin(input: {
  identities: AuthOtpRepository;
  admin: AdminRepository;
  actor: AdminActor;
  passengerId: string;
  fullName?: string;
  email?: string;
  now?: Date;
}) {
  const passengerId = input.passengerId.trim();
  const current = await input.identities.findIdentityBySubject(
    'passenger',
    passengerId,
  );
  if (current == null) {
    throw new AdminPassengerError(
      'PASSENGER_NOT_FOUND',
      'Passageiro não encontrado.',
    );
  }

  let fullName: string | undefined;
  if (input.fullName != null) {
    try {
      fullName = normalizePassengerName(input.fullName);
    } catch {
      throw new AdminPassengerError(
        'INVALID_PASSENGER_NAME',
        'Informe um nome válido para o passageiro.',
      );
    }
  }

  let emailNormalized: string | undefined;
  if (input.email != null) {
    try {
      emailNormalized = normalizePassengerEmail(input.email);
    } catch {
      throw new AdminPassengerError(
        'INVALID_PASSENGER_EMAIL',
        'Informe um e-mail válido para o passageiro.',
      );
    }

    const owner = await input.identities.findIdentityByEmail(
      'passenger',
      emailNormalized,
    );
    if (owner != null && owner.subjectId !== passengerId) {
      throw new AdminPassengerError(
        'PASSENGER_EMAIL_IN_USE',
        'Este e-mail já está vinculado a outro passageiro.',
      );
    }
  }

  if (fullName == null && emailNormalized == null) {
    return current;
  }

  const updatedAt = (input.now ?? new Date()).toISOString();
  const updated = await input.identities.setPassengerAccount({
    subjectId: passengerId,
    ...(fullName == null ? {} : { fullName }),
    ...(emailNormalized == null ? {} : { emailNormalized }),
    updatedAt,
  });
  if (updated == null) {
    throw new AdminPassengerError(
      'PASSENGER_NOT_FOUND',
      'Passageiro não encontrado durante atualização.',
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'passenger.profile.updated',
    targetType: 'passenger',
    targetId: passengerId,
    metadata: {
      fullNameChanged:
        fullName != null && fullName !== current.fullName,
      emailChanged:
        emailNormalized != null &&
        emailNormalized !== current.emailNormalized,
    },
    createdAt: updatedAt,
  });

  return {
    passengerId: updated.subjectId,
    phoneE164: updated.phoneE164,
    fullName: updated.fullName ?? null,
    email: updated.emailNormalized ?? null,
    status: updated.status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}


function normalizePassengerStatus(value: string): AuthIdentityStatus {
  if (value !== 'active' && value !== 'suspended') {
    throw new AdminPassengerError(
      'INVALID_PASSENGER_STATUS',
      'Status deve ser active ou suspended.',
    );
  }
  return value;
}

export async function setPassengerAuthStatusFromAdmin(input: {
  identities: AuthOtpRepository;
  sessions: AuthSessionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  passengerId: string;
  status: AuthIdentityStatus;
  now?: Date;
}) {
  const passengerId = input.passengerId.trim();
  const status = normalizePassengerStatus(input.status);
  const now = (input.now ?? new Date()).toISOString();

  const previous = await input.identities.findIdentityBySubject(
    'passenger',
    passengerId,
  );
  if (previous == null) {
    throw new AdminPassengerError(
      'PASSENGER_NOT_FOUND',
      'Passageiro não encontrado.',
    );
  }

  const identity = await input.identities.setIdentityStatus({
    subjectType: 'passenger',
    subjectId: passengerId,
    status,
    updatedAt: now,
  });
  if (identity == null) {
    throw new AdminPassengerError(
      'PASSENGER_NOT_FOUND',
      'Passageiro não encontrado durante atualização.',
    );
  }

  let revokedSessions = 0;
  if (status === 'suspended') {
    revokedSessions = await input.sessions.revokeAllForSubject(
      'passenger',
      passengerId,
      now,
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'passenger.auth.status_changed',
    targetType: 'passenger',
    targetId: passengerId,
    metadata: {
      previousStatus: previous.status,
      status,
      revokedSessions,
    },
    createdAt: now,
  });

  return {
    identity,
    revokedSessions,
  };
}
