import {
  driverPayoutReserveLedger,
  paymentCaptureLedger,
  rideSettlementLedger,
  walletRidePaymentLedger,
  walletTopupCaptureLedger,
  type LedgerTransaction,
} from '../ledger.js';
import {
  type CapturePaymentInput,
  type CapturePaymentResult,
  type CaptureWalletTopupInput,
  type CaptureWalletTopupResult,
  type FinanceRepository,
  type PayRideFromWalletInput,
  type PayRideFromWalletResult,
  type ReserveDriverPayoutResult,
  type SettleRideInput,
  type SettleRideResult,
} from '../finance-repository.js';
import { transitionPayment } from '../payment-state.js';
import { PaymentDomainError, type PaymentRecord } from '../payment.js';
import {
  PayoutDomainError,
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

  private readonly ledgerByReference = new Map<string, LedgerTransaction>();
  private readonly processedEvents = new Map<
    string,
    { paymentId: string; ledger: ReturnType<typeof paymentCaptureLedger> }
  >();

  async findPaymentById(id: string): Promise<PaymentRecord | null> {
    const payment = this.payments.get(id);
    return payment == null ? null : structuredClone(payment);
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
      return {
        ledgerTransaction: structuredClone(existing),
        duplicateSettlement: true,
      };
    }

    const createdAt = (input.settledAt ?? new Date()).toISOString();
    const ledger = rideSettlementLedger({
      rideId: input.rideId,
      paymentId: input.paymentId,
      driverId: input.driverId,
      totalAmountCents: input.totalAmountCents,
      platformCommissionCents: input.platformCommissionCents,
      driverNetCents: input.driverNetCents,
      createdAt,
    });

    this.ledgerByReference.set(referenceKey, structuredClone(ledger));

    return {
      ledgerTransaction: structuredClone(ledger),
      duplicateSettlement: false,
    };
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
}
