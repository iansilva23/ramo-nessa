import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { dispatchNextDriver } from '../src/matching/dispatch-next-driver.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import {
  rejectDriverOffer,
} from '../src/matching/offer-service.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { InMemoryPaymentPolicySettingsRepository } from '../src/payments/repositories/in-memory-payment-policy-settings-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T13:00:00.000Z');

function ride(): RideRecord {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    passengerId: 'passenger-retry',
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
  };
}

async function setup(driverCount = 2) {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  await rides.create(ride());

  if (driverCount >= 1) {
    await drivers.upsert({
      driverId: 'driver-near',
      vehicleId: 'vehicle-near',
      categories: ['car'],
      fourByFour: false,
      seatCapacity: 4,
      online: true,
      busy: false,
      latitude: -2.8205,
      longitude: -40.4145,
      locationUpdatedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  if (driverCount >= 2) {
    await drivers.upsert({
      driverId: 'driver-next',
      vehicleId: 'vehicle-next',
      categories: ['car'],
      fourByFour: false,
      seatCapacity: 4,
      online: true,
      busy: false,
      latitude: -2.83,
      longitude: -40.42,
      locationUpdatedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return { rides, drivers, matching };
}

test('recusa do primeiro motorista tenta o próximo sem repetir', async () => {
  const ctx = await setup();

  const first = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now,
    offerTtlSeconds: 20,
  });
  assert.equal(first.kind, 'OFFER_CREATED');
  if (first.kind !== 'OFFER_CREATED') return;
  assert.equal(first.offer.driverId, 'driver-near');

  await rejectDriverOffer({
    repository: ctx.matching,
    offerId: first.offer.id,
    driverId: 'driver-near',
    now: new Date('2026-09-23T13:00:05.000Z'),
  });

  const second = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now: new Date('2026-09-23T13:00:06.000Z'),
  });

  assert.equal(second.kind, 'OFFER_CREATED');
  if (second.kind === 'OFFER_CREATED') {
    assert.equal(second.offer.driverId, 'driver-next');
  }
});

test('oferta ainda ativa impede criar outra', async () => {
  const ctx = await setup();

  const first = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now,
  });
  assert.equal(first.kind, 'OFFER_CREATED');

  const second = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now: new Date('2026-09-23T13:00:05.000Z'),
  });

  assert.equal(second.kind, 'OFFER_ACTIVE');
  if (first.kind === 'OFFER_CREATED' && second.kind === 'OFFER_ACTIVE') {
    assert.equal(second.offer.id, first.offer.id);
  }
});

test('oferta expirada é fechada e próximo motorista recebe', async () => {
  const ctx = await setup();

  const first = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now,
    offerTtlSeconds: 5,
  });
  assert.equal(first.kind, 'OFFER_CREATED');

  const second = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now: new Date('2026-09-23T13:00:06.000Z'),
  });

  assert.equal(second.kind, 'OFFER_CREATED');
  if (second.kind === 'OFFER_CREATED') {
    assert.equal(second.offer.driverId, 'driver-next');
  }
});

test('sem motorista restante corrida vai para NO_DRIVER_FOUND', async () => {
  const ctx = await setup(1);

  const first = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now,
  });
  assert.equal(first.kind, 'OFFER_CREATED');
  if (first.kind !== 'OFFER_CREATED') return;

  await rejectDriverOffer({
    repository: ctx.matching,
    offerId: first.offer.id,
    driverId: 'driver-near',
    now: new Date('2026-09-23T13:00:03.000Z'),
  });

  const result = await dispatchNextDriver({
    ...ctx,
    rideId: ride().id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now: new Date('2026-09-23T13:00:04.000Z'),
  });

  assert.equal(result.kind, 'NO_DRIVER_FOUND');
  assert.equal((await ctx.rides.findById(ride().id))?.state, 'NO_DRIVER_FOUND');
});


test('cash pula motorista cujo limite de dívida seria excedido', async () => {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const finance = new InMemoryFinanceRepository();
  const paymentPolicySettings =
    new InMemoryPaymentPolicySettingsRepository();

  const cashRide: RideRecord = {
    ...ride(),
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    paymentStatus: 'authorized',
    paymentMethod: 'cash',
  };
  await rides.create(cashRide);

  await drivers.upsert({
    driverId: 'driver-near-cash-limit',
    vehicleId: 'vehicle-near-cash-limit',
    categories: ['car'],
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
    driverId: 'driver-next-cash-ok',
    vehicleId: 'vehicle-next-cash-ok',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.83,
    longitude: -40.42,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  await paymentPolicySettings.setCashEnabled(
    true,
    now.toISOString(),
  );
  await finance.settleCashRide({
    rideId: 'cash-debt-near-driver',
    driverId: 'driver-near-cash-limit',
    platformCommissionCents: 12000,
  });

  const result = await dispatchNextDriver({
    rides,
    drivers,
    matching,
    finance,
    paymentPolicySettings,
    rideId: cashRide.id,
    pickup: { latitude: -2.82017, longitude: -40.41467 },
    now,
  });

  assert.equal(result.kind, 'OFFER_CREATED');
  if (result.kind === 'OFFER_CREATED') {
    assert.equal(
      result.offer.driverId,
      'driver-next-cash-ok',
    );
  }
});
