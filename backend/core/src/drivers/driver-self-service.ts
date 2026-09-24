import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { DriverRegistryRepository } from './driver-registry-repository.js';

function activityRideView(
  ride: Awaited<ReturnType<RideRepository['findById']>>,
) {
  if (ride == null) return null;
  return {
    id: ride.id,
    state: ride.state,
    category: ride.category,
    origin: ride.origin,
    destination: ride.destination,
    driverEarningsCents: ride.quote.driverNetCents,
    paymentMethod: ride.paymentMethod ?? null,
    updatedAt: ride.updatedAt,
  };
}

export async function driverProfileForApp(input: {
  identities: AuthOtpRepository;
  registry: DriverRegistryRepository;
  driverId: string;
}) {
  const [identity, profile, vehicle] = await Promise.all([
    input.identities.findIdentityBySubject('driver', input.driverId),
    input.registry.findProfile(input.driverId),
    input.registry.findVehicleByDriverId(input.driverId),
  ]);

  return {
    driverId: input.driverId,
    ...(identity == null
      ? {}
      : {
          phoneE164: identity.phoneE164,
          ...(identity.emailNormalized == null
            ? {}
            : { email: identity.emailNormalized }),
        }),
    profile,
    vehicle,
  };
}

export async function driverActivityForApp(input: {
  rides: RideRepository;
  driverId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const [summary, recent] = await Promise.all([
    input.rides.getDriverRideSummary(input.driverId),
    input.rides.listRecentByDriverId(input.driverId, limit),
  ]);

  return {
    summary,
    rides: recent
      .map(activityRideView)
      .filter((ride): ride is NonNullable<typeof ride> => ride != null),
  };
}
