import assert from 'node:assert/strict';
import test from 'node:test';

import type { DriverSupplyRecord } from '../src/drivers/driver-supply.js';
import {
  rankEligibleDrivers,
  selectDriverForDispatch,
} from '../src/matching/select-driver.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T12:00:00.000Z');

function supply(
  overrides: Partial<DriverSupplyRecord> = {},
): DriverSupplyRecord {
  return {
    driverId: 'driver-1',
    vehicleId: 'vehicle-1',
    categories: ['comfort_black'],
    fourByFour: true,
    seatCapacity: 4,
    online: true,
    latitude: -2.82,
    longitude: -40.42,
    locationUpdatedAt: '2026-09-23T11:59:30.000Z',
    updatedAt: '2026-09-23T11:59:30.000Z',
    ...overrides,
  };
}

function paidRide(
  overrides: Partial<RideRecord> = {},
): RideRecord {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    passengerId: 'passenger-1',
    state: 'PAID',
    paymentStatus: 'paid',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    category: 'comfort_black',
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'jeri-prea-comfort',
      baseAmountCents: 15000,
      pickupCompensationCents: 0,
      totalAmountCents: 15000,
      platformCommissionCents: 1500,
      driverNetCents: 13500,
    },
    createdAt: '2026-09-23T11:55:00.000Z',
    updatedAt: '2026-09-23T11:56:00.000Z',
    ...overrides,
  };
}

test('rota de Jeri em Comfort/Black exige 4x4', () => {
  const ranked = rankEligibleDrivers({
    ride: paidRide(),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply({
        driverId: 'common-premium',
        vehicleId: 'vehicle-common',
        fourByFour: false,
      }),
      supply({
        driverId: 'four-by-four',
        vehicleId: 'vehicle-4x4',
        fourByFour: true,
      }),
    ],
    now,
  });

  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['four-by-four'],
  );
});

test('matching elimina localização velha e capacidade insuficiente', () => {
  const ranked = rankEligibleDrivers({
    ride: paidRide({ passengers: 4 }),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply({
        driverId: 'stale',
        locationUpdatedAt: '2026-09-23T11:55:00.000Z',
      }),
      supply({
        driverId: 'small',
        seatCapacity: 3,
      }),
      supply({
        driverId: 'valid',
        seatCapacity: 4,
      }),
    ],
    now,
    maxLocationAgeSeconds: 120,
  });

  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['valid'],
  );
});

test('pré-seleção ordena pelo motorista elegível mais próximo', () => {
  const ranked = rankEligibleDrivers({
    ride: paidRide({
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'prea', localityId: 'formosa' },
      category: 'car',
    }),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply({
        driverId: 'far',
        vehicleId: 'vehicle-far',
        categories: ['car'],
        fourByFour: false,
        latitude: -2.88,
        longitude: -40.45,
      }),
      supply({
        driverId: 'near',
        vehicleId: 'vehicle-near',
        categories: ['car'],
        fourByFour: false,
        latitude: -2.821,
        longitude: -40.415,
      }),
    ],
    now,
  });

  assert.equal(ranked[0]?.supply.driverId, 'near');
  assert.ok(
    (ranked[0]?.approximatePickupDistanceKm ?? 99) <
      (ranked[1]?.approximatePickupDistanceKm ?? 0),
  );
});

test('despacho recusa corrida que ainda não está paga', () => {
  assert.throws(
    () =>
      selectDriverForDispatch({
        ride: paidRide({
          state: 'AWAITING_PAYMENT',
          paymentStatus: 'created',
        }),
        pickup: { latitude: -2.82017, longitude: -40.41467 },
        candidates: [supply()],
        now,
      }),
    /só pode iniciar depois/,
  );
});

test('despacho pago avança para SEARCHING_DRIVER', () => {
  const selected = selectDriverForDispatch({
    ride: paidRide(),
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [supply()],
    now,
  });

  assert.equal(selected.nextRideState, 'SEARCHING_DRIVER');
  assert.equal(selected.driver.supply.driverId, 'driver-1');
});
