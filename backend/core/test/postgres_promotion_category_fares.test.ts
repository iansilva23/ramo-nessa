import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresPromotionRepository } from '../src/promotions/repositories/postgres-promotion-repository.js';
import { createPromotionCampaignRecord } from '../src/promotions/promotion-service.js';
const databaseUrl = process.env.DATABASE_URL?.trim();
test(
  'PostgreSQL preserva tarifa por categoria e rejeita mapa financeiro inválido',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const promotions = new PostgresPromotionRepository(pool);
    const campaign = createPromotionCampaignRecord({
      code: `CAT${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      name: 'Tarifas por categoria',
      kind: 'fixed_driver_fare',
      maxRedemptions: 10,
      categories: ['car', 'moto'],
      fixedDriverFaresByCategory: { car: 5000, moto: 1000 },
    });
    try {
      const created = await promotions.createCampaign(campaign);
      assert.deepEqual(created.fixedDriverFaresByCategory, {
        car: 5000,
        moto: 1000,
      });
      assert.deepEqual(
        (await promotions.findCampaignById(campaign.id))
          ?.fixedDriverFaresByCategory,
        { car: 5000, moto: 1000 },
      );
      for (const invalid of [
        { car: 5000 },
        { car: 0, moto: 1000 },
        { car: 1.5, moto: 1000 },
        { car: '5000', moto: 1000 },
        { car: 5000, moto: 1000, buggy: 500 },
        { car: 5000, moto: 1000, unknown: 1 },
        [],
      ]) {
        await assert.rejects(
          pool.query(
            'UPDATE promotion_campaigns SET fixed_driver_fares_by_category=$2::jsonb WHERE id=$1',
            [campaign.id, JSON.stringify(invalid)],
          ),
          (error: unknown) => (error as { code?: string }).code === '23514',
        );
      }
      assert.deepEqual(
        (await promotions.findCampaignById(campaign.id))
          ?.fixedDriverFaresByCategory,
        { car: 5000, moto: 1000 },
      );
      await promotions.setCampaignEnabled(
        campaign.id,
        true,
        new Date().toISOString(),
      );
      assert.equal(
        (await promotions.findCampaignById(campaign.id))?.enabled,
        true,
      );
    } finally {
      await pool.query('DELETE FROM promotion_campaigns WHERE id=$1', [
        campaign.id,
      ]);
      await pool.end();
    }
  },
);
