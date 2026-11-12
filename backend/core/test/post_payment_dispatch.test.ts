import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T16:00:00.000Z');

function paidPreparedRide(): RideRecord {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    passengerId: 'passenger-auto-dispatch',
    state: 'PAID',
    paymentStatus: 'paid',
    reservedDriverId: 'driver-auto',
    driverHoldExpiresAt: '2026-09-23T16:01:00.000Z',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
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
}

test('pagamento confirmado dispara oferta para motorista reservado', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const ride = paidPreparedRide();

  await rides.create(ride);
  await drivers.upsert({
    driverId: 'driver-auto',
    vehicleId: 'vehicle-auto',
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

  const result = await dispatchRideAfterPayment({
    ride,
    rides,
    drivers,
    matching,
    now,
  });

  assert.equal(result.kind, 'OFFER_CREATED');
  const stored = await rides.findById(ride.id);
  assert.equal(stored?.state, 'SEARCHING_DRIVER');

  const offers = await matching.listOffersForRide(ride.id);
  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.driverId, 'driver-auto');
});

test('corrida antiga sem pickup persistido não inventa coordenadas', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const {
    pickupLatitude: _pickupLatitude,
    pickupLongitude: _pickupLongitude,
    reservedDriverId: _reservedDriverId,
    driverHoldExpiresAt: _driverHoldExpiresAt,
    ...baseRide
  } = paidPreparedRide();
  const ride: RideRecord = {
    ...baseRide,
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  };

  await rides.create(ride);

  const result = await dispatchRideAfterPayment({
    ride,
    rides,
    drivers,
    matching,
    now,
  });

  assert.equal(result.kind, 'NOT_PREPARED');
  assert.equal((await rides.findById(ride.id))?.state, 'PAID');
});
