import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresPool } from '../src/db/postgres.js';
import { PaymentDomainError } from '../src/payments/payment.js';
import { PostgresFinanceRepository } from '../src/payments/repositories/postgres-finance-repository.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL impede dois pagamentos paid para a mesma corrida',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresFinanceRepository(pool);
    const rideId = randomUUID();
    const paymentA = randomUUID();
    const paymentB = randomUUID();
    const now = '2026-09-23T20:00:00.000Z';

    try {
      await pool.query(
        `
        INSERT INTO rides (
          id, passenger_id, state, payment_status,
          origin_zone_id, destination_zone_id,
          category, price_period, passengers,
          pricing_rule_id, base_amount_cents,
          pickup_compensation_cents, total_amount_cents,
          platform_commission_cents, driver_net_cents,
          created_at, updated_at
        ) VALUES (
          $1, 'postgres-audit-passenger', 'AWAITING_PAYMENT', 'pending',
          'prea', 'jijoca',
          'car', 'day', 1,
          'audit-prea-jijoca-car', 12000,
          0, 12000,
          1200, 10800,
          $2, $2
        )
        `,
        [rideId, now],
      );

      for (const [id, key] of [
        [paymentA, `audit-${paymentA}`],
        [paymentB, `audit-${paymentB}`],
      ] as const) {
        await repository.createPayment({
          id,
          rideId,
          method: 'pix',
          processor: 'audit-gateway',
          status: 'pending',
          amountCents: 12000,
          idempotencyKey: key,
          createdAt: now,
          updatedAt: now,
        });
      }

      const first = await repository.capturePayment({
        paymentId: paymentA,
        processorEventId: `audit-event-${paymentA}`,
      });
      assert.equal(first.payment.status, 'paid');

      await assert.rejects(
        () =>
          repository.capturePayment({
            paymentId: paymentB,
            processorEventId: `audit-event-${paymentB}`,
          }),
        (error: unknown) =>
          error instanceof PaymentDomainError &&
          error.code === 'RIDE_ALREADY_PAID',
      );

      assert.equal(
        (await repository.findPaymentById(paymentB))?.status,
        'pending',
      );
    } finally {
      await pool.query(
        `
        DELETE FROM ledger_entries
        WHERE transaction_id IN (
          SELECT id FROM ledger_transactions WHERE ride_id = $1
        )
        `,
        [rideId],
      );
      await pool.query(
        `
        DELETE FROM payment_events
        WHERE payment_id IN (
          SELECT id FROM payments WHERE ride_id = $1
        )
        `,
        [rideId],
      );
      await pool.query('DELETE FROM ledger_transactions WHERE ride_id = $1', [
        rideId,
      ]);
      await pool.query('DELETE FROM payments WHERE ride_id = $1', [rideId]);
      await pool.query('DELETE FROM rides WHERE id = $1', [rideId]);
      await pool.end();
    }
  },
);
