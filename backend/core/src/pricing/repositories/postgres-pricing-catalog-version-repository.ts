import type { Pool } from 'pg';

import type { AdminActor } from '../../admin/admin-repository.js';
import type { PricingCatalogSnapshot } from '../admin-catalog.js';
import type {
  PricingCatalogVersionRecord,
  PricingCatalogVersionRepository,
  PricingCatalogVersionStatus,
} from '../pricing-catalog-version-repository.js';

interface PricingCatalogVersionRow {
  id: string;
  version_number: string | number;
  status: PricingCatalogVersionStatus;
  snapshot: PricingCatalogSnapshot;
  effective_from: Date | null;
  created_by_kind: AdminActor['kind'];
  created_by_id: string;
  created_by_name: string;
  published_by_kind: AdminActor['kind'] | null;
  published_by_id: string | null;
  published_by_name: string | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}

function mapActor(kind: AdminActor['kind'], id: string, name: string): AdminActor {
  return { kind, id, name };
}

function mapRow(row: PricingCatalogVersionRow): PricingCatalogVersionRecord {
  return {
    id: row.id,
    versionNumber: Number(row.version_number),
    status: row.status,
    snapshot: row.snapshot,
    createdBy: mapActor(
      row.created_by_kind,
      row.created_by_id,
      row.created_by_name,
    ),
    ...(row.effective_from != null
      ? { effectiveFrom: row.effective_from.toISOString() }
      : {}),
    ...(row.published_by_kind != null &&
    row.published_by_id != null &&
    row.published_by_name != null
      ? {
          publishedBy: mapActor(
            row.published_by_kind,
            row.published_by_id,
            row.published_by_name,
          ),
        }
      : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.published_at != null
      ? { publishedAt: row.published_at.toISOString() }
      : {}),
  };
}

export class PostgresPricingCatalogVersionRepository
  implements PricingCatalogVersionRepository {
  constructor(private readonly pool: Pool) {}

  async createDraft(
    input: Parameters<PricingCatalogVersionRepository['createDraft']>[0],
  ): Promise<PricingCatalogVersionRecord> {
    const result = await this.pool.query<PricingCatalogVersionRow>(
      `
      INSERT INTO pricing_catalog_versions (
        id, status, snapshot,
        created_by_kind, created_by_id, created_by_name,
        created_at, updated_at
      ) VALUES ($1, 'draft', $2::jsonb, $3, $4, $5, $6, $6)
      RETURNING *
      `,
      [
        input.id,
        JSON.stringify(input.snapshot),
        input.createdBy.kind,
        input.createdBy.id,
        input.createdBy.name,
        input.createdAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Versão de preços não foi persistida.');
    return mapRow(row);
  }

  async findById(id: string): Promise<PricingCatalogVersionRecord | null> {
    const result = await this.pool.query<PricingCatalogVersionRow>(
      'SELECT * FROM pricing_catalog_versions WHERE id = $1 LIMIT 1',
      [id],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }

  async list(limit: number): Promise<PricingCatalogVersionRecord[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.pool.query<PricingCatalogVersionRow>(
      `
      SELECT *
      FROM pricing_catalog_versions
      ORDER BY version_number DESC
      LIMIT $1
      `,
      [safeLimit],
    );
    return result.rows.map(mapRow);
  }

  async publish(
    input: Parameters<PricingCatalogVersionRepository['publish']>[0],
  ): Promise<PricingCatalogVersionRecord | null> {
    const result = await this.pool.query<PricingCatalogVersionRow>(
      `
      UPDATE pricing_catalog_versions
      SET
        status = 'published',
        effective_from = $2,
        published_by_kind = $3,
        published_by_id = $4,
        published_by_name = $5,
        published_at = $6,
        updated_at = $6
      WHERE id = $1
        AND status = 'draft'
      RETURNING *
      `,
      [
        input.id,
        input.effectiveFrom,
        input.publishedBy.kind,
        input.publishedBy.id,
        input.publishedBy.name,
        input.publishedAt,
      ],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }

  async findEffective(at: string): Promise<PricingCatalogVersionRecord | null> {
    const result = await this.pool.query<PricingCatalogVersionRow>(
      `
      SELECT *
      FROM pricing_catalog_versions
      WHERE status = 'published'
        AND effective_from <= $1
      ORDER BY effective_from DESC, version_number DESC
      LIMIT 1
      `,
      [at],
    );
    return result.rows[0] == null ? null : mapRow(result.rows[0]);
  }
}
