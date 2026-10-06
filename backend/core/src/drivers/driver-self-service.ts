import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { DriverRegistryRepository } from './driver-registry-repository.js';
import { driverPhotoPath } from './driver-profile-photo-service.js';

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
    totalAmountCents: ride.quote.totalAmountCents,
    platformFeeCents: ride.quote.platformCommissionCents,
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
    profile:
      profile == null
        ? null
        : {
            ...profile,
            photoPath: driverPhotoPath(
              input.driverId,
              profile.photoUpdatedAt,
            ),
          },
    vehicle,
  };
}

export async function driverActivityForApp(input: {
  rides: RideRepository;
  finance: FinanceRepository;
  driverId: string;
  limit?: number;
  from?: string;
  to?: string;
}) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const [summary, recent, payouts, availableBalanceCents] =
    await Promise.all([
      input.rides.getDriverRideSummary(
        input.driverId,
        input.from,
        input.to,
      ),
      input.rides.listRecentByDriverId(
        input.driverId,
        limit,
        input.from,
        input.to,
      ),
      input.finance.getDriverPayoutPeriodSummary(
        input.driverId,
        input.from,
        input.to,
      ),
      input.finance.getAccountBalanceCents(
        `driver:${input.driverId}:payable`,
      ),
    ]);

  return {
    period: {
      from: input.from ?? null,
      to: input.to ?? null,
    },
    summary: {
      ...summary,
      averageEarningsCents:
        summary.completed === 0
          ? 0
          : Math.round(summary.earningsCents / summary.completed),
      payoutsRequestedCents: payouts.requestedCents,
      payoutsPaidCents: payouts.paidCents,
      availableBalanceCents,
    },
    rides: recent
      .map(activityRideView)
      .filter((ride): ride is NonNullable<typeof ride> => ride != null),
  };
}
