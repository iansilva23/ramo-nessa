import type { RoutingDistanceProvider } from '../routing/distance-provider.js';
import { RideOfferError } from '../matching/ride-offer.js';
import type { OperationalSettingsRepository } from '../config/operational-settings-repository.js';
import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentPolicySettingsRepository } from '../payments/payment-policy-settings-repository.js';
import {
  dispatchNextDriver,
  type DispatchNextResult,
} from '../matching/dispatch-next-driver.js';
import type { RideMatchingRepository } from '../matching/ride-matching-repository.js';
import type { RideRepository } from './ride-repository.js';
import type { RideRecord } from './ride.js';

export type PostPaymentDispatchResult =
  | DispatchNextResult
  | { kind: 'NOT_PREPARED' }
  | { kind: 'DRIVER_CONFIRMED'; driverId: string };

export async function dispatchRideAfterPayment(input: {
  routing?: RoutingDistanceProvider;
  ride: RideRecord;
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  now?: Date;
  finance?: FinanceRepository;
  paymentPolicySettings?: PaymentPolicySettingsRepository;
  operationalSettings?: OperationalSettingsRepository;
  canOfferDriver?: (driverId: string) => Promise<boolean>;
  allowPreviouslyAttemptedDrivers?: boolean;
}): Promise<PostPaymentDispatchResult> {
  if (
    input.ride.pickupLatitude == null ||
    input.ride.pickupLongitude == null
  ) {
    return { kind: 'NOT_PREPARED' };
  }

  if (input.ride.driverConsentRequired) {
    if (input.ride.state !== 'PAID' || !['paid', 'authorized'].includes(input.ride.paymentStatus)) return { kind: 'NOT_PREPARED' };
    const now = input.now ?? new Date();
    const offer = (await input.matching.listOffersForRide(input.ride.id)).find(
      (entry) => entry.status === 'ACCEPTED' && entry.driverId === input.ride.driverId);
    if (offer == null || input.ride.reservedDriverId !== offer.driverId ||
        Date.parse(input.ride.driverHoldExpiresAt ?? '') <= now.getTime()) {
      // Never silently replace the driver the passenger confirmed.
      return { kind: 'NOT_PREPARED' };
    }
    try {
      await input.matching.acceptOffer({ offerId: offer.id, driverId: offer.driverId,
        acceptedAt: now.toISOString() });
    } catch (error) {
      if (error instanceof RideOfferError && ['DRIVER_NOT_AVAILABLE', 'RIDE_NOT_READY'].includes(error.code)) {
        return { kind: 'NOT_PREPARED' };
      }
      throw error;
    }
    return { kind: 'DRIVER_CONFIRMED', driverId: offer.driverId };
  }
  return dispatchNextDriver({
    ...(input.routing == null ? {} : { routing: input.routing }),
    rides: input.rides,
    drivers: input.drivers,
    matching: input.matching,
    rideId: input.ride.id,
    pickup: {
      latitude: input.ride.pickupLatitude,
      longitude: input.ride.pickupLongitude,
    },
    ...(input.now != null ? { now: input.now } : {}),
    ...(input.finance != null ? { finance: input.finance } : {}),
    ...(input.paymentPolicySettings != null
      ? { paymentPolicySettings: input.paymentPolicySettings }
      : {}),
    ...(input.operationalSettings != null
      ? { operationalSettings: input.operationalSettings }
      : {}),
    ...(input.canOfferDriver != null
      ? { canOfferDriver: input.canOfferDriver }
      : {}),
    ...(input.allowPreviouslyAttemptedDrivers == null
      ? {}
      : {
          allowPreviouslyAttemptedDrivers:
            input.allowPreviouslyAttemptedDrivers,
        }),
  });
}
