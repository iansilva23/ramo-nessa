import type {
  CompanyPayoutDestination,
  CompanyPayoutRecord,
} from './company-payout.js';
import type { LedgerTransaction } from './ledger.js';
import type { PaymentRecord } from './payment.js';
import type {
  ExternalPaymentAdjustmentKind,
  ExternalPaymentAdjustmentRecord,
} from './external-payment-adjustment.js';
import type {
  DriverPayoutDestination,
  DriverPayoutRecord,
  DriverPayoutSettings,
} from './payout.js';
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

export interface RecordExternalPaymentAdjustmentInput {
  paymentId: string;
  processorAdjustmentId: string;
  kind: ExternalPaymentAdjustmentKind;
  processorStatus: string;
  processorStatusDetail: string;
  amountCents: number;
  applyToAccounting: boolean;
  observedAt?: Date;
}

export interface RecordExternalPaymentAdjustmentResult {
  adjustment: ExternalPaymentAdjustmentRecord;
  ledgerTransaction?: LedgerTransaction;
  duplicateAdjustment: boolean;
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

export interface FundRidePromotionInput {
  rideId: string;
  applicationId: string;
  amountCents: number;
  fundedAt?: Date;
}

export interface GrantWalletPromotionInput {
  passengerId: string;
  applicationId: string;
  amountCents: number;
  grantedAt?: Date;
}

export interface PromotionLedgerResult {
  ledgerTransaction: LedgerTransaction;
  duplicate: boolean;
}

export interface SettleRideInput {
  rideId: string;
  paymentId: string;
  driverId: string;
  totalAmountCents: number;
  fareAmountCents?: number;
  paymentAdjustmentCents?: number;
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

export interface ApproveDriverPayoutInput {
  payoutId: string;
  approvedAt?: Date;
}

export interface ApproveDriverPayoutResult {
  payout: DriverPayoutRecord;
  ledgerTransaction?: LedgerTransaction;
  duplicateApproval: boolean;
}

export interface DriverPayoutCandidate {
  driverId: string;
  availableBalanceCents: number;
  destination: DriverPayoutDestination | null;
}

export interface SetDriverPayoutAutomaticEnabledInput {
  automaticEnabled: boolean;
  updatedAt?: Date;
}

export interface StartDriverPayoutInput {
  payoutId: string;
  processor: string;
  processorPayoutId: string;
  startedAt?: Date;
}

export interface StartDriverPayoutResult {
  payout: DriverPayoutRecord;
  duplicateStart: boolean;
}

export interface FailDriverPayoutInput {
  payoutId: string;
  processor?: string;
  processorPayoutId?: string;
  failedAt?: Date;
}

export interface FailDriverPayoutResult {
  payout: DriverPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateFailure: boolean;
}

export interface CompleteDriverPayoutInput {
  payoutId: string;
  processor: string;
  processorPayoutId?: string;
  completedAt?: Date;
}

export interface CompleteDriverPayoutResult {
  payout: DriverPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateCompletion: boolean;
}

export interface CancelDriverPayoutInput {
  payoutId: string;
  cancelledAt?: Date;
}

export interface CancelDriverPayoutResult {
  payout: DriverPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateCancellation: boolean;
}

export interface ReserveCompanyPayoutResult {
  payout: CompanyPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateRequest: boolean;
}

export interface StartCompanyPayoutInput {
  payoutId: string;
  processor: string;
  processorPayoutId: string;
  startedAt?: Date;
}

export interface StartCompanyPayoutResult {
  payout: CompanyPayoutRecord;
  duplicateStart: boolean;
}

export interface FailCompanyPayoutInput {
  payoutId: string;
  processor?: string;
  processorPayoutId?: string;
  failedAt?: Date;
}

export interface FailCompanyPayoutResult {
  payout: CompanyPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateFailure: boolean;
}

export interface CompleteCompanyPayoutInput {
  payoutId: string;
  processor: string;
  processorPayoutId?: string;
  completedAt?: Date;
}

export interface CompleteCompanyPayoutResult {
  payout: CompanyPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateCompletion: boolean;
}

export interface CancelCompanyPayoutInput {
  payoutId: string;
  cancelledAt?: Date;
}

export interface CancelCompanyPayoutResult {
  payout: CompanyPayoutRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateCancellation: boolean;
}

export interface MarkWalletTopupPendingInput {
  walletTopupId: string;
  processorTopupId: string;
  updatedAt?: Date;
}

export interface MarkWalletTopupTerminalInput {
  walletTopupId: string;
  status: 'failed' | 'cancelled';
  updatedAt?: Date;
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

export interface RefundWalletTopupInput {
  walletTopupId: string;
  refundedAt?: Date;
}

export interface RefundWalletTopupResult {
  topup: WalletTopupRecord;
  ledgerTransaction: LedgerTransaction;
  duplicateRefund: boolean;
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
  companyProfitAvailableCents: number;
  companyPayoutPendingCents: number;
  externalAdjustmentReviewCents: number;
  externalAdjustmentReviewCount: number;
  driverPayableCents: number;
  driverPayoutPendingCents: number;
  driverCashCommissionDebtCents: number;
  rideEscrowCents: number;
  passengerWalletCents: number;
  payoutsRequested: number;
  payoutsRequestedCents: number;
}

export interface DriverPayoutPeriodSummary {
  requestedCents: number;
  paidCents: number;
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
  recordExternalPaymentAdjustment(
    input: RecordExternalPaymentAdjustmentInput,
  ): Promise<RecordExternalPaymentAdjustmentResult>;
  listRecentExternalPaymentAdjustments(
    limit: number,
  ): Promise<ExternalPaymentAdjustmentRecord[]>;

