import type { PixKeyType } from './payout.js';

export type CompanyPayoutStatus =
  | 'requested'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface CompanyPayoutDestination {
  pixKeyType: PixKeyType;
  pixKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyPayoutRecord {
  id: string;
  amountCents: number;
  status: CompanyPayoutStatus;
  idempotencyKey: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  processor?: string;
  processorPayoutId?: string;
  createdAt: string;
  updatedAt: string;
}

export class CompanyPayoutError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_COMPANY_PAYOUT_AMOUNT'
      | 'INVALID_COMPANY_PAYOUT_IDEMPOTENCY_KEY'
      | 'COMPANY_PAYOUT_DESTINATION_REQUIRED'
      | 'COMPANY_PAYOUT_IDEMPOTENCY_CONFLICT'
      | 'INSUFFICIENT_COMPANY_BALANCE'
      | 'COMPANY_PAYOUT_NOT_FOUND'
      | 'INVALID_COMPANY_PAYOUT_TRANSITION',
    message: string,
  ) {
    super(message);
    this.name = 'CompanyPayoutError';
  }
}
