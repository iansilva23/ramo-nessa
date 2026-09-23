import {
  driverPayoutReserveLedger,
  paymentCaptureLedger,
  rideSettlementLedger,
  type LedgerTransaction,
} from '../ledger.js';
import {
  type CapturePaymentInput,
  type CapturePaymentResult,
  type FinanceRepository,
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

export class InMemoryFinanceRepository implements FinanceRepository {
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
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
    this.ledgerByReference.set(
      ledger.referenceKey,
      structuredClone(ledger),
    );

    return {
      payment: structuredClone(updated),
      ledgerTransaction: structuredClone(ledger),
      duplicateEvent: false,
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
