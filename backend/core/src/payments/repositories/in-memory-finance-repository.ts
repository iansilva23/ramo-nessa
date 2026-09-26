import {
  cashRideCommissionDebtLedger,
  driverPayoutReserveLedger,
  externalRideRefundLedger,
  paymentCaptureLedger,
  rideSettlementLedger,
  walletRidePaymentLedger,
  walletRideRefundLedger,
  walletTopupCaptureLedger,
  type LedgerTransaction,
} from '../ledger.js';
import {
  type AdminFinanceSummary,
  type CapturePaymentInput,
  type CapturePaymentResult,
  type MarkPaymentPendingInput,
  type MarkPaymentTerminalInput,
  type RefundExternalPaymentInput,
  type RefundExternalPaymentResult,
  type CaptureWalletTopupInput,
  type CaptureWalletTopupResult,
  type FinanceRepository,
  type PayRideFromWalletInput,
  type PayRideFromWalletResult,
  type RefundWalletRideInput,
  type RefundWalletRideResult,
  type ReserveDriverPayoutResult,
  type SettleCashRideInput,
  type SettleCashRideResult,
  type SettleRideInput,
  type SettleRideResult,
} from '../finance-repository.js';
import { transitionPayment } from '../payment-state.js';
import { PaymentDomainError, type PaymentRecord } from '../payment.js';
import {
  PayoutDomainError,
  type DriverPayoutDestination,
  type DriverPayoutRecord,
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

    const escrowAccount = `ride:${payment.rideId}:escrow`;
    const escrowBalance = await this.getAccountBalanceCents(escrowAccount);
    if (escrowBalance < payment.amountCents) {
      throw new PaymentDomainError(
        'INSUFFICIENT_RIDE_ESCROW',
        'Escrow da corrida não possui saldo suficiente para o estorno.',
      );
    }

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

  async settleRide(input: SettleRideInput): Promise<SettleRideResult> {
    const payment = this.payments.get(input.paymentId);
    if (
      payment == null ||
      payment.rideId !== input.rideId ||
      payment.status !== 'paid' ||
      payment.amountCents !== input.totalAmountCents
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
    const cashDebtRecoveredCents = Math.min(
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

    if (payout.amountCents > available) {
      throw new PayoutDomainError(
        'INSUFFICIENT_DRIVER_BALANCE',
        'Saldo disponível insuficiente para o saque.',
      );
    }

    const ledger = driverPayoutReserveLedger({
      payoutId: payout.id,
      driverId: payout.driverId,
      amountCents: payout.amountCents,
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
      platformRevenueCents: familyBalance(
        (accountKey) => accountKey === 'platform:revenue',
      ),
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
      driverCashCommissionDebtCents: Math.max(
        0,
        -familyBalance(
          (accountKey) =>
            accountKey.startsWith('driver:') &&
            accountKey.endsWith(':commission_debt'),
        ),
      ),
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
