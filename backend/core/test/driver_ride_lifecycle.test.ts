import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import {
  completeDriverRide,
  currentDriverRide,
  markDriverArrived,
  startDriverRide,
} from '../src/drivers/driver-app-service.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T18:00:00.000Z');

function assignedRide(): RideRecord {
  return {
    id: '12121212-1212-4212-8212-121212121212',
    passengerId: 'passenger-lifecycle',
    state: 'DRIVER_ARRIVING',
    paymentStatus: 'paid',
    driverId: 'driver-lifecycle',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 2,
    quote: {
      ruleId: 'prea-jijoca-car',
      baseAmountCents: 12000,
      pickupCompensationCents: 200,
      totalAmountCents: 12200,
      platformCommissionCents: 1200,
      driverNetCents: 11000,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function setup() {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const finance = new InMemoryFinanceRepository();
  const ride = await rides.create(assignedRide());

  await drivers.upsert({
    driverId: 'driver-lifecycle',
    vehicleId: 'vehicle-lifecycle',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: true,
    latitude: -2.82,
    longitude: -40.41,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  await finance.createPayment({
    id: '34343434-3434-4434-8434-343434343434',
    rideId: ride.id,
    method: 'wallet',
    processor: 'internal-wallet',
    status: 'paid',
    amountCents: ride.quote.totalAmountCents,
    idempotencyKey: 'lifecycle-payment-001',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  return { rides, drivers, finance, ride };
}

test('corrida ativa é recuperada após reabrir o app', async () => {
  const ctx = await setup();

  const active = await currentDriverRide({
    rides: ctx.rides,
    drivers: ctx.drivers,
    driverId: 'driver-lifecycle',
  });

  assert.equal(active?.id, ctx.ride.id);
  assert.equal(active?.state, 'DRIVER_ARRIVING');
});

test('Cheguei, Iniciar e Finalizar respeitam a máquina de estados', async () => {
  const ctx = await setup();

  const arrived = await markDriverArrived({
    rides: ctx.rides,
    rideId: ctx.ride.id,
    driverId: 'driver-lifecycle',
    now: new Date('2026-09-23T18:01:00.000Z'),
  });
  assert.equal(arrived.state, 'DRIVER_ARRIVED');

  const started = await startDriverRide({
    rides: ctx.rides,
    rideId: ctx.ride.id,
    driverId: 'driver-lifecycle',
    now: new Date('2026-09-23T18:02:00.000Z'),
  });
  assert.equal(started.state, 'IN_PROGRESS');

  const completed = await completeDriverRide({
    rides: ctx.rides,
    drivers: ctx.drivers,
    finance: ctx.finance,
    rideId: ctx.ride.id,
    driverId: 'driver-lifecycle',
    now: new Date('2026-09-23T18:10:00.000Z'),
  });

  assert.equal(completed.ride.state, 'COMPLETED');
  assert.equal(completed.driverBalanceCents, 11000);
  assert.equal(completed.duplicateSettlement, false);
  assert.equal(
    (await ctx.drivers.findByDriverId('driver-lifecycle'))?.busy,
    false,
  );
});

test('repetir finalização não duplica saldo do motorista', async () => {
  const ctx = await setup();

  await markDriverArrived({
    rides: ctx.rides,
    rideId: ctx.ride.id,
    driverId: 'driver-lifecycle',
  });
  await startDriverRide({
    rides: ctx.rides,
    rideId: ctx.ride.id,
    driverId: 'driver-lifecycle',
  });

  const first = await completeDriverRide({
    rides: ctx.rides,
    drivers: ctx.drivers,
    finance: ctx.finance,
    rideId: ctx.ride.id,
    driverId: 'driver-lifecycle',
  });
  const second = await completeDriverRide({
    rides: ctx.rides,
    drivers: ctx.drivers,
    finance: ctx.finance,
    rideId: ctx.ride.id,
    driverId: 'driver-lifecycle',
  });

  assert.equal(first.driverBalanceCents, 11000);
  assert.equal(second.driverBalanceCents, 11000);
  assert.equal(second.duplicateSettlement, true);
});
