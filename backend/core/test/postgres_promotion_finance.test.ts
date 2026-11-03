import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresDriverSupplyRepository } from '../src/drivers/repositories/postgres-driver-supply-repository.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import { PostgresPromotionRepository } from '../src/promotions/repositories/postgres-promotion-repository.js';
import { PostgresFinanceRepository } from '../src/payments/repositories/postgres-finance-repository.js';
import { settleCompletedRide } from '../src/payments/settlement.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import { applyPromotionToRide, createPromotionCampaignRecord, fundRidePromotion, redeemRidePromotion } from '../src/promotions/promotion-service.js';
import type { RideRecord } from '../src/rides/ride.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
const now = new Date('2026-10-01T05:00:00.000Z');

for (const kind of ['fixed_discount', 'fixed_driver_fare'] as const) {
  test(`PostgreSQL ${kind} financia uma vez e liquida com dívida anterior preservada`,
    {skip: !databaseUrl}, async () => {
      const pool = createPostgresPool(databaseUrl!);
      const rides = new PostgresRideRepository(pool);
      const promotions = new PostgresPromotionRepository(pool);
      const finance = new PostgresFinanceRepository(pool);
      const rideId = randomUUID();
      const oldRideId = randomUUID();
      const driverId = `audit-finance-driver-${rideId}`;
      const campaign = await promotions.createCampaign(createPromotionCampaignRecord({
        code: `F${rideId.replaceAll('-', '').slice(0, 20)}`, name: 'PostgreSQL finance audit', kind,
        ...(kind === 'fixed_discount' ? {valueCents: 5000} : {fixedDriverFareCents: 5000}),
        categories: ['car'], maxRedemptions: 10, enabled: true, now,
      }));
      try {
        await new PostgresDriverSupplyRepository(pool).upsert({
          driverId, vehicleId: `audit-vehicle-${rideId}`, categories: ['car'], fourByFour: false,
          seatCapacity: 4, online: true, busy: false, latitude: -2.8, longitude: -40.4,
          locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString(),
        });
        const normal: RideRecord = {
          id: rideId, passengerId: `audit-passenger-${rideId}`,
          state: 'AWAITING_PAYMENT', paymentStatus: 'created', reservedDriverId: driverId,
          driverHoldExpiresAt: '2026-10-01T05:05:00.000Z',
          origin: {zoneId: 'prea'}, destination: {zoneId: 'jijoca'}, category: 'car', period: 'day', passengers: 1,
          quote: {ruleId: 'audit-normal', baseAmountCents: 20000, pickupCompensationCents: 0,
            totalAmountCents: 20000, platformCommissionCents: 2000, driverNetCents: 18000},
          createdAt: now.toISOString(), updatedAt: now.toISOString(),
        };
        await rides.create({...normal, id: oldRideId, state: 'COMPLETED', paymentMethod: 'cash',
          driverId, quote: {...normal.quote, platformCommissionCents: 1000, driverNetCents: 19000}});
        await finance.settleCashRide({rideId: oldRideId, driverId, platformCommissionCents: 1000, settledAt: now});
        await rides.create(normal);
        const promoted = await applyPromotionToRide({rides, promotions, rideId, passengerId: normal.passengerId,
          clientInstanceId: `audit-finance-device-${rideId}`, code: campaign.code, now});
        const payment = await finance.createPayment({
          id: randomUUID(), rideId, method: 'pix', processor: 'audit-test-gateway', status: 'pending',
          amountCents: promoted.promotion!.passengerPayableCents,
          idempotencyKey: `audit-finance-${rideId}`, createdAt: now.toISOString(), updatedAt: now.toISOString(),
        });
        const captured = await finance.capturePayment({paymentId: payment.id, processorEventId: randomUUID(), capturedAt: now});
        await Promise.all(Array.from({length: 4}, () => fundRidePromotion({promotions, finance, ride: promoted, now})));
        const paid = await confirmRidePayment(rides, {rideId, payment: captured.payment, confirmedAt: now});
        const completed = await rides.save({...paid, state: 'COMPLETED', driverId});
        await redeemRidePromotion({promotions, ride: completed, now});
        const settlement = await settleCompletedRide(finance, {ride: completed, payment: captured.payment, settledAt: now});
        assert.equal(settlement.cashDebtRecoveredCents, kind === 'fixed_driver_fare' ? 0 : 1000);
        assert.equal(await finance.getDriverCashDebtCents(driverId), kind === 'fixed_driver_fare' ? 1000 : 0);
        assert.equal(await finance.getAccountBalanceCents(`driver:${driverId}:payable`), kind === 'fixed_driver_fare' ? 5000 : 17000);
        assert.equal(await finance.getAccountBalanceCents(`ride:${rideId}:escrow`), 0);
        assert.equal((await settleCompletedRide(finance, {ride: completed, payment: captured.payment})).duplicateSettlement, true);
        const ledger = await finance.listLedgerTransactionsForAccounts([`ride:${rideId}:escrow`], 50);
        assert.equal(ledger.filter(item => item.kind === 'RIDE_PROMOTION_FUNDED').length, kind === 'fixed_discount' ? 1 : 0);
        assert.ok(ledger.every(item => item.entries.every(entry => entry.amountCents > 0)));
        assert.equal((await promotions.findRedemptionById(promoted.promotion!.applicationId))?.status, 'redeemed');
      } finally {
        const ids = [rideId, oldRideId];
        await pool.query(`DELETE FROM ledger_entries WHERE transaction_id IN
          (SELECT id FROM ledger_transactions WHERE ride_id = ANY($1::uuid[]))`, [ids]);
        await pool.query('DELETE FROM ledger_transactions WHERE ride_id = ANY($1::uuid[])', [ids]);
        await pool.query(`DELETE FROM payment_events WHERE payment_id IN
          (SELECT id FROM payments WHERE ride_id = ANY($1::uuid[]))`, [ids]);
        await pool.query('DELETE FROM payments WHERE ride_id = ANY($1::uuid[])', [ids]);
        await pool.query('DELETE FROM promotion_redemptions WHERE campaign_id = $1', [campaign.id]);
        await pool.query('DELETE FROM rides WHERE id = ANY($1::uuid[])', [ids]);
        await pool.query('DELETE FROM driver_supply WHERE driver_id = $1', [driverId]);
        await pool.query('DELETE FROM promotion_campaigns WHERE id = $1', [campaign.id]);
        await pool.end();
      }
    });
}
