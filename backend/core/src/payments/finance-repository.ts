import type { LedgerTransaction } from './ledger.js';
import type { PaymentRecord } from './payment.js';

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

export interface FinanceRepository {
  findPaymentById(id: string): Promise<PaymentRecord | null>;
  findPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null>;
  createPayment(payment: PaymentRecord): Promise<PaymentRecord>;
  capturePayment(input: CapturePaymentInput): Promise<CapturePaymentResult>;
}
