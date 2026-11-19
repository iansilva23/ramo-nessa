import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import {
  acceptDriverOffer,
  createDriverOffer,
  rejectDriverOffer,
} from '../src/matching/offer-service.js';
import { RideOfferError } from '../src/matching/ride-offer.js';
import type { RankedDriver } from '../src/matching/select-driver.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T12:00:00.000Z');

function ride(): RideRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    passengerId: 'passenger-offer',
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

async function setup() {
  const rides = new InMemoryRideRepository();
  const drivers = new InMemoryDriverSupplyRepository();
  const matching = new InMemoryRideMatchingRepository(rides, drivers);

  await rides.create(ride());
  await drivers.upsert({
    driverId: 'driver-offer-1',
    vehicleId: 'vehicle-offer-1',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    latitude: -2.821,
    longitude: -40.414,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const ranked: RankedDriver = {
    supply: (await drivers.findByDriverId('driver-offer-1'))!,
    approximatePickupDistanceKm: 1.25,
    routeDistanceRequiredForFinalFare: true,
  };

  return { rides, drivers, matching, ranked };
}

test('criar oferta põe corrida em SEARCHING_DRIVER', async () => {
  const { rides, matching, ranked } = await setup();

  const result = await createDriverOffer({
    repository: matching,
    rideId: ride().id,
    driver: ranked,
    now,
    ttlSeconds: 20,
  });

  assert.equal(result.offer.status, 'OFFERED');
  assert.equal(result.ride.state, 'SEARCHING_DRIVER');
  assert.equal((await rides.findById(ride().id))?.state, 'SEARCHING_DRIVER');
});

test('aceite vincula motorista, atribui corrida e marca motorista ocupado', async () => {
  const { rides, drivers, matching, ranked } = await setup();
  const offered = await createDriverOffer({
    repository: matching,
    rideId: ride().id,
    driver: ranked,
    now,
    ttlSeconds: 20,
  });

  const accepted = await acceptDriverOffer({
    repository: matching,
    offerId: offered.offer.id,
    driverId: ranked.supply.driverId,
    now: new Date('2026-09-23T12:00:05.000Z'),
  });

  assert.equal(accepted.offer.status, 'ACCEPTED');
  assert.equal(accepted.ride.state, 'DRIVER_ASSIGNED');
  assert.equal(accepted.ride.driverId, 'driver-offer-1');
  assert.equal((await drivers.findByDriverId('driver-offer-1'))?.busy, true);
  assert.equal((await rides.findById(ride().id))?.driverId, 'driver-offer-1');
});

test('retry do mesmo aceite devolve a corrida já atribuída', async () => {
  const { matching, ranked } = await setup();
  const offered = await createDriverOffer({
    repository: matching,
    rideId: ride().id,
    driver: ranked,
    now,
    ttlSeconds: 20,
  });

  const first = await acceptDriverOffer({
    repository: matching,
    offerId: offered.offer.id,
    driverId: ranked.supply.driverId,
    now: new Date('2026-09-23T12:00:05.000Z'),
  });
  const retry = await acceptDriverOffer({
    repository: matching,
    offerId: offered.offer.id,
    driverId: ranked.supply.driverId,
    now: new Date('2026-09-23T12:00:07.000Z'),
  });

  assert.equal(first.offer.status, 'ACCEPTED');
  assert.equal(retry.offer.status, 'ACCEPTED');
  assert.equal(retry.ride.id, first.ride.id);
  assert.equal(retry.ride.driverId, ranked.supply.driverId);
});

test('oferta expirada não pode ser aceita', async () => {
  const { matching, ranked } = await setup();
  const offered = await createDriverOffer({
    repository: matching,
    rideId: ride().id,
    driver: ranked,
    now,
    ttlSeconds: 5,
  });

  await assert.rejects(
    () =>
      acceptDriverOffer({
        repository: matching,
        offerId: offered.offer.id,
        driverId: ranked.supply.driverId,
        now: new Date('2026-09-23T12:00:06.000Z'),
      }),
    (error: unknown) =>
      error instanceof RideOfferError &&
      error.code === 'OFFER_EXPIRED',
  );
});

test('motorista diferente não consegue aceitar oferta', async () => {
  const { matching, ranked } = await setup();
  const offered = await createDriverOffer({
    repository: matching,
    rideId: ride().id,
    driver: ranked,
    now,
  });

  await assert.rejects(
    () =>
      acceptDriverOffer({
        repository: matching,
        offerId: offered.offer.id,
        driverId: 'driver-invasor',
        now: new Date('2026-09-23T12:00:02.000Z'),
      }),
    (error: unknown) =>
      error instanceof RideOfferError &&
      error.code === 'OFFER_DRIVER_MISMATCH',
  );
});

test('retry da mesma recusa é idempotente', async () => {
  const { matching, ranked } = await setup();
  const offered = await createDriverOffer({
    repository: matching,
    rideId: ride().id,
    driver: ranked,
    now,
    ttlSeconds: 20,
  });

  const first = await rejectDriverOffer({
    repository: matching,
    offerId: offered.offer.id,
    driverId: ranked.supply.driverId,
    now: new Date('2026-09-23T12:00:05.000Z'),
  });
  const retry = await rejectDriverOffer({
    repository: matching,
    offerId: offered.offer.id,
    driverId: ranked.supply.driverId,
    now: new Date('2026-09-23T12:00:07.000Z'),
  });

  assert.equal(first.status, 'REJECTED');
  assert.equal(retry.status, 'REJECTED');
  assert.equal(retry.id, first.id);
});

test('não cria segunda oferta ativa para a mesma corrida', async () => {
  const { matching, ranked } = await setup();

  await createDriverOffer({
    repository: matching,
    rideId: ride().id,
    driver: ranked,
    now,
  });

  await assert.rejects(
    () =>
      createDriverOffer({
        repository: matching,
        rideId: ride().id,
        driver: ranked,
        now: new Date('2026-09-23T12:00:01.000Z'),
      }),
    (error: unknown) =>
      error instanceof RideOfferError &&
      error.code === 'ACTIVE_OFFER_EXISTS',
  );
});
