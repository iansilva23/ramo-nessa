import type { PaymentRecord } from '../payments/payment.js';
import type { RideRepository } from './ride-repository.js';
import { markRidePaid } from './ride-state.js';
import type { RideRecord } from './ride.js';

const CONFIRMED_PAYMENT_RIDE_STATES: ReadonlySet<RideRecord['state']> =
  new Set([
    'PAID',
    'SEARCHING_DRIVER',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_ARRIVED',
    'IN_PROGRESS',
    'COMPLETED',
    'NO_DRIVER_FOUND',
    'REFUND_PENDING',
    'REFUNDED',
  ]);

export class RidePaymentConfirmationError extends Error {
  constructor(
    public readonly code:
      | 'RIDE_NOT_FOUND'
      | 'PAYMENT_RIDE_MISMATCH'
      | 'PAYMENT_AMOUNT_MISMATCH'
      | 'RIDE_NOT_AWAITING_PAYMENT',
    message: string,
  ) {
    super(message);
    this.name = 'RidePaymentConfirmationError';
  }
}

export async function confirmRidePayment(
  repository: RideRepository,
  input: {
    rideId: string;
    payment: PaymentRecord;
    confirmedAt?: Date;
  },
) {
  const ride = await repository.findById(input.rideId);
  if (ride == null) {
    throw new RidePaymentConfirmationError(
      'RIDE_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }

  if (input.payment.rideId !== ride.id) {
    throw new RidePaymentConfirmationError(
      'PAYMENT_RIDE_MISMATCH',
      'Pagamento não pertence à corrida.',
    );
  }

  if (input.payment.amountCents !== ride.quote.totalAmountCents) {
    throw new RidePaymentConfirmationError(
      'PAYMENT_AMOUNT_MISMATCH',
      'Pagamento não confere com o preço congelado da corrida.',
    );
  }

  if (
    ride.paymentStatus === input.payment.status &&
    CONFIRMED_PAYMENT_RIDE_STATES.has(ride.state)
  ) {
    return ride;
  }

  if (ride.state !== 'AWAITING_PAYMENT') {
    throw new RidePaymentConfirmationError(
      'RIDE_NOT_AWAITING_PAYMENT',
      'Corrida não está aguardando pagamento.',
    );
  }

  const state = markRidePaid(ride.state, input.payment);
  const updatedAt = (input.confirmedAt ?? new Date()).toISOString();

  return repository.save({
    ...ride,
    state,
    paymentStatus: input.payment.status,
    updatedAt,
  });
}
