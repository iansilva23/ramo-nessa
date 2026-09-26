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
  | { kind: 'NOT_PREPARED' };

export async function dispatchRideAfterPayment(input: {
  ride: RideRecord;
  rides: RideRepository;
  drivers: DriverSupplyRepository;
  matching: RideMatchingRepository;
  now?: Date;
  finance?: FinanceRepository;
  paymentPolicySettings?: PaymentPolicySettingsRepository;
  operationalSettings?: OperationalSettingsRepository;
  canOfferDriver?: (driverId: string) => Promise<boolean>;
}): Promise<PostPaymentDispatchResult> {
  if (
    input.ride.pickupLatitude == null ||
    input.ride.pickupLongitude == null
  ) {
    return { kind: 'NOT_PREPARED' };
  }

  return dispatchNextDriver({
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
  });
}
