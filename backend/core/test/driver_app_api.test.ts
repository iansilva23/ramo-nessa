import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import {
  acceptOfferFromDriverApp,
  currentDriverOffer,
  rejectOfferFromDriverApp,
  updateDriverSupplyFromApp,
} from '../src/drivers/driver-app-service.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { createDriverOffer } from '../src/matching/offer-service.js';
import type { RankedDriver } from '../src/matching/select-driver.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-23T17:00:00.000Z');

function ride(): RideRecord {
  return {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    passengerId: 'passenger-driver-api',
    state: 'PAID',
    paymentStatus: 'paid',
    reservedDriverId: 'driver-one',
    driverHoldExpiresAt: '2026-09-23T17:02:00.000Z',
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
  const matching = new InMemoryRideMatchingRepository(rides, drivers);
  const currentRide = await rides.create(ride());

  await drivers.upsert({
    driverId: 'driver-one',
    vehicleId: 'vehicle-one',
    categories: ['car'],
    fourByFour: false,
    seatCapacity: 4,
    online: true,
    busy: false,
    reservedRideId: currentRide.id,
    reservedUntil: currentRide.driverHoldExpiresAt!,
    latitude: -2.821,
    longitude: -40.415,
    locationUpdatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  await drivers.upsert({
    driverId: 'driver-two',
    vehicleId: 'vehicle-two',
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

  const firstDriver = (await drivers.findByDriverId('driver-one'))!;
  const ranked: RankedDriver = {
    supply: firstDriver,
    approximatePickupDistanceKm: 1.1,
    routeDistanceRequiredForFinalFare: true,
  };

  const offer = await createDriverOffer({
    repository: matching,
    rideId: currentRide.id,
    driver: ranked,
    now,
    ttlSeconds: 20,
  });

  return { rides, drivers, matching, currentRide, offer: offer.offer };
}

test('app só altera online/localização e preserva regras aprovadas', async () => {
  const ctx = await setup();

  const updated = await updateDriverSupplyFromApp({
    drivers: ctx.drivers,
    driverId: 'driver-one',
    online: true,
    latitude: -2.822,
    longitude: -40.416,
    now: new Date('2026-09-23T17:00:02.000Z'),
  });

  assert.deepEqual(updated.categories, ['car']);
  assert.equal(updated.fourByFour, false);
  assert.equal(updated.seatCapacity, 4);
  assert.equal(updated.vehicleId, 'vehicle-one');
  assert.equal(updated.latitude, -2.822);
});

test('motorista recebe somente a própria oferta ativa', async () => {
  const ctx = await setup();

  const offer = await currentDriverOffer({
    rides: ctx.rides,
    drivers: ctx.drivers,
    matching: ctx.matching,
    driverId: 'driver-one',
    now: new Date('2026-09-23T17:00:03.000Z'),
  });

  assert.equal(offer?.id, ctx.offer.id);
  assert.equal(offer?.driverEarningsCents, 11000);
  assert.equal('passengerId' in (offer ?? {}), false);
});

test('aceite limpa hold, atribui corrida e deixa motorista ocupado', async () => {
  const ctx = await setup();

  const accepted = await acceptOfferFromDriverApp({
    rides: ctx.rides,
    matching: ctx.matching,
    offerId: ctx.offer.id,
    driverId: 'driver-one',
    now: new Date('2026-09-23T17:00:04.000Z'),
  });

  assert.equal(accepted.ride.state, 'DRIVER_ASSIGNED');
  const storedRide = await ctx.rides.findById(ctx.currentRide.id);
  assert.equal(storedRide?.driverId, 'driver-one');
  assert.equal(storedRide?.reservedDriverId, undefined);
  assert.equal(storedRide?.driverHoldExpiresAt, undefined);
  assert.equal(
    (await ctx.drivers.findByDriverId('driver-one'))?.busy,
    true,
  );
});

test('recusa limpa hold e envia corrida ao próximo motorista', async () => {
  const ctx = await setup();

  const rejected = await rejectOfferFromDriverApp({
    rides: ctx.rides,
    drivers: ctx.drivers,
    matching: ctx.matching,
    offerId: ctx.offer.id,
    driverId: 'driver-one',
    now: new Date('2026-09-23T17:00:05.000Z'),
  });

  assert.equal(rejected.retryStatus, 'SEARCHING_DRIVER');
  const storedRide = await ctx.rides.findById(ctx.currentRide.id);
  assert.equal(storedRide?.reservedDriverId, undefined);
  assert.equal(storedRide?.driverHoldExpiresAt, undefined);

  const offers = await ctx.matching.listOffersForRide(ctx.currentRide.id);
  assert.equal(offers.length, 2);
  assert.equal(offers[1]?.driverId, 'driver-two');
});
