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


test(
  'PostgreSQL reaproveita pagamento concorrente com a mesma chave',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresFinanceRepository(pool);
    const rideId = randomUUID();
    const key = `audit-concurrent-payment-${randomUUID()}`;
    const now = '2026-09-23T20:10:00.000Z';

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
          $1, 'postgres-idempotency-passenger', 'AWAITING_PAYMENT', 'pending',
          'prea', 'jijoca', 'car', 'day', 1,
          'audit-prea-jijoca-car', 12000, 0, 12000, 1200, 10800,
          $2, $2
        )
        `,
        [rideId, now],
      );

      const makePayment = (id: string) =>
        repository.createPayment({
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

      const [first, second] = await Promise.all([
        makePayment(randomUUID()),
        makePayment(randomUUID()),
      ]);

      assert.equal(first.id, second.id);
      const count = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM payments WHERE idempotency_key = $1',
        [key],
      );
      assert.equal(count.rows[0]?.count, '1');
    } finally {
      await pool.query('DELETE FROM payments WHERE ride_id = $1', [rideId]);
      await pool.query('DELETE FROM rides WHERE id = $1', [rideId]);
      await pool.end();
    }
  },
);

test(
  'PostgreSQL reaproveita recarga concorrente com a mesma chave',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresFinanceRepository(pool);
    const key = `audit-concurrent-topup-${randomUUID()}`;
    const now = '2026-09-23T20:20:00.000Z';

    try {
      const makeTopup = (id: string) =>
        repository.createWalletTopup({
          id,
          passengerId: 'postgres-topup-passenger',
          method: 'pix',
          processor: 'audit-gateway',
          status: 'pending',
          amountCents: 5000,
          idempotencyKey: key,
          createdAt: now,
          updatedAt: now,
        });

      const [first, second] = await Promise.all([
        makeTopup(randomUUID()),
        makeTopup(randomUUID()),
      ]);

      assert.equal(first.id, second.id);
      const count = await pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM wallet_topups WHERE idempotency_key = $1',
        [key],
      );
      assert.equal(count.rows[0]?.count, '1');
    } finally {
      await pool.query('DELETE FROM wallet_topups WHERE idempotency_key = $1', [
        key,
      ]);
      await pool.end();
    }
  },
);


test(
  'PostgreSQL estorna pagamento da carteira sem duplicar saldo',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresFinanceRepository(pool);
    const rideId = randomUUID();
    const topupId = randomUUID();
    const paymentId = randomUUID();
    const passengerId = 'postgres-refund-passenger';
    const now = '2026-09-23T20:30:00.000Z';

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
          $1, $2, 'AWAITING_PAYMENT', 'created',
          'prea', 'jijoca', 'car', 'day', 1,
          'audit-prea-jijoca-car', 12000, 0, 12000, 1200, 10800,
          $3, $3
        )
        `,
        [rideId, passengerId, now],
      );

      await repository.createWalletTopup({
        id: topupId,
        passengerId,
        method: 'pix',
        processor: 'audit-gateway',
        status: 'pending',
        amountCents: 15000,
        idempotencyKey: `audit-refund-topup-${topupId}`,
        createdAt: now,
        updatedAt: now,
      });
      await repository.captureWalletTopup({
        walletTopupId: topupId,
        processorEventId: `audit-refund-topup-event-${topupId}`,
        capturedAt: new Date(now),
      });

      await repository.payRideFromWallet({
        passengerId,
        payment: {
          id: paymentId,
          rideId,
          method: 'wallet',
          processor: 'internal-wallet',
          status: 'paid',
          amountCents: 12000,
          idempotencyKey: `audit-refund-payment-${paymentId}`,
          createdAt: now,
          updatedAt: now,
        },
      });

      assert.equal(
        await repository.getAccountBalanceCents(
          `passenger:${passengerId}:wallet`,
        ),
        3000,
      );
      assert.equal(
        await repository.getAccountBalanceCents(`ride:${rideId}:escrow`),
        12000,
      );

      const first = await repository.refundWalletRide({
        paymentId,
        passengerId,
        refundedAt: new Date('2026-09-23T20:31:00.000Z'),
      });
      assert.equal(first.payment.status, 'refunded');
      assert.equal(first.duplicateRefund, false);
      assert.equal(
        await repository.getAccountBalanceCents(
          `passenger:${passengerId}:wallet`,
        ),
        15000,
      );
      assert.equal(
        await repository.getAccountBalanceCents(`ride:${rideId}:escrow`),
        0,
      );

      const duplicate = await repository.refundWalletRide({
        paymentId,
        passengerId,
        refundedAt: new Date('2026-09-23T20:32:00.000Z'),
      });
      assert.equal(duplicate.duplicateRefund, true);
      assert.equal(
        await repository.getAccountBalanceCents(
          `passenger:${passengerId}:wallet`,
        ),
        15000,
      );
    } finally {
      await pool.query(
        `
        DELETE FROM ledger_entries
        WHERE transaction_id IN (
          SELECT id
          FROM ledger_transactions
          WHERE ride_id = $1 OR wallet_topup_id = $2
        )
        `,
        [rideId, topupId],
      );
      await pool.query(
        'DELETE FROM ledger_transactions WHERE ride_id = $1 OR wallet_topup_id = $2',
        [rideId, topupId],
      );
      await pool.query(
        'DELETE FROM wallet_topup_events WHERE wallet_topup_id = $1',
        [topupId],
      );
      await pool.query('DELETE FROM wallet_topups WHERE id = $1', [topupId]);
      await pool.query('DELETE FROM payments WHERE ride_id = $1', [rideId]);
      await pool.query('DELETE FROM rides WHERE id = $1', [rideId]);
      await pool.end();
    }
  },
);
