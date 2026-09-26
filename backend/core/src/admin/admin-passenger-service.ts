import { randomUUID } from 'node:crypto';

import type {
  AuthIdentityStatus,
  AuthOtpRepository,
} from '../auth/auth-otp-repository.js';
import type { AuthSessionRepository } from '../auth/auth-session-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { AdminActor, AdminRepository } from './admin-repository.js';

export class AdminPassengerError extends Error {
  constructor(
    public readonly code:
      | 'PASSENGER_NOT_FOUND'
      | 'INVALID_PASSENGER_STATUS',
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
