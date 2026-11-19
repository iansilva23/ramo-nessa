import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { passengerRideTracking } from '../src/rides/passenger-ride-tracking.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T19:00:00.000Z');

function activeRide(): RideRecord {
  return {
    id: '56565656-5656-4565-8565-565656565656',
    passengerId: 'passenger-tracking',
    state: 'DRIVER_ARRIVING',
    paymentStatus: 'paid',
    driverId: 'driver-tracking',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    dropoffLatitude: -2.7956,
    dropoffLongitude: -40.5142,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    category: 'comfort_black',
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'tracking-rule',
      baseAmountCents: 15000,
      pickupCompensationCents: 0,
      totalAmountCents: 15000,
      platformCommissionCents: 1500,
      driverNetCents: 13500,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

test('passageiro recebe posição do motorista somente durante corrida ativa', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const ride = await rides.create(activeRide());

  await registry.upsertProfile({
    driverId: 'driver-tracking',
    fullName: 'Motorista Tracking',
    preferredName: 'Tracking',
    status: 'approved',
    ratingAverage: 4.9,
    ratingCount: 12,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  await drivers.upsert({
    driverId: 'driver-tracking',
    vehicleId: 'vehicle-tracking',
    categories: ['comfort_black'],
    fourByFour: true,
    seatCapacity: 6,
    online: true,
    busy: true,
    latitude: -2.81234,
    longitude: -40.42345,
    locationUpdatedAt: '2026-09-23T18:59:50.000Z',
    updatedAt: '2026-09-23T18:59:50.000Z',
  });

  const active = await passengerRideTracking({
    rides,
    drivers,
    registry,
    rideId: ride.id,
    passengerId: ride.passengerId,
    now,
  });

  assert.equal(active?.ride.state, 'DRIVER_ARRIVING');
  assert.equal(active?.driverLocation?.latitude, -2.81234);
  assert.equal(active?.driverLocation?.longitude, -40.42345);
  assert.equal(active?.driverLocation?.stale, false);
  assert.equal(active?.driver?.displayName, 'Tracking');
  assert.equal(active?.driver?.ratingAverage, 4.9);
  assert.equal(active?.driver?.ratingCount, 12);
  assert.equal('driverId' in (active?.ride ?? {}), false);

  await rides.save({
    ...ride,
    state: 'COMPLETED',
    updatedAt: '2026-09-23T19:20:00.000Z',
  });

  const completed = await passengerRideTracking({
    rides,
    drivers,
    registry,
    rideId: ride.id,
    passengerId: ride.passengerId,
    now: new Date('2026-09-23T19:20:01.000Z'),
  });

  assert.equal(completed?.ride.state, 'COMPLETED');
  assert.equal(completed?.driverLocation, null);
});

test('tracking não revela corrida pertencente a outro passageiro', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const ride = await rides.create(activeRide());

  const result = await passengerRideTracking({
    rides,
    drivers,
    registry,
    rideId: ride.id,
    passengerId: 'passenger-other',
    now,
  });

  assert.equal(result, null);
});
