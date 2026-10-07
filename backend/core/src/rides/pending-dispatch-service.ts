import type { PostPaymentDispatchResult } from './dispatch-after-payment.js';
import type { RideRepository } from './ride-repository.js';
import type { RideRecord } from './ride.js';

// Recovery must run without a connected passenger or driver. The normal
// dispatcher retains the offer deadline, eligibility and transaction guards.
export async function advancePendingRideDispatch(input: {
  rides: RideRepository;
  dispatch: (ride: RideRecord, now: Date) => Promise<PostPaymentDispatchResult>;
  onProgress?: (rideId: string, result: PostPaymentDispatchResult) => Promise<void>;
  onFailure?: (rideId: string, error: unknown) => void;
  now?: Date;
  limit?: number;
}): Promise<number> {
  const now = input.now ?? new Date();
  const pending = await input.rides.listPendingDispatch(now.toISOString(), input.limit ?? 100);
  let advanced = 0;
  for (const candidate of pending) {
    try {
      // A driver may have accepted or the passenger cancelled since selection.
      const ride = await input.rides.findById(candidate.id);
      if (ride == null || !['PAID', 'SEARCHING_DRIVER'].includes(ride.state) ||
          !['paid', 'authorized'].includes(ride.paymentStatus) ||
          ride.driverConsentRequired || ride.pickupLatitude == null ||
          ride.pickupLongitude == null) continue;
      const result = await input.dispatch(ride, now);
      if (result.kind === 'OFFER_CREATED' || result.kind === 'NO_DRIVER_FOUND') {
        advanced += 1;
        await input.onProgress?.(ride.id, result);
      }
    } catch (error) {
      input.onFailure?.(candidate.id, error);
    }
  }
  return advanced;
}
