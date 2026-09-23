import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import { paymentCaptureLedger, type LedgerTransaction } from '../ledger.js';
import {
  type CapturePaymentInput,
  type CapturePaymentResult,
  type FinanceRepository,
} from '../finance-repository.js';
import { transitionPayment } from '../payment-state.js';
import { PaymentDomainError, type PaymentRecord } from '../payment.js';

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

const PAYMENT_COLUMNS = `
  id, ride_id, method, processor, processor_payment_id, status,
  amount_cents, idempotency_key, created_at, updated_at
`;

async function insertLedger(
  client: PoolClient,
  transaction: LedgerTransaction,
): Promise<void> {
  await client.query(
    `
    INSERT INTO ledger_transactions (
      id, kind, ride_id, payment_id, reference_key, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [
      transaction.id,
      transaction.kind,
      transaction.rideId ?? null,
      transaction.paymentId ?? null,
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

export class PostgresFinanceRepository implements FinanceRepository {
  constructor(private readonly pool: Pool) {}

  async findPaymentById(id: string): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1 LIMIT 1`,
      [id],
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
      const existingEvent = await client.query<{ id: string }>(
        `
        SELECT id FROM payment_events
        WHERE processor = $1 AND processor_event_id = $2
        LIMIT 1
        `,
        [payment.processor, input.processorEventId],
      );

      if ((existingEvent.rowCount ?? 0) > 0) {
        const ledgerResult = await client.query<{
          id: string;
          kind: string;
          reference_key: string;
          created_at: Date;
        }>(
          `
          SELECT id, kind, reference_key, created_at
          FROM ledger_transactions
          WHERE reference_key = $1 LIMIT 1
          `,
          [
            `payment-capture:${payment.processor}:${input.processorEventId}`,
          ],
        );

        const ledgerRow = ledgerResult.rows[0];
        if (ledgerRow == null) {
          throw new Error('Evento idempotente sem ledger correspondente.');
        }

        const entries = await client.query<{
          account_key: string;
          direction: 'debit' | 'credit';
          amount_cents: number;
        }>(
          `
          SELECT account_key, direction, amount_cents
          FROM ledger_entries
          WHERE transaction_id = $1
          ORDER BY created_at, id
          `,
          [ledgerRow.id],
        );

        await client.query('COMMIT');
        return {
          payment,
          ledgerTransaction: {
            id: ledgerRow.id,
            kind: ledgerRow.kind,
            rideId: payment.rideId,
            paymentId: payment.id,
            referenceKey: ledgerRow.reference_key,
            entries: entries.rows.map((entry) => ({
              accountKey: entry.account_key,
              direction: entry.direction,
              amountCents: entry.amount_cents,
            })),
            createdAt: ledgerRow.created_at.toISOString(),
          },
          duplicateEvent: true,
        };
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
      throw error;
    } finally {
      client.release();
    }
  }
}
