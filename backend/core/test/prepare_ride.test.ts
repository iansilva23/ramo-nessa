import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { createPaymentForRide } from '../src/payments/create-payment.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { InMemoryRidePreparationRepository } from '../src/rides/in-memory-ride-preparation-repository.js';
import {
  prepareRideForPayment,
} from '../src/rides/prepare-ride.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RoutingDistanceProvider } from '../src/routing/distance-provider.js';

const now = new Date('2026-09-23T14:00:00.000Z');

class FakeRouting implements RoutingDistanceProvider {
  constructor(private readonly distanceKm: number) {}

  async routeDistanceKm(): Promise<number> {
    return this.distanceKm;
  }
}

async function setup() {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const preparation = new InMemoryRidePreparationRepository(rides, drivers);

  await drivers.upsert({
    driverId: 'driver-prepare-near',
    vehicleId: 'vehicle-prepare-near',
    categories: ['car', 'delivery'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.8205,
    longitude: -40.4145,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  await drivers.upsert({
    driverId: 'driver-prepare-next',
    vehicleId: 'vehicle-prepare-next',
    categories: ['car', 'delivery'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.84,
    longitude: -40.43,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  return { rides, drivers, preparation };
}

test('preparação usa distância roteada e congela compensação antes do pagamento', async () => {
  const ctx = await setup();

  const ride = await prepareRideForPayment({
    repository: ctx.preparation,
    drivers: ctx.drivers,
    routing: new FakeRouting(9),
    passengerId: 'passenger-prepare',
    quoteRequest: {
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'jijoca' },
      category: 'car',
      period: 'day',
    },
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    dropoff: { latitude: -2.7956, longitude: -40.5142 },
    now,
  });

  assert.equal(ride.state, 'AWAITING_PAYMENT');
  assert.equal(ride.pickupLatitude, -2.82017);
  assert.equal(ride.pickupLongitude, -40.41467);
  assert.equal(ride.dropoffLatitude, -2.7956);
  assert.equal(ride.dropoffLongitude, -40.5142);
  assert.equal(ride.reservedDriverId, 'driver-prepare-near');
  assert.equal(ride.driverPickupDistanceKm, 9);
  assert.equal(ride.quote.baseAmountCents, 12000);
  assert.equal(ride.quote.pickupCompensationCents, 500);
  assert.equal(ride.quote.totalAmountCents, 12500);
  assert.equal(ride.quote.platformCommissionCents, 1200);
  assert.equal(ride.quote.driverNetCents, 11300);

  const held = await ctx.drivers.findByDriverId('driver-prepare-near');
  assert.equal(held?.reservedRideId, ride.id);
  assert.equal(held?.reservedUntil, ride.driverHoldExpiresAt);
});

test('distância de coleta enviada pelo cliente é ignorada', async () => {
  const ctx = await setup();

  const ride = await prepareRideForPayment({
    repository: ctx.preparation,
    drivers: ctx.drivers,
    routing: new FakeRouting(2),
    passengerId: 'passenger-spoof',
    quoteRequest: {
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'jijoca' },
      category: 'car',
      period: 'day',
      driverPickupDistanceKm: 99,
    },
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    dropoff: { latitude: -2.7956, longitude: -40.5142 },
    now,
  });

  assert.equal(ride.driverPickupDistanceKm, 2);
  assert.equal(ride.quote.pickupCompensationCents, 0);
  assert.equal(ride.quote.totalAmountCents, 12000);
});

test('entrega em Jeri ignora distância enviada pelo cliente', async () => {
  const ctx = await setup();

  const ride = await prepareRideForPayment({
    repository: ctx.preparation,
    drivers: ctx.drivers,
    routing: new FakeRouting(1.5),
    passengerId: 'passenger-distance-spoof',
    quoteRequest: {
      origin: { zoneId: 'jericoacoara' },
      destination: { zoneId: 'jericoacoara' },
      category: 'delivery',
      period: 'day',
      // Cliente tenta forçar a faixa de até 700 m.
      tripDistanceKm: 0.1,
    },
    pickup: { latitude: -2.7956, longitude: -40.5142 },
    dropoff: { latitude: -2.8050, longitude: -40.5050 },
    now,
  });

  assert.equal(ride.tripDistanceKm, 1.5);
  assert.equal(ride.quote.baseAmountCents, 800);
  assert.equal(ride.quote.totalAmountCents, 800);
});

test('preparação ignora período do cliente e usa horário local do Core', async () => {
  const ctx = await setup();

  const ride = await prepareRideForPayment({
    repository: ctx.preparation,
    drivers: ctx.drivers,
    routing: new FakeRouting(2),
    passengerId: 'passenger-period-spoof',
    quoteRequest: {
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'jijoca' },
      category: 'car',
      // Cliente tenta forçar tarifa diurna.
      period: 'day',
    },
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    dropoff: { latitude: -2.89860, longitude: -40.45060 },
    // 01:00Z = 22:00 do dia anterior em Fortaleza (UTC-3).
    now: new Date('2026-09-24T01:00:00.000Z'),
  });

  assert.equal(ride.period, 'after_22');
  assert.equal(ride.quote.baseAmountCents, 14000);
  assert.equal(ride.quote.platformCommissionCents, 1400);
  assert.equal(ride.quote.driverNetCents, 12600);
});

test('motorista já reservado não é usado em outra preparação ativa', async () => {
  const ctx = await setup();
  const request = {
    origin: { zoneId: 'prea' as const },
    destination: { zoneId: 'jijoca' as const },
    category: 'car' as const,
    period: 'day' as const,
  };

  const first = await prepareRideForPayment({
    repository: ctx.preparation,
    drivers: ctx.drivers,
    routing: new FakeRouting(2),
    passengerId: 'passenger-first',
    quoteRequest: request,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    dropoff: { latitude: -2.7956, longitude: -40.5142 },
    now,
  });

  const second = await prepareRideForPayment({
    repository: ctx.preparation,
    drivers: ctx.drivers,
    routing: new FakeRouting(2),
    passengerId: 'passenger-second',
    quoteRequest: request,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    dropoff: { latitude: -2.7956, longitude: -40.5142 },
    now: new Date('2026-09-23T14:00:01.000Z'),
  });

  assert.equal(first.reservedDriverId, 'driver-prepare-near');
  assert.equal(second.reservedDriverId, 'driver-prepare-next');
});

test('pagamento não inicia depois que a reserva preparada expirou', async () => {
  const ctx = await setup();
  const ride = await prepareRideForPayment({
    repository: ctx.preparation,
    drivers: ctx.drivers,
    routing: new FakeRouting(2),
    passengerId: 'passenger-expired',
    quoteRequest: {
      origin: { zoneId: 'prea' },
      destination: { zoneId: 'jijoca' },
      category: 'car',
      period: 'day',
    },
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    dropoff: { latitude: -2.7956, longitude: -40.5142 },
    now,
    holdSeconds: 30,
  });

  await assert.rejects(
    () =>
      createPaymentForRide(new InMemoryFinanceRepository(), {
        ride,
        method: 'pix',
        processor: 'test-gateway',
        idempotencyKey: 'expired-hold-payment',
        now: new Date('2026-09-23T14:00:31.000Z'),
      }),
    /reserva do motorista expirou/i,
  );
});
