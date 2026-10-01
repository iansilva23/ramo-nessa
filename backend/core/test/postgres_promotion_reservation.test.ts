import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresPromotionRepository } from '../src/promotions/repositories/postgres-promotion-repository.js';
import { PromotionRepositoryError } from '../src/promotions/promotion-repository.js';
import { applyPromotionToRide, createPromotionCampaignRecord } from '../src/promotions/promotion-service.js';
import type { RideRecord } from '../src/rides/ride.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const now = new Date('2026-10-01T05:00:00.000Z');

test('PostgreSQL serializa limites e preserva reserva paga até aceite ou liberação',
  { skip: !databaseUrl }, async () => {
    const pool = createPostgresPool(databaseUrl!);
    const rides = new PostgresRideRepository(pool);
    const promotions = new PostgresPromotionRepository(pool);
    const campaign = await promotions.createCampaign(createPromotionCampaignRecord({
      code: `P${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      name: 'Audit paid reservation', kind: 'fixed_discount', valueCents: 5000,
      categories: ['car'], maxRedemptions: 1, perPassengerLimit: 1, perDeviceLimit: 1,
      enabled: true, now,
    }));
    const rideIds: string[] = [];
    try {
      const candidates = await Promise.all(Array.from({length: 4}, async () => {
        const id = randomUUID();
        rideIds.push(id);
        const ride: RideRecord = {
          id, passengerId: `audit-retain-${id}`, state: 'AWAITING_PAYMENT', paymentStatus: 'created',
          reservedDriverId: `audit-driver-${id}`, driverHoldExpiresAt: '2026-10-01T05:10:00.000Z',
          origin: {zoneId: 'prea'}, destination: {zoneId: 'jijoca'},
          category: 'car', period: 'day', passengers: 1,
          quote: {
            ruleId: 'audit-normal', baseAmountCents: 20000, pickupCompensationCents: 0,
            totalAmountCents: 20000, platformCommissionCents: 2000, driverNetCents: 18000,
          }, createdAt: now.toISOString(), updatedAt: now.toISOString(),
        };
        return rides.create(ride);
      }));
      const apply = (ride: RideRecord, at = now) => applyPromotionToRide({
        rides, promotions, rideId: ride.id, passengerId: ride.passengerId,
        clientInstanceId: `audit-reservation-device-${ride.id}`, code: campaign.code, now: at,
      });
      const concurrent = await Promise.allSettled(candidates.map(ride => apply(ride)));
      const successes = concurrent.filter(result => result.status === 'fulfilled');
      assert.equal(successes.length, 1);
      for (const result of concurrent) {
        if (result.status === 'rejected') {
          assert.ok(result.reason instanceof PromotionRepositoryError);
          assert.equal(result.reason.code, 'PROMOTION_LIMIT_REACHED');
        }
      }
      const promoted = successes[0]!;
      if (promoted.status !== 'fulfilled') throw new Error('Expected reserved ride');
      const ride = promoted.value;
      const redemptionId = ride.promotion!.applicationId;
      const retainInput = {
        redemptionId, campaignId: campaign.id, rideId: ride.id, passengerId: ride.passengerId,
        updatedAt: new Date(now.getTime() + 1000).toISOString(),
      };
      await assert.rejects(promotions.retainPaidReservation({
        ...retainInput, passengerId: 'wrong-passenger',
      }), (error: unknown) => error instanceof PromotionRepositoryError && error.code === 'PROMOTION_REFERENCE_CONFLICT');
      const retained = await Promise.all(Array.from({length: 4}, () => promotions.retainPaidReservation(retainInput)));
      for (const item of retained) {
        assert.equal(item.status, 'reserved');
        assert.equal(item.expiresAt, undefined);
      }
      const other = candidates.find(item => item.id !== ride.id)!;
      const later = new Date(now.getTime() + 11 * 60 * 1000);
      await assert.rejects(apply(other, later),
        (error: unknown) => error instanceof PromotionRepositoryError && error.code === 'PROMOTION_LIMIT_REACHED');
      await promotions.setRedemptionStatus(redemptionId, 'released', later.toISOString());
      await assert.rejects(promotions.retainPaidReservation({...retainInput, updatedAt: later.toISOString()}),
        (error: unknown) => error instanceof PromotionRepositoryError && error.code === 'PROMOTION_REFERENCE_CONFLICT');
      const refreshed = await rides.save({...other, driverHoldExpiresAt: '2026-10-01T05:20:00.000Z'});
      const next = await apply(refreshed, later);
      assert.notEqual(next.promotion!.applicationId, redemptionId);
      await assert.rejects(promotions.retainPaidReservation({
        ...retainInput, redemptionId: next.promotion!.applicationId, rideId: next.id,
        passengerId: next.passengerId, updatedAt: '2026-10-01T05:21:00.000Z',
      }), (error: unknown) => error instanceof PromotionRepositoryError && error.code === 'PROMOTION_REFERENCE_CONFLICT');
      assert.equal((await promotions.findRedemptionById(next.promotion!.applicationId))?.expiresAt,
        '2026-10-01T05:20:00.000Z');
    } finally {
      await pool.query('DELETE FROM promotion_redemptions WHERE campaign_id = $1', [campaign.id]);
      await pool.query('DELETE FROM rides WHERE id = ANY($1::uuid[])', [rideIds]);
      await pool.query('DELETE FROM promotion_campaigns WHERE id = $1', [campaign.id]);
      await pool.end();
    }
  });
