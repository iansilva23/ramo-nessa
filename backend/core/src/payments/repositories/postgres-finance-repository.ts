import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

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
  processor: string | null;
  processor_payout_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface LedgerTransactionRow {
  id: string;
  kind: string;
  ride_id: string | null;
  payment_id: string | null;
  payout_id: string | null;
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

const TOPUP_COLUMNS = `
  id, passenger_id, method, processor, processor_topup_id, status,
  amount_cents, idempotency_key, created_at, updated_at
`;

const PAYOUT_COLUMNS = `
  id, driver_id, amount_cents, status, idempotency_key,
  processor, processor_payout_id, created_at, updated_at
`;

async function insertLedger(
  client: PoolClient,
  transaction: LedgerTransaction,
): Promise<void> {
  await client.query(
    `
    INSERT INTO ledger_transactions (
      id, kind, ride_id, payment_id, payout_id, wallet_topup_id,
      reference_key, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      transaction.id,
      transaction.kind,
      transaction.rideId ?? null,
      transaction.paymentId ?? null,
      transaction.payoutId ?? null,
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
      id, kind, ride_id, payment_id, payout_id, wallet_topup_id,
      reference_key, created_at
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

export class PostgresFinanceRepository implements FinanceRepository {
  constructor(private readonly pool: Pool) {}

  async findPaymentById(id: string): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1 LIMIT 1`,
      [id],
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

      if (code === '23505') {
        throw new PaymentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Chave de idempotência já utilizada.',
        );
      }
      throw error;
    }
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
        throw new WalletDomainError(
          'WALLET_IDEMPOTENCY_CONFLICT',
          'Chave de idempotência da recarga já utilizada.',
        );
      }
      throw error;
    }
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

  async payRideFromWallet(
    input: PayRideFromWalletInput,
  ): Promise<PayRideFromWalletResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

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

  async settleRide(input: SettleRideInput): Promise<SettleRideResult> {
    const client = await this.pool.connect();
    const referenceKey = `ride-settlement:${input.rideId}`;

    try {
      await client.query('BEGIN');

      const existing = await loadLedgerByReference(client, referenceKey);
      if (existing != null) {
        await client.query('COMMIT');
        return {
          ledgerTransaction: existing,
          duplicateSettlement: true,
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

      const ledger = rideSettlementLedger({
        rideId: input.rideId,
        paymentId: input.paymentId,
        driverId: input.driverId,
        totalAmountCents: input.totalAmountCents,
        platformCommissionCents: input.platformCommissionCents,
        driverNetCents: input.driverNetCents,
        createdAt: (input.settledAt ?? new Date()).toISOString(),
      });

      await insertLedger(client, ledger);
      await client.query('COMMIT');

      return {
        ledgerTransaction: ledger,
        duplicateSettlement: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reserveDriverPayout(
    payout: DriverPayoutRecord,
  ): Promise<ReserveDriverPayoutResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

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
      if (payout.amountCents > available) {
        throw new PayoutDomainError(
          'INSUFFICIENT_DRIVER_BALANCE',
          'Saldo disponível insuficiente para o saque.',
        );
      }

      const inserted = await client.query<DriverPayoutRow>(
        `
        INSERT INTO driver_payouts (
          id, driver_id, amount_cents, status, idempotency_key,
          processor, processor_payout_id, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING ${PAYOUT_COLUMNS}
        `,
        [
          payout.id,
          payout.driverId,
          payout.amountCents,
          payout.status,
          payout.idempotencyKey,
          payout.processor ?? null,
          payout.processorPayoutId ?? null,
          payout.createdAt,
          payout.updatedAt,
        ],
      );

      const ledger = driverPayoutReserveLedger({
        payoutId: payout.id,
        driverId: payout.driverId,
        amountCents: payout.amountCents,
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
}
