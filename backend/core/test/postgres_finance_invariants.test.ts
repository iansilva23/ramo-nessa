import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresPool } from '../src/db/postgres.js';
import { PaymentDomainError } from '../src/payments/payment.js';
import { PayoutDomainError } from '../src/payments/payout.js';
import { PostgresFinanceRepository } from '../src/payments/repositories/postgres-finance-repository.js';
import { requestDriverPayout } from '../src/payments/request-payout.js';

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


test(
  'PostgreSQL estorna pagamento externo e zera o escrow sem duplicar ledger',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresFinanceRepository(pool);
    const rideId = randomUUID();
    const paymentId = randomUUID();
    const now = '2026-09-23T20:35:00.000Z';

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
          $1, 'postgres-external-refund-passenger', 'AWAITING_PAYMENT', 'created',
          'prea', 'jijoca', 'car', 'day', 1,
          'audit-prea-jijoca-car', 12000, 0, 12000, 1200, 10800,
          $2, $2
        )
        `,
        [rideId, now],
      );

      await repository.createPayment({
        id: paymentId,
        rideId,
        method: 'pix',
        processor: 'mercado-pago-orders',
        status: 'created',
        amountCents: 12000,
        idempotencyKey: `postgres-external-refund-${paymentId}`,
        createdAt: now,
        updatedAt: now,
      });

      await repository.markPaymentPending({
        paymentId,
        processorPaymentId: 'ORD01POSTGRESREFUND123456789',
        pendingAt: new Date(now),
      });

      const captured = await repository.capturePayment({
        paymentId,
        processorEventId: `postgres-external-capture-${paymentId}`,
        capturedAt: new Date('2026-09-23T20:35:30.000Z'),
      });

      assert.equal(captured.payment.status, 'paid');
      assert.equal(
        await repository.getAccountBalanceCents(`ride:${rideId}:escrow`),
        12000,
      );

      const first = await repository.refundExternalPayment({
        paymentId,
        refundedAt: new Date('2026-09-23T20:36:00.000Z'),
      });
      assert.equal(first.payment.status, 'refunded');
      assert.equal(first.duplicateRefund, false);
      assert.equal(
        await repository.getAccountBalanceCents(`ride:${rideId}:escrow`),
        0,
      );
      assert.equal(
        await repository.getAccountBalanceCents(
          'processor:mercado-pago-orders:clearing',
        ),
        0,
      );

      const duplicate = await repository.refundExternalPayment({
        paymentId,
        refundedAt: new Date('2026-09-23T20:37:00.000Z'),
      });
      assert.equal(duplicate.duplicateRefund, true);
      assert.equal(
        await repository.getAccountBalanceCents(`ride:${rideId}:escrow`),
        0,
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
        'DELETE FROM ledger_transactions WHERE ride_id = $1',
        [rideId],
      );
      await pool.query(
        'DELETE FROM payment_events WHERE payment_id = $1',
        [paymentId],
      );
      await pool.query('DELETE FROM payments WHERE id = $1', [paymentId]);
      await pool.query('DELETE FROM rides WHERE id = $1', [rideId]);
      await pool.end();
    }
  },
);


test(
  'PostgreSQL serializa dois saques simultâneos com a mesma chave',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresFinanceRepository(pool);
    const rideId = randomUUID();
    const paymentId = randomUUID();
    const driverId = `postgres-payout-driver-${randomUUID()}`;
    const key = `postgres-payout-key-${randomUUID()}`;
    const now = '2026-09-23T20:40:00.000Z';

    try {
      await pool.query(
        `
        INSERT INTO rides (
          id, passenger_id, state, payment_status, driver_id,
          origin_zone_id, destination_zone_id,
          category, price_period, passengers,
          pricing_rule_id, base_amount_cents,
          pickup_compensation_cents, total_amount_cents,
          platform_commission_cents, driver_net_cents,
          created_at, updated_at
        ) VALUES (
          $1, 'postgres-payout-passenger', 'COMPLETED', 'paid', $2,
          'prea', 'jijoca', 'car', 'day', 1,
          'audit-prea-jijoca-car', 12000, 0, 12000, 1200, 10800,
          $3, $3
        )
        `,
        [rideId, driverId, now],
      );

      await repository.createPayment({
        id: paymentId,
        rideId,
        method: 'pix',
        processor: 'audit-gateway',
        status: 'pending',
        amountCents: 12000,
        idempotencyKey: `postgres-payout-payment-${paymentId}`,
        createdAt: now,
        updatedAt: now,
      });
      const capture = await repository.capturePayment({
        paymentId,
        processorEventId: `postgres-payout-capture-${paymentId}`,
        capturedAt: new Date(now),
      });

      await repository.settleRide({
        rideId,
        paymentId: capture.payment.id,
        driverId,
        totalAmountCents: 12000,
        platformCommissionCents: 1200,
        driverNetCents: 10800,
        settledAt: new Date(now),
      });
      await repository.upsertDriverPayoutDestination({
        driverId,
        pixKeyType: 'random',
        pixKey: '33333333-3333-4333-8333-333333333333',
        createdAt: now,
        updatedAt: now,
      });

      const input = {
        driverId,
        amountCents: 5000,
        idempotencyKey: key,
        now: new Date('2026-09-23T20:41:00.000Z'),
      };
      const [first, second] = await Promise.all([
        requestDriverPayout(repository, input),
        requestDriverPayout(repository, input),
      ]);

      assert.equal(first.payout.id, second.payout.id);
      assert.equal(
        [first.duplicateRequest, second.duplicateRequest].filter(Boolean).length,
        1,
      );
      assert.equal(
        await repository.getAccountBalanceCents(
          `driver:${driverId}:payable`,
        ),
        5800,
      );
      assert.equal(
        await repository.getAccountBalanceCents(
          `driver:${driverId}:payout_pending`,
        ),
        5000,
      );
    } finally {
      await pool.query(
        `
        DELETE FROM ledger_entries
        WHERE transaction_id IN (
          SELECT id FROM ledger_transactions WHERE ride_id = $1
        )
        OR account_key IN ($2, $3)
        `,
        [
          rideId,
          `driver:${driverId}:payable`,
          `driver:${driverId}:payout_pending`,
        ],
      );
      await pool.query(
        'DELETE FROM ledger_transactions WHERE ride_id = $1 OR payout_id IN (SELECT id FROM driver_payouts WHERE driver_id = $2)',
        [rideId, driverId],
      );
      await pool.query('DELETE FROM driver_payouts WHERE driver_id = $1', [
        driverId,
      ]);
      await pool.query(
        'DELETE FROM driver_payout_destinations WHERE driver_id = $1',
        [driverId],
      );
      await pool.query(
        'DELETE FROM payment_events WHERE payment_id = $1',
        [paymentId],
      );
      await pool.query('DELETE FROM payments WHERE id = $1', [paymentId]);
      await pool.query('DELETE FROM rides WHERE id = $1', [rideId]);
      await pool.end();
    }
  },
);


test(
  'PostgreSQL serializa pagar e cancelar o mesmo saque sem duplicar saldo',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresFinanceRepository(pool);
    const rideId = randomUUID();
    const paymentId = randomUUID();
    const driverId = `postgres-payout-terminal-${randomUUID()}`;
    const now = '2026-09-26T19:50:00.000Z';

    try {
      await pool.query(
        `
        INSERT INTO rides (
          id, passenger_id, state, payment_status, driver_id,
          origin_zone_id, destination_zone_id,
          category, price_period, passengers,
          pricing_rule_id, base_amount_cents,
          pickup_compensation_cents, total_amount_cents,
          platform_commission_cents, driver_net_cents,
          created_at, updated_at
        ) VALUES (
          $1, 'postgres-payout-terminal-passenger',
          'COMPLETED', 'paid', $2,
          'prea', 'jijoca', 'car', 'day', 1,
          'audit-prea-jijoca-car', 12000, 0, 12000, 1200, 10800,
          $3, $3
        )
        `,
        [rideId, driverId, now],
      );

      await repository.createPayment({
        id: paymentId,
        rideId,
        method: 'pix',
        processor: 'audit-gateway',
        status: 'pending',
        amountCents: 12000,
        idempotencyKey: `postgres-terminal-payment-${paymentId}`,
        createdAt: now,
        updatedAt: now,
      });
      const capture = await repository.capturePayment({
        paymentId,
        processorEventId: `postgres-terminal-capture-${paymentId}`,
        capturedAt: new Date(now),
      });
      await repository.settleRide({
        rideId,
        paymentId: capture.payment.id,
        driverId,
        totalAmountCents: 12000,
        platformCommissionCents: 1200,
        driverNetCents: 10800,
        settledAt: new Date(now),
      });
      await repository.upsertDriverPayoutDestination({
        driverId,
        pixKeyType: 'random',
        pixKey: '44444444-4444-4444-8444-444444444444',
        createdAt: now,
        updatedAt: now,
      });

      const requested = await requestDriverPayout(repository, {
        driverId,
        amountCents: 5000,
        idempotencyKey: `postgres-terminal-payout-${randomUUID()}`,
        now: new Date('2026-09-26T19:51:00.000Z'),
      });

      const results = await Promise.allSettled([
        repository.completeDriverPayout({
          payoutId: requested.payout.id,
          processor: 'Pix manual',
          processorPayoutId: 'postgres-race-receipt',
          completedAt: new Date('2026-09-26T19:52:00.000Z'),
        }),
        repository.cancelDriverPayout({
          payoutId: requested.payout.id,
          cancelledAt: new Date('2026-09-26T19:52:00.000Z'),
        }),
      ]);

      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      assert.equal(
        results.filter((result) => result.status === 'rejected').length,
        1,
      );

      const rejected = results.find(
        (result) => result.status === 'rejected',
      );
      assert.ok(rejected != null && rejected.status === 'rejected');
      assert.equal(
        rejected.reason instanceof PayoutDomainError,
        true,
      );
      assert.equal(
        (rejected.reason as PayoutDomainError).code,
        'INVALID_PAYOUT_TRANSITION',
      );

      const payout = await repository.findDriverPayoutById(
        requested.payout.id,
      );
      assert.ok(payout != null);
      assert.ok(
        payout.status === 'paid' || payout.status === 'cancelled',
      );

      assert.equal(
        await repository.getAccountBalanceCents(
          `driver:${driverId}:payout_pending`,
        ),
        0,
      );

      const payable = await repository.getAccountBalanceCents(
        `driver:${driverId}:payable`,
      );
      assert.equal(
        payable,
        payout.status === 'paid' ? 5800 : 10800,
      );

      const terminalLedgers = await pool.query<{ kind: string }>(
        `
        SELECT kind
        FROM ledger_transactions
        WHERE payout_id = $1
          AND kind IN ('DRIVER_PAYOUT_PAID', 'DRIVER_PAYOUT_CANCELLED')
        `,
        [requested.payout.id],
      );
      assert.equal(terminalLedgers.rows.length, 1);
    } finally {
      await pool.query(
        `
        DELETE FROM ledger_entries
        WHERE transaction_id IN (
          SELECT id
          FROM ledger_transactions
          WHERE ride_id = $1
             OR payout_id IN (
               SELECT id
               FROM driver_payouts
               WHERE driver_id = $2
             )
        )
        `,
        [rideId, driverId],
      );
      await pool.query(
        `
        DELETE FROM ledger_transactions
        WHERE ride_id = $1
           OR payout_id IN (
             SELECT id
             FROM driver_payouts
             WHERE driver_id = $2
           )
        `,
        [rideId, driverId],
      );
      await pool.query(
        'DELETE FROM driver_payouts WHERE driver_id = $1',
        [driverId],
      );
      await pool.query(
        'DELETE FROM driver_payout_destinations WHERE driver_id = $1',
        [driverId],
      );
      await pool.query(
        'DELETE FROM payment_events WHERE payment_id = $1',
        [paymentId],
      );
      await pool.query('DELETE FROM payments WHERE id = $1', [paymentId]);
      await pool.query('DELETE FROM rides WHERE id = $1', [rideId]);
      await pool.end();
    }
  },
);
