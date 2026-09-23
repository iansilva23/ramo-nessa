import type { DriverSupplyRepository } from '../drivers/driver-supply-repository.js';
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
  });
}
