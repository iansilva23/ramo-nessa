import assert from 'node:assert/strict';
import test from 'node:test';

import { createPaymentForRide } from '../src/payments/create-payment.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { PaymentDomainError } from '../src/payments/payment.js';
import type { RideRecord } from '../src/rides/ride.js';

function ride(): RideRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    passengerId: 'passenger-1',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
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
    updatedAt: '2026-09-23T00:00:00.000Z',
  };
}

test('criação de pagamento usa exatamente o total congelado da corrida', async () => {
  const repository = new InMemoryFinanceRepository();

  const payment = await createPaymentForRide(repository, {
    ride: ride(),
    method: 'pix',
    processor: 'test-gateway',
    idempotencyKey: 'ride-111-payment-1',
    now: new Date('2026-09-23T01:00:00.000Z'),
  });

  assert.equal(payment.amountCents, 15000);
  assert.equal(payment.status, 'created');
  assert.equal(payment.method, 'pix');
});

test('mesma chave de idempotência retorna o mesmo pagamento', async () => {
  const repository = new InMemoryFinanceRepository();
  const input = {
    ride: ride(),
    method: 'card' as const,
    processor: 'test-gateway',
    idempotencyKey: 'ride-111-payment-card',
    now: new Date('2026-09-23T01:00:00.000Z'),
  };

  const first = await createPaymentForRide(repository, input);
  const second = await createPaymentForRide(repository, input);

  assert.equal(second.id, first.id);
});

test('captura é idempotente e gera ledger balanceado em escrow', async () => {
  const repository = new InMemoryFinanceRepository();
  const payment = await createPaymentForRide(repository, {
    ride: ride(),
    method: 'pix',
    processor: 'test-gateway',
    idempotencyKey: 'ride-111-capture',
  });

  // Simula gateway levando o pagamento para pending.
  const internal = await repository.findPaymentById(payment.id);
  assert.ok(internal);

  // O repositório de teste permite capturar a partir de created? A máquina
  // não permite; primeiro criamos uma versão pending diretamente para cobrir
  // a regra real de webhook.
  const pendingRepository = new InMemoryFinanceRepository();
  await pendingRepository.createPayment({
    ...payment,
    status: 'pending',
  });

  const first = await pendingRepository.capturePayment({
    paymentId: payment.id,
    processorEventId: 'evt-123',
    processorPaymentId: 'pix-abc',
    payload: { status: 'paid' },
    capturedAt: new Date('2026-09-23T01:05:00.000Z'),
  });

  assert.equal(first.payment.status, 'paid');
  assert.equal(first.duplicateEvent, false);
  assert.equal(first.ledgerTransaction.entries.length, 2);
  assert.deepEqual(
    first.ledgerTransaction.entries.map((entry) => entry.amountCents),
    [15000, 15000],
  );
  assert.match(
    first.ledgerTransaction.entries[1]!.accountKey,
    /ride:.*:escrow/,
  );

  const duplicate = await pendingRepository.capturePayment({
    paymentId: payment.id,
    processorEventId: 'evt-123',
    processorPaymentId: 'pix-abc',
  });

  assert.equal(duplicate.duplicateEvent, true);
  assert.equal(duplicate.payment.status, 'paid');
  assert.equal(
    duplicate.ledgerTransaction.id,
    first.ledgerTransaction.id,
  );
});

test('chave de idempotência não pode ser reutilizada em outra intenção', async () => {
  const repository = new InMemoryFinanceRepository();
  await createPaymentForRide(repository, {
    ride: ride(),
    method: 'pix',
    processor: 'gateway-a',
    idempotencyKey: 'shared-key-123',
  });

  await assert.rejects(
    () =>
      createPaymentForRide(repository, {
        ride: ride(),
        method: 'card',
        processor: 'gateway-a',
        idempotencyKey: 'shared-key-123',
      }),
    (error: unknown) =>
      error instanceof PaymentDomainError &&
      error.code === 'IDEMPOTENCY_CONFLICT',
  );
});
