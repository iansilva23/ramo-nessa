import assert from 'node:assert/strict';
import test from 'node:test';

import { cardPriceForBaseFare } from '../src/payments/card-price-adjustment.js';
import { createPaymentForRide } from '../src/payments/create-payment.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

function preparedRide(): RideRecord {
  return {
    id: '21111111-1111-4111-8111-111111111111',
    passengerId: 'passenger-card-price',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-card-price',
    driverHoldExpiresAt: '2027-01-01T00:00:00.000Z',
    pickupLatitude: -2.82,
    pickupLongitude: -40.41,
    dropoffLatitude: -2.80,
    dropoffLongitude: -40.51,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'card-price-test',
      baseAmountCents: 15000,
      pickupCompensationCents: 0,
      totalAmountCents: 15000,
      platformCommissionCents: 1500,
      driverNetCents: 13500,
    },
    createdAt: '2026-09-25T12:00:00.000Z',
    updatedAt: '2026-09-25T12:00:00.000Z',
  };
}

test('gross-up de 4,98% preserva R$ 150,00 de tarifa-base', () => {
  const result = cardPriceForBaseFare(15000, 498);
  assert.equal(result.totalAmountCents, 15787);
  assert.equal(result.priceAdjustmentCents, 787);
  assert.equal(result.baseFareAmountCents, 15000);
});

test('ajuste zero mantém o mesmo preço', () => {
  const result = cardPriceForBaseFare(15000, 0);
  assert.equal(result.totalAmountCents, 15000);
  assert.equal(result.priceAdjustmentCents, 0);
});

test('somente cartão pode criar pagamento acima da tarifa-base', async () => {
  const ride = preparedRide();
  const repository = new InMemoryFinanceRepository();
  const card = await createPaymentForRide(repository, {
    ride,
    method: 'card',
    processor: 'test',
    idempotencyKey: 'card-price-adjustment-1',
    amountCents: 15786,
    now: new Date('2026-09-25T12:01:00.000Z'),
  });
  assert.equal(card.amountCents, 15786);

  await assert.rejects(() =>
    createPaymentForRide(new InMemoryFinanceRepository(), {
      ride,
      method: 'pix',
      processor: 'test',
      idempotencyKey: 'pix-price-adjustment-1',
      amountCents: 15786,
      now: new Date('2026-09-25T12:01:00.000Z'),
    }),
  );
});
