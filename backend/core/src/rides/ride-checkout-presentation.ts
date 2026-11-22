import type {RideRecord} from './ride.js';
import {ridePaymentExpiresAt} from './ride.js';
import type {PaymentRecord} from '../payments/payment.js';

/** A read model, never a persisted cancellation or financial decision. */
export function isAbandonedCheckoutExpired(
  ride: RideRecord, payment: PaymentRecord | null, now: Date,
): boolean {
  const deadline = ridePaymentExpiresAt(ride);
  if (deadline == null || !Number.isFinite(Date.parse(deadline))) return false;
  return ride.state === 'AWAITING_PAYMENT' &&
    ride.driverId == null && ride.paymentMethod == null &&
    ride.paymentStatus === 'created' && payment == null &&
    Date.parse(deadline) <= now.getTime();
}

export function checkoutPresentation(ride: RideRecord, payment: PaymentRecord | null, now: Date) {
  return isAbandonedCheckoutExpired(ride, payment, now)
    ? {state: 'EXPIRED' as const, recordedState: ride.state, statusReason: 'payment_window_expired' as const}
    : {state: ride.state};
}
