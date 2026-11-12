import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresPromotionRepository } from '../src/promotions/repositories/postgres-promotion-repository.js';
import {
  applyPromotionToRide, createPromotionCampaignRecord, removePromotionFromRide,
} from '../src/promotions/promotion-service.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const now = new Date('2026-10-01T05:00:00.000Z');

for (const failingTable of ['rides', 'promotion_redemptions'] as const) {
  test(`PostgreSQL reverte remoção inteira quando ${failingTable} falha`,
    { skip: !databaseUrl }, async () => {
      const pool = createPostgresPool(databaseUrl!);
      const rides = new PostgresRideRepository(pool);
      const promotions = new PostgresPromotionRepository(pool);
      const rideId = randomUUID();
      const passengerId = `audit-promo-${rideId}`;
      const suffix = rideId.replaceAll('-', '');
      const triggerName = `audit_promo_remove_${suffix}`;
      const functionName = `audit_promo_fail_${suffix}`;
      const campaign = await promotions.createCampaign(createPromotionCampaignRecord({
        code: `R${suffix.slice(0, 20)}`,
        name: 'Audit fixed fare removal',
        kind: 'fixed_driver_fare',
        fixedDriverFareCents: 5000,
        categories: ['car'],
        maxRedemptions: 10,
        enabled: true,
        now,
      }));
      let triggerCreated = false;
      let functionCreated = false;
      try {
        await rides.create({
          id: rideId, passengerId, state: 'AWAITING_PAYMENT', paymentStatus: 'created',
          origin: { zoneId: 'prea' }, destination: { zoneId: 'jericoacoara' },
          category: 'car', period: 'day', passengers: 1,
          quote: {
            ruleId: 'audit-normal', baseAmountCents: 20000, pickupCompensationCents: 0,
            totalAmountCents: 20000, platformCommissionCents: 2000, driverNetCents: 18000,
          },
          createdAt: now.toISOString(), updatedAt: now.toISOString(),
        });
        const promoted = await applyPromotionToRide({
          rides, promotions, passengerId, rideId, code: campaign.code,
          clientInstanceId: 'audit-removal-device-0123456789abcdef', now,
        });
        assert.equal(promoted.quote.totalAmountCents, 5000);
        const redemptionId = promoted.promotion!.applicationId;
        const idColumn = failingTable === 'rides' ? 'id' : 'ride_id';
        await pool.query(`CREATE FUNCTION ${functionName}() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.${idColumn}::text = TG_ARGV[0] THEN
              RAISE EXCEPTION 'simulated atomic removal failure';
            END IF;
            RETURN NEW;
          END $$`);
        functionCreated = true;
        await pool.query(`CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${failingTable}
          FOR EACH ROW EXECUTE FUNCTION ${functionName}('${rideId}')`);
        triggerCreated = true;

        const remove = () => removePromotionFromRide({
          rides, promotions, passengerId, rideId,
          now: new Date(now.getTime() + 1000),
        });
        await assert.rejects(remove(), /simulated atomic removal failure/);
        assert.deepEqual(await rides.findById(rideId), promoted);
        assert.equal((await promotions.findRedemptionById(redemptionId))?.status, 'reserved');
        await pool.query(`DROP TRIGGER ${triggerName} ON ${failingTable}`);
        triggerCreated = false;
        await pool.query(`DROP FUNCTION ${functionName}()`);
        functionCreated = false;

        // Concurrent repeats both see a consistent, restored fare.
        const removed = await Promise.all([remove(), remove()]);
        for (const ride of removed) {
          assert.equal(ride.promotion, undefined);
          assert.equal(ride.quote.totalAmountCents, 20000);
          assert.equal(ride.quote.platformCommissionCents, 2000);
          assert.equal(ride.quote.driverNetCents, 18000);
        }
        assert.equal((await promotions.findRedemptionById(redemptionId))?.status, 'released');
        assert.deepEqual(await remove(), removed[0]);
      } finally {
        if (triggerCreated) await pool.query(`DROP TRIGGER ${triggerName} ON ${failingTable}`);
        if (functionCreated) await pool.query(`DROP FUNCTION ${functionName}()`);
        await pool.query('DELETE FROM promotion_redemptions WHERE ride_id = $1', [rideId]);
        await pool.query('DELETE FROM rides WHERE id = $1', [rideId]);
        await pool.query('DELETE FROM promotion_campaigns WHERE id = $1', [campaign.id]);
        await pool.end();
      }
    });
}
