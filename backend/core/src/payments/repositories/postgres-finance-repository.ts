import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

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

interface PaymentRow {
  id: string;
  ride_id: string;
  method: PaymentRecord['method'];
  processor: string;
  processor_payment_id: string | null;
  status: PaymentRecord['status'];
  amount_cents: number;
  idempotency_key: string;
  created_at: Date;
  updated_at: Date;
}

interface ExternalPaymentAdjustmentRow {
  id: string;
  payment_id: string;
  processor: string;
  processor_adjustment_id: string;
  kind: ExternalPaymentAdjustmentRecord['kind'];
  processor_status: string;
  processor_status_detail: string;
  amount_cents: number;
  escrow_applied_cents: number;
  review_required_cents: number;
  accounting_status: ExternalPaymentAdjustmentRecord['accountingStatus'];
  created_at: Date;
  updated_at: Date;
}

interface WalletTopupRow {
  id: string;
  passenger_id: string;
  method: WalletTopupRecord['method'];
  processor: string;
  processor_topup_id: string | null;
  status: WalletTopupRecord['status'];
  amount_cents: number;
  idempotency_key: string;
  created_at: Date;
  updated_at: Date;
}

interface DriverPayoutRow {
  id: string;
  driver_id: string;
  amount_cents: number;
  status: DriverPayoutRecord['status'];
  idempotency_key: string;
  payout_kind: NonNullable<DriverPayoutRecord['payoutKind']>;
  requested_amount_cents: number;
  fee_cents: number;
  approved_at: Date | null;
  pix_key_type: DriverPayoutRecord['pixKeyType'] | null;
  pix_key: string | null;
  processor: string | null;
  processor_payout_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DriverPayoutDestinationRow {
  driver_id: string;
  pix_key_type: DriverPayoutDestination['pixKeyType'];
  pix_key: string;
  created_at: Date;
  updated_at: Date;
}

interface CompanyPayoutRow {
  id: string;
  amount_cents: number;
  status: CompanyPayoutRecord['status'];
  idempotency_key: string;
  pix_key_type: CompanyPayoutRecord['pixKeyType'];
  pix_key: string;
  processor: string | null;
  processor_payout_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CompanyPayoutDestinationRow {
  pix_key_type: CompanyPayoutDestination['pixKeyType'];
  pix_key: string;
  created_at: Date;
  updated_at: Date;
}

interface LedgerTransactionRow {
  id: string;
  kind: string;
  ride_id: string | null;
  payment_id: string | null;
  payout_id: string | null;
  company_payout_id: string | null;
  wallet_topup_id: string | null;
  reference_key: string;
  created_at: Date;
}

interface LedgerEntryRow {
  account_key: string;
  direction: 'debit' | 'credit';
  amount_cents: number;
}

function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    rideId: row.ride_id,
    method: row.method,
    processor: row.processor,
    ...(row.processor_payment_id != null
      ? { processorPaymentId: row.processor_payment_id }
      : {}),
    status: row.status,
    amountCents: row.amount_cents,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapExternalPaymentAdjustment(
  row: ExternalPaymentAdjustmentRow,
): ExternalPaymentAdjustmentRecord {
  return {
    id: row.id,
    paymentId: row.payment_id,
    processor: row.processor,
    processorAdjustmentId: row.processor_adjustment_id,
    kind: row.kind,
    processorStatus: row.processor_status,
    processorStatusDetail: row.processor_status_detail,
    amountCents: row.amount_cents,
    escrowAppliedCents: row.escrow_applied_cents,
    reviewRequiredCents: row.review_required_cents,
    accountingStatus: row.accounting_status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapTopup(row: WalletTopupRow): WalletTopupRecord {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    method: row.method,
    processor: row.processor,
    ...(row.processor_topup_id != null
      ? { processorTopupId: row.processor_topup_id }
      : {}),
    status: row.status,
    amountCents: row.amount_cents,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapPayout(row: DriverPayoutRow): DriverPayoutRecord {
  return {
    id: row.id,
    driverId: row.driver_id,
    amountCents: row.amount_cents,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    payoutKind: row.payout_kind,
    requestedAmountCents: row.requested_amount_cents,
    feeCents: row.fee_cents,
    ...(row.approved_at == null
      ? {}
      : { approvedAt: row.approved_at.toISOString() }),
    pixKeyType: row.pix_key_type ?? 'random',
    pixKey: row.pix_key ?? '',
    ...(row.processor != null ? { processor: row.processor } : {}),
    ...(row.processor_payout_id != null
      ? { processorPayoutId: row.processor_payout_id }
      : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapCompanyPayout(
  row: CompanyPayoutRow,
): CompanyPayoutRecord {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    pixKeyType: row.pix_key_type,
    pixKey: row.pix_key,
    ...(row.processor != null ? { processor: row.processor } : {}),
    ...(row.processor_payout_id != null
      ? { processorPayoutId: row.processor_payout_id }
      : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PAYMENT_COLUMNS = `
  id, ride_id, method, processor, processor_payment_id, status,
  amount_cents, idempotency_key, created_at, updated_at
`;

const EXTERNAL_ADJUSTMENT_COLUMNS = `
  id, payment_id, processor, processor_adjustment_id, kind,
  processor_status, processor_status_detail, amount_cents,
  escrow_applied_cents, review_required_cents, accounting_status,
  created_at, updated_at
`;

const TOPUP_COLUMNS = `
  id, passenger_id, method, processor, processor_topup_id, status,
  amount_cents, idempotency_key, created_at, updated_at
`;

const PAYOUT_COLUMNS = `
  id, driver_id, amount_cents, status, idempotency_key,
  payout_kind, requested_amount_cents, fee_cents, approved_at,
  pix_key_type, pix_key,
  processor, processor_payout_id, created_at, updated_at
`;

const COMPANY_PAYOUT_COLUMNS = `
  id, amount_cents, status, idempotency_key,
  pix_key_type, pix_key,
  processor, processor_payout_id, created_at, updated_at
`;

async function insertLedger(
  client: PoolClient,
  transaction: LedgerTransaction,
): Promise<void> {
  await client.query(
    `
    INSERT INTO ledger_transactions (
      id, kind, ride_id, payment_id, payout_id, company_payout_id,
      wallet_topup_id, reference_key, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      transaction.id,
      transaction.kind,
      transaction.rideId ?? null,
      transaction.paymentId ?? null,
      transaction.payoutId ?? null,
      transaction.companyPayoutId ?? null,
      transaction.walletTopupId ?? null,
      transaction.referenceKey,
      transaction.createdAt,
    ],
  );

  for (const entry of transaction.entries) {
    await client.query(
      `
      INSERT INTO ledger_entries (
        id, transaction_id, account_key, direction, amount_cents, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [
        randomUUID(),
        transaction.id,
        entry.accountKey,
        entry.direction,
        entry.amountCents,
        transaction.createdAt,
      ],
    );
  }
}

async function loadLedgerByReference(
  client: PoolClient,
  referenceKey: string,
): Promise<LedgerTransaction | null> {
  const transactionResult = await client.query<LedgerTransactionRow>(
    `
    SELECT
      id, kind, ride_id, payment_id, payout_id, company_payout_id,
      wallet_topup_id, reference_key, created_at
    FROM ledger_transactions
    WHERE reference_key = $1
    LIMIT 1
    `,
    [referenceKey],
  );

  const row = transactionResult.rows[0];
  if (row == null) return null;

  const entriesResult = await client.query<LedgerEntryRow>(
    `
    SELECT account_key, direction, amount_cents
    FROM ledger_entries
    WHERE transaction_id = $1
    ORDER BY created_at, id
    `,
    [row.id],
  );

  return {
    id: row.id,
    kind: row.kind,
    ...(row.ride_id != null ? { rideId: row.ride_id } : {}),
    ...(row.payment_id != null ? { paymentId: row.payment_id } : {}),
    ...(row.payout_id != null ? { payoutId: row.payout_id } : {}),
    ...(row.company_payout_id != null
      ? { companyPayoutId: row.company_payout_id }
      : {}),
    ...(row.wallet_topup_id != null
      ? { walletTopupId: row.wallet_topup_id }
      : {}),
    referenceKey: row.reference_key,
    entries: entriesResult.rows.map((entry) => ({
      accountKey: entry.account_key,
      direction: entry.direction,
      amountCents: entry.amount_cents,
    })),
    createdAt: row.created_at.toISOString(),
  };
}

async function accountBalanceCents(
  client: PoolClient,
  accountKey: string,
): Promise<number> {
  const result = await client.query<{ balance_cents: string }>(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN direction = 'credit' THEN amount_cents
        ELSE -amount_cents
      END
    ), 0)::text AS balance_cents
    FROM ledger_entries
    WHERE account_key = $1
    `,
    [accountKey],
  );

  return Number(result.rows[0]?.balance_cents ?? '0');
}

async function totalDriverCashDebtCents(
  client: PoolClient,
): Promise<number> {
  const result = await client.query<{ debt_cents: string }>(
    `
    SELECT GREATEST(
      COALESCE(SUM(
        CASE
          WHEN account_key LIKE 'driver:%:commission_debt'
          THEN CASE WHEN direction = 'debit'
            THEN amount_cents ELSE -amount_cents END
          ELSE 0
        END
      ), 0),
      0
    )::text AS debt_cents
    FROM ledger_entries
    `,
  );
  return Number(result.rows[0]?.debt_cents ?? '0');
}

export class PostgresFinanceRepository implements FinanceRepository {
  constructor(private readonly pool: Pool) {}

  async findPaymentById(id: string): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] == null ? null : mapPayment(result.rows[0]);
  }

  async findLatestPaymentByRideId(
    rideId: string,
  ): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments
       WHERE ride_id = $1
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [rideId],
    );
    return result.rows[0] == null ? null : mapPayment(result.rows[0]);
  }

  async findPaidPaymentByRideId(
    rideId: string,
  ): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments
       WHERE ride_id = $1
         AND status = 'paid'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [rideId],
    );
    return result.rows[0] == null ? null : mapPayment(result.rows[0]);
  }

  async findPaymentByIdempotencyKey(
    key: string,
  ): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments WHERE idempotency_key = $1 LIMIT 1`,
      [key],
    );
    return result.rows[0] == null ? null : mapPayment(result.rows[0]);
  }

  async createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
    try {
      const result = await this.pool.query<PaymentRow>(
        `
        INSERT INTO payments (
          id, ride_id, method, processor, processor_payment_id, status,
          amount_cents, idempotency_key, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING ${PAYMENT_COLUMNS}
        `,
        [
          payment.id,
          payment.rideId,
          payment.method,
          payment.processor,
          payment.processorPaymentId ?? null,
          payment.status,
          payment.amountCents,
          payment.idempotencyKey,
          payment.createdAt,
          payment.updatedAt,
        ],
      );

      const row = result.rows[0];
      if (row == null) throw new Error('PostgreSQL não retornou pagamento.');
      return mapPayment(row);
    } catch (error) {
      const code =
        typeof error === 'object' && error != null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';

      const constraint =
        typeof error === 'object' && error != null && 'constraint' in error
          ? String((error as { constraint?: unknown }).constraint ?? '')
          : '';

      if (
        code === '23505' &&
        constraint === 'payments_one_paid_per_ride_idx'
      ) {
        throw new PaymentDomainError(
          'RIDE_ALREADY_PAID',
          'Esta corrida já possui outro pagamento confirmado.',
        );
      }

      if (code === '23505') {
        const existing = await this.findPaymentByIdempotencyKey(
          payment.idempotencyKey,
        );
        if (
          existing != null &&
          existing.rideId === payment.rideId &&
          existing.method === payment.method &&
          existing.processor === payment.processor &&
          existing.amountCents === payment.amountCents
        ) {
          return existing;
        }

        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Chave de idempotência já utilizada em outro pagamento.',
        );
      }
      throw error;
    }
  }

  async markPaymentPending(
    input: MarkPaymentPendingInput,
  ): Promise<PaymentRecord> {
    const current = await this.findPaymentById(input.paymentId);
    if (current == null) {
      throw new PaymentDomainError(
        'PAYMENT_NOT_FOUND',
        'Pagamento não encontrado.',
      );
    }

    if (current.status === 'pending') {
      return current;
    }

    let status: PaymentRecord['status'];
    try {
      status = transitionPayment(current.status, 'pending');
    } catch {
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        `Pagamento em estado ${current.status} não pode ficar pendente.`,
      );
    }

    const updatedAt = (input.pendingAt ?? new Date()).toISOString();
    const result = await this.pool.query<PaymentRow>(
      `
      UPDATE payments
      SET status = $2,
          processor_payment_id = $3,
          updated_at = $4
      WHERE id = $1
      RETURNING ${PAYMENT_COLUMNS}
      `,
      [
        current.id,
        status,
        input.processorPaymentId,
        updatedAt,
      ],
    );

    const row = result.rows[0];
    if (row == null) {
      throw new Error('PostgreSQL não retornou pagamento pendente.');
    }
    return mapPayment(row);
  }

  async markPaymentTerminal(
    input: MarkPaymentTerminalInput,
  ): Promise<PaymentRecord> {
    const current = await this.findPaymentById(input.paymentId);
    if (current == null) {
      throw new PaymentDomainError(
        'PAYMENT_NOT_FOUND',
        'Pagamento não encontrado.',
      );
    }

    if (current.status === input.status) {
      return current;
    }

    let status: PaymentRecord['status'];
    try {
      status = transitionPayment(current.status, input.status);
    } catch {
      throw new PaymentDomainError(
        'INVALID_PAYMENT_TRANSITION',
        `Pagamento em estado ${current.status} não pode ir para ${input.status}.`,
      );
    }

    const updatedAt = (input.updatedAt ?? new Date()).toISOString();
    const result = await this.pool.query<PaymentRow>(
      `
      UPDATE payments
      SET status = $2, updated_at = $3
      WHERE id = $1
      RETURNING ${PAYMENT_COLUMNS}
      `,
      [current.id, status, updatedAt],
    );

    const row = result.rows[0];
    if (row == null) {
      throw new Error('PostgreSQL não retornou pagamento terminal.');
    }
    return mapPayment(row);
  }

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const paymentResult = await client.query<PaymentRow>(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments WHERE id = $1 FOR UPDATE`,
        [input.paymentId],
      );
      const row = paymentResult.rows[0];
      if (row == null) {
        throw new PaymentDomainError(
          'PAYMENT_NOT_FOUND',
          'Pagamento não encontrado.',
        );
      }

      const payment = mapPayment(row);
      const eventKey =
        `payment-capture:${payment.processor}:${input.processorEventId}`;

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [eventKey],
      );
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`payment-ride:${payment.rideId}`],
      );

      const existingLedger = await loadLedgerByReference(client, eventKey);

      if (existingLedger != null) {
        if (existingLedger.paymentId !== payment.id) {
          throw new PaymentDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Evento do processador já foi usado em outro pagamento.',
          );
        }

        await client.query('COMMIT');
        return {
          payment,
          ledgerTransaction: existingLedger,
          duplicateEvent: true,
        };
      }

      const alreadyPaid = await client.query<{ id: string }>(
        `
        SELECT id
        FROM payments
        WHERE ride_id = $1
          AND status = 'paid'
          AND id <> $2
        LIMIT 1
        `,
        [payment.rideId, payment.id],
      );
      if (alreadyPaid.rows[0] != null) {
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
        throw new PaymentDomainError(
          'INVALID_PAYMENT_TRANSITION',
          `Pagamento em estado ${payment.status} não pode ser capturado.`,
        );
      }

      const capturedAt = (input.capturedAt ?? new Date()).toISOString();

      await client.query(
        `
        INSERT INTO payment_events (
          id, processor, processor_event_id, payment_id, payload, created_at
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
        `,
        [
          randomUUID(),
          payment.processor,
          input.processorEventId,
          payment.id,
          JSON.stringify(input.payload ?? {}),
          capturedAt,
        ],
      );

      const updatedResult = await client.query<PaymentRow>(
        `
        UPDATE payments
        SET status = $2,
            processor_payment_id = COALESCE($3, processor_payment_id),
            updated_at = $4
        WHERE id = $1
        RETURNING ${PAYMENT_COLUMNS}
        `,
        [
          payment.id,
          nextStatus,
          input.processorPaymentId ?? null,
          capturedAt,
        ],
      );

      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) throw new Error('Falha ao atualizar pagamento.');

      const ledger = paymentCaptureLedger({
        rideId: payment.rideId,
        paymentId: payment.id,
        processor: payment.processor,
        processorEventId: input.processorEventId,
        amountCents: payment.amountCents,
        createdAt: capturedAt,
      });

      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        payment: mapPayment(updatedRow),
        ledgerTransaction: ledger,
        duplicateEvent: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const code =
        typeof error === 'object' && error != null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      const constraint =
        typeof error === 'object' && error != null && 'constraint' in error
          ? String((error as { constraint?: unknown }).constraint ?? '')
          : '';

      if (
        code === '23505' &&
        constraint === 'payments_one_paid_per_ride_idx'
      ) {
        throw new PaymentDomainError(
          'RIDE_ALREADY_PAID',
          'Esta corrida já possui outro pagamento confirmado.',
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async refundExternalPayment(
    input: RefundExternalPaymentInput,
  ): Promise<RefundExternalPaymentResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const paymentResult = await client.query<PaymentRow>(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments
         WHERE id = $1
         FOR UPDATE`,
        [input.paymentId],
      );
      const row = paymentResult.rows[0];
      if (row == null) {
        throw new PaymentDomainError(
          'PAYMENT_NOT_FOUND',
          'Pagamento não encontrado.',
        );
      }

      const payment = mapPayment(row);
      const referenceKey = `external-ride-refund:${payment.id}`;

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [referenceKey],
      );

      const existing = await loadLedgerByReference(client, referenceKey);
      if (existing != null) {
        if (
          existing.paymentId !== payment.id ||
          payment.status !== 'refunded'
        ) {
          throw new Error(
            'Estado inconsistente entre estorno externo e pagamento.',
          );
        }

        await client.query('COMMIT');
        return {
          payment,
          ledgerTransaction: existing,
          duplicateRefund: true,
        };
      }

      if (payment.status !== 'paid') {
        throw new PaymentDomainError(
          'INVALID_PAYMENT_TRANSITION',
          `Pagamento em estado ${payment.status} não pode ser estornado externamente.`,
        );
      }

      const adjustedResult = await client.query<{
        adjusted_cents: string;
      }>(
        `SELECT COALESCE(SUM(
           escrow_applied_cents + review_required_cents
         ), 0)::text AS adjusted_cents
         FROM payment_external_adjustments
         WHERE payment_id = $1
           AND kind = 'partial_refund'
           AND accounting_status <> 'observed'`,
        [payment.id],
      );
      const alreadyAdjustedCents = Number(
        adjustedResult.rows[0]?.adjusted_cents ?? '0',
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
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [escrowAccount],
      );

      const escrowBalance = Math.max(
        0,
        await accountBalanceCents(client, escrowAccount),
      );
      const escrowAppliedCents = Math.min(
        escrowBalance,
        remainingRefundCents,
      );
      const reviewRequiredCents =
        remainingRefundCents - escrowAppliedCents;

      const refundedAt = (input.refundedAt ?? new Date()).toISOString();
      const nextStatus = transitionPayment(payment.status, 'refunded');
      const updatedResult = await client.query<PaymentRow>(
        `
        UPDATE payments
        SET status = $2, updated_at = $3
        WHERE id = $1
        RETURNING ${PAYMENT_COLUMNS}
        `,
        [payment.id, nextStatus, refundedAt],
      );

      const ledger = externalRideRefundLedger({
        rideId: payment.rideId,
        paymentId: payment.id,
        processor: payment.processor,
        amountCents: remainingRefundCents,
        escrowAppliedCents,
        reviewRequiredCents,
        createdAt: refundedAt,
      });
      await insertLedger(client, ledger);

      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou pagamento estornado.');
      }

      await client.query('COMMIT');
      return {
        payment: mapPayment(updatedRow),
        ledgerTransaction: ledger,
        duplicateRefund: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordExternalPaymentAdjustment(
    input: RecordExternalPaymentAdjustmentInput,
  ): Promise<RecordExternalPaymentAdjustmentResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const processorAdjustmentId =
        input.processorAdjustmentId.trim();
      if (processorAdjustmentId.length < 3) {
        throw new ExternalPaymentAdjustmentError(
          'PAYMENT_ADJUSTMENT_MISMATCH',
          'Identificador do ajuste externo é inválido.',
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

      const paymentResult = await client.query<PaymentRow>(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments
         WHERE id = $1
         FOR UPDATE`,
        [input.paymentId],
      );
      const paymentRow = paymentResult.rows[0];
      if (paymentRow == null) {
        throw new ExternalPaymentAdjustmentError(
          'PAYMENT_NOT_FOUND',
          'Pagamento não encontrado para ajuste externo.',
        );
      }
      const payment = mapPayment(paymentRow);
      if (
        payment.processor !== 'mercado-pago-orders' ||
        payment.status !== 'paid'
      ) {
        throw new ExternalPaymentAdjustmentError(
          'PAYMENT_ADJUSTMENT_MISMATCH',
          'Pagamento não está elegível para ajuste externo.',
        );
      }

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`external-adjustment:${payment.processor}:${processorAdjustmentId}`],
      );

      const existingResult =
        await client.query<ExternalPaymentAdjustmentRow>(
          `SELECT ${EXTERNAL_ADJUSTMENT_COLUMNS}
           FROM payment_external_adjustments
           WHERE processor = $1
             AND processor_adjustment_id = $2
           FOR UPDATE`,
          [payment.processor, processorAdjustmentId],
        );
      const existingRow = existingResult.rows[0];
      if (existingRow != null) {
        const existing = mapExternalPaymentAdjustment(existingRow);
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

        const instant = (input.observedAt ?? new Date()).toISOString();
        let ledger: LedgerTransaction | undefined;
        let escrowAppliedCents = existing.escrowAppliedCents;
        let reviewRequiredCents = existing.reviewRequiredCents;
        let accountingStatus = existing.accountingStatus;

        if (
          input.applyToAccounting &&
          existing.accountingStatus === 'observed'
        ) {
          const escrowAccount = `ride:${payment.rideId}:escrow`;
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [escrowAccount],
          );
          const availableEscrow = Math.max(
            0,
            await accountBalanceCents(client, escrowAccount),
          );
          escrowAppliedCents = Math.min(
            availableEscrow,
            existing.amountCents,
          );
          reviewRequiredCents =
            existing.amountCents - escrowAppliedCents;
          ledger = externalPaymentAdjustmentLedger({
            rideId: payment.rideId,
            paymentId: payment.id,
            processor: payment.processor,
            processorAdjustmentId,
            escrowAppliedCents,
            reviewRequiredCents,
            createdAt: instant,
          });
          await insertLedger(client, ledger);
          accountingStatus =
            reviewRequiredCents > 0
              ? 'review_required'
              : 'applied_to_escrow';
        }

        const updatedResult =
          await client.query<ExternalPaymentAdjustmentRow>(
            `UPDATE payment_external_adjustments
             SET processor_status = $3,
                 processor_status_detail = $4,
                 escrow_applied_cents = $5,
                 review_required_cents = $6,
                 accounting_status = $7,
                 updated_at = $8
             WHERE processor = $1
               AND processor_adjustment_id = $2
             RETURNING ${EXTERNAL_ADJUSTMENT_COLUMNS}`,
            [
              payment.processor,
              processorAdjustmentId,
              input.processorStatus,
              input.processorStatusDetail,
              escrowAppliedCents,
              reviewRequiredCents,
              accountingStatus,
              instant,
            ],
          );
        const updatedRow = updatedResult.rows[0];
        if (updatedRow == null) {
          throw new Error(
            'PostgreSQL não retornou ajuste externo atualizado.',
          );
        }
        await client.query('COMMIT');
        return {
          adjustment: mapExternalPaymentAdjustment(updatedRow),
          ...(ledger == null ? {} : { ledgerTransaction: ledger }),
          duplicateAdjustment: true,
        };
      }

      if (input.kind === 'partial_refund') {
        const sumResult = await client.query<{ amount_cents: string }>(
          `SELECT COALESCE(SUM(amount_cents), 0)::text AS amount_cents
           FROM payment_external_adjustments
           WHERE payment_id = $1
             AND kind = 'partial_refund'`,
          [payment.id],
        );
        const existingRefundedCents = Number(
          sumResult.rows[0]?.amount_cents ?? '0',
        );
        if (
          existingRefundedCents + input.amountCents >
          payment.amountCents
        ) {
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
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [escrowAccount],
        );
        const availableEscrow = Math.max(
          0,
          await accountBalanceCents(client, escrowAccount),
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
          processorAdjustmentId,
          escrowAppliedCents,
          reviewRequiredCents,
          createdAt: instant,
        });
        await insertLedger(client, ledger);
        accountingStatus =
          reviewRequiredCents > 0
            ? 'review_required'
            : 'applied_to_escrow';
      }

      const inserted =
        await client.query<ExternalPaymentAdjustmentRow>(
          `INSERT INTO payment_external_adjustments (
             id, payment_id, processor, processor_adjustment_id, kind,
             processor_status, processor_status_detail, amount_cents,
             escrow_applied_cents, review_required_cents,
             accounting_status, created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
           )
           RETURNING ${EXTERNAL_ADJUSTMENT_COLUMNS}`,
          [
            randomUUID(),
            payment.id,
            payment.processor,
            processorAdjustmentId,
            input.kind,
            input.processorStatus,
            input.processorStatusDetail,
            input.amountCents,
            escrowAppliedCents,
            reviewRequiredCents,
            accountingStatus,
            instant,
            instant,
          ],
        );
      const insertedRow = inserted.rows[0];
      if (insertedRow == null) {
        throw new Error(
          'PostgreSQL não retornou ajuste externo criado.',
        );
      }

      await client.query('COMMIT');
      return {
        adjustment: mapExternalPaymentAdjustment(insertedRow),
        ...(ledger == null ? {} : { ledgerTransaction: ledger }),
        duplicateAdjustment: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRecentExternalPaymentAdjustments(
    limit: number,
  ): Promise<ExternalPaymentAdjustmentRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<ExternalPaymentAdjustmentRow>(
      `SELECT ${EXTERNAL_ADJUSTMENT_COLUMNS}
       FROM payment_external_adjustments
       ORDER BY updated_at DESC, id DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map(mapExternalPaymentAdjustment);
  }

  async listWalletTopups(
    passengerId: string,
    limit: number,
  ): Promise<WalletTopupRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, limit));
    const result = await this.pool.query<WalletTopupRow>(
      `SELECT ${TOPUP_COLUMNS}
       FROM wallet_topups
       WHERE passenger_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [passengerId, safeLimit],
    );
    return result.rows.map(mapTopup);
  }

  async findWalletTopupById(
    id: string,
  ): Promise<WalletTopupRecord | null> {
    const result = await this.pool.query<WalletTopupRow>(
      `SELECT ${TOPUP_COLUMNS}
       FROM wallet_topups WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] == null ? null : mapTopup(result.rows[0]);
  }

  async findWalletTopupByIdempotencyKey(
    key: string,
  ): Promise<WalletTopupRecord | null> {
    const result = await this.pool.query<WalletTopupRow>(
      `SELECT ${TOPUP_COLUMNS}
       FROM wallet_topups WHERE idempotency_key = $1 LIMIT 1`,
      [key],
    );
    return result.rows[0] == null ? null : mapTopup(result.rows[0]);
  }

  async createWalletTopup(
    topup: WalletTopupRecord,
  ): Promise<WalletTopupRecord> {
    try {
      const result = await this.pool.query<WalletTopupRow>(
        `
        INSERT INTO wallet_topups (
          id, passenger_id, method, processor, processor_topup_id, status,
          amount_cents, idempotency_key, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING ${TOPUP_COLUMNS}
        `,
        [
          topup.id,
          topup.passengerId,
          topup.method,
          topup.processor,
          topup.processorTopupId ?? null,
          topup.status,
          topup.amountCents,
          topup.idempotencyKey,
          topup.createdAt,
          topup.updatedAt,
        ],
      );

      const row = result.rows[0];
      if (row == null) throw new Error('PostgreSQL não retornou a recarga.');
      return mapTopup(row);
    } catch (error) {
      const code =
        typeof error === 'object' && error != null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';

      if (code === '23505') {
        const existing = await this.findWalletTopupByIdempotencyKey(
          topup.idempotencyKey,
        );
        if (
          existing != null &&
          existing.passengerId === topup.passengerId &&
          existing.method === topup.method &&
          existing.processor === topup.processor &&
          existing.amountCents === topup.amountCents
        ) {
          return existing;
        }

        throw new WalletDomainError(
          'WALLET_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência da recarga já utilizada em outra intenção.',
        );
      }
      throw error;
    }
  }

  async markWalletTopupPending(
    input: MarkWalletTopupPendingInput,
  ): Promise<WalletTopupRecord> {
    const updatedAt = (input.updatedAt ?? new Date()).toISOString();
    const result = await this.pool.query<WalletTopupRow>(
      `
      UPDATE wallet_topups
      SET status = 'pending',
          processor_topup_id = $2,
          updated_at = $3
      WHERE id = $1
        AND status IN ('created', 'pending', 'authorized')
      RETURNING ${TOPUP_COLUMNS}
      `,
      [input.walletTopupId, input.processorTopupId, updatedAt],
    );
    const row = result.rows[0];
    if (row != null) return mapTopup(row);

    const current = await this.findWalletTopupById(input.walletTopupId);
    if (current == null) {
      throw new WalletDomainError(
        'WALLET_TOPUP_NOT_FOUND',
        'Recarga não encontrada.',
      );
    }
    throw new WalletDomainError(
      'INVALID_TOPUP_TRANSITION',
      `Recarga em estado ${current.status} não pode voltar para pendente.`,
    );
  }

  async markWalletTopupTerminal(
    input: MarkWalletTopupTerminalInput,
  ): Promise<WalletTopupRecord> {
    const current = await this.findWalletTopupById(input.walletTopupId);
    if (current == null) {
      throw new WalletDomainError(
        'WALLET_TOPUP_NOT_FOUND',
        'Recarga não encontrada.',
      );
    }
    if (current.status === input.status) return current;
    if (current.status === 'paid' || current.status === 'refunded') {
      throw new WalletDomainError(
        'INVALID_TOPUP_TRANSITION',
        `Recarga em estado ${current.status} não pode ser encerrada como ${input.status}.`,
      );
    }

    const updatedAt = (input.updatedAt ?? new Date()).toISOString();
    const result = await this.pool.query<WalletTopupRow>(
      `
      UPDATE wallet_topups
      SET status = $2, updated_at = $3
      WHERE id = $1
        AND status NOT IN ('paid', 'refunded')
      RETURNING ${TOPUP_COLUMNS}
      `,
      [input.walletTopupId, input.status, updatedAt],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new WalletDomainError(
        'INVALID_TOPUP_TRANSITION',
        'A recarga mudou de estado enquanto era encerrada.',
      );
    }
    return mapTopup(row);
  }

  async captureWalletTopup(
    input: CaptureWalletTopupInput,
  ): Promise<CaptureWalletTopupResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const topupResult = await client.query<WalletTopupRow>(
        `
        SELECT ${TOPUP_COLUMNS}
        FROM wallet_topups
        WHERE id = $1
        FOR UPDATE
        `,
        [input.walletTopupId],
      );
      const row = topupResult.rows[0];
      if (row == null) {
        throw new WalletDomainError(
          'WALLET_TOPUP_NOT_FOUND',
          'Recarga não encontrada.',
        );
      }

      const topup = mapTopup(row);
      const referenceKey =
        `wallet-topup-capture:${topup.processor}:${input.processorEventId}`;
      const existingLedger = await loadLedgerByReference(
        client,
        referenceKey,
      );

      if (existingLedger != null) {
        if (existingLedger.walletTopupId !== topup.id) {
          throw new WalletDomainError(
            'WALLET_IDEMPOTENCY_CONFLICT',
            'Evento do processador já foi usado em outra recarga.',
          );
        }

        await client.query('COMMIT');
        return {
          topup,
          ledgerTransaction: existingLedger,
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

      await client.query(
        `
        INSERT INTO wallet_topup_events (
          id, processor, processor_event_id, wallet_topup_id,
          payload, created_at
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
        `,
        [
          randomUUID(),
          topup.processor,
          input.processorEventId,
          topup.id,
          JSON.stringify(input.payload ?? {}),
          capturedAt,
        ],
      );

      const updatedResult = await client.query<WalletTopupRow>(
        `
        UPDATE wallet_topups
        SET status = $2,
            processor_topup_id = COALESCE($3, processor_topup_id),
            updated_at = $4
        WHERE id = $1
        RETURNING ${TOPUP_COLUMNS}
        `,
        [
          topup.id,
          nextStatus,
          input.processorTopupId ?? null,
          capturedAt,
        ],
      );
      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) throw new Error('Falha ao atualizar recarga.');

      const ledger = walletTopupCaptureLedger({
        walletTopupId: topup.id,
        passengerId: topup.passengerId,
        processor: topup.processor,
        processorEventId: input.processorEventId,
        amountCents: topup.amountCents,
        createdAt: capturedAt,
      });

      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        topup: mapTopup(updatedRow),
        ledgerTransaction: ledger,
        duplicateEvent: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async refundWalletTopup(
    input: RefundWalletTopupInput,
  ): Promise<RefundWalletTopupResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const topupResult = await client.query<WalletTopupRow>(
        `
        SELECT ${TOPUP_COLUMNS}
        FROM wallet_topups
        WHERE id = $1
        FOR UPDATE
        `,
        [input.walletTopupId],
      );
      const row = topupResult.rows[0];
      if (row == null) {
        throw new WalletDomainError(
          'WALLET_TOPUP_NOT_FOUND',
          'Recarga não encontrada.',
        );
      }
      const topup = mapTopup(row);
      const referenceKey = `wallet-topup-refund:${topup.id}`;
      const existingLedger = await loadLedgerByReference(
        client,
        referenceKey,
      );
      if (existingLedger != null) {
        await client.query('COMMIT');
        return {
          topup,
          ledgerTransaction: existingLedger,
          duplicateRefund: true,
        };
      }

      if (topup.status !== 'paid') {
        throw new WalletDomainError(
          'INVALID_TOPUP_TRANSITION',
          `Recarga em estado ${topup.status} não pode ser estornada.`,
        );
      }

      const walletAccount =
        `passenger:${topup.passengerId}:wallet`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [walletAccount],
      );

      const refundedAt = (input.refundedAt ?? new Date()).toISOString();
      const updatedResult = await client.query<WalletTopupRow>(
        `
        UPDATE wallet_topups
        SET status = 'refunded', updated_at = $2
        WHERE id = $1
        RETURNING ${TOPUP_COLUMNS}
        `,
        [topup.id, refundedAt],
      );
      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) {
        throw new Error('Falha ao marcar recarga como estornada.');
      }

      const ledger = walletTopupRefundLedger({
        walletTopupId: topup.id,
        passengerId: topup.passengerId,
        processor: topup.processor,
        amountCents: topup.amountCents,
        createdAt: refundedAt,
      });
      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        topup: mapTopup(updatedRow),
        ledgerTransaction: ledger,
        duplicateRefund: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async payRideFromWallet(
    input: PayRideFromWalletInput,
  ): Promise<PayRideFromWalletResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`wallet-payment-idempotency:${input.payment.idempotencyKey}`],
      );

