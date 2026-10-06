import { randomUUID } from 'node:crypto';

import {
  cashRideCommissionDebtLedger,
  companyPayoutCancelledLedger,
  companyPayoutFailedLedger,
  companyPayoutPaidLedger,
  companyPayoutReserveLedger,
  driverPayoutReserveLedger,
  driverPayoutAnticipationFeeLedger,
  driverPayoutPaidLedger,
  driverPayoutCancelledLedger,
  driverPayoutFailedLedger,
  externalPaymentAdjustmentLedger,
  externalRideRefundLedger,
  paymentCaptureLedger,
  ridePromotionFundingLedger,
  ridePromotionFundingReversalLedger,
  walletPromotionGrantLedger,
  rideSettlementLedger,
  walletRidePaymentLedger,
  walletRideRefundLedger,
  walletTopupCaptureLedger,
  walletTopupRefundLedger,
  type LedgerTransaction,
} from '../ledger.js';
import {
  type AdminFinanceSummary,
  type ApproveDriverPayoutInput,
  type ApproveDriverPayoutResult,
  type CancelCompanyPayoutInput,
  type CancelCompanyPayoutResult,
  type CancelDriverPayoutInput,
  type CancelDriverPayoutResult,
  type CapturePaymentInput,
  type CapturePaymentResult,
  type CompleteCompanyPayoutInput,
  type CompleteCompanyPayoutResult,
  type CompleteDriverPayoutInput,
  type CompleteDriverPayoutResult,
  type FailCompanyPayoutInput,
  type FailCompanyPayoutResult,
  type FailDriverPayoutInput,
  type FailDriverPayoutResult,
  type FundRidePromotionInput,
  type GrantWalletPromotionInput,
  type PromotionLedgerResult,
  type ReverseRidePromotionInput,
  type MarkPaymentPendingInput,
  type MarkPaymentTerminalInput,
  type MarkWalletTopupPendingInput,
  type MarkWalletTopupTerminalInput,
  type RecordExternalPaymentAdjustmentInput,
  type RecordExternalPaymentAdjustmentResult,
  type RefundExternalPaymentInput,
  type RefundExternalPaymentResult,
  type RefundWalletTopupInput,
  type RefundWalletTopupResult,
  type CaptureWalletTopupInput,
  type CaptureWalletTopupResult,
  type DriverPayoutCandidate,
  type FinanceRepository,
  type PayRideFromWalletInput,
  type PayRideFromWalletResult,
  type RefundWalletRideInput,
  type RefundWalletRideResult,
  type ReserveCompanyPayoutResult,
  type ReserveDriverPayoutResult,
  type SettleCashRideInput,
  type SettleCashRideResult,
  type SettleRideInput,
  type SettleRideResult,
  type SetDriverPayoutAutomaticEnabledInput,
  type StartCompanyPayoutInput,
  type StartCompanyPayoutResult,
  type StartDriverPayoutInput,
  type StartDriverPayoutResult,
} from '../finance-repository.js';
import {
  CompanyPayoutError,
  type CompanyPayoutDestination,
  type CompanyPayoutRecord,
} from '../company-payout.js';
import {
  ExternalPaymentAdjustmentError,
  type ExternalPaymentAdjustmentRecord,
} from '../external-payment-adjustment.js';
import { transitionPayment } from '../payment-state.js';
import { PaymentDomainError, type PaymentRecord } from '../payment.js';
import {
  PayoutDomainError,
  payoutFeeCents,
  payoutRequestedAmountCents,
  payoutRequiresAdminApproval,
  type DriverPayoutDestination,
  type DriverPayoutRecord,
  type DriverPayoutSettings,
} from '../payout.js';
import {
  WalletDomainError,
  type WalletTopupRecord,
} from '../wallet.js';

export class InMemoryFinanceRepository implements FinanceRepository {
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly idempotencyIndex = new Map<string, string>();

  private readonly walletTopups = new Map<string, WalletTopupRecord>();
  private readonly walletTopupIdempotencyIndex = new Map<string, string>();
  private readonly processedTopupEvents = new Map<
    string,
    { topupId: string; ledger: LedgerTransaction }
  >();

  private readonly payouts = new Map<string, DriverPayoutRecord>();
  private readonly payoutIdempotencyIndex = new Map<string, string>();
  private readonly payoutDestinations =
      new Map<string, DriverPayoutDestination>();
  private readonly companyPayouts =
      new Map<string, CompanyPayoutRecord>();
  private readonly companyPayoutIdempotencyIndex =
      new Map<string, string>();
  private companyPayoutDestination: CompanyPayoutDestination | null = null;
  private payoutSettings: DriverPayoutSettings = {
    automaticEnabled: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };

  private readonly externalAdjustments =
      new Map<string, ExternalPaymentAdjustmentRecord>();
  private readonly ledgerByReference = new Map<string, LedgerTransaction>();
  private readonly processedEvents = new Map<
    string,
    { paymentId: string; ledger: ReturnType<typeof paymentCaptureLedger> }
  >();

  async findPaymentById(id: string): Promise<PaymentRecord | null> {
    const payment = this.payments.get(id);
    return payment == null ? null : structuredClone(payment);
  }

  async findLatestPaymentByRideId(
    rideId: string,
  ): Promise<PaymentRecord | null> {
    const payments = [...this.payments.values()]
      .filter((payment) => payment.rideId === rideId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return payments[0] == null ? null : structuredClone(payments[0]);
  }

  async findPaidPaymentByRideId(
    rideId: string,
  ): Promise<PaymentRecord | null> {
    const payments = [...this.payments.values()]
      .filter(
        (payment) =>
          payment.rideId === rideId && payment.status === 'paid',
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return payments[0] == null ? null : structuredClone(payments[0]);
  }

  async findPaymentByIdempotencyKey(
    key: string,
  ): Promise<PaymentRecord | null> {
    const id = this.idempotencyIndex.get(key);
    return id == null ? null : this.findPaymentById(id);
  }

  async createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
    if (
      this.payments.has(payment.id) ||
      this.idempotencyIndex.has(payment.idempotencyKey)
    ) {
      throw new PaymentDomainError(
        'IDEMPOTENCY_CONFLICT',
        'Pagamento duplicado.',
      );
    }

    this.payments.set(payment.id, structuredClone(payment));
    this.idempotencyIndex.set(payment.idempotencyKey, payment.id);
    return structuredClone(payment);
  }

  async markPaymentPending(
    input: MarkPaymentPendingInput,
  ): Promise<PaymentRecord> {
    const payment = this.payments.get(input.paymentId);
    if (payment == null) {
      throw new PaymentDomainError(
        'PAYMENT_NOT_FOUND',
        'Pagamento não encontrado.',
      );
    }

    if (payment.status === 'pending') {
      return structuredClone(payment);
    }

    let status: PaymentRecord['status'];
    try {
      status = transitionPayment(payment.status, 'pending');
    } catch {
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        `Pagamento em estado ${payment.status} não pode ficar pendente.`,
      );
    }

    const updated: PaymentRecord = {
      ...payment,
      status,
      processorPaymentId: input.processorPaymentId,
      updatedAt: (input.pendingAt ?? new Date()).toISOString(),
    };
    this.payments.set(payment.id, structuredClone(updated));
    return structuredClone(updated);
  }

  async markPaymentTerminal(
    input: MarkPaymentTerminalInput,
  ): Promise<PaymentRecord> {
    const payment = this.payments.get(input.paymentId);
    if (payment == null) {
      throw new PaymentDomainError(
        'PAYMENT_NOT_FOUND',
        'Pagamento não encontrado.',
      );
    }

    if (payment.status === input.status) {
      return structuredClone(payment);
    }

    let status: PaymentRecord['status'];
    try {
      status = transitionPayment(payment.status, input.status);
    } catch {
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        `Pagamento em estado ${payment.status} não pode ir para ${input.status}.`,
      );
    }

