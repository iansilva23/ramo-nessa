import assert from 'node:assert/strict';
import test from 'node:test';

import { settleCompletedRide, SettlementError } from '../src/payments/settlement.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import type { PaymentRecord } from '../src/payments/payment.js';
import type { RideRecord } from '../src/rides/ride.js';

function completedRide(): RideRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    passengerId: 'passenger-1',
    driverId: 'driver-77',
    state: 'COMPLETED',
    paymentStatus: 'paid',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    category: 'comfort_black',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'jeri-prea-comfort',
      baseAmountCents: 15000,
      pickupCompensationCents: 0,
      totalAmountCents: 15000,
      platformCommissionCents: 1500,
      driverNetCents: 13500,
    },
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T02:00:00.000Z',
  };
}

function paidPayment(): PaymentRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    rideId: completedRide().id,
    method: 'pix',
    processor: 'test-gateway',
    status: 'paid',
    amountCents: 15000,
    idempotencyKey: 'settlement-test-payment',
    createdAt: '2026-09-23T00:10:00.000Z',
    updatedAt: '2026-09-23T00:11:00.000Z',
  };
}

async function seedPaidPayment(
  repository: InMemoryFinanceRepository,
): Promise<PaymentRecord> {
  const payment = paidPayment();
  await repository.createPayment({
    ...payment,
    status: 'pending',
  });
  const capture = await repository.capturePayment({
    paymentId: payment.id,
    processorEventId: 'settlement-seed-capture',
    capturedAt: new Date('2026-09-23T00:11:00.000Z'),
  });
  return capture.payment;
}

test('liquidação separa 10% da plataforma e 90% do motorista', async () => {
  const repository = new InMemoryFinanceRepository();
  const ride = completedRide();
  const payment = await seedPaidPayment(repository);

  const result = await settleCompletedRide(repository, {
    ride,
    payment,
    settledAt: new Date('2026-09-23T02:05:00.000Z'),
  });

  assert.equal(result.duplicateSettlement, false);
  assert.equal(result.ledgerTransaction.kind, 'RIDE_SETTLED');
  assert.equal(
    await repository.getAccountBalanceCents('platform:revenue'),
    1500,
  );
  assert.equal(
    await repository.getAccountBalanceCents('driver:driver-77:payable'),
    13500,
  );
});

test('liquidação é idempotente', async () => {
  const repository = new InMemoryFinanceRepository();
  const ride = completedRide();
  const payment = await seedPaidPayment(repository);

  const first = await settleCompletedRide(repository, { ride, payment });
  const second = await settleCompletedRide(repository, { ride, payment });

  assert.equal(first.duplicateSettlement, false);
  assert.equal(second.duplicateSettlement, true);
  assert.equal(first.ledgerTransaction.id, second.ledgerTransaction.id);
  assert.equal(
    await repository.getAccountBalanceCents('platform:revenue'),
    1500,
  );
});

test('corrida não concluída não pode liquidar', async () => {
  const repository = new InMemoryFinanceRepository();
  const payment = await seedPaidPayment(repository);
  const ride = { ...completedRide(), state: 'IN_PROGRESS' as const };

  await assert.rejects(
    () => settleCompletedRide(repository, { ride, payment }),
    (error: unknown) =>
      error instanceof SettlementError &&
      error.code === 'RIDE_NOT_COMPLETED',
  );
});

test('pagamento ausente no repositório não gera saldo', async () => {
  const repository = new InMemoryFinanceRepository();

  await assert.rejects(
    () =>
      settleCompletedRide(repository, {
        ride: completedRide(),
        payment: paidPayment(),
      }),
    /Pagamento não está pronto para liquidação/,
  );
});

test('captura seguida de liquidação zera escrow', async () => {
  const repository = new InMemoryFinanceRepository();
  const ride = completedRide();
  const payment = paidPayment();

  await repository.createPayment({
    ...payment,
    status: 'pending',
  });

  const capture = await repository.capturePayment({
    paymentId: payment.id,
    processorEventId: 'settlement-capture-1',
    capturedAt: new Date('2026-09-23T00:11:00.000Z'),
  });

  await settleCompletedRide(repository, {
    ride,
    payment: capture.payment,
  });

  assert.equal(
    await repository.getAccountBalanceCents(
      `ride:${ride.id}:escrow`,
    ),
    0,
  );
  assert.equal(
    await repository.getAccountBalanceCents('platform:revenue'),
    1500,
  );
  assert.equal(
    await repository.getAccountBalanceCents('driver:driver-77:payable'),
    13500,
  );
});


test('registro paid sem saldo no escrow não pode liquidar', async () => {
  const repository = new InMemoryFinanceRepository();
  const payment = paidPayment();
  await repository.createPayment(payment);

  await assert.rejects(
    () =>
      settleCompletedRide(repository, {
        ride: completedRide(),
        payment,
      }),
    /Escrow da corrida não possui saldo suficiente/,
  );

  assert.equal(
    await repository.getAccountBalanceCents('platform:revenue'),
    0,
  );
  assert.equal(
    await repository.getAccountBalanceCents('driver:driver-77:payable'),
    0,
  );
});
