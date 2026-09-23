import type { EnabledPaymentMethod } from './payment-policy.js';
import type { PaymentStatus } from './payment-state.js';

export interface PaymentRecord {
  id: string;
  rideId: string;
  method: EnabledPaymentMethod;
  processor: string;
  processorPaymentId?: string;
  status: PaymentStatus;
  amountCents: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export class PaymentDomainError extends Error {
  constructor(
    public readonly code:
      | 'PAYMENT_METHOD_DISABLED'
      | 'RIDE_NOT_AWAITING_PAYMENT'
      | 'INVALID_PAYMENT_AMOUNT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'PAYMENT_NOT_FOUND'
      | 'INVALID_PAYMENT_TRANSITION',
    message: string,
  ) {
    super(message);
    this.name = 'PaymentDomainError';
  }
}
