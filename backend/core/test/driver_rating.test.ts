import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import {
  DriverRatingError,
  submitPassengerDriverRating,
} from '../src/rides/driver-rating-service.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-24T21:00:00.000Z');

function completedRide(): RideRecord {
  return {
    id: '78787878-7878-4787-8787-787878787878',
    passengerId: 'passenger-rating',
    driverId: 'driver-rating',
    state: 'COMPLETED',
    paymentStatus: 'paid',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    category: 'car',
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'rating-rule',
      baseAmountCents: 10000,
      pickupCompensationCents: 0,
      totalAmountCents: 10000,
      platformCommissionCents: 1000,
      driverNetCents: 9000,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function setup() {
  const rides = new InMemoryRideRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const ride = await rides.create(completedRide());
  await registry.upsertProfile({
    driverId: 'driver-rating',
    fullName: 'Motorista Avaliado',
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  return { rides, registry, ride };
}

test('passageiro avalia motorista uma única vez por corrida', async () => {
  const { rides, registry, ride } = await setup();

  const first = await submitPassengerDriverRating({
    rides,
    registry,
    rideId: ride.id,
    passengerId: ride.passengerId,
    stars: 5,
    now,
  });
  assert.deepEqual(first, {
    stars: 5,
    ratingAverage: 5,
    ratingCount: 1,
    duplicate: false,
  });

  const repeated = await submitPassengerDriverRating({
    rides,
    registry,
    rideId: ride.id,
    passengerId: ride.passengerId,
    stars: 3,
    now,
  });
  assert.equal(repeated.stars, 5);
  assert.equal(repeated.ratingAverage, 5);
  assert.equal(repeated.ratingCount, 1);
  assert.equal(repeated.duplicate, true);

  const profile = await registry.findProfile('driver-rating');
  assert.equal(profile?.ratingAverage, 5);
  assert.equal(profile?.ratingCount, 1);
});

test('corrida não concluída e nota fora de 1–5 são recusadas', async () => {
  const { rides, registry, ride } = await setup();

  await assert.rejects(
    submitPassengerDriverRating({
      rides,
      registry,
      rideId: ride.id,
      passengerId: ride.passengerId,
      stars: 0,
    }),
    (error: unknown) =>
      error instanceof DriverRatingError &&
      error.code === 'INVALID_RATING',
  );

  await rides.save({
    ...ride,
    state: 'IN_PROGRESS',
    updatedAt: now.toISOString(),
  });
  await assert.rejects(
    submitPassengerDriverRating({
      rides,
      registry,
      rideId: ride.id,
      passengerId: ride.passengerId,
      stars: 5,
    }),
    (error: unknown) =>
      error instanceof DriverRatingError &&
      error.code === 'RATING_NOT_ALLOWED',
  );
});
