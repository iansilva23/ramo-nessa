import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresPool } from '../src/db/postgres.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { PostgresPricingCatalogVersionRepository } from '../src/pricing/repositories/postgres-pricing-catalog-version-repository.js';

const databaseUrl = process.env.DATABASE_URL?.trim();

test(
  'PostgreSQL rejeita save e publicação stale do catálogo de preços',
  { skip: !databaseUrl },
  async () => {
    const pool = createPostgresPool(databaseUrl!);
    const repository = new PostgresPricingCatalogVersionRepository(pool);
    const id = randomUUID();
    const actor = {
      kind: 'user' as const,
      id: 'admin-pricing-postgres-concurrency',
      name: 'Admin Pricing PostgreSQL',
    };
    const createdAt = '2026-09-27T06:15:00.000Z';

    try {
      const draft = await repository.createDraft({
        id,
        snapshot: structuredClone(STATIC_PRICING_CATALOG_V1),
        createdBy: actor,
        createdAt,
      });

      const firstSnapshot = structuredClone(draft.snapshot);
      firstSnapshot.commissionBps = 1100;
      const first = await repository.updateDraftSnapshot({
        id,
        snapshot: firstSnapshot,
        expectedUpdatedAt: draft.updatedAt,
        updatedAt: '2026-09-27T06:15:01.000Z',
      });
      assert.ok(first);
      assert.equal(first.snapshot.commissionBps, 1100);

      const staleSnapshot = structuredClone(first.snapshot);
      staleSnapshot.commissionBps = 1200;
      const staleUpdate = await repository.updateDraftSnapshot({
        id,
        snapshot: staleSnapshot,
        expectedUpdatedAt: draft.updatedAt,
        updatedAt: '2026-09-27T06:15:02.000Z',
      });
      assert.equal(staleUpdate, null);

      const stalePublish = await repository.publish({
        id,
        expectedUpdatedAt: draft.updatedAt,
        effectiveFrom: '2026-09-27T06:20:00.000Z',
        publishedBy: actor,
        publishedAt: '2026-09-27T06:15:03.000Z',
      });
      assert.equal(stalePublish, null);

      const stored = await repository.findById(id);
      assert.equal(stored?.status, 'draft');
      assert.equal(stored?.snapshot.commissionBps, 1100);

      const published = await repository.publish({
        id,
        expectedUpdatedAt: first.updatedAt,
        effectiveFrom: '2026-09-27T06:20:00.000Z',
        publishedBy: actor,
        publishedAt: '2026-09-27T06:15:04.000Z',
      });
      assert.equal(published?.status, 'published');
    } finally {
      await pool.query(
        'DELETE FROM pricing_catalog_versions WHERE id = $1',
        [id],
      );
      await pool.end();
    }
  },
);
