export type DriverPayoutStatus =
  | 'requested'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface DriverPayoutRecord {
  id: string;
  driverId: string;
  amountCents: number;
  status: DriverPayoutStatus;
  idempotencyKey: string;
  processor?: string;
  processorPayoutId?: string;
  createdAt: string;
  updatedAt: string;
}

export class PayoutDomainError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PAYOUT_AMOUNT'
      | 'INVALID_DRIVER'
      | 'INVALID_IDEMPOTENCY_KEY'
      | 'PAYOUT_IDEMPOTENCY_CONFLICT'
      | 'INSUFFICIENT_DRIVER_BALANCE',
    message: string,
  ) {
    super(message);
    this.name = 'PayoutDomainError';
  }
}
