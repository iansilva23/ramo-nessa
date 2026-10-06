import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresGrowthRepository } from '../src/growth/growth-repository.js';
import {
  campaignInput,
  defaultPreference,
  type MarketingDelivery,
} from '../src/growth/growth-model.js';
const databaseUrl = process.env.DATABASE_URL?.trim();
test(
  'PostgreSQL serializa orçamento e reserva única; anonimização preserva os custos',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!),
      store = new PostgresGrowthRepository(pool),
      now = new Date(),
      pid = `growth-test:${randomUUID()}`,
      actor = {
        kind: 'api_key' as const,
        id: randomUUID(),
        name: 'Growth test',
      };
    const c = campaignInput(
      {
        name: 'Teste isolado',
        trigger: 'never_used',
        days: 1,
        threshold: 1,
        title: 'Teste',
        message: 'Não enviar a provedores reais.',
        channels: ['inapp'],
        zones: [],
        categories: [],
        audience: 'all',
        enabled: false,
        automatic: false,
        requireSupply: false,
        startsAt: new Date(now.getTime() - 86400000).toISOString(),
        endsAt: new Date(now.getTime() + 86400000).toISOString(),
        couponValueCents: 500,
        couponValidDays: 7,
        budgetCents: 500,
        maxRecipients: 100,
        channelCostCents: { inapp: 0, push: 0, email: 0, whatsapp: 0 },
        controlPercent: 0,
      },
      undefined,
      now,
    );
    c.enabled = true;
    const initial = await store.settings();
    const d: MarketingDelivery = {
      id: randomUUID(),
      campaignId: c.id,
      campaignVersion: c.updatedAt,
      passengerId: pid,
      occurrence: 'once',
      createdAt: now.toISOString(),
      state: 'pending',
      heldCents: 500,
      control: false,
      title: c.title,
      message: c.message,
      couponId: null,
      channels: ['inapp'],
      results: {},
      openedAt: null,
    };
    try {
      await store.saveSettings(
        { ...initial, enabled: true, updatedAt: now.toISOString() },
        initial.updatedAt,
        actor,
      );
      await store.saveCampaign(c, null, actor);
      await store.savePreference({
        ...defaultPreference(pid),
        channels: { inapp: true, push: false, email: false, whatsapp: false },
      });
      const accepted = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          store.reserve(
            { ...d, id: randomUUID(), occurrence: String(i) },
            c.updatedAt,
          ),
        ),
      );
      assert.equal(accepted.filter(Boolean).length, 1);
      const saved = (await store.deliveries(c.id))[0]!;
      const claims = await Promise.all([
        store.claim(saved.id),
        store.claim(saved.id),
      ]);
      assert.equal(claims.filter(Boolean).length, 1);
      await assert.rejects(
        store.saveCampaign({ ...c, budgetCents: 499 }, c.updatedAt, actor),
      );
      await store.forget(pid);
      const anonymized = (await store.deliveries(c.id))[0]!;
      assert.equal(anonymized.heldCents, 500);
      assert.ok(anonymized.passengerId.startsWith('erased:'));
      assert.deepEqual(anonymized.channels, []);
    } finally {
      await pool.query(
        'DELETE FROM marketing_deliveries WHERE campaign_id=$1',
        [c.id],
      );
      await pool.query('DELETE FROM marketing_campaigns WHERE id=$1', [c.id]);
      await pool.query(
        'DELETE FROM marketing_preferences WHERE passenger_id=$1',
        [pid],
      );
      await pool.query(
        'UPDATE marketing_settings SET data=$1::jsonb WHERE id=true',
        [JSON.stringify(initial)],
      );
      await pool.end();
    }
  },
);
