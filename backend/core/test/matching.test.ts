import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import type { DriverSupplyRecord } from '../src/drivers/driver-supply.js';
import {
  rankEligibleDrivers,
  rideRequiresFourByFour,
  selectDriverForDispatch,
} from '../src/matching/select-driver.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T12:00:00.000Z');

function ride(overrides: Partial<RideRecord> = {}): RideRecord {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    passengerId: 'passenger-matching',
    state: 'PAID',
    paymentStatus: 'paid',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'prea-jijoca-car',
      baseAmountCents: 12000,
      pickupCompensationCents: 0,
      totalAmountCents: 12000,
      platformCommissionCents: 1200,
      driverNetCents: 10800,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function supply(
  driverId: string,
  overrides: Partial<DriverSupplyRecord> = {},
): DriverSupplyRecord {
  return {
    driverId,
    vehicleId: `vehicle-${driverId}`,
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    latitude: -2.821,
    longitude: -40.414,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

test('driver-supply é a fonte única de disponibilidade do matching', async () => {
  const repository = new InMemoryDriverSupplyRepository();

  await repository.upsert(
    supply('driver-offline', { online: false }),
  );
  await repository.upsert(supply('driver-online'));

  const online = await repository.listOnline();

  assert.deepEqual(
    online.map((item) => item.driverId),
    ['driver-online'],
  );
});

test('matching ordena o motorista elegível mais próximo', () => {
  const ranked = rankEligibleDrivers({
    ride: ride(),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('driver-far', {
        latitude: -2.90,
        longitude: -40.45,
      }),
      supply('driver-near', {
        latitude: -2.821,
        longitude: -40.414,
      }),
    ],
    now,
  });

  assert.equal(ranked[0]?.supply.driverId, 'driver-near');
  assert.equal(ranked[0]?.routeDistanceRequiredForFinalFare, true);
});

test('Comfort para/de Jeri exige 4x4 elegível', () => {
  const currentRide = ride({
    category: 'comfort_black',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    passengers: 3,
  });

  const ranked = rankEligibleDrivers({
    ride: currentRide,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('comfort-common', {
        categories: ['comfort_black'],
        fourByFour: false,
      }),
      supply('comfort-4x4', {
        categories: ['comfort_black'],
        fourByFour: true,
        latitude: -2.83,
      }),
    ],
    now,
  });

  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['comfort-4x4'],
  );
  assert.equal(rideRequiresFourByFour(currentRide), true);
});

test('capacidade real e localização recente são obrigatórias', () => {
  const ranked = rankEligibleDrivers({
    ride: ride({ passengers: 4 }),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('capacity-2', { seatCapacity: 2 }),
      supply('stale', {
        seatCapacity: 4,
        locationUpdatedAt: '2026-09-23T11:55:00.000Z',
      }),
      supply('eligible', { seatCapacity: 4 }),
    ],
    now,
    maxLocationAgeSeconds: 60,
  });

  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['eligible'],
  );
});

test('matching não inicia antes de pagamento confirmado', () => {
  assert.throws(
    () =>
      selectDriverForDispatch({
        ride: ride({
          state: 'AWAITING_PAYMENT',
          paymentStatus: 'pending',
        }),
        pickup: { latitude: -2.82017, longitude: -40.41467 },
        candidates: [supply('driver-1')],
        now,
      }),
    /depois da corrida estar PAID/,
  );
});

test('corrida paga entra em SEARCHING_DRIVER com candidato elegível', () => {
  const selected = selectDriverForDispatch({
    ride: ride(),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [supply('driver-1')],
    now,
  });

  assert.equal(selected.nextRideState, 'SEARCHING_DRIVER');
  assert.equal(selected.driver.supply.driverId, 'driver-1');
});

test('Jeri local não força 4x4 por esta regra de corredor', () => {
  const localJeri = ride({
    category: 'comfort_black',
    origin: { zoneId: 'jericoacoara' },
    destination: { zoneId: 'jericoacoara' },
  });

  assert.equal(rideRequiresFourByFour(localJeri), false);
});
