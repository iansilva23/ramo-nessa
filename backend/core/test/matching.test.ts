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
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { requiresFourByFourForTrip } from '../src/pricing/category-eligibility.js';

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
    busy: false,
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


test('matching respeita a política 4x4 congelada na corrida', () => {
  const currentRide = ride({
    category: 'comfort_black',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    passengers: 2,
    requiresFourByFour: false,
  });

  const ranked = rankEligibleDrivers({
    ride: currentRide,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    candidates: [
      supply('comfort-common-frozen', {
        categories: ['comfort_black'],
        fourByFour: false,
      }),
      supply('comfort-4x4-frozen', {
        categories: ['comfort_black'],
        fourByFour: true,
        latitude: -2.84,
      }),
    ],
    now,
  });

  assert.equal(rideRequiresFourByFour(currentRide), false);
  assert.deepEqual(
    ranked.map((item) => item.supply.driverId),
    ['comfort-common-frozen', 'comfort-4x4-frozen'],
  );
});

test('política publicada de corredor 4x4 chega ao matching via snapshot da corrida', () => {
  const origin = {zoneId:'prea' as const,localityId:'prea'};
  const destination = {zoneId:'jericoacoara' as const,localityId:'jericoacoara'};
  const required = requiresFourByFourForTrip({
    catalog:STATIC_PRICING_CATALOG_V1,origin,destination,category:'car',
  });
  assert.equal(required,true);
  const currentRide = ride({
    origin,destination,category:'car',requiresFourByFour:required,
  });
  const ranked = rankEligibleDrivers({
    ride:currentRide,pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[
      supply('near-ordinary',{fourByFour:false}),
      supply('far-4x4',{fourByFour:true,latitude:-2.84}),
    ],now,
  });
  assert.deepEqual(ranked.map(row=>row.supply.driverId),['far-4x4']);
  assert.equal(rideRequiresFourByFour(currentRide),true);
  assert.throws(()=>selectDriverForDispatch({
    ride:currentRide,pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[supply('ordinary-only',{fourByFour:false})],now,
  }),/Nenhum motorista elegível/);
  const returning = ride({
    origin:destination,destination:origin,category:'car',
    requiresFourByFour:requiresFourByFourForTrip({
      catalog:STATIC_PRICING_CATALOG_V1,
      origin:destination,destination:origin,category:'car',
    }),
  });
  assert.deepEqual(rankEligibleDrivers({
    ride:returning,pickup:{latitude:-2.80023,longitude:-40.51638},
    candidates:[supply('return-ordinary',{fourByFour:false}),
      supply('return-4x4',{fourByFour:true})],now,
  }).map(row=>row.supply.driverId),['return-4x4']);
});

test('estado PAID sem pagamento confirmado não libera busca de motorista', () => {
  for (const paymentStatus of ['pending','failed'] as const) {
    assert.throws(() => selectDriverForDispatch({
      ride:ride({state:'PAID',paymentStatus}),
      pickup:{latitude:-2.82017,longitude:-40.41467},
      candidates:[supply('driver-paid-state-only')],
      now,
    }));
  }
});

test('busca não seleciona motorista reservado por outra corrida', () => {
  const ranked = rankEligibleDrivers({
    ride:ride(),
    pickup:{latitude:-2.82017,longitude:-40.41467},
    candidates:[
      supply('reserved-other',{reservedRideId:'another-ride',
        reservedUntil:'2026-09-23T12:01:00.000Z'}),
      supply('free-driver',{latitude:-2.83}),
    ],
    now,
  });
  assert.deepEqual(ranked.map(item=>item.supply.driverId),['free-driver']);
});

test('reserva vencida libera motorista e reserva da mesma corrida não bloqueia', () => {
  const currentRide = ride();
  const ranked = rankEligibleDrivers({
    ride: currentRide,
    pickup: {latitude:-2.82017,longitude:-40.41467},
    candidates: [
      supply('held-other-active',{
        reservedRideId:'other-ride',reservedUntil:'2026-09-23T12:01:00.000Z',
      }),
      supply('held-other-expired',{
        reservedRideId:'other-ride',reservedUntil:'2026-09-23T11:59:59.000Z',
        latitude:-2.822,
      }),
      supply('held-same-ride',{
        reservedRideId:currentRide.id,reservedUntil:'2026-09-23T12:01:00.000Z',
        latitude:-2.823,
      }),
    ],now,
  });
  assert.deepEqual(ranked.map(item=>item.supply.driverId),
    ['held-other-expired','held-same-ride']);
});
