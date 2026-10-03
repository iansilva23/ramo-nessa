import type { PaymentStatus } from './payment-state.js';

export type WalletTopupMethod = 'pix' | 'card';

export interface WalletTopupRecord {
  id: string;
  passengerId: string;
  method: WalletTopupMethod;
  processor: string;
  processorTopupId?: string;
  status: PaymentStatus;
  amountCents: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export class WalletDomainError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_TOPUP_AMOUNT'
      | 'INVALID_TOPUP_METHOD'
      | 'WALLET_IDEMPOTENCY_CONFLICT'
      | 'WALLET_TOPUP_NOT_FOUND'
      | 'INVALID_TOPUP_TRANSITION'
      | 'INSUFFICIENT_WALLET_BALANCE'
      | 'RIDE_ALREADY_PAID'
      | 'RIDE_PASSENGER_MISMATCH'
      | 'RIDE_NOT_AWAITING_WALLET_PAYMENT'
      | 'RIDE_NOT_PREPARED'
      | 'WALLET_REFUND_NOT_ALLOWED'
      | 'INSUFFICIENT_RIDE_ESCROW',
    message: string,
  ) {
    super(message);
    this.name = 'WalletDomainError';
  }
}
