import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryDriverAvailabilityRepository } from '../src/matching/repositories/in-memory-driver-availability-repository.js';
import {
  findDriverCandidates,
  routeRequiresJeri4x4,
} from '../src/matching/find-driver-candidates.js';

const now = new Date('2026-09-23T12:00:00.000Z');

test('matching ordena pelo motorista elegível mais próximo', async () => {
  const repository = new InMemoryDriverAvailabilityRepository();

  await repository.upsert({
    driverId: 'driver-far',
    status: 'available',
    serviceCategories: ['car'],
    passengerCapacity: 4,
    jeri4x4Eligible: false,
    position: { lat: -2.9000, lon: -40.4500 },
    lastSeenAt: now.toISOString(),
  });
  await repository.upsert({
    driverId: 'driver-near',
    status: 'available',
    serviceCategories: ['car'],
    passengerCapacity: 4,
    jeri4x4Eligible: false,
    position: { lat: -2.8210, lon: -40.4140 },
    lastSeenAt: now.toISOString(),
  });

  const candidates = await findDriverCandidates(repository, {
    category: 'car',
    passengers: 2,
    pickup: { lat: -2.82017, lon: -40.41467 },
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    now,
  });

  assert.equal(candidates[0]?.driver.driverId, 'driver-near');
  assert.equal(candidates[0]?.routeDistanceRequiredForFinalFare, true);
});

test('rota Comfort para Jeri exclui veículo sem elegibilidade 4x4', async () => {
  const repository = new InMemoryDriverAvailabilityRepository();

  await repository.upsert({
    driverId: 'comfort-common',
    status: 'available',
    serviceCategories: ['comfort_black'],
    passengerCapacity: 4,
    jeri4x4Eligible: false,
    position: { lat: -2.8202, lon: -40.4147 },
    lastSeenAt: now.toISOString(),
  });
  await repository.upsert({
    driverId: 'comfort-4x4',
    status: 'available',
    serviceCategories: ['comfort_black'],
    passengerCapacity: 4,
    jeri4x4Eligible: true,
    position: { lat: -2.83, lon: -40.42 },
    lastSeenAt: now.toISOString(),
  });

  const candidates = await findDriverCandidates(repository, {
    category: 'comfort_black',
    passengers: 3,
    pickup: { lat: -2.82017, lon: -40.41467 },
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    now,
  });

  assert.deepEqual(
    candidates.map((candidate) => candidate.driver.driverId),
    ['comfort-4x4'],
  );
});

test('capacidade real do veículo é respeitada', async () => {
  const repository = new InMemoryDriverAvailabilityRepository();

  await repository.upsert({
    driverId: 'driver-capacity-2',
    status: 'available',
    serviceCategories: ['comfort_black'],
    passengerCapacity: 2,
    jeri4x4Eligible: true,
    position: { lat: -2.82, lon: -40.41 },
    lastSeenAt: now.toISOString(),
  });

  const candidates = await findDriverCandidates(repository, {
    category: 'comfort_black',
    passengers: 4,
    pickup: { lat: -2.82017, lon: -40.41467 },
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jericoacoara' },
    now,
  });

  assert.equal(candidates.length, 0);
});

test('posição antiga não entra no matching', async () => {
  const repository = new InMemoryDriverAvailabilityRepository();

  await repository.upsert({
    driverId: 'stale-driver',
    status: 'available',
    serviceCategories: ['moto'],
    passengerCapacity: 1,
    jeri4x4Eligible: false,
    position: { lat: -2.82, lon: -40.41 },
    lastSeenAt: '2026-09-23T11:58:00.000Z',
  });

  const candidates = await findDriverCandidates(repository, {
    category: 'moto',
    passengers: 1,
    pickup: { lat: -2.82017, lon: -40.41467 },
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'prea', localityId: 'formosa' },
    now,
  });

  assert.equal(candidates.length, 0);
});

test('regra 4x4 só vale quando a rota cruza para/de Jeri', () => {
  assert.equal(
    routeRequiresJeri4x4(
      { zoneId: 'prea' },
      { zoneId: 'jericoacoara' },
    ),
    true,
  );
  assert.equal(
    routeRequiresJeri4x4(
      { zoneId: 'jericoacoara' },
      { zoneId: 'jericoacoara' },
    ),
    false,
  );
  assert.equal(
    routeRequiresJeri4x4(
      { zoneId: 'prea' },
      { zoneId: 'jijoca' },
    ),
    false,
  );
});
