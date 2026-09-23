import type { LedgerTransaction } from './ledger.js';
import type { PaymentRecord } from './payment.js';
import type { DriverPayoutRecord } from './payout.js';

export interface CapturePaymentInput {
  paymentId: string;
  processorEventId: string;
  processorPaymentId?: string;
  payload?: unknown;
  capturedAt?: Date;
}

export interface CapturePaymentResult {
  payment: PaymentRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateEvent: boolean;
}

export interface SettleRideInput {
  rideId: string;
  paymentId: string;
  driverId: string;
  totalAmountCents: number;
  platformCommissionCents: number;
  driverNetCents: number;
  settledAt?: Date;
}

export interface SettleRideResult {
  ledgerTransaction: LedgerTransaction;
  duplicateSettlement: boolean;
}

export interface ReserveDriverPayoutResult {
  payout: DriverPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateRequest: boolean;
}

export interface FinanceRepository {
  findPaymentById(id: string): Promise<PaymentRecord | null>;
  findPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null>;
  createPayment(payment: PaymentRecord): Promise<PaymentRecord>;
  capturePayment(input: CapturePaymentInput): Promise<CapturePaymentResult>;
  settleRide(input: SettleRideInput): Promise<SettleRideResult>;
  reserveDriverPayout(
    payout: DriverPayoutRecord,
  ): Promise<ReserveDriverPayoutResult>;
  getAccountBalanceCents(accountKey: string): Promise<number>;
}
