import type { LedgerTransaction } from './ledger.js';
import type { PaymentRecord } from './payment.js';
import type { DriverPayoutRecord } from './payout.js';
import type { WalletTopupRecord } from './wallet.js';

export interface MarkPaymentPendingInput {
  paymentId: string;
  processorPaymentId: string;
  pendingAt?: Date;
}

export interface MarkPaymentTerminalInput {
  paymentId: string;
  status: 'failed' | 'cancelled';
  updatedAt?: Date;
}

export interface RefundExternalPaymentInput {
  paymentId: string;
  refundedAt?: Date;
}

export interface RefundExternalPaymentResult {
  payment: PaymentRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateRefund: boolean;
}

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
  cashDebtRecoveredCents: number;
}

export interface SettleCashRideInput {
  rideId: string;
  driverId: string;
  platformCommissionCents: number;
  settledAt?: Date;
}

export interface SettleCashRideResult {
  ledgerTransaction: LedgerTransaction;
  duplicateSettlement: boolean;
  cashCommissionRecoveredFromBalanceCents: number;
  cashDebtCents: number;
}

export interface ReserveDriverPayoutResult {
  payout: DriverPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateRequest: boolean;
}

export interface CaptureWalletTopupInput {
  walletTopupId: string;
  processorEventId: string;
  processorTopupId?: string;
  payload?: unknown;
  capturedAt?: Date;
}

export interface CaptureWalletTopupResult {
  topup: WalletTopupRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateEvent: boolean;
}

export interface PayRideFromWalletInput {
  passengerId: string;
  payment: PaymentRecord;
}

export interface PayRideFromWalletResult {
  payment: PaymentRecord;
  ledgerTransaction: LedgerTransaction;
  duplicatePayment: boolean;
}

export interface RefundWalletRideInput {
  paymentId: string;
  passengerId: string;
  refundedAt?: Date;
}

export interface RefundWalletRideResult {
  payment: PaymentRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateRefund: boolean;
}

export interface AdminFinanceSummary {
  paymentsTotal: number;
  paymentsPaid: number;
  paymentsPaidCents: number;
  paymentsPending: number;
  paymentsFailed: number;
  paymentsCancelled: number;
  paymentsRefunded: number;
  platformRevenueCents: number;
  driverPayableCents: number;
  driverPayoutPendingCents: number;
  driverCashCommissionDebtCents: number;
  rideEscrowCents: number;
  passengerWalletCents: number;
  payoutsRequested: number;
  payoutsRequestedCents: number;
}

export interface FinanceRepository {
  findPaymentById(id: string): Promise<PaymentRecord | null>;
  findLatestPaymentByRideId(rideId: string): Promise<PaymentRecord | null>;
  findPaidPaymentByRideId(rideId: string): Promise<PaymentRecord | null>;
  findPaymentByIdempotencyKey(key: string): Promise<PaymentRecord | null>;
  createPayment(payment: PaymentRecord): Promise<PaymentRecord>;
  markPaymentPending(input: MarkPaymentPendingInput): Promise<PaymentRecord>;
  markPaymentTerminal(input: MarkPaymentTerminalInput): Promise<PaymentRecord>;
  capturePayment(input: CapturePaymentInput): Promise<CapturePaymentResult>;
  refundExternalPayment(
    input: RefundExternalPaymentInput,
  ): Promise<RefundExternalPaymentResult>;

  findWalletTopupByIdempotencyKey(
    key: string,
  ): Promise<WalletTopupRecord | null>;
  createWalletTopup(topup: WalletTopupRecord): Promise<WalletTopupRecord>;
  captureWalletTopup(
    input: CaptureWalletTopupInput,
  ): Promise<CaptureWalletTopupResult>;
  payRideFromWallet(
    input: PayRideFromWalletInput,
  ): Promise<PayRideFromWalletResult>;
  refundWalletRide(
    input: RefundWalletRideInput,
  ): Promise<RefundWalletRideResult>;

  settleRide(input: SettleRideInput): Promise<SettleRideResult>;
  settleCashRide(
    input: SettleCashRideInput,
  ): Promise<SettleCashRideResult>;
  reserveDriverPayout(
    payout: DriverPayoutRecord,
  ): Promise<ReserveDriverPayoutResult>;

  getAccountBalanceCents(accountKey: string): Promise<number>;
  getDriverCashDebtCents(driverId: string): Promise<number>;
  adminFinanceSummary(): Promise<AdminFinanceSummary>;
  listRecentPayments(limit: number): Promise<PaymentRecord[]>;
  listRecentDriverPayouts(limit: number): Promise<DriverPayoutRecord[]>;
  listLedgerTransactionsForAccounts(
    accountKeys: readonly string[],
    limit: number,
  ): Promise<LedgerTransaction[]>;
}
