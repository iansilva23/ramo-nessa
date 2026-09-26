import assert from 'node:assert/strict';
import test from 'node:test';

import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
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
  assert.equal(ride.requiresFourByFour, true);

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


test('corrida congela a política 4x4 do catálogo usado na criação', async () => {
  const repository = repo();
  const snapshot = structuredClone(STATIC_PRICING_CATALOG_V1);
  snapshot.categoryPolicies.comfort_black = {
    enabled: true,
    requiresFourByFourOnJeriBoundary: false,
  };

  const ride = await createRide(repository, {
    passengerId: 'passenger-eligibility-snapshot',
    now: new Date('2026-09-23T12:00:00.000Z'),
    pricing: {
      snapshot,
      reference: {
        catalogVersion: 'v1',
        catalogVersionId: '11111111-1111-4111-8111-111111111111',
        catalogVersionNumber: 2,
      },
      version: null,
    },
    quoteRequest: {
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'jericoacoara' },
      category: 'comfort_black',
      period: 'day',
    },
  });

  assert.equal(ride.requiresFourByFour, false);
  assert.equal(
    ride.quote.catalogVersionId,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.equal(ride.quote.catalogVersionNumber, 2);
});
