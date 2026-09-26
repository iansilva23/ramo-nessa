import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryOperationalSettingsRepository } from '../src/config/in-memory-operational-settings-repository.js';
import { nearbyDriversForApp } from '../src/drivers/driver-nearby-service.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';

const now = new Date('2026-09-26T19:40:00.000Z');

function supply(
  driverId: string,
  {
    latitude,
    longitude,
    ageSeconds = 0,
  }: {
    latitude: number;
    longitude: number;
    ageSeconds?: number;
  },
) {
  return {
    driverId,
    vehicleId: `vehicle-${driverId}`,
    categories: ['car'] as const,
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude,
    longitude,
    locationUpdatedAt: new Date(
      now.getTime() - ageSeconds * 1000,
    ).toISOString(),
    updatedAt: now.toISOString(),
  };
}

test('mapa próximo respeita raio e validade GPS definidos pelo Admin', async () => {
  const drivers = new InMemoryDriverSupplyRepository();
  const settings = new InMemoryOperationalSettingsRepository();

  await settings.update({
    showNearbyDrivers: true,
    driverLocationMaxAgeSeconds: 60,
    nearbyDriverMaxDistanceKm: 2,
    updatedAt: now.toISOString(),
  });

  await drivers.upsert(
    supply('driver-current', {
      latitude: -2.82017,
      longitude: -40.41467,
    }),
  );
  await drivers.upsert(
    supply('driver-near', {
      latitude: -2.825,
      longitude: -40.41467,
      ageSeconds: 30,
    }),
  );
  await drivers.upsert(
    supply('driver-stale', {
      latitude: -2.824,
      longitude: -40.41467,
      ageSeconds: 90,
    }),
  );
  await drivers.upsert(
    supply('driver-far', {
      latitude: -2.86,
      longitude: -40.41467,
      ageSeconds: 20,
    }),
  );

  const view = await nearbyDriversForApp({
    drivers,
    settings,
    driverId: 'driver-current',
    now,
  });

  assert.equal(view.enabled, true);
  assert.deepEqual(
    view.drivers.map((driver) => driver.driverId),
    ['driver-near'],
  );
});