      const existingResult = await client.query<PaymentRow>(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments WHERE idempotency_key = $1 LIMIT 1`,
        [input.payment.idempotencyKey],
      );
      const existingRow = existingResult.rows[0];

      if (existingRow != null) {
        const existing = mapPayment(existingRow);
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

        const ledger = await loadLedgerByReference(
          client,
          `wallet-ride-payment:${existing.id}`,
        );
        if (ledger == null) {
          throw new Error('Pagamento de carteira sem lançamento no ledger.');
        }

        await client.query('COMMIT');
        return {
          payment: existing,
          ledgerTransaction: ledger,
          duplicatePayment: true,
        };
      }

      const accountKey = `passenger:${input.passengerId}:wallet`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [accountKey],
      );
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`payment-ride:${input.payment.rideId}`],
      );

      const alreadyPaid = await client.query<{ id: string }>(
        `
        SELECT id
        FROM payments
        WHERE ride_id = $1
          AND status = 'paid'
        LIMIT 1
        `,
        [input.payment.rideId],
      );
      if (alreadyPaid.rows[0] != null) {
        throw new WalletDomainError(
          'RIDE_ALREADY_PAID',
          'Esta corrida já possui pagamento confirmado.',
        );
      }

      const available = await accountBalanceCents(client, accountKey);
      if (input.payment.amountCents > available) {
        throw new WalletDomainError(
          'INSUFFICIENT_WALLET_BALANCE',
          'Saldo da Carteira Ramo Nessa insuficiente.',
        );
      }

      const paymentResult = await client.query<PaymentRow>(
        `
        INSERT INTO payments (
          id, ride_id, method, processor, processor_payment_id, status,
          amount_cents, idempotency_key, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING ${PAYMENT_COLUMNS}
        `,
        [
          input.payment.id,
          input.payment.rideId,
          'wallet',
          'internal-wallet',
          null,
          'paid',
          input.payment.amountCents,
          input.payment.idempotencyKey,
          input.payment.createdAt,
          input.payment.updatedAt,
        ],
      );

      const ledger = walletRidePaymentLedger({
        rideId: input.payment.rideId,
        paymentId: input.payment.id,
        passengerId: input.passengerId,
        amountCents: input.payment.amountCents,
        createdAt: input.payment.createdAt,
      });

      await insertLedger(client, ledger);
      await client.query('COMMIT');

      const row = paymentResult.rows[0];
      if (row == null) {
        throw new Error('PostgreSQL não retornou pagamento da carteira.');
      }

      return {
        payment: mapPayment(row),
        ledgerTransaction: ledger,
        duplicatePayment: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const code =
        typeof error === 'object' && error != null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';

      const constraint =
        typeof error === 'object' && error != null && 'constraint' in error
          ? String((error as { constraint?: unknown }).constraint ?? '')
          : '';

      if (
        code === '23505' &&
        constraint === 'payments_one_paid_per_ride_idx'
      ) {
        throw new WalletDomainError(
          'RIDE_ALREADY_PAID',
          'Esta corrida já possui pagamento confirmado.',
        );
      }

      if (code === '23505') {
        throw new WalletDomainError(
          'WALLET_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência da carteira já utilizada.',
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async refundWalletRide(
    input: RefundWalletRideInput,
  ): Promise<RefundWalletRideResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`wallet-ride-refund:${input.paymentId}`],
      );

      const paymentResult = await client.query<PaymentRow>(
        `SELECT ${PAYMENT_COLUMNS}
         FROM payments
         WHERE id = $1
         FOR UPDATE`,
        [input.paymentId],
      );
      const row = paymentResult.rows[0];
      if (row == null) {
        throw new WalletDomainError(
          'WALLET_REFUND_NOT_ALLOWED',
          'Pagamento de carteira não encontrado para estorno.',
        );
      }

      const payment = mapPayment(row);
      if (payment.method !== 'wallet') {
        throw new WalletDomainError(
          'WALLET_REFUND_NOT_ALLOWED',
          'Somente pagamento interno da carteira pode usar este estorno.',
        );
      }

      const rideResult = await client.query<{ passenger_id: string }>(
        `SELECT passenger_id
         FROM rides
         WHERE id = $1
         FOR UPDATE`,
        [payment.rideId],
      );
      const passengerId = rideResult.rows[0]?.passenger_id;
      if (passengerId == null || passengerId !== input.passengerId) {
        throw new WalletDomainError(
          'RIDE_PASSENGER_MISMATCH',
          'Pagamento não pertence à carteira deste passageiro.',
        );
      }

      const referenceKey = `wallet-ride-refund:${payment.id}`;
      const existing = await loadLedgerByReference(client, referenceKey);
      if (existing != null) {
        if (existing.paymentId !== payment.id || payment.status !== 'refunded') {
          throw new Error(
            'Estado inconsistente entre estorno da carteira e pagamento.',
          );
        }

        await client.query('COMMIT');
        return {
          payment,
          ledgerTransaction: existing,
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
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [escrowAccount],
      );

      const escrowBalance = await accountBalanceCents(client, escrowAccount);
      if (escrowBalance < payment.amountCents) {
        throw new WalletDomainError(
          'INSUFFICIENT_RIDE_ESCROW',
          'Escrow da corrida não possui saldo suficiente para o estorno.',
        );
      }

      const refundedAt = (input.refundedAt ?? new Date()).toISOString();
      const nextStatus = transitionPayment(payment.status, 'refunded');
      const updatedResult = await client.query<PaymentRow>(
        `
        UPDATE payments
        SET status = $2, updated_at = $3
        WHERE id = $1
        RETURNING ${PAYMENT_COLUMNS}
        `,
        [payment.id, nextStatus, refundedAt],
      );

      const ledger = walletRideRefundLedger({
        rideId: payment.rideId,
        paymentId: payment.id,
        passengerId: input.passengerId,
        amountCents: payment.amountCents,
        createdAt: refundedAt,
      });
      await insertLedger(client, ledger);

      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou pagamento estornado.');
      }

      await client.query('COMMIT');
      return {
        payment: mapPayment(updatedRow),
        ledgerTransaction: ledger,
        duplicateRefund: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async settleRide(input: SettleRideInput): Promise<SettleRideResult> {
    const client = await this.pool.connect();
    const referenceKey = `ride-settlement:${input.rideId}`;
    const debtAccount = `driver:${input.driverId}:commission_debt`;

    try {
      await client.query('BEGIN');

      const existing = await loadLedgerByReference(client, referenceKey);
      if (existing != null) {
        const recovered =
          existing.entries.find(
            (entry) =>
              entry.accountKey === debtAccount &&
              entry.direction === 'credit',
          )?.amountCents ?? 0;
        await client.query('COMMIT');
        return {
          ledgerTransaction: existing,
          duplicateSettlement: true,
          cashDebtRecoveredCents: recovered,
        };
      }

      const paymentResult = await client.query<PaymentRow>(
        `
        SELECT ${PAYMENT_COLUMNS}
        FROM payments
        WHERE id = $1 AND ride_id = $2
        FOR UPDATE
        `,
        [input.paymentId, input.rideId],
      );
      const paymentRow = paymentResult.rows[0];

      if (
        paymentRow == null ||
        paymentRow.status !== 'paid' ||
        paymentRow.amount_cents !== input.totalAmountCents
      ) {
        throw new PaymentDomainError(
          'INVALID_PAYMENT_TRANSITION',
          'Pagamento não está pronto para liquidação.',
        );
      }

      const escrowAccount = `ride:${input.rideId}:escrow`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [escrowAccount],
      );
      const escrowBalance = await accountBalanceCents(
        client,
        escrowAccount,
      );
      if (escrowBalance < input.totalAmountCents) {
        throw new PaymentDomainError(
          'INSUFFICIENT_RIDE_ESCROW',
          'Escrow da corrida não possui saldo suficiente para liquidação.',
        );
      }

      const payableAccount = `driver:${input.driverId}:payable`;
      for (const account of [debtAccount, payableAccount].sort()) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [account],
        );
      }
      const debtBalance = await accountBalanceCents(
        client,
        debtAccount,
      );
      const cashDebtCents = Math.max(0, -debtBalance);
      const cashDebtRecoveredCents = Math.min(
        cashDebtCents,
        input.driverNetCents,
      );

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
        createdAt: (input.settledAt ?? new Date()).toISOString(),
      });

      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        ledgerTransaction: ledger,
        duplicateSettlement: false,
        cashDebtRecoveredCents,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async settleCashRide(
    input: SettleCashRideInput,
  ): Promise<SettleCashRideResult> {
    const client = await this.pool.connect();
    const referenceKey = `cash-ride-commission:${input.rideId}`;
    const debtAccount = `driver:${input.driverId}:commission_debt`;
    const payableAccount = `driver:${input.driverId}:payable`;

    try {
      await client.query('BEGIN');
      for (const account of [debtAccount, payableAccount].sort()) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [account],
        );
      }

      const existing = await loadLedgerByReference(client, referenceKey);
      if (existing != null) {
        const recovered =
          existing.entries.find(
            (entry) =>
              entry.accountKey === payableAccount &&
              entry.direction === 'debit',
          )?.amountCents ?? 0;
        const debtBalance = await accountBalanceCents(
          client,
          debtAccount,
        );
        await client.query('COMMIT');
        return {
          ledgerTransaction: existing,
          duplicateSettlement: true,
          cashCommissionRecoveredFromBalanceCents: recovered,
          cashDebtCents: Math.max(0, -debtBalance),
        };
      }

      const availablePayable = Math.max(
        0,
        await accountBalanceCents(client, payableAccount),
      );
      const debtBalanceBefore = await accountBalanceCents(
        client,
        debtAccount,
      );
      const existingDebtCents = Math.max(0, -debtBalanceBefore);

      const ledger = cashRideCommissionDebtLedger({
        rideId: input.rideId,
        driverId: input.driverId,
        platformCommissionCents: input.platformCommissionCents,
        existingDebtCents,
        availableDriverPayableCents: availablePayable,
        createdAt: (input.settledAt ?? new Date()).toISOString(),
      });
      await insertLedger(client, ledger);

      const recovered =
        ledger.entries.find(
          (entry) =>
            entry.accountKey === payableAccount &&
            entry.direction === 'debit',
        )?.amountCents ?? 0;
      const debtBalance = await accountBalanceCents(
        client,
        debtAccount,
      );
      await client.query('COMMIT');

      return {
        ledgerTransaction: ledger,
        duplicateSettlement: false,
        cashCommissionRecoveredFromBalanceCents: recovered,
        cashDebtCents: Math.max(0, -debtBalance),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDriverPayoutDestination(
    driverId: string,
  ): Promise<DriverPayoutDestination | null> {
    const result = await this.pool.query<DriverPayoutDestinationRow>(
      `
      SELECT driver_id, pix_key_type, pix_key, created_at, updated_at
      FROM driver_payout_destinations
      WHERE driver_id = $1
      LIMIT 1
      `,
      [driverId],
    );
    const row = result.rows[0];
    if (row == null) return null;
    return {
      driverId: row.driver_id,
      pixKeyType: row.pix_key_type,
      pixKey: row.pix_key,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async upsertDriverPayoutDestination(
    destination: DriverPayoutDestination,
  ): Promise<DriverPayoutDestination> {
    const result = await this.pool.query<DriverPayoutDestinationRow>(
      `
      INSERT INTO driver_payout_destinations (
        driver_id, pix_key_type, pix_key, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (driver_id)
      DO UPDATE SET
        pix_key_type = EXCLUDED.pix_key_type,
        pix_key = EXCLUDED.pix_key,
        updated_at = EXCLUDED.updated_at
      RETURNING driver_id, pix_key_type, pix_key, created_at, updated_at
      `,
      [
        destination.driverId,
        destination.pixKeyType,
        destination.pixKey,
        destination.createdAt,
        destination.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Destino Pix do motorista não foi persistido.');
    }
    return {
      driverId: row.driver_id,
      pixKeyType: row.pix_key_type,
      pixKey: row.pix_key,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async reserveDriverPayout(
    payout: DriverPayoutRecord,
  ): Promise<ReserveDriverPayoutResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`driver-payout-idempotency:${payout.idempotencyKey}`],
      );

      const existingResult = await client.query<DriverPayoutRow>(
        `
        SELECT ${PAYOUT_COLUMNS}
        FROM driver_payouts
        WHERE idempotency_key = $1
        LIMIT 1
        `,
        [payout.idempotencyKey],
      );
      const existingRow = existingResult.rows[0];

      if (existingRow != null) {
        const existing = mapPayout(existingRow);
        if (
          existing.driverId !== payout.driverId ||
          existing.amountCents !== payout.amountCents
        ) {
          throw new PayoutDomainError(
            'PAYOUT_IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada em outro saque.',
          );
        }

        const ledger = await loadLedgerByReference(
          client,
          `driver-payout-reserve:${existing.id}`,
        );
        if (ledger == null) {
          throw new Error('Saque idempotente sem lançamento no ledger.');
        }

        await client.query('COMMIT');
        return {
          payout: existing,
          ledgerTransaction: ledger,
          duplicateRequest: true,
        };
      }

      const accountKey = `driver:${payout.driverId}:payable`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [accountKey],
      );

      const available = await accountBalanceCents(client, accountKey);
      const requestedAmountCents = payoutRequestedAmountCents(payout);
      if (requestedAmountCents > available) {
        throw new PayoutDomainError(
          'INSUFFICIENT_DRIVER_BALANCE',
          'Saldo disponível insuficiente para o saque.',
        );
      }

      const inserted = await client.query<DriverPayoutRow>(
        `
        INSERT INTO driver_payouts (
          id, driver_id, amount_cents, status, idempotency_key,
          payout_kind, requested_amount_cents, fee_cents, approved_at,
          pix_key_type, pix_key,
          processor, processor_payout_id, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING ${PAYOUT_COLUMNS}
        `,
        [
          payout.id,
          payout.driverId,
          payout.amountCents,
          payout.status,
          payout.idempotencyKey,
          payout.payoutKind ?? 'legacy',
          requestedAmountCents,
          payout.feeCents ?? 0,
          payout.approvedAt ?? null,
          payout.pixKeyType,
          payout.pixKey,
          payout.processor ?? null,
          payout.processorPayoutId ?? null,
          payout.createdAt,
          payout.updatedAt,
        ],
      );

      const ledger = driverPayoutReserveLedger({
        payoutId: payout.id,
        driverId: payout.driverId,
        amountCents: requestedAmountCents,
        createdAt: payout.createdAt,
      });

      await insertLedger(client, ledger);
      await client.query('COMMIT');

      const row = inserted.rows[0];
      if (row == null) {
        throw new Error('PostgreSQL não retornou o saque criado.');
      }

      return {
        payout: mapPayout(row),
        ledgerTransaction: ledger,
        duplicateRequest: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const code =
        typeof error === 'object' && error != null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';

      if (code === '23505') {
        throw new PayoutDomainError(
          'PAYOUT_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência do saque já utilizada.',
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async findDriverPayoutById(
    id: string,
  ): Promise<DriverPayoutRecord | null> {
    const result = await this.pool.query<DriverPayoutRow>(
      `SELECT ${PAYOUT_COLUMNS}
       FROM driver_payouts
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] == null
      ? null
      : mapPayout(result.rows[0]);
  }

  async approveDriverPayout(
    input: ApproveDriverPayoutInput,
  ): Promise<ApproveDriverPayoutResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`driver-payout:${input.payoutId}`],
      );
      const current = await client.query<DriverPayoutRow>(
        `SELECT ${PAYOUT_COLUMNS}
         FROM driver_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = current.rows[0];
      if (row == null) {
        throw new PayoutDomainError('PAYOUT_NOT_FOUND', 'Saque não encontrado.');
      }
      const payout = mapPayout(row);
      if (payout.approvedAt != null) {
        const existing = await loadLedgerByReference(
          client,
          `driver-payout-anticipation-fee:${payout.id}`,
        );
        await client.query('COMMIT');
        return {
          payout,
          ...(existing == null ? {} : { ledgerTransaction: existing }),
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
        const pendingAccount = `driver:${payout.driverId}:payout_pending`;
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [pendingAccount],
        );
        const pending = await accountBalanceCents(client, pendingAccount);
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
        await insertLedger(client, ledgerTransaction);
      }

      const updated = await client.query<DriverPayoutRow>(
        `UPDATE driver_payouts
         SET approved_at = $2, updated_at = $2
         WHERE id = $1
         RETURNING ${PAYOUT_COLUMNS}`,
        [payout.id, approvedAt],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou saque aprovado.');
      }
      await client.query('COMMIT');
      return {
        payout: mapPayout(updatedRow),
        ...(ledgerTransaction == null ? {} : { ledgerTransaction }),
        duplicateApproval: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listDriverPayoutsByStatus(
    statuses: readonly DriverPayoutRecord['status'][],
    limit: number,
  ): Promise<DriverPayoutRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    if (statuses.length === 0) return [];
    const result = await this.pool.query<DriverPayoutRow>(
      `SELECT ${PAYOUT_COLUMNS}
       FROM driver_payouts
       WHERE status = ANY($1::text[])
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [statuses, safeLimit],
    );
    return result.rows.map(mapPayout);
  }

  async startDriverPayout(
    input: StartDriverPayoutInput,
  ): Promise<StartDriverPayoutResult> {
    const processor = input.processor.trim();
    const processorPayoutId = input.processorPayoutId.trim();
    if (processor.length < 2 || processorPayoutId.length < 3) {
      throw new PayoutDomainError(
        'PAYOUT_PROCESSOR_REQUIRED',
        'Processador e referência do repasse são obrigatórios.',
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`driver-payout:${input.payoutId}`],
      );

      const currentResult = await client.query<DriverPayoutRow>(
        `SELECT ${PAYOUT_COLUMNS}
         FROM driver_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = currentResult.rows[0];
      if (row == null) {
        throw new PayoutDomainError(
          'PAYOUT_NOT_FOUND',
          'Saque não encontrado.',
        );
      }
      const payout = mapPayout(row);

      if (payoutRequiresAdminApproval(payout)) {
        throw new PayoutDomainError(
          'PAYOUT_APPROVAL_REQUIRED',
          'Antecipação aguarda aprovação administrativa.',
        );
      }

      if (payout.status === 'processing') {
        if (
          payout.processor === processor &&
          payout.processorPayoutId === processorPayoutId
        ) {
          await client.query('COMMIT');
          return { payout, duplicateStart: true };
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

      const startedAt = (input.startedAt ?? new Date()).toISOString();
      const updated = await client.query<DriverPayoutRow>(
        `UPDATE driver_payouts
         SET status = 'processing',
             processor = $2,
             processor_payout_id = $3,
             updated_at = $4
         WHERE id = $1
         RETURNING ${PAYOUT_COLUMNS}`,
        [payout.id, processor, processorPayoutId, startedAt],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou saque em processamento.');
      }

      await client.query('COMMIT');
      return {
        payout: mapPayout(updatedRow),
        duplicateStart: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async failDriverPayout(
    input: FailDriverPayoutInput,
  ): Promise<FailDriverPayoutResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`driver-payout:${input.payoutId}`],
      );

      const result = await client.query<DriverPayoutRow>(
        `SELECT ${PAYOUT_COLUMNS}
         FROM driver_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = result.rows[0];
      if (row == null) {
        throw new PayoutDomainError(
          'PAYOUT_NOT_FOUND',
          'Saque não encontrado.',
        );
      }
      const payout = mapPayout(row);
      const referenceKey = `driver-payout-failed:${payout.id}`;

      if (payout.status === 'failed') {
        const existing = await loadLedgerByReference(client, referenceKey);
        if (existing == null) {
          throw new Error(
            'Saque falho sem lançamento de devolução no ledger.',
          );
        }
        await client.query('COMMIT');
        return {
          payout,
          ledgerTransaction: existing,
          duplicateFailure: true,
        };
      }

      if (payout.status !== 'requested' && payout.status !== 'processing') {
        throw new PayoutDomainError(
          'INVALID_PAYOUT_TRANSITION',
          `Saque em estado ${payout.status} não pode falhar.`,
        );
      }

      const pendingAccount =
        `driver:${payout.driverId}:payout_pending`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [pendingAccount],
      );
      const feeApplied =
        payout.approvedAt != null && payoutFeeCents(payout) > 0;
      const expectedPendingCents = feeApplied
        ? payout.amountCents
        : payoutRequestedAmountCents(payout);
      const pending = await accountBalanceCents(client, pendingAccount);
      if (pending < expectedPendingCents) {
        throw new PayoutDomainError(
          'INVALID_PAYOUT_TRANSITION',
          'Saldo pendente do saque não fecha com o ledger.',
        );
      }

      const failedAt = (input.failedAt ?? new Date()).toISOString();
      const updatedResult = await client.query<DriverPayoutRow>(
        `UPDATE driver_payouts
         SET status = 'failed',
             processor = COALESCE($2, processor),
             processor_payout_id = COALESCE($3, processor_payout_id),
             updated_at = $4
         WHERE id = $1
         RETURNING ${PAYOUT_COLUMNS}`,
        [
          payout.id,
          input.processor?.trim() || null,
          input.processorPayoutId?.trim() || null,
          failedAt,
        ],
      );
      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou saque falho.');
      }

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
      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        payout: mapPayout(updatedRow),
        ledgerTransaction: ledger,
        duplicateFailure: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeDriverPayout(
    input: CompleteDriverPayoutInput,
  ): Promise<CompleteDriverPayoutResult> {
    const processor = input.processor.trim();
    if (processor.length < 2 || processor.length > 80) {
      throw new PayoutDomainError(
        'PAYOUT_PROCESSOR_REQUIRED',
        'Informe o processador ou método usado no repasse.',
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`driver-payout:${input.payoutId}`],
      );

      const result = await client.query<DriverPayoutRow>(
        `SELECT ${PAYOUT_COLUMNS}
         FROM driver_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = result.rows[0];
      if (row == null) {
        throw new PayoutDomainError(
          'PAYOUT_NOT_FOUND',
          'Saque não encontrado.',
        );
      }
      const payout = mapPayout(row);
      const referenceKey = `driver-payout-paid:${payout.id}`;

      if (payout.status === 'paid') {
        const existing = await loadLedgerByReference(
          client,
          referenceKey,
        );
        if (existing == null) {
          throw new Error(
            'Saque pago sem lançamento de conclusão no ledger.',
          );
        }
        await client.query('COMMIT');
        return {
          payout,
          ledgerTransaction: existing,
          duplicateCompletion: true,
        };
      }

      if (payoutRequiresAdminApproval(payout)) {
        throw new PayoutDomainError(
          'PAYOUT_APPROVAL_REQUIRED',
          'Antecipação aguarda aprovação administrativa.',
        );
      }

      if (
        payout.status !== 'requested' &&
        payout.status !== 'processing'
      ) {
        throw new PayoutDomainError(
          'INVALID_PAYOUT_TRANSITION',
          `Saque em estado ${payout.status} não pode ser concluído.`,
        );
      }

      const pendingAccount =
        `driver:${payout.driverId}:payout_pending`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [pendingAccount],
      );
      const pending = await accountBalanceCents(
        client,
        pendingAccount,
      );
      if (pending < payout.amountCents) {
        throw new PayoutDomainError(
          'INVALID_PAYOUT_TRANSITION',
          'Saldo pendente do saque não fecha com o ledger.',
        );
      }

      const completedAt =
        (input.completedAt ?? new Date()).toISOString();
      const updatedResult = await client.query<DriverPayoutRow>(
        `UPDATE driver_payouts
         SET
           status = 'paid',
           processor = $2,
           processor_payout_id = $3,
           updated_at = $4
         WHERE id = $1
         RETURNING ${PAYOUT_COLUMNS}`,
        [
          payout.id,
          processor,
          input.processorPayoutId?.trim() || null,
          completedAt,
        ],
      );
      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou saque concluído.');
      }

      const ledger = driverPayoutPaidLedger({
        payoutId: payout.id,
        driverId: payout.driverId,
        processor,
        amountCents: payout.amountCents,
        createdAt: completedAt,
      });
      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        payout: mapPayout(updatedRow),
        ledgerTransaction: ledger,
        duplicateCompletion: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelDriverPayout(
    input: CancelDriverPayoutInput,
  ): Promise<CancelDriverPayoutResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`driver-payout:${input.payoutId}`],
      );

      const result = await client.query<DriverPayoutRow>(
        `SELECT ${PAYOUT_COLUMNS}
         FROM driver_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = result.rows[0];
      if (row == null) {
        throw new PayoutDomainError(
          'PAYOUT_NOT_FOUND',
          'Saque não encontrado.',
        );
      }
      const payout = mapPayout(row);
      const referenceKey =
        `driver-payout-cancelled:${payout.id}`;

      if (payout.status === 'cancelled') {
        const existing = await loadLedgerByReference(
          client,
          referenceKey,
        );
        if (existing == null) {
          throw new Error(
            'Saque cancelado sem lançamento de devolução no ledger.',
          );
        }
        await client.query('COMMIT');
        return {
          payout,
          ledgerTransaction: existing,
          duplicateCancellation: true,
        };
      }

      if (
        payout.status !== 'requested' &&
        payout.status !== 'processing'
      ) {
        throw new PayoutDomainError(
          'INVALID_PAYOUT_TRANSITION',
          `Saque em estado ${payout.status} não pode ser cancelado.`,
        );
      }

      const pendingAccount =
        `driver:${payout.driverId}:payout_pending`;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [pendingAccount],
      );
      const feeApplied =
        payout.approvedAt != null && payoutFeeCents(payout) > 0;
      const expectedPendingCents = feeApplied
        ? payout.amountCents
        : payoutRequestedAmountCents(payout);
      const pending = await accountBalanceCents(
        client,
        pendingAccount,
      );
      if (pending < expectedPendingCents) {
        throw new PayoutDomainError(
          'INVALID_PAYOUT_TRANSITION',
          'Saldo pendente do saque não fecha com o ledger.',
        );
      }

      const cancelledAt =
        (input.cancelledAt ?? new Date()).toISOString();
      const updatedResult = await client.query<DriverPayoutRow>(
        `UPDATE driver_payouts
         SET status = 'cancelled', updated_at = $2
         WHERE id = $1
         RETURNING ${PAYOUT_COLUMNS}`,
        [payout.id, cancelledAt],
      );
      const updatedRow = updatedResult.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou saque cancelado.');
      }

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
      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        payout: mapPayout(updatedRow),
        ledgerTransaction: ledger,
        duplicateCancellation: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reserveCompanyPayout(
    payout: CompanyPayoutRecord,
  ): Promise<ReserveCompanyPayoutResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`company-payout-idempotency:${payout.idempotencyKey}`],
      );

      const existingResult = await client.query<CompanyPayoutRow>(
        `SELECT ${COMPANY_PAYOUT_COLUMNS}
         FROM company_payouts
         WHERE idempotency_key = $1
         LIMIT 1`,
        [payout.idempotencyKey],
      );
      const existingRow = existingResult.rows[0];
      if (existingRow != null) {
        const existing = mapCompanyPayout(existingRow);
        if (existing.amountCents !== payout.amountCents) {
          throw new CompanyPayoutError(
            'COMPANY_PAYOUT_IDEMPOTENCY_CONFLICT',
            'Chave de idempotência já utilizada em outro repasse da empresa.',
          );
        }
        const ledger = await loadLedgerByReference(
          client,
          `company-payout-reserve:${existing.id}`,
        );
        if (ledger == null) {
          throw new Error(
            'Repasse idempotente da empresa sem lançamento no ledger.',
          );
        }
        await client.query('COMMIT');
        return {
          payout: existing,
          ledgerTransaction: ledger,
          duplicateRequest: true,
        };
      }

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['platform:company-payout'],
      );
      const platformRevenueCents = await accountBalanceCents(
        client,
        'platform:revenue',
      );
      const driverCashDebtCents = await totalDriverCashDebtCents(client);
      const availableCents = Math.max(
        0,
        platformRevenueCents - driverCashDebtCents,
      );
      if (payout.amountCents > availableCents) {
        throw new CompanyPayoutError(
          'INSUFFICIENT_COMPANY_BALANCE',
          'Saldo disponível da empresa insuficiente para o repasse.',
        );
      }

      const inserted = await client.query<CompanyPayoutRow>(
        `INSERT INTO company_payouts (
          id, amount_cents, status, idempotency_key,
          pix_key_type, pix_key,
          processor, processor_payout_id, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING ${COMPANY_PAYOUT_COLUMNS}`,
        [
          payout.id,
          payout.amountCents,
          payout.status,
          payout.idempotencyKey,
          payout.pixKeyType,
          payout.pixKey,
          payout.processor ?? null,
          payout.processorPayoutId ?? null,
          payout.createdAt,
          payout.updatedAt,
        ],
      );

      const ledger = companyPayoutReserveLedger({
        companyPayoutId: payout.id,
        amountCents: payout.amountCents,
        createdAt: payout.createdAt,
      });
      await insertLedger(client, ledger);
      await client.query('COMMIT');

      const row = inserted.rows[0];
      if (row == null) {
        throw new Error(
          'PostgreSQL não retornou o repasse da empresa criado.',
        );
      }
      return {
        payout: mapCompanyPayout(row),
        ledgerTransaction: ledger,
        duplicateRequest: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      const code =
        typeof error === 'object' && error != null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      if (code === '23505') {
        throw new CompanyPayoutError(
          'COMPANY_PAYOUT_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência do repasse da empresa já utilizada.',
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async findCompanyPayoutById(
    id: string,
  ): Promise<CompanyPayoutRecord | null> {
    const result = await this.pool.query<CompanyPayoutRow>(
      `SELECT ${COMPANY_PAYOUT_COLUMNS}
       FROM company_payouts
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return result.rows[0] == null
      ? null
      : mapCompanyPayout(result.rows[0]);
  }

  async listCompanyPayoutsByStatus(
    statuses: readonly CompanyPayoutRecord['status'][],
    limit: number,
  ): Promise<CompanyPayoutRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    if (statuses.length === 0) return [];
    const result = await this.pool.query<CompanyPayoutRow>(
      `SELECT ${COMPANY_PAYOUT_COLUMNS}
       FROM company_payouts
       WHERE status = ANY($1::text[])
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [statuses, safeLimit],
    );
    return result.rows.map(mapCompanyPayout);
  }

  async startCompanyPayout(
    input: StartCompanyPayoutInput,
  ): Promise<StartCompanyPayoutResult> {
    const processor = input.processor.trim();
    const processorPayoutId = input.processorPayoutId.trim();
    if (processor.length < 2 || processorPayoutId.length < 3) {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Processador do repasse da empresa é inválido.',
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`company-payout:${input.payoutId}`],
      );
      const current = await client.query<CompanyPayoutRow>(
        `SELECT ${COMPANY_PAYOUT_COLUMNS}
         FROM company_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = current.rows[0];
      if (row == null) {
        throw new CompanyPayoutError(
          'COMPANY_PAYOUT_NOT_FOUND',
          'Repasse da empresa não encontrado.',
        );
      }
      const payout = mapCompanyPayout(row);
      if (payout.status === 'processing') {
        if (
          payout.processor === processor &&
          payout.processorPayoutId === processorPayoutId
        ) {
          await client.query('COMMIT');
          return { payout, duplicateStart: true };
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
      const startedAt = (input.startedAt ?? new Date()).toISOString();
      const updated = await client.query<CompanyPayoutRow>(
        `UPDATE company_payouts
         SET status = 'processing',
             processor = $2,
             processor_payout_id = $3,
             updated_at = $4
         WHERE id = $1
         RETURNING ${COMPANY_PAYOUT_COLUMNS}`,
        [payout.id, processor, processorPayoutId, startedAt],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow == null) {
        throw new Error(
          'PostgreSQL não retornou repasse da empresa em processamento.',
        );
      }
      await client.query('COMMIT');
      return {
        payout: mapCompanyPayout(updatedRow),
        duplicateStart: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async failCompanyPayout(
    input: FailCompanyPayoutInput,
  ): Promise<FailCompanyPayoutResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`company-payout:${input.payoutId}`],
      );
      const current = await client.query<CompanyPayoutRow>(
        `SELECT ${COMPANY_PAYOUT_COLUMNS}
         FROM company_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = current.rows[0];
      if (row == null) {
        throw new CompanyPayoutError(
          'COMPANY_PAYOUT_NOT_FOUND',
          'Repasse da empresa não encontrado.',
        );
      }
      const payout = mapCompanyPayout(row);
      const referenceKey = `company-payout-failed:${payout.id}`;
      if (payout.status === 'failed') {
        const existing = await loadLedgerByReference(client, referenceKey);
        if (existing == null) {
          throw new Error(
            'Repasse da empresa falho sem devolução no ledger.',
          );
        }
        await client.query('COMMIT');
        return {
          payout,
          ledgerTransaction: existing,
          duplicateFailure: true,
        };
      }
      if (payout.status !== 'requested' && payout.status !== 'processing') {
        throw new CompanyPayoutError(
          'INVALID_COMPANY_PAYOUT_TRANSITION',
          `Repasse da empresa em estado ${payout.status} não pode falhar.`,
        );
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['platform:company_payout_pending'],
      );
      const pending = await accountBalanceCents(
        client,
        'platform:company_payout_pending',
      );
      if (pending < payout.amountCents) {
        throw new CompanyPayoutError(
          'INVALID_COMPANY_PAYOUT_TRANSITION',
          'Saldo pendente da empresa não fecha com o ledger.',
        );
      }

      const failedAt = (input.failedAt ?? new Date()).toISOString();
      const updated = await client.query<CompanyPayoutRow>(
        `UPDATE company_payouts
         SET status = 'failed',
             processor = COALESCE($2, processor),
             processor_payout_id = COALESCE($3, processor_payout_id),
             updated_at = $4
         WHERE id = $1
         RETURNING ${COMPANY_PAYOUT_COLUMNS}`,
        [
          payout.id,
          input.processor?.trim() || null,
          input.processorPayoutId?.trim() || null,
          failedAt,
        ],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou repasse da empresa falho.');
      }
      const ledger = companyPayoutFailedLedger({
        companyPayoutId: payout.id,
        amountCents: payout.amountCents,
        createdAt: failedAt,
      });
      await insertLedger(client, ledger);
      await client.query('COMMIT');
      return {
        payout: mapCompanyPayout(updatedRow),
        ledgerTransaction: ledger,
        duplicateFailure: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeCompanyPayout(
    input: CompleteCompanyPayoutInput,
  ): Promise<CompleteCompanyPayoutResult> {
    const processor = input.processor.trim();
    if (processor.length < 2 || processor.length > 80) {
      throw new CompanyPayoutError(
        'INVALID_COMPANY_PAYOUT_TRANSITION',
        'Processador do repasse da empresa é inválido.',
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`company-payout:${input.payoutId}`],
      );
      const current = await client.query<CompanyPayoutRow>(
        `SELECT ${COMPANY_PAYOUT_COLUMNS}
         FROM company_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = current.rows[0];
      if (row == null) {
        throw new CompanyPayoutError(
          'COMPANY_PAYOUT_NOT_FOUND',
          'Repasse da empresa não encontrado.',
        );
      }
      const payout = mapCompanyPayout(row);
      const referenceKey = `company-payout-paid:${payout.id}`;
      if (payout.status === 'paid') {
        const existing = await loadLedgerByReference(client, referenceKey);
        if (existing == null) {
          throw new Error(
            'Repasse da empresa pago sem conclusão no ledger.',
          );
        }
        await client.query('COMMIT');
        return {
          payout,
          ledgerTransaction: existing,
          duplicateCompletion: true,
        };
      }
      if (payout.status !== 'requested' && payout.status !== 'processing') {
        throw new CompanyPayoutError(
          'INVALID_COMPANY_PAYOUT_TRANSITION',
          `Repasse da empresa em estado ${payout.status} não pode concluir.`,
        );
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['platform:company_payout_pending'],
      );
      const pending = await accountBalanceCents(
        client,
        'platform:company_payout_pending',
      );
      if (pending < payout.amountCents) {
        throw new CompanyPayoutError(
          'INVALID_COMPANY_PAYOUT_TRANSITION',
          'Saldo pendente da empresa não fecha com o ledger.',
        );
      }

      const completedAt =
        (input.completedAt ?? new Date()).toISOString();
      const updated = await client.query<CompanyPayoutRow>(
        `UPDATE company_payouts
         SET status = 'paid',
             processor = $2,
             processor_payout_id = $3,
             updated_at = $4
         WHERE id = $1
         RETURNING ${COMPANY_PAYOUT_COLUMNS}`,
        [
          payout.id,
          processor,
          input.processorPayoutId?.trim() || null,
          completedAt,
        ],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow == null) {
        throw new Error('PostgreSQL não retornou repasse da empresa pago.');
      }
      const ledger = companyPayoutPaidLedger({
        companyPayoutId: payout.id,
        processor,
        amountCents: payout.amountCents,
        createdAt: completedAt,
      });
      await insertLedger(client, ledger);
      await client.query('COMMIT');
      return {
        payout: mapCompanyPayout(updatedRow),
        ledgerTransaction: ledger,
        duplicateCompletion: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelCompanyPayout(
    input: CancelCompanyPayoutInput,
  ): Promise<CancelCompanyPayoutResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`company-payout:${input.payoutId}`],
      );
      const current = await client.query<CompanyPayoutRow>(
        `SELECT ${COMPANY_PAYOUT_COLUMNS}
         FROM company_payouts
         WHERE id = $1
         FOR UPDATE`,
        [input.payoutId],
      );
      const row = current.rows[0];
      if (row == null) {
        throw new CompanyPayoutError(
          'COMPANY_PAYOUT_NOT_FOUND',
          'Repasse da empresa não encontrado.',
        );
      }
      const payout = mapCompanyPayout(row);
      const referenceKey = `company-payout-cancelled:${payout.id}`;
      if (payout.status === 'cancelled') {
        const existing = await loadLedgerByReference(client, referenceKey);
        if (existing == null) {
          throw new Error(
            'Repasse da empresa cancelado sem devolução no ledger.',
          );
        }
        await client.query('COMMIT');
        return {
          payout,
          ledgerTransaction: existing,
          duplicateCancellation: true,
        };
      }
      if (payout.status !== 'requested') {
        throw new CompanyPayoutError(
          'INVALID_COMPANY_PAYOUT_TRANSITION',
          'Só é possível cancelar repasse da empresa ainda não enviado.',
        );
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        ['platform:company_payout_pending'],
      );
      const pending = await accountBalanceCents(
        client,
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
      const updated = await client.query<CompanyPayoutRow>(
        `UPDATE company_payouts
         SET status = 'cancelled', updated_at = $2
         WHERE id = $1
         RETURNING ${COMPANY_PAYOUT_COLUMNS}`,
        [payout.id, cancelledAt],
      );
      const updatedRow = updated.rows[0];
      if (updatedRow == null) {
        throw new Error(
          'PostgreSQL não retornou repasse da empresa cancelado.',
        );
      }
      const ledger = companyPayoutCancelledLedger({
        companyPayoutId: payout.id,
        amountCents: payout.amountCents,
        createdAt: cancelledAt,
      });
      await insertLedger(client, ledger);
      await client.query('COMMIT');
      return {
        payout: mapCompanyPayout(updatedRow),
        ledgerTransaction: ledger,
        duplicateCancellation: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCompanyPayoutDestination():
    Promise<CompanyPayoutDestination | null> {
    const result = await this.pool.query<CompanyPayoutDestinationRow>(
      `SELECT pix_key_type, pix_key, created_at, updated_at
       FROM company_payout_destination
       WHERE id = 1
       LIMIT 1`,
    );
    const row = result.rows[0];
    return row == null
      ? null
      : {
          pixKeyType: row.pix_key_type,
          pixKey: row.pix_key,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        };
  }

  async upsertCompanyPayoutDestination(
    destination: CompanyPayoutDestination,
  ): Promise<CompanyPayoutDestination> {
    const result = await this.pool.query<CompanyPayoutDestinationRow>(
      `INSERT INTO company_payout_destination (
         id, pix_key_type, pix_key, created_at, updated_at
       ) VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         pix_key_type = EXCLUDED.pix_key_type,
         pix_key = EXCLUDED.pix_key,
         updated_at = EXCLUDED.updated_at
       RETURNING pix_key_type, pix_key, created_at, updated_at`,
      [
        destination.pixKeyType,
        destination.pixKey,
        destination.createdAt,
        destination.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error(
        'PostgreSQL não retornou destino Pix da empresa.',
      );
    }
    return {
      pixKeyType: row.pix_key_type,
      pixKey: row.pix_key,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async listRecentCompanyPayouts(
    limit: number,
  ): Promise<CompanyPayoutRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<CompanyPayoutRow>(
      `SELECT ${COMPANY_PAYOUT_COLUMNS}
       FROM company_payouts
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map(mapCompanyPayout);
  }

  async getDriverPayoutSettings(): Promise<DriverPayoutSettings> {
    const result = await this.pool.query<{
      automatic_enabled: boolean;
      updated_at: Date;
    }>(
      `SELECT automatic_enabled, updated_at
       FROM driver_payout_settings
       WHERE id = 1
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de repasses não foi inicializada.');
    }
    return {
      automaticEnabled: row.automatic_enabled,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async setDriverPayoutAutomaticEnabled(
    input: SetDriverPayoutAutomaticEnabledInput,
  ): Promise<DriverPayoutSettings> {
    const updatedAt = (input.updatedAt ?? new Date()).toISOString();
    const result = await this.pool.query<{
      automatic_enabled: boolean;
      updated_at: Date;
    }>(
      `UPDATE driver_payout_settings
       SET automatic_enabled = $1, updated_at = $2
       WHERE id = 1
       RETURNING automatic_enabled, updated_at`,
      [input.automaticEnabled, updatedAt],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de repasses não foi encontrada.');
    }
    return {
      automaticEnabled: row.automatic_enabled,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async listDriverPayoutCandidates(
    limit: number,
  ): Promise<DriverPayoutCandidate[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const result = await this.pool.query<{
      driver_id: string;
      available_balance_cents: string;
      pix_key_type: DriverPayoutDestination['pixKeyType'] | null;
      pix_key: string | null;
      destination_created_at: Date | null;
      destination_updated_at: Date | null;
    }>(
      `
      WITH balances AS (
        SELECT
          substring(entry.account_key from '^driver:(.+):payable$') AS driver_id,
          SUM(
            CASE WHEN entry.direction = 'credit'
              THEN entry.amount_cents ELSE -entry.amount_cents END
          ) AS available_balance_cents
        FROM ledger_entries AS entry
        WHERE entry.account_key ~ '^driver:.+:payable$'
        GROUP BY entry.account_key
      )
      SELECT
        balances.driver_id,
        balances.available_balance_cents::text,
        destination.pix_key_type,
        destination.pix_key,
        destination.created_at AS destination_created_at,
        destination.updated_at AS destination_updated_at
      FROM balances
      LEFT JOIN driver_payout_destinations AS destination
        ON destination.driver_id = balances.driver_id
      WHERE balances.available_balance_cents > 0
      ORDER BY balances.available_balance_cents DESC, balances.driver_id
      LIMIT $1
      `,
      [safeLimit],
    );

    return result.rows.map((row) => ({
      driverId: row.driver_id,
      availableBalanceCents: Number(row.available_balance_cents),
      destination:
        row.pix_key_type == null ||
        row.pix_key == null ||
        row.destination_created_at == null ||
        row.destination_updated_at == null
          ? null
          : {
              driverId: row.driver_id,
              pixKeyType: row.pix_key_type,
              pixKey: row.pix_key,
              createdAt: row.destination_created_at.toISOString(),
              updatedAt: row.destination_updated_at.toISOString(),
            },
    }));
  }

  async adminFinanceSummary(): Promise<AdminFinanceSummary> {
    const [payments, ledger, payouts, externalAdjustments] =
      await Promise.all([
      this.pool.query<{
        payments_total: string;
        payments_paid: string;
        payments_paid_cents: string;
        payments_pending: string;
        payments_failed: string;
        payments_cancelled: string;
        payments_refunded: string;
      }>(`
        SELECT
          COUNT(*)::text AS payments_total,
          COUNT(*) FILTER (WHERE status = 'paid')::text AS payments_paid,
          COALESCE(
            SUM(amount_cents) FILTER (WHERE status = 'paid'),
            0
          )::text AS payments_paid_cents,
          COUNT(*) FILTER (
            WHERE status IN ('created', 'pending', 'authorized')
          )::text AS payments_pending,
          COUNT(*) FILTER (WHERE status = 'failed')::text
            AS payments_failed,
          COUNT(*) FILTER (WHERE status = 'cancelled')::text
            AS payments_cancelled,
          COUNT(*) FILTER (WHERE status = 'refunded')::text
            AS payments_refunded
        FROM payments
      `),
      this.pool.query<{
        platform_revenue_cents: string;
        company_payout_pending_cents: string;
        external_adjustment_review_cents: string;
        driver_payable_cents: string;
        driver_payout_pending_cents: string;
        driver_cash_commission_debt_cents: string;
        ride_escrow_cents: string;
        passenger_wallet_cents: string;
      }>(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN account_key = 'platform:revenue'
              THEN CASE WHEN direction = 'credit'
                THEN amount_cents ELSE -amount_cents END
              ELSE 0
            END
          ), 0)::text AS platform_revenue_cents,
          COALESCE(SUM(
            CASE
              WHEN account_key = 'platform:company_payout_pending'
              THEN CASE WHEN direction = 'credit'
                THEN amount_cents ELSE -amount_cents END
              ELSE 0
            END
          ), 0)::text AS company_payout_pending_cents,
          GREATEST(
            -COALESCE(SUM(
              CASE
                WHEN account_key = 'platform:external_adjustment_review'
                THEN CASE WHEN direction = 'credit'
                  THEN amount_cents ELSE -amount_cents END
                ELSE 0
              END
            ), 0),
            0
          )::text AS external_adjustment_review_cents,
          COALESCE(SUM(
            CASE
              WHEN account_key LIKE 'driver:%:payable'
              THEN CASE WHEN direction = 'credit'
                THEN amount_cents ELSE -amount_cents END
              ELSE 0
            END
          ), 0)::text AS driver_payable_cents,
          COALESCE(SUM(
            CASE
              WHEN account_key LIKE 'driver:%:payout_pending'
              THEN CASE WHEN direction = 'credit'
                THEN amount_cents ELSE -amount_cents END
              ELSE 0
            END
          ), 0)::text AS driver_payout_pending_cents,
          GREATEST(
            COALESCE(SUM(
              CASE
                WHEN account_key LIKE 'driver:%:commission_debt'
                THEN CASE WHEN direction = 'debit'
                  THEN amount_cents ELSE -amount_cents END
                ELSE 0
              END
            ), 0),
            0
          )::text AS driver_cash_commission_debt_cents,
          COALESCE(SUM(
            CASE
              WHEN account_key LIKE 'ride:%:escrow'
              THEN CASE WHEN direction = 'credit'
                THEN amount_cents ELSE -amount_cents END
              ELSE 0
            END
          ), 0)::text AS ride_escrow_cents,
          COALESCE(SUM(
            CASE
              WHEN account_key LIKE 'passenger:%:wallet'
              THEN CASE WHEN direction = 'credit'
                THEN amount_cents ELSE -amount_cents END
              ELSE 0
            END
          ), 0)::text AS passenger_wallet_cents
        FROM ledger_entries
      `),
      this.pool.query<{
        payouts_requested: string;
        payouts_requested_cents: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'requested')::text
            AS payouts_requested,
          COALESCE(
            SUM(requested_amount_cents) FILTER (WHERE status = 'requested'),
            0
          )::text AS payouts_requested_cents
        FROM driver_payouts
      `),
      this.pool.query<{ review_count: string }>(`
        SELECT COUNT(*)::text AS review_count
        FROM payment_external_adjustments
        WHERE accounting_status = 'review_required'
      `),
    ]);

    const paymentRow = payments.rows[0];
    const ledgerRow = ledger.rows[0];
    const payoutRow = payouts.rows[0];
    const externalAdjustmentRow = externalAdjustments.rows[0];

    return {
      paymentsTotal: Number(paymentRow?.payments_total ?? '0'),
      paymentsPaid: Number(paymentRow?.payments_paid ?? '0'),
      paymentsPaidCents: Number(
        paymentRow?.payments_paid_cents ?? '0',
      ),
      paymentsPending: Number(paymentRow?.payments_pending ?? '0'),
      paymentsFailed: Number(paymentRow?.payments_failed ?? '0'),
      paymentsCancelled: Number(
        paymentRow?.payments_cancelled ?? '0',
      ),
      paymentsRefunded: Number(
        paymentRow?.payments_refunded ?? '0',
      ),
      platformRevenueCents: Number(
        ledgerRow?.platform_revenue_cents ?? '0',
      ),
      companyProfitAvailableCents: Math.max(
        0,
        Number(ledgerRow?.platform_revenue_cents ?? '0') -
          Number(ledgerRow?.driver_cash_commission_debt_cents ?? '0') -
          Number(ledgerRow?.external_adjustment_review_cents ?? '0'),
      ),
      companyPayoutPendingCents: Number(
        ledgerRow?.company_payout_pending_cents ?? '0',
      ),
      externalAdjustmentReviewCents: Number(
        ledgerRow?.external_adjustment_review_cents ?? '0',
      ),
      externalAdjustmentReviewCount: Number(
        externalAdjustmentRow?.review_count ?? '0',
      ),
      driverPayableCents: Number(
        ledgerRow?.driver_payable_cents ?? '0',
      ),
      driverPayoutPendingCents: Number(
        ledgerRow?.driver_payout_pending_cents ?? '0',
      ),
      driverCashCommissionDebtCents: Number(
        ledgerRow?.driver_cash_commission_debt_cents ?? '0',
      ),
      rideEscrowCents: Number(
        ledgerRow?.ride_escrow_cents ?? '0',
      ),
      passengerWalletCents: Number(
        ledgerRow?.passenger_wallet_cents ?? '0',
      ),
      payoutsRequested: Number(
        payoutRow?.payouts_requested ?? '0',
      ),
      payoutsRequestedCents: Number(
        payoutRow?.payouts_requested_cents ?? '0',
      ),
    };
  }

  async listRecentPayments(limit: number): Promise<PaymentRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS}
       FROM payments
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map(mapPayment);
  }

  async listRecentDriverPayouts(
    limit: number,
  ): Promise<DriverPayoutRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<DriverPayoutRow>(
      `SELECT ${PAYOUT_COLUMNS}
       FROM driver_payouts
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [safeLimit],
    );
    return result.rows.map(mapPayout);
  }

  async getDriverPayoutPeriodSummary(
    driverId: string,
    from?: string,
    to?: string,
  ) {
    const result = await this.pool.query<{
      requested_cents: string;
      paid_cents: string;
    }>(
      `
      SELECT
        COALESCE(SUM(amount_cents) FILTER (
          WHERE status IN ('requested', 'processing', 'paid')
        ), 0)::text AS requested_cents,
        COALESCE(SUM(amount_cents) FILTER (
          WHERE status = 'paid'
        ), 0)::text AS paid_cents
      FROM driver_payouts
      WHERE driver_id = $1
        AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
      `,
      [driverId, from ?? null, to ?? null],
    );
    return {
      requestedCents: Number(result.rows[0]?.requested_cents ?? '0'),
      paidCents: Number(result.rows[0]?.paid_cents ?? '0'),
    };
  }

  async listLedgerTransactionsForAccounts(
    accountKeys: readonly string[],
    limit: number,
  ): Promise<LedgerTransaction[]> {
    const keys = [...new Set(
      accountKeys.map((value) => value.trim()).filter(Boolean),
    )];
    if (keys.length === 0) return [];

    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<LedgerTransactionRow>(
      `
      SELECT DISTINCT
        transaction.id,
        transaction.kind,
        transaction.ride_id,
        transaction.payment_id,
        transaction.payout_id,
        transaction.company_payout_id,
        transaction.wallet_topup_id,
        transaction.reference_key,
        transaction.created_at
      FROM ledger_transactions AS transaction
      INNER JOIN ledger_entries AS entry
        ON entry.transaction_id = transaction.id
      WHERE entry.account_key = ANY($1::text[])
      ORDER BY transaction.created_at DESC, transaction.id DESC
      LIMIT $2
      `,
      [keys, safeLimit],
    );

    const transactions: LedgerTransaction[] = [];
    for (const row of result.rows) {
      const entries = await this.pool.query<LedgerEntryRow>(
        `
        SELECT account_key, direction, amount_cents
        FROM ledger_entries
        WHERE transaction_id = $1
        ORDER BY created_at, id
        `,
        [row.id],
      );

      transactions.push({
        id: row.id,
        kind: row.kind,
        ...(row.ride_id != null ? { rideId: row.ride_id } : {}),
        ...(row.payment_id != null ? { paymentId: row.payment_id } : {}),
        ...(row.payout_id != null ? { payoutId: row.payout_id } : {}),
        ...(row.company_payout_id != null
          ? { companyPayoutId: row.company_payout_id }
          : {}),
        ...(row.wallet_topup_id != null
          ? { walletTopupId: row.wallet_topup_id }
          : {}),
        referenceKey: row.reference_key,
        entries: entries.rows.map((entry) => ({
          accountKey: entry.account_key,
          direction: entry.direction,
          amountCents: entry.amount_cents,
        })),
        createdAt: row.created_at.toISOString(),
      });
    }

    return transactions;
  }

  async getAccountBalanceCents(accountKey: string): Promise<number> {
    const result = await this.pool.query<{ balance_cents: string }>(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN direction = 'credit' THEN amount_cents
          ELSE -amount_cents
        END
      ), 0)::text AS balance_cents
      FROM ledger_entries
      WHERE account_key = $1
      `,
      [accountKey],
    );

    return Number(result.rows[0]?.balance_cents ?? '0');
  }

  async getDriverCashDebtCents(driverId: string): Promise<number> {
    const balance = await this.getAccountBalanceCents(
      `driver:${driverId}:commission_debt`,
    );
    return Math.max(0, -balance);
  }
}
