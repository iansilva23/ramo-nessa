import assert from 'node:assert/strict';
import test from 'node:test';

import { adminFleetSnapshot } from '../src/admin/admin-fleet-service.js';
import { InMemoryDriverRegistryRepository } from '../src/drivers/repositories/in-memory-driver-registry-repository.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-24T00:30:00.000Z');

function ride(input: {
  id: string;
  driverId: string;
  category: RideRecord['category'];
  state?: RideRecord['state'];
}): RideRecord {
  return {
    id: input.id,
    passengerId: `passenger-${input.id}`,
    state: input.state ?? 'IN_PROGRESS',
    paymentStatus: 'paid',
    driverId: input.driverId,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: input.category,
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'fleet-test',
      baseAmountCents: 10000,
      pickupCompensationCents: 0,
      totalAmountCents: 10000,
      platformCommissionCents: 1000,
      driverNetCents: 9000,
    },
    createdAt: '2026-09-24T00:20:00.000Z',
    updatedAt: '2026-09-24T00:29:00.000Z',
  };
}

test('snapshot da frota inclui livres, ocupados e GPS atrasado', async () => {
  const drivers = new InMemoryDriverSupplyRepository();
  const registry = new InMemoryDriverRegistryRepository();
  const rides = new InMemoryRideRepository();

  await drivers.upsert({
    driverId: 'driver-free',
    vehicleId: 'vehicle-free',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.82017,
    longitude: -40.41467,
    locationUpdatedAt: '2026-09-24T00:29:30.000Z',
    updatedAt: '2026-09-24T00:29:30.000Z',
  });
  await drivers.upsert({
    driverId: 'driver-trip',
    vehicleId: 'vehicle-trip',
    categories: ['car', 'delivery'],
    fourByFour: true,
    seatCapacity: 4,
    online: true,
    busy: true,
    latitude: -2.80023,
    longitude: -40.51638,
    locationUpdatedAt: '2026-09-24T00:29:45.000Z',
    updatedAt: '2026-09-24T00:29:45.000Z',
  });
  await drivers.upsert({
    driverId: 'driver-stale',
    vehicleId: 'vehicle-stale',
    categories: ['moto', 'delivery'],
    fourByFour: false,
    seatCapacity: 1,
    online: true,
    busy: false,
    latitude: -2.89860,
    longitude: -40.45060,
    locationUpdatedAt: '2026-09-24T00:20:00.000Z',
    updatedAt: '2026-09-24T00:20:00.000Z',
  });
  await drivers.upsert({
    driverId: 'driver-offline',
    vehicleId: 'vehicle-offline',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: false,
    busy: false,
    latitude: -2.89,
    longitude: -40.45,
    locationUpdatedAt: '2026-09-24T00:29:50.000Z',
    updatedAt: '2026-09-24T00:29:50.000Z',
  });

  await registry.upsertProfile({
    driverId: 'driver-trip',
    fullName: 'Motorista Em Corrida',
    preferredName: 'Corrida',
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await registry.upsertVehicle({
    id: 'vehicle-trip',
    driverId: 'driver-trip',
    plateNormalized: 'ABC1D23',
    make: 'Toyota',
    model: 'Corolla',
    modelYear: 2025,
    color: 'Preto',
    categories: ['car', 'delivery'],
    fourByFour: true,
    seatCapacity: 4,
    status: 'approved',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await rides.create(
    ride({
      id: '11111111-1111-4111-8111-111111111111',
      driverId: 'driver-trip',
      category: 'delivery',
    }),
  );

  const snapshot = await adminFleetSnapshot({
    drivers,
    registry,
    rides,
    now,
    staleAfterSeconds: 120,
  });

  assert.deepEqual(snapshot.summary, {
    totalOnline: 3,
    free: 2,
    reserved: 0,
    onRide: 1,
    busy: 0,
    staleGps: 1,
  });
  assert.equal(
    snapshot.items.some((item) => item.driverId === 'driver-offline'),
    false,
  );

  const active = snapshot.items.find(
    (item) => item.driverId === 'driver-trip',
  );
  assert.equal(active?.driverName, 'Corrida');
  assert.equal(active?.vehicle.plate, 'ABC1D23');
  assert.equal(active?.availability, 'on_ride');
  assert.equal(active?.currentServiceCategory, 'delivery');
  assert.equal(active?.ride?.state, 'IN_PROGRESS');
  assert.equal(active?.location.status, 'fresh');

  const stale = snapshot.items.find(
    (item) => item.driverId === 'driver-stale',
  );
  assert.equal(stale?.availability, 'free');
  assert.equal(stale?.location.status, 'stale');
  assert.equal(stale?.location.ageSeconds, 600);
});
