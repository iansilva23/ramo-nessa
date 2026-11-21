import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresDriverSupplyRepository } from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import { PostgresManualCancellationStore } from '../src/rides/manual-cancellation-store.js';
import { cashCancellationTerms } from '../src/rides/manual-cancellation-policy.js';

test('cash cancellation closes at twenty seconds or the first acceptance', () => {
  const requestedAt = new Date('2026-11-20T00:00:00Z');
  const before = new Date(requestedAt.getTime() + 19_999);
  const boundary = new Date(requestedAt.getTime() + 20_000);
  const ride = { requestedAt, acceptedAt: null, assigned: false, state: 'SEARCHING_DRIVER', now: before };
  assert.equal(cashCancellationTerms(ride).cancelUntil, boundary.toISOString());
  assert.equal(cashCancellationTerms({ ...ride, now: boundary }).canCancel, false);
  assert.equal(cashCancellationTerms({ ...ride, acceptedAt: before }).canCancel, false);
  assert.equal(cashCancellationTerms({ ...ride, assigned: true }).canCancel, false);
  assert.equal(cashCancellationTerms({ ...ride, requestedAt: null }).canCancel, false);
});

test('Postgres cash cancellation handles pending offers, acceptance, retries and expiry', {
  skip: process.env.RAMO_CANCELLATION_TEST_POSTGRES !== 'true',
}, async () => {
  const pool = createPostgresPool(process.env.DATABASE_URL!);
  const rides = new PostgresRideRepository(pool);
  const drivers = new PostgresDriverSupplyRepository(pool);
  const store = new PostgresManualCancellationStore(pool);
  const driverId = 'cash-driver-' + randomUUID();
  const passengerId = 'cash-passenger-' + randomUUID();
  const ids: string[] = [];
  const requested = new Date('2026-11-20T00:00:00Z');
  const requestedAt = requested.toISOString();
  const beforeDeadline = new Date(requested.getTime() + 19_999);
  const deadline = new Date(requested.getTime() + 20_000);
  async function fixture(beforePayment: boolean) {
    const id = randomUUID();
    ids.push(id);
    const draft = await rides.create({
      id, passengerId, state: 'AWAITING_PAYMENT', paymentStatus: 'pending',
      origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' },
      category: 'car', period: 'day', passengers: 1,
      driverConsentRequired: beforePayment,
      quote: { ruleId: 'cash-test', baseAmountCents: 3200, pickupCompensationCents: 0,
        totalAmountCents: 3200, platformCommissionCents: 320, driverNetCents: 2880 },
      createdAt: requestedAt, updatedAt: requestedAt,
    });
    if (!beforePayment) {
      const authorized = await rides.save({ ...draft, state: 'PAID', paymentMethod: 'cash', paymentStatus: 'authorized', cashTenderedCents: 5000 });
      assert.equal(authorized.cashTenderedCents, 5000);
      assert.equal((await rides.save({ ...authorized, cashTenderedCents: 9500 })).cashTenderedCents, 5000);
      await pool.query("UPDATE rides SET state='SEARCHING_DRIVER', updated_at=$2 WHERE id=$1", [id, beforeDeadline]);
    }
    const offerId = randomUUID();
    await pool.query(`INSERT INTO ride_offers(id,ride_id,driver_id,status,approximate_pickup_distance_km,expires_at,created_at,updated_at)
      VALUES ($1,$2,$3,'OFFERED',1,$4,$5,$5)`, [offerId, id, driverId, deadline, requestedAt]);
    return { rideId: id, passengerId, beforePayment, reason: 'Teste', offerId, now: beforeDeadline };
  }
  try {
    await drivers.upsert({ driverId, vehicleId: 'test-' + driverId, categories: ['car'],
      fourByFour: false, seatCapacity: 4, online: true, busy: false, latitude: -2.82, longitude: -40.41,
      locationUpdatedAt: requestedAt, updatedAt: requestedAt });
    const pending = await fixture(true);
    await store.cancelCash(pending);
    await store.cancelCash(pending);
    assert.equal((await rides.findById(pending.rideId))?.state, 'CANCELLED_BY_PASSENGER');
    assert.equal((await pool.query('SELECT status FROM ride_offers WHERE id=$1', [pending.offerId])).rows[0].status, 'CANCELLED');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM ride_manual_cancellation_audit WHERE ride_id=$1', [pending.rideId])).rows[0].count, 1);
    assert.equal(await store.find(pending.rideId), null);

    const cash = await fixture(false);
    await assert.rejects(store.cancelCash({ ...cash, now: deadline }), { code: 'FREE_PERIOD_ENDED' });
    await store.cancelCash(cash);
    assert.equal((await rides.findById(cash.rideId))?.state, 'CANCELLED_BY_PASSENGER');

    const accepted = await fixture(false);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM rides WHERE id=$1 FOR UPDATE', [accepted.rideId]);
      const cancellation = assert.rejects(store.cancelCash(accepted), { code: 'DRIVER_ALREADY_ACCEPTED' });
      await client.query("UPDATE ride_offers SET status='ACCEPTED' WHERE id=$1", [accepted.offerId]);
      await client.query("UPDATE rides SET state='DRIVER_ASSIGNED', driver_id=$2 WHERE id=$1", [accepted.rideId, driverId]);
      await client.query('COMMIT');
      await cancellation;
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  } finally {
    await pool.query('DELETE FROM ride_manual_cancellation_audit WHERE ride_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM ride_offers WHERE ride_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM rides WHERE id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM driver_supply WHERE driver_id=$1', [driverId]);
    await pool.end();
  }
});
