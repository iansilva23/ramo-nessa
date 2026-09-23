import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { createRide, RideCreationError } from '../src/rides/create-ride.js';

const repo = () => new InMemoryRideRepository();

test('criar corrida congela preço, comissão e regra comercial', async () => {
  const repository = repo();

  const ride = await createRide(repository, {
    passengerId: 'passenger-test-1',
    now: new Date('2026-09-23T00:00:00.000Z'),
    quoteRequest: {
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'jericoacoara' },
      category: 'comfort_black',
      period: 'day',
    },
  });

  assert.equal(ride.state, 'AWAITING_PAYMENT');
  assert.equal(ride.paymentStatus, 'created');
  assert.equal(ride.quote.ruleId, 'jeri-prea-comfort');
  assert.equal(ride.quote.totalAmountCents, 15000);
  assert.equal(ride.quote.platformCommissionCents, 1500);
  assert.equal(ride.quote.driverNetCents, 13500);

  const stored = await repository.findById(ride.id);
  assert.deepEqual(stored, ride);
});

test('corrida não nasce quando a cotação ainda é uma faixa', async () => {
  const repository = repo();

  await assert.rejects(
    () =>
      createRide(repository, {
        passengerId: 'passenger-test-2',
        quoteRequest: {
          origin: { zoneId: 'prea', localityId: 'prea' },
          destination: { zoneId: 'prea', localityId: 'formosa' },
          category: 'moto',
          period: 'day',
        },
      }),
    (error: unknown) =>
      error instanceof RideCreationError &&
      error.code === 'QUOTE_NOT_EXACT',
  );
});

test('snapshot da corrida não muda quando objeto externo é alterado', async () => {
  const repository = repo();

  const ride = await createRide(repository, {
    passengerId: 'passenger-test-3',
    // 01:00Z = 22:00 em Fortaleza (UTC-3).
    now: new Date('2026-09-24T01:00:00.000Z'),
    quoteRequest: {
      origin: { zoneId: 'jijoca' },
      destination: { zoneId: 'jericoacoara' },
      category: 'comfort_black',
      period: 'after_22',
    },
  });

  const original = ride.quote.totalAmountCents;
  ride.quote.totalAmountCents = 1;

  const stored = await repository.findById(ride.id);
  assert.equal(original, 20000);
  assert.equal(stored?.quote.totalAmountCents, 20000);
});