  findWalletTopupById(id: string): Promise<WalletTopupRecord | null>;
  listWalletTopups(
    passengerId: string,
    limit: number,
  ): Promise<WalletTopupRecord[]>;
  findWalletTopupByIdempotencyKey(
    key: string,
  ): Promise<WalletTopupRecord | null>;
  createWalletTopup(topup: WalletTopupRecord): Promise<WalletTopupRecord>;
  markWalletTopupPending(
    input: MarkWalletTopupPendingInput,
  ): Promise<WalletTopupRecord>;
  markWalletTopupTerminal(
    input: MarkWalletTopupTerminalInput,
  ): Promise<WalletTopupRecord>;
  captureWalletTopup(
    input: CaptureWalletTopupInput,
  ): Promise<CaptureWalletTopupResult>;
  refundWalletTopup(
    input: RefundWalletTopupInput,
  ): Promise<RefundWalletTopupResult>;
  payRideFromWallet(
    input: PayRideFromWalletInput,
  ): Promise<PayRideFromWalletResult>;
  refundWalletRide(
    input: RefundWalletRideInput,
  ): Promise<RefundWalletRideResult>;

  fundRidePromotion(
    input: FundRidePromotionInput,
  ): Promise<PromotionLedgerResult>;
  grantWalletPromotion(
    input: GrantWalletPromotionInput,
  ): Promise<PromotionLedgerResult>;

  settleRide(input: SettleRideInput): Promise<SettleRideResult>;
  settleCashRide(
    input: SettleCashRideInput,
  ): Promise<SettleCashRideResult>;
  reserveDriverPayout(
    payout: DriverPayoutRecord,
  ): Promise<ReserveDriverPayoutResult>;
  findDriverPayoutById(id: string): Promise<DriverPayoutRecord | null>;
  approveDriverPayout(
    input: ApproveDriverPayoutInput,
  ): Promise<ApproveDriverPayoutResult>;
  listDriverPayoutsByStatus(
    statuses: readonly DriverPayoutRecord['status'][],
    limit: number,
  ): Promise<DriverPayoutRecord[]>;
  startDriverPayout(
    input: StartDriverPayoutInput,
  ): Promise<StartDriverPayoutResult>;
  failDriverPayout(
    input: FailDriverPayoutInput,
  ): Promise<FailDriverPayoutResult>;
  completeDriverPayout(
    input: CompleteDriverPayoutInput,
  ): Promise<CompleteDriverPayoutResult>;
  cancelDriverPayout(
    input: CancelDriverPayoutInput,
  ): Promise<CancelDriverPayoutResult>;
  getDriverPayoutDestination(
    driverId: string,
  ): Promise<DriverPayoutDestination | null>;
  upsertDriverPayoutDestination(
    destination: DriverPayoutDestination,
  ): Promise<DriverPayoutDestination>;
  getDriverPayoutSettings(): Promise<DriverPayoutSettings>;
  setDriverPayoutAutomaticEnabled(
    input: SetDriverPayoutAutomaticEnabledInput,
  ): Promise<DriverPayoutSettings>;
  listDriverPayoutCandidates(
    limit: number,
  ): Promise<DriverPayoutCandidate[]>;

  reserveCompanyPayout(
    payout: CompanyPayoutRecord,
  ): Promise<ReserveCompanyPayoutResult>;
  findCompanyPayoutById(id: string): Promise<CompanyPayoutRecord | null>;
  listCompanyPayoutsByStatus(
    statuses: readonly CompanyPayoutRecord['status'][],
    limit: number,
  ): Promise<CompanyPayoutRecord[]>;
  startCompanyPayout(
    input: StartCompanyPayoutInput,
  ): Promise<StartCompanyPayoutResult>;
  failCompanyPayout(
    input: FailCompanyPayoutInput,
  ): Promise<FailCompanyPayoutResult>;
  completeCompanyPayout(
    input: CompleteCompanyPayoutInput,
  ): Promise<CompleteCompanyPayoutResult>;
  cancelCompanyPayout(
    input: CancelCompanyPayoutInput,
  ): Promise<CancelCompanyPayoutResult>;
  getCompanyPayoutDestination(): Promise<CompanyPayoutDestination | null>;
  upsertCompanyPayoutDestination(
    destination: CompanyPayoutDestination,
  ): Promise<CompanyPayoutDestination>;
  listRecentCompanyPayouts(limit: number): Promise<CompanyPayoutRecord[]>;

  getAccountBalanceCents(accountKey: string): Promise<number>;
  getDriverCashDebtCents(driverId: string): Promise<number>;
  adminFinanceSummary(): Promise<AdminFinanceSummary>;
  listRecentPayments(limit: number): Promise<PaymentRecord[]>;
  listRecentDriverPayouts(limit: number): Promise<DriverPayoutRecord[]>;
  getDriverPayoutPeriodSummary(
    driverId: string,
    from?: string,
    to?: string,
  ): Promise<DriverPayoutPeriodSummary>;
  listLedgerTransactionsForAccounts(
    accountKeys: readonly string[],
    limit: number,
  ): Promise<LedgerTransaction[]>;
}
