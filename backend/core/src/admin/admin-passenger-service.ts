import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';

export class AdminPassengerError extends Error {
  constructor(
    public readonly code: 'PASSENGER_NOT_FOUND',
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