    const updated = {
      ...payment,
      status,
      updatedAt: (input.updatedAt ?? new Date()).toISOString(),
    };
    this.payments.set(payment.id, structuredClone(updated));
    return structuredClone(updated);
  }

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentResult> {
    const payment = this.payments.get(input.paymentId);
    if (payment == null) {
      throw new PaymentDomainError(
        'PAYMENT_NOT_FOUND',
        'Pagamento não encontrado.',
      );
    }

    const eventKey = `${payment.processor}:${input.processorEventId}`;
    const existingEvent = this.processedEvents.get(eventKey);
    if (existingEvent != null) {
      if (existingEvent.paymentId !== input.paymentId) {
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Evento do processador já foi usado em outro pagamento.',
        );
      }

      const stored = this.payments.get(existingEvent.paymentId);
      if (stored == null) {
        throw new Error('Evento aponta para pagamento inexistente.');
      }

      return {
        payment: structuredClone(stored),
        ledgerTransaction: structuredClone(existingEvent.ledger),
        duplicateEvent: true,
      };
    }

    const paidForRide = [...this.payments.values()].find(
      (candidate) =>
        candidate.rideId === payment.rideId &&
        candidate.status === 'paid' &&
        candidate.id !== payment.id,
    );
    if (paidForRide != null) {
      throw new PaymentDomainError(
        'RIDE_ALREADY_PAID',
        'Esta corrida já possui outro pagamento confirmado.',
      );
    }

    let nextStatus: PaymentRecord['status'];
    try {
      nextStatus = payment.status === 'authorized'
          ? transitionPayment('authorized', 'paid')
          : transitionPayment(payment.status, 'paid');
    } catch {
      if (payment.status === 'paid') {
        throw new PaymentDomainError(
          'INVALID_PAYMENT_TRANSITION',
          'Pagamento já foi capturado por outro evento.',
        );
      }
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        `Pagamento em estado ${payment.status} não pode ser capturado.`,
      );
    }

    const capturedAt = (input.capturedAt ?? new Date()).toISOString();
    const updated: PaymentRecord = {
      ...payment,
      status: nextStatus,
      ...(input.processorPaymentId != null
        ? { processorPaymentId: input.processorPaymentId }
        : {}),
      updatedAt: capturedAt,
    };

    const ledger = paymentCaptureLedger({
      rideId: payment.rideId,
      paymentId: payment.id,
      processor: payment.processor,
      processorEventId: input.processorEventId,
      amountCents: payment.amountCents,
      createdAt: capturedAt,
    });

    this.payments.set(payment.id, structuredClone(updated));
    this.processedEvents.set(eventKey, {
      paymentId: payment.id,
      ledger: structuredClone(ledger),
    });
    this.ledgerByReference.set(ledger.referenceKey, structuredClone(ledger));

    return {
      payment: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateEvent: false,
    };
  }

  async refundExternalPayment(
    input: RefundExternalPaymentInput,
  ): Promise<RefundExternalPaymentResult> {
    const payment = this.payments.get(input.paymentId);
    if (payment == null) {
      throw new PaymentDomainError(
        'PAYMENT_NOT_FOUND',
        'Pagamento não encontrado.',
      );
    }

    const referenceKey = `external-ride-refund:${payment.id}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      const stored = this.payments.get(payment.id) ?? payment;
      return {
        payment: structuredClone(stored),
        ledgerTransaction: structuredClone(existing),
        duplicateRefund: true,
      };
    }

    if (payment.status !== 'paid') {
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        `Pagamento em estado ${payment.status} não pode ser estornado externamente.`,
      );
    }

    const alreadyAdjustedCents = [
      ...this.externalAdjustments.values(),
    ]
      .filter(
        (adjustment) =>
          adjustment.paymentId === payment.id &&
          adjustment.kind === 'partial_refund' &&
          adjustment.accountingStatus !== 'observed',
      )
      .reduce(
        (sum, adjustment) =>
          sum +
          adjustment.escrowAppliedCents +
          adjustment.reviewRequiredCents,
        0,
      );
    const remainingRefundCents =
      payment.amountCents - alreadyAdjustedCents;
    if (remainingRefundCents <= 0) {
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        'Pagamento já foi integralmente ajustado por refunds anteriores.',
      );
    }

    const escrowAccount = `ride:${payment.rideId}:escrow`;
    const escrowBalance = Math.max(
      0,
      await this.getAccountBalanceCents(escrowAccount),
    );
    const escrowAppliedCents = Math.min(
      escrowBalance,
      remainingRefundCents,
    );
    const reviewRequiredCents =
      remainingRefundCents - escrowAppliedCents;

    const refundedAt = (input.refundedAt ?? new Date()).toISOString();
    const updated = {
      ...payment,
      status: transitionPayment(payment.status, 'refunded'),
      updatedAt: refundedAt,
    };
    const ledger = externalRideRefundLedger({
      rideId: payment.rideId,
      paymentId: payment.id,
      processor: payment.processor,
      amountCents: remainingRefundCents,
      escrowAppliedCents,
      reviewRequiredCents,
      createdAt: refundedAt,
    });

    this.payments.set(payment.id, structuredClone(updated));
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));

    return {
      payment: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateRefund: false,
    };
  }

  async recordExternalPaymentAdjustment(
    input: RecordExternalPaymentAdjustmentInput,
  ): Promise<RecordExternalPaymentAdjustmentResult> {
    const payment = this.payments.get(input.paymentId);
    if (payment == null) {
      throw new ExternalPaymentAdjustmentError(
        'PAYMENT_NOT_FOUND',
        'Pagamento não encontrado para ajuste externo.',
      );
    }
    if (
      payment.processor !== 'mercado-pago-orders' ||
      payment.status !== 'paid'
    ) {
      throw new ExternalPaymentAdjustmentError(
        'PAYMENT_ADJUSTMENT_MISMATCH',
        'Pagamento não está elegível para ajuste externo.',
      );
    }
    if (
      !Number.isInteger(input.amountCents) ||
      input.amountCents <= 0
    ) {
      throw new ExternalPaymentAdjustmentError(
        'INVALID_ADJUSTMENT_AMOUNT',
        'Valor do ajuste externo é inválido.',
      );
    }

    const key =
      `${payment.processor}:${input.processorAdjustmentId.trim()}`;
    if (input.processorAdjustmentId.trim().length < 3) {
      throw new ExternalPaymentAdjustmentError(
        'PAYMENT_ADJUSTMENT_MISMATCH',
        'Identificador do ajuste externo é inválido.',
      );
    }

    const existing = this.externalAdjustments.get(key);
    if (existing != null) {
      if (
        existing.paymentId !== payment.id ||
        existing.kind !== input.kind ||
        existing.amountCents !== input.amountCents
      ) {
        throw new ExternalPaymentAdjustmentError(
          'PAYMENT_ADJUSTMENT_MISMATCH',
          'Ajuste externo já pertence a outro pagamento ou valor.',
        );
      }

      if (
        input.applyToAccounting &&
        existing.accountingStatus === 'observed'
      ) {
        const escrowAccount = `ride:${payment.rideId}:escrow`;
        const availableEscrow = Math.max(
          0,
          await this.getAccountBalanceCents(escrowAccount),
        );
        const escrowAppliedCents = Math.min(
          availableEscrow,
          existing.amountCents,
        );
        const reviewRequiredCents =
          existing.amountCents - escrowAppliedCents;
        const appliedAt =
          (input.observedAt ?? new Date()).toISOString();
        const ledger = externalPaymentAdjustmentLedger({
          rideId: payment.rideId,
          paymentId: payment.id,
          processor: payment.processor,
          processorAdjustmentId: existing.processorAdjustmentId,
          escrowAppliedCents,
          reviewRequiredCents,
          createdAt: appliedAt,
        });
        const updated: ExternalPaymentAdjustmentRecord = {
          ...existing,
          processorStatus: input.processorStatus,
          processorStatusDetail: input.processorStatusDetail,
          escrowAppliedCents,
          reviewRequiredCents,
          accountingStatus:
            reviewRequiredCents > 0
              ? 'review_required'
              : 'applied_to_escrow',
          updatedAt: appliedAt,
        };
        this.externalAdjustments.set(key, structuredClone(updated));
        this.ledgerByReference.set(
          ledger.referenceKey,
          structuredClone(ledger),
        );
        return {
          adjustment: structuredClone(updated),
          ledgerTransaction: structuredClone(ledger),
          duplicateAdjustment: true,
        };
      }

      const updated: ExternalPaymentAdjustmentRecord = {
        ...existing,
        processorStatus: input.processorStatus,
        processorStatusDetail: input.processorStatusDetail,
        updatedAt: (input.observedAt ?? new Date()).toISOString(),
      };
      this.externalAdjustments.set(key, structuredClone(updated));
      const ledger = this.ledgerByReference.get(
        `external-adjustment:${payment.processor}:${existing.processorAdjustmentId}`,
      );
      return {
        adjustment: structuredClone(updated),
        ...(ledger == null
          ? {}
          : { ledgerTransaction: structuredClone(ledger) }),
        duplicateAdjustment: true,
      };
    }

    if (input.kind === 'partial_refund') {
      const existingRefundedCents = [...this.externalAdjustments.values()]
        .filter(
          (item) =>
            item.paymentId === payment.id &&
            item.kind === 'partial_refund',
        )
        .reduce((sum, item) => sum + item.amountCents, 0);
      if (existingRefundedCents + input.amountCents > payment.amountCents) {
        throw new ExternalPaymentAdjustmentError(
          'ADJUSTMENT_EXCEEDS_PAYMENT',
          'Reembolsos parciais acumulados ultrapassam o pagamento.',
        );
      }
    }

    const instant = (input.observedAt ?? new Date()).toISOString();
    let escrowAppliedCents = 0;
    let reviewRequiredCents = 0;
    let accountingStatus:
      ExternalPaymentAdjustmentRecord['accountingStatus'] = 'observed';
    let ledger: LedgerTransaction | undefined;

    if (input.applyToAccounting) {
      const escrowAccount = `ride:${payment.rideId}:escrow`;
      const availableEscrow = Math.max(
        0,
        await this.getAccountBalanceCents(escrowAccount),
      );
      escrowAppliedCents = Math.min(
        availableEscrow,
        input.amountCents,
      );
      reviewRequiredCents =
        input.amountCents - escrowAppliedCents;
      ledger = externalPaymentAdjustmentLedger({
        rideId: payment.rideId,
        paymentId: payment.id,
        processor: payment.processor,
        processorAdjustmentId: input.processorAdjustmentId.trim(),
        escrowAppliedCents,
        reviewRequiredCents,
        createdAt: instant,
      });
      accountingStatus =
        reviewRequiredCents > 0
          ? 'review_required'
          : 'applied_to_escrow';
    }

    const adjustment: ExternalPaymentAdjustmentRecord = {
      id: randomUUID(),
      paymentId: payment.id,
      processor: payment.processor,
      processorAdjustmentId: input.processorAdjustmentId.trim(),
      kind: input.kind,
      processorStatus: input.processorStatus,
      processorStatusDetail: input.processorStatusDetail,
      amountCents: input.amountCents,
      escrowAppliedCents,
      reviewRequiredCents,
      accountingStatus,
      createdAt: instant,
      updatedAt: instant,
    };
    this.externalAdjustments.set(key, structuredClone(adjustment));
    if (ledger != null) {
      this.ledgerByReference.set(
        ledger.referenceKey,
        structuredClone(ledger),
      );
    }

    return {
      adjustment: structuredClone(adjustment),
      ...(ledger == null
        ? {}
        : { ledgerTransaction: structuredClone(ledger) }),
      duplicateAdjustment: false,
    };
  }

  async listRecentExternalPaymentAdjustments(
    limit: number,
  ): Promise<ExternalPaymentAdjustmentRecord[]> {
    return [...this.externalAdjustments.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((item) => structuredClone(item));
  }

  async listWalletTopups(
    passengerId: string,
    limit: number,
  ): Promise<WalletTopupRecord[]> {
    return [...this.walletTopups.values()]
      .filter((topup) => topup.passengerId === passengerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((topup) => structuredClone(topup));
  }

  async findWalletTopupById(
    id: string,
  ): Promise<WalletTopupRecord | null> {
    const topup = this.walletTopups.get(id);
    return topup == null ? null : structuredClone(topup);
  }

  async findWalletTopupByIdempotencyKey(
    key: string,
  ): Promise<WalletTopupRecord | null> {
    const id = this.walletTopupIdempotencyIndex.get(key);
    const topup = id == null ? null : this.walletTopups.get(id);
    return topup == null ? null : structuredClone(topup);
  }

  async createWalletTopup(
    topup: WalletTopupRecord,
  ): Promise<WalletTopupRecord> {
    if (
      this.walletTopups.has(topup.id) ||
      this.walletTopupIdempotencyIndex.has(topup.idempotencyKey)
    ) {
      throw new WalletDomainError(
        'WALLET_IDEMPOTENCY_CONFLICT',
        'Recarga duplicada.',
      );
    }

    this.walletTopups.set(topup.id, structuredClone(topup));
    this.walletTopupIdempotencyIndex.set(
      topup.idempotencyKey,
      topup.id,
    );
    return structuredClone(topup);
  }

  async markWalletTopupPending(
    input: MarkWalletTopupPendingInput,
  ): Promise<WalletTopupRecord> {
    const topup = this.walletTopups.get(input.walletTopupId);
    if (topup == null) {
      throw new WalletDomainError(
        'WALLET_TOPUP_NOT_FOUND',
        'Recarga não encontrada.',
      );
    }
    if (
      topup.status === 'paid' ||
      topup.status === 'refunded' ||
      topup.status === 'failed' ||
      topup.status === 'cancelled'
    ) {
      throw new WalletDomainError(
        'INVALID_TOPUP_TRANSITION',
        `Recarga em estado ${topup.status} não pode voltar para pendente.`,
      );
    }

    const updated: WalletTopupRecord = {
      ...topup,
      status: 'pending',
      processorTopupId: input.processorTopupId,
      updatedAt: (input.updatedAt ?? new Date()).toISOString(),
    };
    this.walletTopups.set(topup.id, structuredClone(updated));
    return structuredClone(updated);
  }

  async markWalletTopupTerminal(
    input: MarkWalletTopupTerminalInput,
  ): Promise<WalletTopupRecord> {
    const topup = this.walletTopups.get(input.walletTopupId);
    if (topup == null) {
      throw new WalletDomainError(
        'WALLET_TOPUP_NOT_FOUND',
        'Recarga não encontrada.',
      );
    }
    if (topup.status === input.status) return structuredClone(topup);
    if (topup.status === 'paid' || topup.status === 'refunded') {
      throw new WalletDomainError(
        'INVALID_TOPUP_TRANSITION',
        `Recarga em estado ${topup.status} não pode ser encerrada como ${input.status}.`,
      );
    }
    const updated: WalletTopupRecord = {
      ...topup,
      status: input.status,
      updatedAt: (input.updatedAt ?? new Date()).toISOString(),
    };
    this.walletTopups.set(topup.id, structuredClone(updated));
    return structuredClone(updated);
  }

  async captureWalletTopup(
    input: CaptureWalletTopupInput,
  ): Promise<CaptureWalletTopupResult> {
    const topup = this.walletTopups.get(input.walletTopupId);
    if (topup == null) {
      throw new WalletDomainError(
        'WALLET_TOPUP_NOT_FOUND',
        'Recarga não encontrada.',
      );
    }

    const eventKey = `${topup.processor}:${input.processorEventId}`;
    const existing = this.processedTopupEvents.get(eventKey);
    if (existing != null) {
      if (existing.topupId !== input.walletTopupId) {
        throw new WalletDomainError(
          'WALLET_IDEMPOTENCY_CONFLICT',
          'Evento do processador já foi usado em outra recarga.',
        );
      }

      const stored = this.walletTopups.get(existing.topupId);
      if (stored == null) {
        throw new Error('Evento de recarga aponta para registro inexistente.');
      }

      return {
        topup: structuredClone(stored),
        ledgerTransaction: structuredClone(existing.ledger),
        duplicateEvent: true,
      };
    }

    let nextStatus: WalletTopupRecord['status'];
    try {
      nextStatus = topup.status === 'authorized'
          ? transitionPayment('authorized', 'paid')
          : transitionPayment(topup.status, 'paid');
    } catch {
      throw new WalletDomainError(
        'INVALID_TOPUP_TRANSITION',
        `Recarga em estado ${topup.status} não pode ser capturada.`,
      );
    }

    const capturedAt = (input.capturedAt ?? new Date()).toISOString();
    const updated: WalletTopupRecord = {
      ...topup,
      status: nextStatus,
      ...(input.processorTopupId != null
        ? { processorTopupId: input.processorTopupId }
        : {}),
      updatedAt: capturedAt,
    };

    const ledger = walletTopupCaptureLedger({
      walletTopupId: topup.id,
      passengerId: topup.passengerId,
      processor: topup.processor,
      processorEventId: input.processorEventId,
      amountCents: topup.amountCents,
      createdAt: capturedAt,
    });

    this.walletTopups.set(topup.id, structuredClone(updated));
    this.processedTopupEvents.set(eventKey, {
      topupId: topup.id,
      ledger: structuredClone(ledger),
    });
    this.ledgerByReference.set(ledger.referenceKey, structuredClone(ledger));

    return {
      topup: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateEvent: false,
    };
  }

  async refundWalletTopup(
    input: RefundWalletTopupInput,
  ): Promise<RefundWalletTopupResult> {
    const topup = this.walletTopups.get(input.walletTopupId);
    if (topup == null) {
      throw new WalletDomainError(
        'WALLET_TOPUP_NOT_FOUND',
        'Recarga não encontrada.',
      );
    }

    const referenceKey = `wallet-topup-refund:${topup.id}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      const stored = this.walletTopups.get(topup.id) ?? topup;
      return {
        topup: structuredClone(stored),
        ledgerTransaction: structuredClone(existing),
        duplicateRefund: true,
      };
    }

    if (topup.status !== 'paid') {
      throw new WalletDomainError(
        'INVALID_TOPUP_TRANSITION',
        `Recarga em estado ${topup.status} não pode ser estornada.`,
      );
    }

    const refundedAt = (input.refundedAt ?? new Date()).toISOString();
    const updated: WalletTopupRecord = {
      ...topup,
      status: 'refunded',
      updatedAt: refundedAt,
    };
    const ledger = walletTopupRefundLedger({
      walletTopupId: topup.id,
      passengerId: topup.passengerId,
      processor: topup.processor,
      amountCents: topup.amountCents,
      createdAt: refundedAt,
    });

    this.walletTopups.set(topup.id, structuredClone(updated));
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));

    return {
      topup: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateRefund: false,
    };
  }

  async payRideFromWallet(
    input: PayRideFromWalletInput,
  ): Promise<PayRideFromWalletResult> {
    const existingId = this.idempotencyIndex.get(
      input.payment.idempotencyKey,
    );

    if (existingId != null) {
      const existing = this.payments.get(existingId);
      if (existing == null) {
        throw new Error('Índice de pagamento aponta para registro inexistente.');
      }

      if (
        existing.rideId !== input.payment.rideId ||
        existing.amountCents !== input.payment.amountCents ||
        existing.method !== 'wallet'
      ) {
        throw new WalletDomainError(
          'WALLET_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência já usada em outro pagamento.',
        );
      }

      const ledger = this.ledgerByReference.get(
        `wallet-ride-payment:${existing.id}`,
      );
      if (ledger == null) {
        throw new Error('Pagamento de carteira sem lançamento no ledger.');
      }

      return {
        payment: structuredClone(existing),
        ledgerTransaction: structuredClone(ledger),
        duplicatePayment: true,
      };
    }

    const paidForRide = [...this.payments.values()].find(
      (candidate) =>
        candidate.rideId === input.payment.rideId &&
        candidate.status === 'paid',
    );
    if (paidForRide != null) {
      throw new WalletDomainError(
        'RIDE_ALREADY_PAID',
        'Esta corrida já possui pagamento confirmado.',
      );
    }

    const accountKey = `passenger:${input.passengerId}:wallet`;
    const available = await this.getAccountBalanceCents(accountKey);

    if (input.payment.amountCents > available) {
      throw new WalletDomainError(
        'INSUFFICIENT_WALLET_BALANCE',
        'Saldo da Carteira Ramo Nessa insuficiente.',
      );
    }

    const ledger = walletRidePaymentLedger({
      rideId: input.payment.rideId,
      paymentId: input.payment.id,
      passengerId: input.passengerId,
      amountCents: input.payment.amountCents,
      createdAt: input.payment.createdAt,
    });

    this.payments.set(input.payment.id, structuredClone(input.payment));
    this.idempotencyIndex.set(
      input.payment.idempotencyKey,
      input.payment.id,
    );
    this.ledgerByReference.set(ledger.referenceKey, structuredClone(ledger));

    return {
      payment: structuredClone(input.payment),
      ledgerTransaction: structuredClone(ledger),
      duplicatePayment: false,
    };
  }

  async refundWalletRide(
    input: RefundWalletRideInput,
  ): Promise<RefundWalletRideResult> {
    const payment = this.payments.get(input.paymentId);
    if (
      payment == null ||
      payment.method !== 'wallet'
    ) {
      throw new WalletDomainError(
        'WALLET_REFUND_NOT_ALLOWED',
        'Pagamento de carteira não encontrado para estorno.',
      );
    }

    const referenceKey = `wallet-ride-refund:${payment.id}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      const stored = this.payments.get(payment.id);
      if (stored?.status !== 'refunded') {
        throw new Error('Estorno no ledger sem pagamento marcado como refunded.');
      }

      return {
        payment: structuredClone(stored),
        ledgerTransaction: structuredClone(existing),
        duplicateRefund: true,
      };
    }

    if (payment.status !== 'paid') {
      throw new WalletDomainError(
        'WALLET_REFUND_NOT_ALLOWED',
        `Pagamento em estado ${payment.status} não pode ser estornado.`,
      );
    }

    const escrowAccount = `ride:${payment.rideId}:escrow`;
    const escrowBalance = await this.getAccountBalanceCents(escrowAccount);
    if (escrowBalance < payment.amountCents) {
      throw new WalletDomainError(
        'INSUFFICIENT_RIDE_ESCROW',
        'Escrow da corrida não possui saldo suficiente para o estorno.',
      );
    }

    const refundedAt = (input.refundedAt ?? new Date()).toISOString();
    const updated: PaymentRecord = {
      ...payment,
      status: transitionPayment(payment.status, 'refunded'),
      updatedAt: refundedAt,
    };
    const ledger = walletRideRefundLedger({
      rideId: payment.rideId,
      paymentId: payment.id,
      passengerId: input.passengerId,
      amountCents: payment.amountCents,
      createdAt: refundedAt,
    });

    this.payments.set(payment.id, structuredClone(updated));
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));

    return {
      payment: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateRefund: false,
    };
  }

  async fundRidePromotion(
    input: FundRidePromotionInput,
  ): Promise<PromotionLedgerResult> {
    const referenceKey = `ride-promotion:${input.applicationId}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      return {
        ledgerTransaction: structuredClone(existing),
        duplicate: true,
      };
    }

    const ledger = ridePromotionFundingLedger({
      rideId: input.rideId,
      applicationId: input.applicationId,
      amountCents: input.amountCents,
      createdAt: (input.fundedAt ?? new Date()).toISOString(),
    });
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));
    return {
      ledgerTransaction: structuredClone(ledger),
      duplicate: false,
    };
  }

  async reverseRidePromotion(
    input: ReverseRidePromotionInput,
  ): Promise<PromotionLedgerResult> {
    const referenceKey =
      `ride-promotion-reversal:${input.applicationId}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      return {
        ledgerTransaction: structuredClone(existing),
        duplicate: true,
      };
    }

    const escrow = await this.getAccountBalanceCents(
      `ride:${input.rideId}:escrow`,
    );
    if (escrow < input.amountCents) {
      throw new PaymentDomainError(
        'INSUFFICIENT_RIDE_ESCROW',
        'Escrow da corrida não possui saldo promocional suficiente.',
      );
    }

    const ledger = ridePromotionFundingReversalLedger({
      rideId: input.rideId,
      applicationId: input.applicationId,
      amountCents: input.amountCents,
      createdAt: (input.reversedAt ?? new Date()).toISOString(),
    });
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));
    return {
      ledgerTransaction: structuredClone(ledger),
      duplicate: false,
    };
  }

  async grantWalletPromotion(
    input: GrantWalletPromotionInput,
  ): Promise<PromotionLedgerResult> {
    const referenceKey = `wallet-promotion:${input.applicationId}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      return {
        ledgerTransaction: structuredClone(existing),
        duplicate: true,
      };
    }

    const ledger = walletPromotionGrantLedger({
      passengerId: input.passengerId,
      applicationId: input.applicationId,
      amountCents: input.amountCents,
      createdAt: (input.grantedAt ?? new Date()).toISOString(),
    });
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));
    return {
      ledgerTransaction: structuredClone(ledger),
      duplicate: false,
    };
  }

  async settleRide(input: SettleRideInput): Promise<SettleRideResult> {
    const payment = this.payments.get(input.paymentId);
    if (
      payment == null ||
      payment.rideId !== input.rideId ||
      payment.status !== 'paid' ||
      payment.amountCents !==
        (input.paymentAmountCents ?? input.totalAmountCents)
    ) {
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        'Pagamento não está pronto para liquidação.',
      );
    }

    const referenceKey = `ride-settlement:${input.rideId}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      const recovered =
        existing.entries.find(
          (entry) =>
            entry.accountKey ===
              `driver:${input.driverId}:commission_debt` &&
            entry.direction === 'credit',
        )?.amountCents ?? 0;
      return {
        ledgerTransaction: structuredClone(existing),
        duplicateSettlement: true,
        cashDebtRecoveredCents: recovered,
      };
    }

    const escrowBalance = await this.getAccountBalanceCents(
      `ride:${input.rideId}:escrow`,
    );
    if (escrowBalance < input.totalAmountCents) {
      throw new PaymentDomainError(
        'INSUFFICIENT_RIDE_ESCROW',
        'Escrow da corrida não possui saldo suficiente para liquidação.',
      );
    }

    const cashDebtCents = await this.getDriverCashDebtCents(
      input.driverId,
    );
    const cashDebtRecoveredCents = input.deferCashDebtRecovery === true ? 0 : Math.min(
      cashDebtCents,
      input.driverNetCents,
    );

    const createdAt = (input.settledAt ?? new Date()).toISOString();
    const ledger = rideSettlementLedger({
      rideId: input.rideId,
      paymentId: input.paymentId,
      driverId: input.driverId,
      totalAmountCents: input.totalAmountCents,
      fareAmountCents:
        input.fareAmountCents ?? input.totalAmountCents,
      paymentAdjustmentCents:
        input.paymentAdjustmentCents ?? 0,
      platformCommissionCents: input.platformCommissionCents,
      driverNetCents: input.driverNetCents,
      cashDebtRecoveryCents: cashDebtRecoveredCents,
      createdAt,
    });

    this.ledgerByReference.set(referenceKey, structuredClone(ledger));

    return {
      ledgerTransaction: structuredClone(ledger),
      duplicateSettlement: false,
      cashDebtRecoveredCents,
    };
  }

  async settleCashRide(
    input: SettleCashRideInput,
  ): Promise<SettleCashRideResult> {
    const referenceKey = `cash-ride-commission:${input.rideId}`;
    const existing = this.ledgerByReference.get(referenceKey);
    if (existing != null) {
      const recovered =
        existing.entries.find(
          (entry) =>
            entry.accountKey ===
              `driver:${input.driverId}:payable` &&
            entry.direction === 'debit',
        )?.amountCents ?? 0;
      return {
        ledgerTransaction: structuredClone(existing),
        duplicateSettlement: true,
        cashCommissionRecoveredFromBalanceCents: recovered,
        cashDebtCents: await this.getDriverCashDebtCents(
          input.driverId,
        ),
      };
    }

    const availablePayable = Math.max(
      0,
      await this.getAccountBalanceCents(
        `driver:${input.driverId}:payable`,
      ),
    );
    const existingDebtCents =
      await this.getDriverCashDebtCents(input.driverId);

    const ledger = cashRideCommissionDebtLedger({
      rideId: input.rideId,
      driverId: input.driverId,
      platformCommissionCents: input.platformCommissionCents,
      existingDebtCents,
      availableDriverPayableCents: availablePayable,
      createdAt: (input.settledAt ?? new Date()).toISOString(),
    });
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));

    const recovered =
      ledger.entries.find(
        (entry) =>
          entry.accountKey ===
            `driver:${input.driverId}:payable` &&
          entry.direction === 'debit',
      )?.amountCents ?? 0;

    return {
      ledgerTransaction: structuredClone(ledger),
      duplicateSettlement: false,
      cashCommissionRecoveredFromBalanceCents: recovered,
      cashDebtCents: await this.getDriverCashDebtCents(input.driverId),
    };
  }

  async getDriverPayoutDestination(
    driverId: string,
  ): Promise<DriverPayoutDestination | null> {
    const destination = this.payoutDestinations.get(driverId);
    return destination == null ? null : structuredClone(destination);
  }

  async upsertDriverPayoutDestination(
    destination: DriverPayoutDestination,
  ): Promise<DriverPayoutDestination> {
    const existing = this.payoutDestinations.get(destination.driverId);
    const stored: DriverPayoutDestination = {
      ...destination,
      createdAt: existing?.createdAt ?? destination.createdAt,
    };
    this.payoutDestinations.set(
      destination.driverId,
      structuredClone(stored),
    );
    return structuredClone(stored);
  }

  async reserveDriverPayout(
    payout: DriverPayoutRecord,
  ): Promise<ReserveDriverPayoutResult> {
    const existingId = this.payoutIdempotencyIndex.get(
      payout.idempotencyKey,
    );

    if (existingId != null) {
      const existing = this.payouts.get(existingId);
      if (existing == null) {
        throw new Error('Índice de saque aponta para registro inexistente.');
      }

      if (
        existing.driverId !== payout.driverId ||
        existing.amountCents !== payout.amountCents
      ) {
        throw new PayoutDomainError(
          'PAYOUT_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência já utilizada em outro saque.',
        );
      }

      const ledger = this.ledgerByReference.get(
        `driver-payout-reserve:${existing.id}`,
      );
      if (ledger == null) {
        throw new Error('Saque idempotente sem lançamento no ledger.');
      }

      return {
        payout: structuredClone(existing),
        ledgerTransaction: structuredClone(ledger),
        duplicateRequest: true,
      };
    }

    const available = await this.getAccountBalanceCents(
      `driver:${payout.driverId}:payable`,
    );
    const requestedAmountCents = payoutRequestedAmountCents(payout);

    if (requestedAmountCents > available) {
      throw new PayoutDomainError(
        'INSUFFICIENT_DRIVER_BALANCE',
        'Saldo disponível insuficiente para o saque.',
      );
    }

    const ledger = driverPayoutReserveLedger({
      payoutId: payout.id,
      driverId: payout.driverId,
      amountCents: requestedAmountCents,
      createdAt: payout.createdAt,
    });

    this.payouts.set(payout.id, structuredClone(payout));
    this.payoutIdempotencyIndex.set(payout.idempotencyKey, payout.id);
    this.ledgerByReference.set(ledger.referenceKey, structuredClone(ledger));

    return {
      payout: structuredClone(payout),
      ledgerTransaction: structuredClone(ledger),
      duplicateRequest: false,
    };
  }

  async findDriverPayoutById(
    id: string,
  ): Promise<DriverPayoutRecord | null> {
    const payout = this.payouts.get(id);
    return payout == null ? null : structuredClone(payout);
  }

  async approveDriverPayout(
    input: ApproveDriverPayoutInput,
  ): Promise<ApproveDriverPayoutResult> {
    const payout = this.payouts.get(input.payoutId);
    if (payout == null) {
      throw new PayoutDomainError('PAYOUT_NOT_FOUND', 'Saque não encontrado.');
    }
    if (payout.approvedAt != null) {
      const existing = this.ledgerByReference.get(
        `driver-payout-anticipation-fee:${payout.id}`,
      );
      return {
        payout: structuredClone(payout),
        ...(existing == null
          ? {}
          : { ledgerTransaction: structuredClone(existing) }),
        duplicateApproval: true,
      };
    }
    if (payout.status !== 'requested') {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        `Saque em estado ${payout.status} não pode ser aprovado.`,
      );
    }

    const approvedAt = (input.approvedAt ?? new Date()).toISOString();
    const feeCents = payoutFeeCents(payout);
    let ledgerTransaction: LedgerTransaction | undefined;
    if (feeCents > 0) {
      const pending = await this.getAccountBalanceCents(
        `driver:${payout.driverId}:payout_pending`,
      );
      if (pending < payoutRequestedAmountCents(payout)) {
        throw new PayoutDomainError(
          'INVALID_PAYOUT_TRANSITION',
          'Saldo reservado não fecha com a antecipação.',
        );
      }
      ledgerTransaction = driverPayoutAnticipationFeeLedger({
        payoutId: payout.id,
        driverId: payout.driverId,
        feeCents,
        createdAt: approvedAt,
      });
      this.ledgerByReference.set(
        ledgerTransaction.referenceKey,
        structuredClone(ledgerTransaction),
      );
    }

    const updated: DriverPayoutRecord = {
      ...payout,
      approvedAt,
      updatedAt: approvedAt,
    };
    this.payouts.set(payout.id, structuredClone(updated));
    return {
      payout: structuredClone(updated),
      ...(ledgerTransaction == null
        ? {}
        : { ledgerTransaction: structuredClone(ledgerTransaction) }),
      duplicateApproval: false,
    };
  }

  async listDriverPayoutsByStatus(
    statuses: readonly DriverPayoutRecord['status'][],
    limit: number,
  ): Promise<DriverPayoutRecord[]> {
    const allowed = new Set(statuses);
    return [...this.payouts.values()]
      .filter((payout) => allowed.has(payout.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((payout) => structuredClone(payout));
  }

  async startDriverPayout(
    input: StartDriverPayoutInput,
  ): Promise<StartDriverPayoutResult> {
    const payout = this.payouts.get(input.payoutId);
    if (payout == null) {
      throw new PayoutDomainError(
        'PAYOUT_NOT_FOUND',
        'Saque não encontrado.',
      );
    }

    if (payoutRequiresAdminApproval(payout)) {
      throw new PayoutDomainError(
        'PAYOUT_APPROVAL_REQUIRED',
        'Antecipação aguarda aprovação administrativa.',
      );
    }

    if (payout.status === 'processing') {
      if (
        payout.processor === input.processor &&
        payout.processorPayoutId === input.processorPayoutId
      ) {
        return {
          payout: structuredClone(payout),
          duplicateStart: true,
        };
      }
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        'Saque já está em processamento por outro repasse.',
      );
    }

    if (payout.status !== 'requested') {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        `Saque em estado ${payout.status} não pode iniciar processamento.`,
      );
    }

    const processor = input.processor.trim();
    const processorPayoutId = input.processorPayoutId.trim();
    if (processor.length < 2 || processorPayoutId.length < 3) {
      throw new PayoutDomainError(
        'PAYOUT_PROCESSOR_REQUIRED',
        'Processador e referência do repasse são obrigatórios.',
      );
    }

    const updated: DriverPayoutRecord = {
      ...payout,
      status: 'processing',
      processor,
      processorPayoutId,
      updatedAt: (input.startedAt ?? new Date()).toISOString(),
    };
    this.payouts.set(payout.id, structuredClone(updated));
    return {
      payout: structuredClone(updated),
      duplicateStart: false,
    };
  }

  async failDriverPayout(
    input: FailDriverPayoutInput,
  ): Promise<FailDriverPayoutResult> {
    const payout = this.payouts.get(input.payoutId);
    if (payout == null) {
      throw new PayoutDomainError(
        'PAYOUT_NOT_FOUND',
        'Saque não encontrado.',
      );
    }

    const referenceKey = `driver-payout-failed:${payout.id}`;
    if (payout.status === 'failed') {
      const existing = this.ledgerByReference.get(referenceKey);
      if (existing == null) {
        throw new Error(
          'Saque falho sem lançamento de devolução no ledger.',
        );
      }
      return {
        payout: structuredClone(payout),
        ledgerTransaction: structuredClone(existing),
        duplicateFailure: true,
      };
    }

    if (payout.status !== 'requested' && payout.status !== 'processing') {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        `Saque em estado ${payout.status} não pode falhar.`,
      );
    }

    const feeApplied =
      payout.approvedAt != null && payoutFeeCents(payout) > 0;
    const expectedPendingCents = feeApplied
      ? payout.amountCents
      : payoutRequestedAmountCents(payout);
    const pending = await this.getAccountBalanceCents(
      `driver:${payout.driverId}:payout_pending`,
    );
    if (pending < expectedPendingCents) {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        'Saldo pendente do saque não fecha com o ledger.',
      );
    }

    const failedAt = (input.failedAt ?? new Date()).toISOString();
    const updated: DriverPayoutRecord = {
      ...payout,
      status: 'failed',
      ...(input.processor?.trim()
        ? { processor: input.processor.trim() }
        : {}),
      ...(input.processorPayoutId?.trim()
        ? { processorPayoutId: input.processorPayoutId.trim() }
        : {}),
      updatedAt: failedAt,
    };
    const feeCents = payoutFeeCents(payout);
    const ledger = driverPayoutFailedLedger({
      payoutId: payout.id,
      driverId: payout.driverId,
      amountCents: payout.amountCents,
      requestedAmountCents: payoutRequestedAmountCents(payout),
      feeCents,
      feeWasApplied: payout.approvedAt != null && feeCents > 0,
      createdAt: failedAt,
    });

    this.payouts.set(payout.id, structuredClone(updated));
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));

    return {
      payout: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateFailure: false,
    };
  }

  async completeDriverPayout(
    input: CompleteDriverPayoutInput,
  ): Promise<CompleteDriverPayoutResult> {
    const payout = this.payouts.get(input.payoutId);
    if (payout == null) {
      throw new PayoutDomainError(
        'PAYOUT_NOT_FOUND',
        'Saque não encontrado.',
      );
    }

    const referenceKey = `driver-payout-paid:${payout.id}`;
    if (payout.status === 'paid') {
      const existing = this.ledgerByReference.get(referenceKey);
      if (existing == null) {
        throw new Error('Saque pago sem lançamento de conclusão no ledger.');
      }
      return {
        payout: structuredClone(payout),
        ledgerTransaction: structuredClone(existing),
        duplicateCompletion: true,
      };
    }

    if (payoutRequiresAdminApproval(payout)) {
      throw new PayoutDomainError(
        'PAYOUT_APPROVAL_REQUIRED',
        'Antecipação aguarda aprovação administrativa.',
      );
    }

    if (payout.status !== 'requested' && payout.status !== 'processing') {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        `Saque em estado ${payout.status} não pode ser concluído.`,
      );
    }

    const processor = input.processor.trim();
    if (processor.length < 2 || processor.length > 80) {
      throw new PayoutDomainError(
        'PAYOUT_PROCESSOR_REQUIRED',
        'Informe o processador ou método usado no repasse.',
      );
    }

    const pending = await this.getAccountBalanceCents(
      `driver:${payout.driverId}:payout_pending`,
    );
    if (pending < payout.amountCents) {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        'Saldo pendente do saque não fecha com o ledger.',
      );
    }

    const completedAt = (input.completedAt ?? new Date()).toISOString();
    const updated: DriverPayoutRecord = {
      ...payout,
      status: 'paid',
      processor,
      ...(input.processorPayoutId?.trim()
        ? { processorPayoutId: input.processorPayoutId.trim() }
        : {}),
      updatedAt: completedAt,
    };
    const ledger = driverPayoutPaidLedger({
      payoutId: payout.id,
      driverId: payout.driverId,
      processor,
      amountCents: payout.amountCents,
      createdAt: completedAt,
    });

    this.payouts.set(payout.id, structuredClone(updated));
    this.ledgerByReference.set(
      ledger.referenceKey,
      structuredClone(ledger),
    );

    return {
      payout: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateCompletion: false,
    };
  }

  async cancelDriverPayout(
    input: CancelDriverPayoutInput,
  ): Promise<CancelDriverPayoutResult> {
    const payout = this.payouts.get(input.payoutId);
    if (payout == null) {
      throw new PayoutDomainError(
        'PAYOUT_NOT_FOUND',
        'Saque não encontrado.',
      );
    }

    const referenceKey = `driver-payout-cancelled:${payout.id}`;
    if (payout.status === 'cancelled') {
      const existing = this.ledgerByReference.get(referenceKey);
      if (existing == null) {
        throw new Error(
          'Saque cancelado sem lançamento de devolução no ledger.',
        );
      }
      return {
        payout: structuredClone(payout),
        ledgerTransaction: structuredClone(existing),
        duplicateCancellation: true,
      };
    }

    if (payout.status !== 'requested' && payout.status !== 'processing') {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        `Saque em estado ${payout.status} não pode ser cancelado.`,
      );
    }

    const feeApplied =
      payout.approvedAt != null && payoutFeeCents(payout) > 0;
    const expectedPendingCents = feeApplied
      ? payout.amountCents
      : payoutRequestedAmountCents(payout);
    const pending = await this.getAccountBalanceCents(
      `driver:${payout.driverId}:payout_pending`,
    );
    if (pending < expectedPendingCents) {
      throw new PayoutDomainError(
        'INVALID_PAYOUT_TRANSITION',
        'Saldo pendente do saque não fecha com o ledger.',
      );
    }

    const cancelledAt = (input.cancelledAt ?? new Date()).toISOString();
    const updated: DriverPayoutRecord = {
      ...payout,
      status: 'cancelled',
      updatedAt: cancelledAt,
    };
    const feeCents = payoutFeeCents(payout);
    const ledger = driverPayoutCancelledLedger({
      payoutId: payout.id,
      driverId: payout.driverId,
      amountCents: payout.amountCents,
      requestedAmountCents: payoutRequestedAmountCents(payout),
      feeCents,
      feeWasApplied: payout.approvedAt != null && feeCents > 0,
      createdAt: cancelledAt,
    });

    this.payouts.set(payout.id, structuredClone(updated));
    this.ledgerByReference.set(
      ledger.referenceKey,
      structuredClone(ledger),
    );

    return {
      payout: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateCancellation: false,
    };
  }

  async reserveCompanyPayout(
    payout: CompanyPayoutRecord,
  ): Promise<ReserveCompanyPayoutResult> {
    const existingId = this.companyPayoutIdempotencyIndex.get(
      payout.idempotencyKey,
    );
    if (existingId != null) {
      const existing = this.companyPayouts.get(existingId);
      if (existing == null) {
        throw new Error(
          'Índice de repasse da empresa aponta para registro inexistente.',
        );
      }
      if (existing.amountCents !== payout.amountCents) {
        throw new CompanyPayoutError(
          'COMPANY_PAYOUT_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência já utilizada em outro repasse da empresa.',
        );
      }
      const ledger = this.ledgerByReference.get(
        `company-payout-reserve:${existing.id}`,
      );
      if (ledger == null) {
        throw new Error(
          'Repasse idempotente da empresa sem lançamento no ledger.',
        );
      }
      return {
        payout: structuredClone(existing),
        ledgerTransaction: structuredClone(ledger),
        duplicateRequest: true,
      };
    }

    const summary = await this.adminFinanceSummary();
    if (payout.amountCents > summary.companyProfitAvailableCents) {
      throw new CompanyPayoutError(
        'INSUFFICIENT_COMPANY_BALANCE',
        'Saldo disponível da empresa insuficiente para o repasse.',
      );
    }

    const ledger = companyPayoutReserveLedger({
      companyPayoutId: payout.id,
      amountCents: payout.amountCents,
      createdAt: payout.createdAt,
    });
    this.companyPayouts.set(payout.id, structuredClone(payout));
    this.companyPayoutIdempotencyIndex.set(
      payout.idempotencyKey,
      payout.id,
    );
    this.ledgerByReference.set(
      ledger.referenceKey,
      structuredClone(ledger),
    );
    return {
      payout: structuredClone(payout),
      ledgerTransaction: structuredClone(ledger),
      duplicateRequest: false,
    };
  }

  async findCompanyPayoutById(
    id: string,
  ): Promise<CompanyPayoutRecord | null> {
    const payout = this.companyPayouts.get(id);
    return payout == null ? null : structuredClone(payout);
  }

  async listCompanyPayoutsByStatus(
    statuses: readonly CompanyPayoutRecord['status'][],
    limit: number,
  ): Promise<CompanyPayoutRecord[]> {
    const allowed = new Set(statuses);
    return [...this.companyPayouts.values()]
      .filter((payout) => allowed.has(payout.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((payout) => structuredClone(payout));
  }

  async startCompanyPayout(
    input: StartCompanyPayoutInput,
  ): Promise<StartCompanyPayoutResult> {
    const payout = this.companyPayouts.get(input.payoutId);
    if (payout == null) {
      throw new CompanyPayoutError(
        'COMPANY_PAYOUT_NOT_FOUND',
        'Repasse da empresa não encontrado.',
      );
    }
    if (payout.status === 'processing') {
      if (
        payout.processor === input.processor &&
        payout.processorPayoutId === input.processorPayoutId
      ) {
        return { payout: structuredClone(payout), duplicateStart: true };
      }
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Repasse da empresa já está em processamento por outra referência.',
      );
    }
    if (payout.status !== 'requested') {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        `Repasse da empresa em estado ${payout.status} não pode iniciar.`,
      );
    }

    const processor = input.processor.trim();
    const processorPayoutId = input.processorPayoutId.trim();
    if (processor.length < 2 || processorPayoutId.length < 3) {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Processador do repasse da empresa é inválido.',
      );
    }
    const updated: CompanyPayoutRecord = {
      ...payout,
      status: 'processing',
      processor,
      processorPayoutId,
      updatedAt: (input.startedAt ?? new Date()).toISOString(),
    };
    this.companyPayouts.set(payout.id, structuredClone(updated));
    return { payout: structuredClone(updated), duplicateStart: false };
  }

  async failCompanyPayout(
    input: FailCompanyPayoutInput,
  ): Promise<FailCompanyPayoutResult> {
    const payout = this.companyPayouts.get(input.payoutId);
    if (payout == null) {
      throw new CompanyPayoutError(
        'COMPANY_PAYOUT_NOT_FOUND',
        'Repasse da empresa não encontrado.',
      );
    }
    const referenceKey = `company-payout-failed:${payout.id}`;
    if (payout.status === 'failed') {
      const existing = this.ledgerByReference.get(referenceKey);
      if (existing == null) {
        throw new Error(
          'Repasse da empresa falho sem devolução no ledger.',
        );
      }
      return {
        payout: structuredClone(payout),
        ledgerTransaction: structuredClone(existing),
        duplicateFailure: true,
      };
    }
    if (payout.status !== 'requested' && payout.status !== 'processing') {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        `Repasse da empresa em estado ${payout.status} não pode falhar.`,
      );
    }
    const pending = await this.getAccountBalanceCents(
      'platform:company_payout_pending',
    );
    if (pending < payout.amountCents) {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Saldo pendente da empresa não fecha com o ledger.',
      );
    }
    const failedAt = (input.failedAt ?? new Date()).toISOString();
    const updated: CompanyPayoutRecord = {
      ...payout,
      status: 'failed',
      ...(input.processor?.trim()
        ? { processor: input.processor.trim() }
        : {}),
      ...(input.processorPayoutId?.trim()
        ? { processorPayoutId: input.processorPayoutId.trim() }
        : {}),
      updatedAt: failedAt,
    };
    const ledger = companyPayoutFailedLedger({
      companyPayoutId: payout.id,
      amountCents: payout.amountCents,
      createdAt: failedAt,
    });
    this.companyPayouts.set(payout.id, structuredClone(updated));
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));
    return {
      payout: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateFailure: false,
    };
  }

  async completeCompanyPayout(
    input: CompleteCompanyPayoutInput,
  ): Promise<CompleteCompanyPayoutResult> {
    const payout = this.companyPayouts.get(input.payoutId);
    if (payout == null) {
      throw new CompanyPayoutError(
        'COMPANY_PAYOUT_NOT_FOUND',
        'Repasse da empresa não encontrado.',
      );
    }
    const referenceKey = `company-payout-paid:${payout.id}`;
    if (payout.status === 'paid') {
      const existing = this.ledgerByReference.get(referenceKey);
      if (existing == null) {
        throw new Error(
          'Repasse da empresa pago sem conclusão no ledger.',
        );
      }
      return {
        payout: structuredClone(payout),
        ledgerTransaction: structuredClone(existing),
        duplicateCompletion: true,
      };
    }
    if (payout.status !== 'requested' && payout.status !== 'processing') {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        `Repasse da empresa em estado ${payout.status} não pode concluir.`,
      );
    }
    const processor = input.processor.trim();
    if (processor.length < 2 || processor.length > 80) {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Processador do repasse da empresa é inválido.',
      );
    }
    const pending = await this.getAccountBalanceCents(
      'platform:company_payout_pending',
    );
    if (pending < payout.amountCents) {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Saldo pendente da empresa não fecha com o ledger.',
      );
    }
    const completedAt = (input.completedAt ?? new Date()).toISOString();
    const updated: CompanyPayoutRecord = {
      ...payout,
      status: 'paid',
      processor,
      ...(input.processorPayoutId?.trim()
        ? { processorPayoutId: input.processorPayoutId.trim() }
        : {}),
      updatedAt: completedAt,
    };
    const ledger = companyPayoutPaidLedger({
      companyPayoutId: payout.id,
      processor,
      amountCents: payout.amountCents,
      createdAt: completedAt,
    });
    this.companyPayouts.set(payout.id, structuredClone(updated));
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));
    return {
      payout: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateCompletion: false,
    };
  }

  async cancelCompanyPayout(
    input: CancelCompanyPayoutInput,
  ): Promise<CancelCompanyPayoutResult> {
    const payout = this.companyPayouts.get(input.payoutId);
    if (payout == null) {
      throw new CompanyPayoutError(
        'COMPANY_PAYOUT_NOT_FOUND',
        'Repasse da empresa não encontrado.',
      );
    }
    const referenceKey = `company-payout-cancelled:${payout.id}`;
    if (payout.status === 'cancelled') {
      const existing = this.ledgerByReference.get(referenceKey);
      if (existing == null) {
        throw new Error(
          'Repasse da empresa cancelado sem devolução no ledger.',
        );
      }
      return {
        payout: structuredClone(payout),
        ledgerTransaction: structuredClone(existing),
        duplicateCancellation: true,
      };
    }
    if (payout.status !== 'requested') {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Só é possível cancelar repasse da empresa ainda não enviado.',
      );
    }
    const pending = await this.getAccountBalanceCents(
      'platform:company_payout_pending',
    );
    if (pending < payout.amountCents) {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Saldo pendente da empresa não fecha com o ledger.',
      );
    }
    const cancelledAt =
      (input.cancelledAt ?? new Date()).toISOString();
    const updated: CompanyPayoutRecord = {
      ...payout,
      status: 'cancelled',
      updatedAt: cancelledAt,
    };
    const ledger = companyPayoutCancelledLedger({
      companyPayoutId: payout.id,
      amountCents: payout.amountCents,
      createdAt: cancelledAt,
    });
    this.companyPayouts.set(payout.id, structuredClone(updated));
    this.ledgerByReference.set(referenceKey, structuredClone(ledger));
    return {
      payout: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateCancellation: false,
    };
  }

  async getCompanyPayoutDestination():
    Promise<CompanyPayoutDestination | null> {
    return this.companyPayoutDestination == null
      ? null
      : structuredClone(this.companyPayoutDestination);
  }

  async upsertCompanyPayoutDestination(
    destination: CompanyPayoutDestination,
  ): Promise<CompanyPayoutDestination> {
    this.companyPayoutDestination = structuredClone(destination);
    return structuredClone(destination);
  }

  async listRecentCompanyPayouts(
    limit: number,
  ): Promise<CompanyPayoutRecord[]> {
    return [...this.companyPayouts.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((payout) => structuredClone(payout));
  }

  async getDriverPayoutSettings(): Promise<DriverPayoutSettings> {
    return structuredClone(this.payoutSettings);
  }

  async setDriverPayoutAutomaticEnabled(
    input: SetDriverPayoutAutomaticEnabledInput,
  ): Promise<DriverPayoutSettings> {
    this.payoutSettings = {
      automaticEnabled: input.automaticEnabled,
      updatedAt: (input.updatedAt ?? new Date()).toISOString(),
    };
    return structuredClone(this.payoutSettings);
  }

  async listDriverPayoutCandidates(
    limit: number,
  ): Promise<DriverPayoutCandidate[]> {
    const driverIds = new Set<string>(this.payoutDestinations.keys());
    for (const transaction of this.ledgerByReference.values()) {
      for (const entry of transaction.entries) {
        const match = entry.accountKey.match(/^driver:(.+):payable$/);
        if (match?.[1]) driverIds.add(match[1]);
      }
    }
    const rows: DriverPayoutCandidate[] = [];
    for (const driverId of driverIds) {
      const availableBalanceCents = await this.getAccountBalanceCents(
        `driver:${driverId}:payable`,
      );
      if (availableBalanceCents <= 0) continue;
      rows.push({
        driverId,
        availableBalanceCents,
        destination: await this.getDriverPayoutDestination(driverId),
      });
    }
    return rows
      .sort((a, b) => b.availableBalanceCents - a.availableBalanceCents)
      .slice(0, Math.max(1, Math.min(500, Math.trunc(limit))));
  }

  async adminFinanceSummary(): Promise<AdminFinanceSummary> {
    const payments = [...this.payments.values()];
    const payouts = [...this.payouts.values()];

    const familyBalance = (matches: (accountKey: string) => boolean) => {
      let balance = 0;
      for (const transaction of this.ledgerByReference.values()) {
        for (const entry of transaction.entries) {
          if (!matches(entry.accountKey)) continue;
          balance +=
            entry.direction === 'credit'
              ? entry.amountCents
              : -entry.amountCents;
        }
      }
      return balance;
    };

    const platformRevenueCents = familyBalance(
      (accountKey) => accountKey === 'platform:revenue',
    );
    const driverCashCommissionDebtCents = Math.max(
      0,
      -familyBalance(
        (accountKey) =>
          accountKey.startsWith('driver:') &&
          accountKey.endsWith(':commission_debt'),
      ),
    );
    const companyPayoutPendingCents = familyBalance(
      (accountKey) => accountKey === 'platform:company_payout_pending',
    );
    const externalAdjustmentReviewCents = Math.max(
      0,
      -familyBalance(
        (accountKey) =>
          accountKey === 'platform:external_adjustment_review',
      ),
    );
    const externalAdjustmentReviewCount = [
      ...this.externalAdjustments.values(),
    ].filter(
      (adjustment) =>
        adjustment.accountingStatus === 'review_required',
    ).length;
    const companyProfitAvailableCents = Math.max(
      0,
      platformRevenueCents -
        driverCashCommissionDebtCents -
        externalAdjustmentReviewCents,
    );

    return {
      paymentsTotal: payments.length,
      paymentsPaid: payments.filter(
        (payment) => payment.status === 'paid',
      ).length,
      paymentsPaidCents: payments
        .filter((payment) => payment.status === 'paid')
        .reduce((sum, payment) => sum + payment.amountCents, 0),
      paymentsPending: payments.filter((payment) =>
        ['created', 'pending', 'authorized'].includes(payment.status),
      ).length,
      paymentsFailed: payments.filter(
        (payment) => payment.status === 'failed',
      ).length,
      paymentsCancelled: payments.filter(
        (payment) => payment.status === 'cancelled',
      ).length,
      paymentsRefunded: payments.filter(
        (payment) => payment.status === 'refunded',
      ).length,
      platformRevenueCents,
      companyProfitAvailableCents,
      companyPayoutPendingCents,
      externalAdjustmentReviewCents,
      externalAdjustmentReviewCount,
      driverPayableCents: familyBalance(
        (accountKey) =>
          accountKey.startsWith('driver:') &&
          accountKey.endsWith(':payable'),
      ),
      driverPayoutPendingCents: familyBalance(
        (accountKey) =>
          accountKey.startsWith('driver:') &&
          accountKey.endsWith(':payout_pending'),
      ),
      driverCashCommissionDebtCents,
      rideEscrowCents: familyBalance(
        (accountKey) =>
          accountKey.startsWith('ride:') &&
          accountKey.endsWith(':escrow'),
      ),
      passengerWalletCents: familyBalance(
        (accountKey) =>
          accountKey.startsWith('passenger:') &&
          accountKey.endsWith(':wallet'),
      ),
      payoutsRequested: payouts.filter(
        (payout) => payout.status === 'requested',
      ).length,
      payoutsRequestedCents: payouts
        .filter((payout) => payout.status === 'requested')
        .reduce((sum, payout) => sum + payout.amountCents, 0),
    };
  }

  async listRecentPayments(limit: number): Promise<PaymentRecord[]> {
    return [...this.payments.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((payment) => structuredClone(payment));
  }

  async listRecentDriverPayouts(
    limit: number,
  ): Promise<DriverPayoutRecord[]> {
    return [...this.payouts.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((payout) => structuredClone(payout));
  }

  async getDriverPayoutPeriodSummary(
    driverId: string,
    from?: string,
    to?: string,
  ) {
    const fromMs = from == null ? null : Date.parse(from);
    const toMs = to == null ? null : Date.parse(to);
    const payouts = [...this.payouts.values()].filter((payout) => {
      if (payout.driverId !== driverId) return false;
      const createdAt = Date.parse(payout.createdAt);
      if (fromMs != null && createdAt < fromMs) return false;
      if (toMs != null && createdAt >= toMs) return false;
      return true;
    });
    return {
      requestedCents: payouts
        .filter((payout) =>
          payout.status === 'requested' ||
          payout.status === 'processing' ||
          payout.status === 'paid'
        )
        .reduce((sum, payout) => sum + payout.amountCents, 0),
      paidCents: payouts
        .filter((payout) => payout.status === 'paid')
        .reduce((sum, payout) => sum + payout.amountCents, 0),
    };
  }

  async listLedgerTransactionsForAccounts(
    accountKeys: readonly string[],
    limit: number,
  ): Promise<LedgerTransaction[]> {
    const keys = new Set(
      accountKeys.map((value) => value.trim()).filter(Boolean),
    );
    if (keys.size === 0) return [];

    return [...this.ledgerByReference.values()]
      .filter((transaction) =>
        transaction.entries.some((entry) => keys.has(entry.accountKey)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((transaction) => structuredClone(transaction));
  }

  async getAccountBalanceCents(accountKey: string): Promise<number> {
    let balance = 0;

    for (const transaction of this.ledgerByReference.values()) {
      for (const entry of transaction.entries) {
        if (entry.accountKey !== accountKey) continue;
        balance += entry.direction === 'credit'
          ? entry.amountCents
          : -entry.amountCents;
      }
    }

    return balance;
  }

  async getDriverCashDebtCents(driverId: string): Promise<number> {
    const balance = await this.getAccountBalanceCents(
      `driver:${driverId}:commission_debt`,
    );
    return Math.max(0, -balance);
  }
}
