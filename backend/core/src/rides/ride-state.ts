import {
  assertPaymentReadyForDispatch,
  type PaymentSnapshot,
} from '../payments/payment-state.js';

export type RideState =
  | 'CREATED'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'SEARCHING_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ARRIVING'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PAYMENT_FAILED'
  | 'NO_DRIVER_FOUND'
  | 'CANCELLED_BY_PASSENGER'
  | 'CANCELLED_BY_DRIVER'
  | 'CANCELLED_BY_ADMIN'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export class RideStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RideStateError';
  }
}

const TRANSITIONS: Readonly<Record<RideState, ReadonlySet<RideState>>> = {
  CREATED: new Set(['AWAITING_PAYMENT', 'CANCELLED_BY_PASSENGER']),
  AWAITING_PAYMENT: new Set([
    'PAID',
    'PAYMENT_FAILED',
    'CANCELLED_BY_PASSENGER',
  ]),
  PAID: new Set([
    'SEARCHING_DRIVER',
    'CANCELLED_BY_PASSENGER',
    'REFUND_PENDING',
  ]),
  SEARCHING_DRIVER: new Set([
    'DRIVER_ASSIGNED',
    'NO_DRIVER_FOUND',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_ADMIN',
  ]),
  DRIVER_ASSIGNED: new Set([
    'DRIVER_ARRIVING',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'CANCELLED_BY_ADMIN',
  ]),
  DRIVER_ARRIVING: new Set([
    'DRIVER_ARRIVED',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'CANCELLED_BY_ADMIN',
  ]),
  DRIVER_ARRIVED: new Set([
    'IN_PROGRESS',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'CANCELLED_BY_ADMIN',
  ]),
  IN_PROGRESS: new Set([
    'COMPLETED',
    'CANCELLED_BY_ADMIN',
  ]),
  COMPLETED: new Set([]),
  PAYMENT_FAILED: new Set(['AWAITING_PAYMENT', 'CANCELLED_BY_PASSENGER']),
  NO_DRIVER_FOUND: new Set(['REFUND_PENDING', 'SEARCHING_DRIVER']),
  CANCELLED_BY_PASSENGER: new Set(['REFUND_PENDING']),
  CANCELLED_BY_DRIVER: new Set(['SEARCHING_DRIVER', 'REFUND_PENDING']),
  CANCELLED_BY_ADMIN: new Set(['REFUND_PENDING']),
  REFUND_PENDING: new Set(['REFUNDED']),
  REFUNDED: new Set([]),
};

export function transitionRide(
  current: RideState,
  next: RideState,
): RideState {
  if (!TRANSITIONS[current].has(next)) {
    throw new RideStateError(
      `Transição de corrida inválida: ${current} -> ${next}.`,
    );
  }
  return next;
}

export function markRidePaid(
  current: RideState,
  payment: Pick<PaymentSnapshot, 'status' | 'amountCents'>,
): RideState {
  if (current !== 'AWAITING_PAYMENT') {
    throw new RideStateError(
      'A corrida só pode ser marcada como paga enquanto aguarda pagamento.',
    );
  }

  assertPaymentReadyForDispatch(payment);
  return 'PAID';
}

export function beginDriverSearch(
  current: RideState,
  payment: Pick<PaymentSnapshot, 'status' | 'amountCents'>,
): RideState {
  if (current !== 'PAID') {
    throw new RideStateError(
      'A corrida precisa estar em PAID antes do matching.',
    );
  }

  assertPaymentReadyForDispatch(payment);
  return 'SEARCHING_DRIVER';
}
