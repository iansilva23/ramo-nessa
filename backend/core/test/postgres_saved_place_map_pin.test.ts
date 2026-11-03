import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresPassengerSavedPlaceRepository } from '../src/passengers/repositories/postgres-passenger-saved-place-repository.js';
import { savePassengerSavedPlace } from '../src/passengers/passenger-saved-place-service.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresRidePreparationRepository } from '../src/rides/postgres-ride-preparation-repository.js';
import { PostgresDriverSupplyRepository } from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import { PostgresRideMatchingRepository } from '../src/matching/postgres-ride-matching-repository.js';
import { preparePassengerRideForPayment } from '../src/rides/prepare-ride.js';
import { driverRideView } from '../src/drivers/driver-ride-service.js';
const databaseUrl = process.env.DATABASE_URL?.trim();

test('PostgreSQL: detalhes do pin persistem na edição e durante pagamento/aceite', { skip: !databaseUrl }, async () => {
  const pool = createPostgresPool(databaseUrl!);
  const passengerId = `pin-${randomUUID()}`;
  const driverId = `pin-driver-${randomUUID()}`;
  let rideId: string | undefined;
  try {
    const repository = new PostgresPassengerSavedPlaceRepository(pool);
    const input = { repository, passengerId, kind: 'custom', label: 'Casa', name: 'Rua das Flores',
      address: 'Rua das Flores, Cruz', latitude: -2.82017, longitude: -40.41467,
      addressDetails: { mapPinned: true, noNumber: false, houseNumber: '12A', reference: 'Portão azul' } };
    const place = await savePassengerSavedPlace(input);
    await savePassengerSavedPlace({ ...input, id: place.id, label: 'Casa nova' });
    const listed = await repository.listByPassenger(passengerId);
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0]?.addressDetails, input.addressDetails);
    const drivers = new PostgresDriverSupplyRepository(pool);
    const now = new Date();
    await drivers.upsert({ driverId, vehicleId: driverId, categories: ['car'], fourByFour: false,
      seatCapacity: 4, online: true, busy: false, latitude: -2.8205, longitude: -40.4145,
      locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString() });
    const rides = new PostgresRideRepository(pool);
    const ride = await preparePassengerRideForPayment({ repository: new PostgresRidePreparationRepository(pool), drivers,
      routing: { routeDistanceKm: async () => 1 }, passengerId, now, canUseDriver: async id => id === driverId,
      quoteRequest: { origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' }, category: 'car', period: 'day' },
      pickup: { latitude: -2.82017, longitude: -40.41467 }, dropoff: { latitude: -2.8986, longitude: -40.4506 },
      pickupInstructions: 'Rua das Flores — Nº 12A — Referência: Portão azul', dropoffInstructions: 'Destino — Sem número' });
    rideId = ride.id;
    const paid = await rides.save({ ...ride, state: 'PAID', paymentStatus: 'paid', paymentMethod: 'pix' });
    assert.equal(paid.pickupInstructions, ride.pickupInstructions);
    const matching = new PostgresRideMatchingRepository(pool);
    const offer = await matching.createOffer({ rideId, driverId,
      approximatePickupDistanceKm: 1, expiresAt: new Date(now.getTime() + 60000).toISOString(), createdAt: now.toISOString() });
    const accepted = await matching.acceptOffer({ offerId: offer.offer.id, driverId, acceptedAt: now.toISOString() });
    assert.equal(accepted.ride.pickupInstructions, ride.pickupInstructions);
    assert.equal(driverRideView(accepted.ride).dropoffInstructions, 'Destino — Sem número');
  } finally {
    if (rideId) { await pool.query('DELETE FROM ride_offers WHERE ride_id = $1', [rideId]); await pool.query('DELETE FROM rides WHERE id = $1', [rideId]); }
    await pool.query('DELETE FROM driver_supply WHERE driver_id = $1', [driverId]);
    await pool.query('DELETE FROM passenger_saved_places WHERE passenger_id = $1', [passengerId]);
    await pool.end();
  }
});
