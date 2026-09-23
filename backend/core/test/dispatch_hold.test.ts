import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { dispatchNextDriver } from '../src/matching/dispatch-next-driver.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

test('despacho prioriza exclusivamente o motorista reservado enquanto hold está ativo', async () => {
  const now = new Date('2026-09-23T15:00:00.000Z');
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);

  const ride: RideRecord = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    passengerId: 'passenger-held',
    state: 'PAID',
    paymentStatus: 'paid',
    reservedDriverId: 'driver-held',
    driverHoldExpiresAt: '2026-09-23T15:01:00.000Z',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 1,
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
  };
  await rides.create(ride);

  await drivers.upsert({
    driverId: 'driver-closer-but-not-held',
    vehicleId: 'vehicle-close',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.82018,
    longitude: -40.41468,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await drivers.upsert({
    driverId: 'driver-held',
    vehicleId: 'vehicle-held',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    reservedRideId: ride.id,
    reservedUntil: ride.driverHoldExpiresAt!,
    latitude: -2.83,
    longitude: -40.42,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const result = await dispatchNextDriver({
    rides,
    drivers,
    matching,
    rideId: ride.id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now,
  });

  assert.equal(result.kind, 'OFFER_CREATED');
  if (result.kind === 'OFFER_CREATED') {
    assert.equal(result.offer.driverId, 'driver-held');
  }
});
